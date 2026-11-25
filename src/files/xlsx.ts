// Fichiers Excel (.xlsx). Le texte des cellules est rangé dans une table
// commune (xl/sharedStrings.xml) ou directement dans la cellule. On remplace
// le texte à ces endroits. Les formules, les nombres et les styles ne sont
// pas touchés.

import JSZip from 'jszip';
import type { SourceDocument } from './types';
import type { Category, Span } from '../detect/types';
import { COLUMN_HINTS } from './columns';
import { suffixedName } from '../ui/helpers';
import {
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

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface LoadedPart {
  name: string;
  doc: XmlDoc;
  units: TextUnit[];
}

// Une chaîne de texte : tous les <t> d'un <si> (table commune), d'un <is>
// (texte dans la cellule) ou d'un <text> (commentaire). Le texte phonétique
// (<rPh>) est ignoré.
function stringUnits(doc: XmlDoc, containerTag: string): TextUnit[] {
  return elementsByTag(doc, containerTag).map((container) => ({
    offset: 0,
    pieces: elementsByTag(container, 't')
      .filter((t) => !closest(t, ['rPh']))
      .map(pieceFromNode),
  }));
}

function columnOf(ref: string): string {
  return /^[A-Z]+/.exec(ref)?.[0] ?? '';
}
function rowOf(ref: string): number {
  return Number(/\d+$/.exec(ref)?.[0] ?? 0);
}

interface ReadResult {
  parts: LoadedPart[];
  // Unités entières à masquer d'après le titre de leur colonne.
  hinted: Array<{ unit: TextUnit; category: Category }>;
}

async function readParts(zip: JSZip): Promise<ReadResult> {
  const parts: LoadedPart[] = [];
  const hinted: ReadResult['hinted'] = [];
  let sharedUnits: TextUnit[] = [];
  const shared = zip.file('xl/sharedStrings.xml');
  if (shared) {
    const doc = parseXml(await shared.async('string'));
    sharedUnits = stringUnits(doc, 'si');
    parts.push({ name: 'xl/sharedStrings.xml', doc, units: sharedUnits });
  }
  for (const name of partsMatching(zip, /^xl\/worksheets\/sheet\d+\.xml$/)) {
    const doc = parseXml(await zip.file(name)!.async('string'));
    const units: TextUnit[] = [];
    const cells: Array<{ ref: string; unit: TextUnit }> = [];
    for (const c of elementsByTag(doc, 'c')) {
      const type = c.getAttribute('t');
      const ref = c.getAttribute('r') ?? '';
      let unit: TextUnit | undefined;
      if (type === 's') {
        const v = elementsByTag(c, 'v')[0];
        unit = sharedUnits[Number(v?.textContent ?? -1)];
      } else if (type === 'inlineStr') {
        const is = elementsByTag(c, 'is')[0];
        if (is) {
          unit = { offset: 0, pieces: elementsByTag(is, 't').filter((t) => !closest(t, ['rPh'])).map(pieceFromNode) };
          units.push(unit);
        }
      } else if (type === 'str') {
        // Résultat texte d'une formule, gardé en cache dans la cellule : on le
        // nettoie aussi, la formule elle-même reste intacte.
        const v = elementsByTag(c, 'v')[0];
        if (v) {
          unit = { offset: 0, pieces: [pieceFromNode(v)] };
          units.push(unit);
        }
      }
      if (unit) cells.push({ ref, unit });
    }
    // Titres de colonnes : la première ligne remplie de la feuille.
    const firstRow = Math.min(...cells.map((c) => rowOf(c.ref)));
    const hints = new Map<string, Category>();
    for (const cell of cells.filter((c) => rowOf(c.ref) === firstRow)) {
      const title = unitText(cell.unit).trim();
      const hint = COLUMN_HINTS.find(([re]) => re.test(title));
      if (hint) hints.set(columnOf(cell.ref), hint[1]);
    }
    for (const cell of cells) {
      const category = hints.get(columnOf(cell.ref));
      if (category && rowOf(cell.ref) !== firstRow) hinted.push({ unit: cell.unit, category });
    }
    parts.push({ name, doc, units });
  }
  for (const name of partsMatching(zip, /^xl\/comments\d*\.xml$/)) {
    const doc = parseXml(await zip.file(name)!.async('string'));
    parts.push({ name, doc, units: stringUnits(doc, 'text') });
  }
  return { parts, hinted };
}

function layoutText(parts: LoadedPart[]): string {
  let text = '';
  for (const unit of parts.flatMap((p) => p.units)) {
    const t = unitText(unit);
    if (!t.trim()) continue;
    unit.offset = text.length;
    text += t + '\n';
  }
  return text;
}

export async function loadXlsx(file: File | Blob, name = (file as File).name ?? 'classeur.xlsx'): Promise<SourceDocument> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  if (!zip.file('xl/workbook.xml')) throw new Error('Ce fichier .xlsx semble abîmé : le classeur est introuvable.');
  const { parts, hinted } = await readParts(zip);
  const text = layoutText(parts);
  const extraSpans: Span[] = hinted
    .filter(({ unit }) => unitText(unit).trim())
    .map(({ unit, category }) => {
      const t = unitText(unit);
      const lead = t.length - t.trimStart().length;
      return { start: unit.offset + lead, end: unit.offset + t.trimEnd().length, category, source: 'rule' as const };
    });
  return {
    kind: 'xlsx',
    extraSpans,
    name,
    text,
    structured: true,
    note: 'Le texte de chaque cellule est affiché sur une ligne. Les nombres et les formules ne sont pas modifiés.',
    async build(replacements) {
      const out = await JSZip.loadAsync(buffer);
      const { parts } = await readParts(out);
      layoutText(parts);
      // Les unités vides n'ont pas reçu de position : on les écarte.
      const units = parts.flatMap((p) => p.units).filter((u) => unitText(u).trim());
      applyToUnits(units, replacements);
      let authors = false;
      for (const part of parts) {
        if (part.name.startsWith('xl/comments')) {
          for (const author of elementsByTag(part.doc, 'author')) {
            if (author.textContent?.trim()) {
              while (author.firstChild) author.removeChild(author.firstChild);
              author.appendChild(part.doc.createTextNode('Auteur'));
              authors = true;
            }
          }
        }
        out.file(part.name, serializeXml(part.doc));
      }
      const removed = await stripMetadata(out);
      for (const persons of partsMatching(out, /^xl\/persons\/person\.xml$/)) {
        const doc = parseXml(await out.file(persons)!.async('string'));
        for (const p of elementsByTag(doc, 'person')) {
          p.setAttribute('displayName', 'Auteur');
          p.removeAttribute('userId');
        }
        out.file(persons, serializeXml(doc));
        authors = true;
      }
      if (authors) removed.push('noms des auteurs des commentaires');
      const blob = await out.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
      return {
        files: [{ blob, fileName: suffixedName(name, 'nettoye', 'xlsx') }],
        report: { removedMetadata: removed },
      };
    },
  };
}
