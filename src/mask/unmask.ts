// Remet les vraies valeurs à la place des étiquettes dans la réponse de l'IA.
// Les IA modifient parfois les étiquettes : crochets perdus, espaces ajoutés,
// minuscules, accents. On accepte ces variantes.

import { CATEGORIES } from '../detect/types';

export interface Correspondence {
  label: string; // forme d'origine, par exemple [PERSONNE_1]
  value: string;
}

export interface UnmaskPiece {
  text: string;
  restored: boolean;
  label?: string;
}

export interface UnmaskResult {
  text: string;
  pieces: UnmaskPiece[];
  restoredCount: number;
  // Étiquettes trouvées dans le texte mais absentes de la table.
  unknownLabels: string[];
  // Position de chaque étiquette remplacée dans le texte d'entrée.
  matches: Array<{ start: number; end: number; text: string }>;
}

// Écriture tolérante d'un nom de catégorie : accents facultatifs.
function tolerantCategory(category: string): string {
  return category
    .split('')
    .map((c) => (c === 'E' ? '[EÉÈÊeéèê]' : `[${c}${c.toLowerCase()}]`))
    .join('');
}

const LABEL_RE = new RegExp(
  `(\\[\\s*)?(?<![\\p{L}\\p{N}])(${CATEGORIES.map(tolerantCategory).join('|')})(\\s*[_\\- ]\\s*|_)?(\\d{1,4})(?![\\p{N}])(\\s*\\])?`,
  'gu',
);

function canonicalLabel(category: string, n: string): string {
  const cat = category
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  return `[${cat}_${Number(n)}]`;
}

// Étiquettes de l'outil trouvées dans un texte, sous leur forme canonique
// ([PERSONNE_1]) même si l'IA les a abîmées.
export function scanToolLabels(text: string): Array<{ start: number; end: number; label: string }> {
  const found: Array<{ start: number; end: number; label: string }> = [];
  for (const m of text.matchAll(LABEL_RE)) {
    const [whole, open, category, sep, n, close] = m;
    // Sans crochet, on exige au moins un séparateur pour ne pas confondre avec
    // un mot ordinaire suivi d'un nombre (« personne 2 » reste tel quel si ce
    // n'est pas en majuscules).
    const isUpper = category === category.toUpperCase();
    if (!open && !close && !(sep && sep.includes('_')) && !(isUpper && sep)) continue;
    // « [MONTANT_1/3] » : crochet ouvert puis autre chose qu'une fin de mot.
    // C'est un trou ajouté par l'IA, pas une étiquette de l'outil.
    const next = text[m.index + whole.length] ?? '';
    if (open && !close && next && !/[\s.,;:!?)»]/u.test(next)) continue;
    found.push({ start: m.index, end: m.index + whole.length, label: canonicalLabel(category, n) });
  }
  return found;
}

// Table de correspondance sous forme d'index : étiquette canonique → vraie valeur.
export function tableToMap(table: Correspondence[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const { label, value } of table) {
    const m = /^\[?\s*([A-Z]+)\s*_\s*(\d+)\s*\]?$/i.exec(label.trim());
    if (m) map.set(canonicalLabel(m[1], m[2]), value);
  }
  return map;
}

export function unmaskText(text: string, table: Correspondence[]): UnmaskResult {
  const map = tableToMap(table);
  const pieces: UnmaskPiece[] = [];
  const unknown = new Set<string>();
  let cursor = 0;
  let restoredCount = 0;
  const matches: UnmaskResult['matches'] = [];
  for (const { start, end, label } of scanToolLabels(text)) {
    const value = map.get(label);
    if (value === undefined) {
      unknown.add(label);
      continue;
    }
    if (start > cursor) pieces.push({ text: text.slice(cursor, start), restored: false });
    pieces.push({ text: value, restored: true, label });
    restoredCount++;
    matches.push({ start, end, text: value });
    cursor = end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), restored: false });
  return {
    text: pieces.map((p) => p.text).join(''),
    pieces,
    restoredCount,
    unknownLabels: [...unknown],
    matches,
  };
}

// --- Table de correspondance en .csv ------------------------------------------

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Séparateur point-virgule, lu directement par un tableur réglé en français.
export function tableToCsv(table: Correspondence[]): string {
  const lines = ['"Étiquette";"Vraie valeur"', ...table.map((e) => `${csvCell(e.label)};${csvCell(e.value)}`)];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Lit un .csv simple (séparateur ; ou , et guillemets).
export function parseCsv(content: string): string[][] {
  const text = content.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function csvToTable(content: string): Correspondence[] {
  const rows = parseCsv(content);
  const table: Correspondence[] = [];
  for (const r of rows) {
    if (r.length < 2) continue;
    const label = r[0].trim();
    if (!/^\[?\s*[A-Za-z]+\s*_\s*\d+\s*\]?$/.test(label)) continue; // ligne d'en-tête ou ligne vide
    table.push({ label, value: r[1] });
  }
  return table;
}
