// Assemble les repérages (règles, modèle, listes), règle les chevauchements,
// attribue une étiquette stable à chaque valeur et découpe le texte en morceaux
// affichables (texte normal ou élément masqué).

import { findTerm, detectWithRules } from '../detect/rules';
import { FIRST_NAMES } from '../detect/firstnames';
import { CATEGORIES, type Category, type Span, type SpanSource } from '../detect/types';

export interface MaskOptions {
  // Termes de la liste « Toujours masquer ».
  alwaysMask?: string[];
  // Termes ajoutés pendant la relecture (« Masquer aussi ce mot »).
  manualTerms?: string[];
  // Repérages fournis par le modèle de détection, s'il a tourné.
  modelSpans?: Span[];
  // Valeurs remises en clair pendant la relecture (clés normalisées).
  revealed?: Set<string>;
  // Valeurs repérées mais retirées définitivement de la détection.
  ignored?: Set<string>;
  // Désactive les règles (utile pour masquer avec une table existante).
  skipRules?: boolean;
}

export interface TableEntry {
  label: string;
  category: Category;
  value: string;
  key: string;
  count: number;
  revealed: boolean;
}

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'entity'; text: string; label: string; key: string; category: Category; revealed: boolean };

export interface MaskResult {
  segments: Segment[];
  maskedText: string;
  entries: TableEntry[];
}

const NUMERIC: ReadonlySet<Category> = new Set<Category>([
  'TELEPHONE', 'IBAN', 'SIRET', 'SIREN', 'NIR', 'TVA', 'PLAQUE', 'MONTANT',
]);

// Catégories dont la valeur, une fois repérée, est cherchée partout ailleurs.
const PROPAGATE: ReadonlySet<Category> = new Set<Category>(['PERSONNE', 'ENTREPRISE', 'LIEU', 'AUTRE']);

const SOURCE_RANK: Record<SpanSource, number> = { list: 0, manual: 1, rule: 2, model: 3, variant: 4 };
const CATEGORY_RANK = new Map<Category, number>([
  ['EMAIL', 0], ['URL', 1], ['IBAN', 2], ['NIR', 3], ['SIRET', 4], ['TVA', 5], ['SIREN', 6],
  ['TELEPHONE', 7], ['PLAQUE', 8], ['ADRESSE', 9], ['MONTANT', 10], ['DATE', 11],
  ['ENTREPRISE', 12], ['PERSONNE', 13], ['LIEU', 14], ['AUTRE', 15],
]);

// Clé de regroupement d'une valeur : deux écritures proches donnent la même clé.
export function normalizeKey(value: string, category: Category): string {
  let v = value.normalize('NFC').replace(/[\s  ]+/g, ' ').trim().toLowerCase();
  if (NUMERIC.has(category)) {
    v = v.replace(/[^a-z0-9€]/g, '');
    if (category === 'TELEPHONE') v = v.replace(/^(?:\+33|0033|33)(?:0)?/, '0');
  }
  return v;
}

const FIRST_NAME_SET = new Set(FIRST_NAMES.map((n) => n.toLowerCase()));

// Variantes d'un nom de personne : sans le prénom (« Yann Le Gall » donne « Le Gall »).
function personVariants(value: string): string[] {
  const words = value.split(/\s+/);
  if (words.length < 2) return [];
  const first = words[0].toLowerCase();
  const firstParts = first.split('-');
  if (!FIRST_NAME_SET.has(first) && !firstParts.every((p) => FIRST_NAME_SET.has(p))) return [];
  const rest = words.slice(1).join(' ');
  return rest.length > 2 ? [rest] : [];
}

// Un lieu deviné par la règle « à X », « chez X » est moins sûr que ce que
// dit le modèle sur le même mot (« chez Kerhuel Distribution » est une entreprise).
function sourceRank(s: Span): number {
  return s.source === 'rule' && s.category === 'LIEU' ? 3.5 : SOURCE_RANK[s.source];
}

// Garde les repérages qui ne se chevauchent pas : le plus long gagne, puis le plus sûr.
function resolveOverlaps(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => {
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    const srcDiff = sourceRank(a) - sourceRank(b);
    if (srcDiff !== 0) return srcDiff;
    return (CATEGORY_RANK.get(a.category) ?? 99) - (CATEGORY_RANK.get(b.category) ?? 99);
  });
  // Les sources sûres (liste, ajout à la main) passent avant tout le reste.
  const priority = sorted.filter((s) => s.source === 'list' || s.source === 'manual');
  const others = sorted.filter((s) => s.source !== 'list' && s.source !== 'manual');
  const kept: Span[] = [];
  const overlaps = (s: Span) => kept.some((k) => s.start < k.end && k.start < s.end);
  for (const s of [...priority, ...others]) if (!overlaps(s)) kept.push(s);
  return kept.sort((a, b) => a.start - b.start);
}

