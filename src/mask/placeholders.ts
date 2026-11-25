// Trous à remplir dans la réponse de l'IA : les étiquettes de l'outil
// ([PERSONNE_1]) et ceux que l'IA ajoute elle-même ([adresse e-mail],
// {date}, [Prénom]). Chaque trou devient une ligne à remplir ; une même
// valeur remplace toutes les occurrences du trou.

import { scanToolLabels } from './unmask';

export type PlaceholderKind = 'tool' | 'ai';

export interface Placeholder {
  key: string; // [PERSONNE_1] pour l'outil, texte intérieur normalisé pour l'IA
  display: string; // forme affichée, telle qu'écrite la première fois
  kind: PlaceholderKind;
  count: number;
}

interface Occurrence {
  start: number;
  end: number;
  key: string;
}

export interface ScanResult {
  placeholders: Placeholder[]; // dans l'ordre d'apparition
  occurrences: Occurrence[];
}

// Trou ajouté par l'IA : texte court entre crochets ou accolades, sans être
// un lien Markdown ([texte](adresse)) ni un simple numéro de note ([1]).
const AI_HOLE = /\[([^[\]\n]{1,60})\](?!\()|\{\{?([^{}\n]{1,60})\}?\}/gu;

function aiKey(inner: string): string {
  return inner.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function scanPlaceholders(text: string): ScanResult {
  const occurrences: Occurrence[] = scanToolLabels(text).map((m) => ({ start: m.start, end: m.end, key: m.label }));
  const taken = (start: number, end: number) => occurrences.some((o) => start < o.end && o.start < end);
  for (const m of text.matchAll(AI_HOLE)) {
    const inner = (m[1] ?? m[2] ?? '').trim();
    const end = m.index + m[0].length;
    if (!inner || /^\d+$/.test(inner) || taken(m.index, end)) continue;
    occurrences.push({ start: m.index, end, key: `ai:${aiKey(inner)}` });
  }
  occurrences.sort((a, b) => a.start - b.start);

  const byKey = new Map<string, Placeholder>();
  for (const o of occurrences) {
    const existing = byKey.get(o.key);
    if (existing) {
      existing.count++;
      continue;
    }
    const isTool = !o.key.startsWith('ai:');
    byKey.set(o.key, {
      key: o.key,
      display: isTool ? o.key : text.slice(o.start, o.end),
      kind: isTool ? 'tool' : 'ai',
      count: 1,
    });
  }
  return { placeholders: [...byKey.values()], occurrences };
}

export type FilledPiece =
  | { kind: 'plain'; text: string }
  | { kind: 'filled'; text: string; key: string }
  | { kind: 'empty'; text: string; key: string };

export interface FillResult {
  pieces: FilledPiece[];
  text: string; // texte final ; un trou vide garde sa forme d'origine
  missing: Placeholder[]; // trous encore vides
  matches: Array<{ start: number; end: number; text: string }>; // remplacements effectués
}

// Remplit les trous avec les valeurs données (clé → valeur). Une valeur vide
// laisse le trou tel quel, pour qu'il reste visible.
export function fillPlaceholders(text: string, values: Map<string, string>, scan = scanPlaceholders(text)): FillResult {
  const pieces: FilledPiece[] = [];
  const matches: FillResult['matches'] = [];
  let cursor = 0;
  for (const o of scan.occurrences) {
    if (o.start > cursor) pieces.push({ kind: 'plain', text: text.slice(cursor, o.start) });
    const value = values.get(o.key)?.trim() ? values.get(o.key)! : '';
    if (value) {
      pieces.push({ kind: 'filled', text: value, key: o.key });
      matches.push({ start: o.start, end: o.end, text: value });
    } else {
      pieces.push({ kind: 'empty', text: text.slice(o.start, o.end), key: o.key });
    }
    cursor = o.end;
  }
  if (cursor < text.length) pieces.push({ kind: 'plain', text: text.slice(cursor) });
  const missing = scan.placeholders.filter((p) => !values.get(p.key)?.trim());
  return { pieces, text: pieces.map((p) => p.text).join(''), missing, matches };
}

// Étiquettes du texte envoyé que la réponse ne reprend pas (information seulement).
export function absentLabels(sentLabels: string[], scan: ScanResult): string[] {
  const present = new Set(scan.placeholders.map((p) => p.key));
  return sentLabels.filter((l) => !present.has(l));
}
