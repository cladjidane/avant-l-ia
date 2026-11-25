// Fichiers Word (.docx). On lit le texte de chaque paragraphe du corps, des
// en-têtes, des pieds de page, des notes et des commentaires, puis on écrit
// les étiquettes directement dans ces mêmes nœuds de texte. Les styles, les
// images et la mise en page ne sont pas touchés.

import JSZip from 'jszip';
import type { SourceDocument } from './types';
import type { Correspondence } from '../mask/unmask';
import { fillPlaceholders } from '../mask/placeholders';
import { unmaskText } from '../mask/unmask';
import { suffixedName } from '../ui/helpers';
import {
  applyToUnit,
  applyToUnits,
  closest,
  elementsByTag,
  parseXml,
  partsMatching,
  pieceFromNode,
  serializeXml,
  stripMetadata,
  unitText,
  type TextUnit,
  type XmlDoc,
} from './ooxml';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Parties du document qui contiennent du texte, dans l'ordre d'affichage.
function textParts(zip: JSZip): string[] {
  return [
    'word/document.xml',
    ...partsMatching(zip, /^word\/header\d*\.xml$/),
    ...partsMatching(zip, /^word\/footer\d*\.xml$/),
    ...partsMatching(zip, /^word\/(footnotes|endnotes)\.xml$/),
    ...partsMatching(zip, /^word\/comments\.xml$/),
  ].filter((name) => zip.file(name));
}

// Découpe une partie en paragraphes. Une zone de texte est enregistrée deux
// fois par Word (version moderne et version de secours) : on ignore la copie
// de secours pour ne pas lire le texte en double.
function paragraphs(doc: XmlDoc): TextUnit[] {
  const units: TextUnit[] = [];
  for (const p of elementsByTag(doc, 'w:p')) {
    if (closest(p, ['mc:Fallback'])) continue;
    const unit: TextUnit = { pieces: [], offset: 0 };
    const walk = (node: XmlDoc | ReturnType<XmlDoc['createElement']>) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType !== 1) continue;
        const elem = child as ReturnType<XmlDoc['createElement']>;
        const name = elem.nodeName;
        if (name === 'w:p' || name === 'mc:Fallback' || name === 'w:del') continue; // paragraphe imbriqué, copie de secours, texte supprimé
        if (name === 'w:t') unit.pieces.push(pieceFromNode(elem));
        else if (name === 'w:tab') unit.pieces.push({ node: null, text: '\t' });
        else if (name === 'w:br' || name === 'w:cr') unit.pieces.push({ node: null, text: '\n' });
        else walk(elem);
      }
    };
    walk(p);
    units.push(unit);
  }
  return units;
}

interface LoadedPart {
  name: string;
  doc: XmlDoc;
  units: TextUnit[];
}

async function readParts(zip: JSZip): Promise<LoadedPart[]> {
  const parts: LoadedPart[] = [];
  for (const name of textParts(zip)) {
    const doc = parseXml(await zip.file(name)!.async('string'));
    parts.push({ name, doc, units: paragraphs(doc) });
  }
  return parts;
}

// Assemble le texte affiché et fixe la position de chaque paragraphe.
function layoutText(parts: LoadedPart[]): string {
  let text = '';
  for (const part of parts) {
    if (text && part.units.length) text += '\n';
    for (const unit of part.units) {
      unit.offset = text.length;
      text += unitText(unit) + '\n';
    }
  }
  return text.replace(/\n+$/, '\n');
}

// Remplace le nom des auteurs des commentaires et des modifications suivies.
function anonymizeAuthors(parts: LoadedPart[]): boolean {
  let changed = false;
  for (const part of parts) {
    for (const tag of ['w:comment', 'w:ins', 'w:del', 'w:rPrChange', 'w:pPrChange', 'w:moveFrom', 'w:moveTo']) {
      for (const node of elementsByTag(part.doc, tag)) {
        if (node.getAttribute('w:author')) {
          node.setAttribute('w:author', 'Auteur');
          changed = true;
        }
        if (node.getAttribute('w:initials')) node.setAttribute('w:initials', 'A');
      }
    }
  }
  return changed;
}

export async function loadDocx(file: File | Blob, name = (file as File).name ?? 'document.docx'): Promise<SourceDocument> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  if (!zip.file('word/document.xml')) throw new Error("Ce fichier .docx semble abîmé : le texte du document est introuvable.");
  const text = layoutText(await readParts(zip));
  return {
    kind: 'docx',
    name,
    text,
    structured: true,
    note: 'Le texte affiché est celui du document, des en-têtes, des pieds de page et des commentaires.',
    async build(replacements) {
      // On repart du fichier d'origine à chaque export.
      const out = await JSZip.loadAsync(buffer);
      const parts = await readParts(out);
      layoutText(parts);
      applyToUnits(
        parts.flatMap((p) => p.units),
        replacements,
      );
      const authors = anonymizeAuthors(parts);
      for (const part of parts) out.file(part.name, serializeXml(part.doc));
      const removed = await stripMetadata(out);
      if (out.file('word/people.xml')) {
        out.remove('word/people.xml');
        removed.push('liste des personnes ayant commenté');
      }
      if (authors) removed.push('noms des auteurs des commentaires et des modifications');
      const blob = await out.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
      return {
        files: [{ blob, fileName: suffixedName(name, 'nettoye', 'docx') }],
        report: { removedMetadata: removed },
      };
    },
  };
}

// Texte d'un .docx, pour l'onglet « Remettre les vrais noms ».
export async function readDocxText(file: File | Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  return layoutText(await readParts(zip));
}

// Remet les vraies valeurs dans un .docx rendu par l'IA, paragraphe par paragraphe.
// Accepte la table de correspondance, ou les valeurs saisies trou par trou
// (étiquettes de l'outil et trous ajoutés par l'IA).
export async function restoreDocx(file: File | Blob, source: Correspondence[] | Map<string, string>): Promise<Blob> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parts = await readParts(zip);
  for (const part of parts) {
    for (const unit of part.units) {
      const text = unitText(unit);
      const { matches } = source instanceof Map ? fillPlaceholders(text, source) : unmaskText(text, source);
      if (matches.length) applyToUnit(unit, matches);
    }
    zip.file(part.name, serializeXml(part.doc));
  }
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}

// Crée un .docx simple à partir de texte brut (utilisé pour la sortie des PDF).
export async function textToDocx(text: string): Promise<Blob> {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = text
    .split(/\r?\n/)
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`)
    .join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
