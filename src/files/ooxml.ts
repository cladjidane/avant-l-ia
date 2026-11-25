// Outils communs aux fichiers Word (.docx) et Excel (.xlsx), qui sont des
// archives zip de fichiers XML. On modifie uniquement le texte des nœuds de
// texte, sans toucher aux styles, pour garder la mise en forme.

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type JSZip from 'jszip';
import type { Replacement } from './types';

// Les types DOM de xmldom sont proches de ceux du navigateur ; on s'en tient
// au strict nécessaire pour ne pas dépendre de l'un ou de l'autre.
export type XmlDoc = ReturnType<DOMParser['parseFromString']>;
export type XmlElement = ReturnType<XmlDoc['createElement']>;
type XmlNode = NonNullable<XmlElement['parentNode']>;

export function parseXml(xml: string): XmlDoc {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

export function serializeXml(doc: XmlDoc): string {
  return new XMLSerializer().serializeToString(doc);
}

export function elementsByTag(root: XmlDoc | XmlElement, tag: string): XmlElement[] {
  return Array.from(root.getElementsByTagName(tag)) as XmlElement[];
}

// Ancêtre le plus proche portant l'un des noms donnés.
export function closest(node: XmlNode, tags: string[]): XmlElement | null {
  let current: XmlNode | null = node.parentNode;
  while (current) {
    if (current.nodeType === 1 && tags.includes((current as XmlElement).nodeName)) return current as XmlElement;
    current = current.parentNode;
  }
  return null;
}

// Un morceau de texte d'une unité : un nœud de texte réel, ou un caractère
// ajouté pour la lecture (tabulation, retour à la ligne) qui n'existe pas
// comme texte dans le fichier.
export interface Piece {
  node: XmlElement | null;
  text: string;
}

// Une unité de texte : un paragraphe Word, une chaîne de cellule Excel.
export interface TextUnit {
  pieces: Piece[];
  // Position de l'unité dans le texte affiché.
  offset: number;
}

export function unitText(unit: TextUnit): string {
  return unit.pieces.map((p) => p.text).join('');
}

function nodeText(node: XmlElement): string {
  return node.textContent ?? '';
}

export function setNodeText(node: XmlElement, text: string): void {
  while (node.firstChild) node.removeChild(node.firstChild);
  node.appendChild(node.ownerDocument!.createTextNode(text));
  // Sans cet attribut, Word supprime les espaces en début et fin de morceau.
  if (node.nodeName === 'w:t' || node.nodeName === 't') node.setAttribute('xml:space', 'preserve');
}

export function pieceFromNode(node: XmlElement): Piece {
  return { node, text: nodeText(node) };
}

// Applique des remplacements (positions relatives à l'unité) aux morceaux.
// Quand une valeur est coupée en plusieurs morceaux (styles différents dans
// un même nom), l'étiquette va dans le premier morceau et les suivants sont
// raccourcis.
export function applyToUnit(unit: TextUnit, replacements: Array<{ start: number; end: number; text: string }>): void {
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  for (const r of sorted) {
    let pos = 0;
    let inserted = false;
    for (const piece of unit.pieces) {
      const pStart = pos;
      const pEnd = pos + piece.text.length;
      pos = pEnd;
      if (pEnd <= r.start || pStart >= r.end) continue;
      if (!piece.node) continue; // tabulation ou saut de ligne : on n'y touche pas
      const localStart = Math.max(0, r.start - pStart);
      const localEnd = Math.min(piece.text.length, r.end - pStart);
      const before = piece.text.slice(0, localStart);
      const after = piece.text.slice(localEnd);
      piece.text = before + (inserted ? '' : r.text) + after;
      inserted = true;
    }
  }
  for (const piece of unit.pieces) if (piece.node) setNodeText(piece.node, piece.text);
}

// Répartit des remplacements exprimés dans le texte complet entre les unités.
export function applyToUnits(units: TextUnit[], replacements: Replacement[]): void {
  for (const unit of units) {
    const len = unitText(unit).length;
    const local = replacements
      .filter((r) => r.start < unit.offset + len && r.end > unit.offset)
      .map((r) => ({
        start: Math.max(0, r.start - unit.offset),
        end: Math.min(len, r.end - unit.offset),
        text: r.text,
      }));
    if (local.length) applyToUnit(unit, local);
  }
}

// --- Métadonnées -----------------------------------------------------------------

const CORE_FIELDS: Array<[string, string]> = [
  ['dc:creator', 'auteur'],
  ['cp:lastModifiedBy', 'dernière personne à avoir modifié le fichier'],
  ['dc:title', 'titre'],
  ['dc:subject', 'sujet'],
  ['dc:description', 'commentaires'],
  ['cp:keywords', 'mots clés'],
  ['cp:category', 'catégorie'],
  ['cp:contentStatus', 'statut'],
];

const APP_FIELDS: Array<[string, string]> = [
  ['Company', 'société'],
  ['Manager', 'responsable'],
  ['HyperlinkBase', 'adresse de base des liens'],
];

// Vide les métadonnées du fichier (docProps/core.xml, app.xml, custom.xml).
// Renvoie la liste lisible de ce qui a été supprimé.
export async function stripMetadata(zip: JSZip): Promise<string[]> {
  const removed: string[] = [];
  const core = zip.file('docProps/core.xml');
  if (core) {
    const doc = parseXml(await core.async('string'));
    for (const [tag, label] of CORE_FIELDS) {
      for (const node of elementsByTag(doc, tag)) {
        if (nodeText(node).trim()) {
          removed.push(label);
          setNodeText(node, '');
        }
      }
    }
    zip.file('docProps/core.xml', serializeXml(doc));
  }
  const app = zip.file('docProps/app.xml');
  if (app) {
    const doc = parseXml(await app.async('string'));
    for (const [tag, label] of APP_FIELDS) {
      for (const node of elementsByTag(doc, tag)) {
        if (nodeText(node).trim()) {
          removed.push(label);
          setNodeText(node, '');
        }
      }
    }
    zip.file('docProps/app.xml', serializeXml(doc));
  }
  if (zip.file('docProps/custom.xml')) {
    const doc = parseXml(await zip.file('docProps/custom.xml')!.async('string'));
    const props = elementsByTag(doc, 'property');
    if (props.length) {
      removed.push('propriétés personnalisées');
      for (const p of props) p.parentNode?.removeChild(p);
      zip.file('docProps/custom.xml', serializeXml(doc));
    }
  }
  return [...new Set(removed)];
}

// Liste les fichiers de l'archive dont le nom correspond à un motif, triés.
export function partsMatching(zip: JSZip, pattern: RegExp): string[] {
  return Object.keys(zip.files)
    .filter((name) => pattern.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