export function maskText(text: string, options: MaskOptions = {}): MaskResult {
  const revealed = options.revealed ?? new Set<string>();
  const ignored = options.ignored ?? new Set<string>();
  let spans: Span[] = options.skipRules ? [] : detectWithRules(text);
  if (options.modelSpans) spans.push(...options.modelSpans);

  for (const term of options.alwaysMask ?? []) {
    for (const [start, end] of findTerm(text, term)) spans.push({ start, end, category: 'AUTRE', source: 'list' });
  }
  for (const term of options.manualTerms ?? []) {
    for (const [start, end] of findTerm(text, term)) spans.push({ start, end, category: 'AUTRE', source: 'manual' });
  }

  // Un terme de la liste déjà repéré par une règle garde la catégorie de la règle.
  const ruleCategoryByKey = new Map<string, Category>();
  for (const s of spans) {
    if (s.source === 'rule' || s.source === 'model') {
      const key = normalizeKey(text.slice(s.start, s.end), 'AUTRE');
      if (!ruleCategoryByKey.has(key)) ruleCategoryByKey.set(key, s.category);
    }
  }
  for (const s of spans) {
    if (s.source === 'list' || s.source === 'manual') {
      const cat = ruleCategoryByKey.get(normalizeKey(text.slice(s.start, s.end), 'AUTRE'));
      if (cat) s.category = cat;
    }
  }

  spans = spans.filter((s) => !ignored.has(normalizeKey(text.slice(s.start, s.end), s.category)));

  // Propagation : une valeur repérée une fois est masquée partout, avec ses variantes.
  const seen = new Map<string, { category: Category; value: string }>();
  for (const s of spans) {
    if (!PROPAGATE.has(s.category)) continue;
    const value = text.slice(s.start, s.end);
    const key = normalizeKey(value, s.category);
    if (!seen.has(key)) seen.set(key, { category: s.category, value });
  }
  // Nom de famille seul → personne complète (« Abgrall » → « Nolwenn Abgrall »).
  const aliases = new Map<string, string>();
  for (const [key, { category, value }] of seen) {
    for (const [start, end] of findTerm(text, value)) spans.push({ start, end, category, source: 'variant' });
    if (category === 'PERSONNE') {
      for (const variant of personVariants(value)) {
        const variantKey = normalizeKey(variant, category);
        if (ignored.has(variantKey)) continue;
        if (!aliases.has(variantKey)) aliases.set(variantKey, key);
        for (const [start, end] of findTerm(text, variant)) {
          spans.push({ start, end, category, source: 'variant', aliasOf: key });
        }
      }
    }
  }

  const kept = resolveOverlaps(spans);

  // Attribution des étiquettes dans l'ordre d'apparition.
  const counters = new Map<Category, number>();
  const entriesByKey = new Map<string, TableEntry>();
  const segments: Segment[] = [];
  let cursor = 0;
  for (const s of kept) {
    const value = text.slice(s.start, s.end);
    const ownKey = normalizeKey(value, s.category);
    const aliasOf = s.aliasOf ?? (s.category === 'PERSONNE' ? aliases.get(ownKey) : undefined);
    const key = aliasOf ?? ownKey;
    let entry = entriesByKey.get(key);
    if (!entry) {
      const n = (counters.get(s.category) ?? 0) + 1;
      counters.set(s.category, n);
      entry = {
        label: `[${s.category}_${n}]`,
        category: s.category,
        value: aliasOf ? (seen.get(aliasOf)?.value ?? value) : value,
        key,
        count: 0,
        revealed: revealed.has(key),
      };
      entriesByKey.set(key, entry);
    }
    entry.count++;
    if (s.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, s.start) });
    segments.push({
      kind: 'entity',
      text: value,
      label: entry.label,
      key,
      category: entry.category,
      revealed: entry.revealed,
    });
    cursor = s.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });

  const maskedText = segments
    .map((seg) => (seg.kind === 'text' || seg.revealed ? seg.text : seg.label))
    .join('');

  const entries = [...entriesByKey.values()].sort(
    (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || labelNumber(a.label) - labelNumber(b.label),
  );
  return { segments, maskedText, entries };
}

function labelNumber(label: string): number {
  return Number(/_(\d+)\]$/.exec(label)?.[1] ?? 0);
}
