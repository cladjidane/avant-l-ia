// Réponse automatique à la question « Ce contenu pourrait-il être publié tel
// quel sur Internet ? » : l'outil fait le repérage et donne son verdict.

import { CATEGORY_LABELS, type Category, type Span } from '../detect/types';
import { detectSensitive } from '../detect/sensitive';
import { maskText, type MaskResult } from './engine';
import { plural } from '../ui/helpers';

// Libellés courts pour le verdict (« 1 téléphone, 1 mail »).
const SHORT_LABELS: Partial<Record<Category, [string, string]>> = {
  TELEPHONE: ['téléphone', 'téléphones'],
  EMAIL: ['mail', 'mails'],
  URL: ['site', 'sites'],
  IBAN: ['compte bancaire', 'comptes bancaires'],
  NIR: ['numéro de sécurité sociale', 'numéros de sécurité sociale'],
  PLAQUE: ['plaque', 'plaques'],
};

const BIRTH_BEFORE = /(?:\bnée?s?|date de naissance|naissance)\s*(?:le|:)?\s*$/iu;

export interface Verdict {
  publishable: boolean;
  total: number; // informations confidentielles distinctes
  byCategory: Array<[Category, number]>; // dans l'ordre d'apparition
  sensitive: number; // mots sensibles distincts
  headline: string; // « Oui, a priori. » ou « Non. »
  detail: string;
  sensitiveLine: string; // vide s'il n'y a pas de mot sensible
}

export interface CheckOptions {
  alwaysMask?: string[];
  modelSpans?: Span[]; // repérages du modèle et indices de colonnes
}

export function checkText(text: string, options: CheckOptions = {}): { result: MaskResult; verdict: Verdict } {
  const result = maskText(text, { alwaysMask: options.alwaysMask, modelSpans: options.modelSpans });
  const sensitive = new Set(detectSensitive(text).map((s) => text.slice(s.start, s.end).toLowerCase())).size;
  return { result, verdict: buildVerdict(result, sensitive) };
}

export function buildVerdict(result: MaskResult, sensitive: number): Verdict {
  // Catégories dans l'ordre où elles apparaissent dans le texte.
  const counts = new Map<Category, number>();
  const seen = new Set<string>();
  // Une date seule n'est pas confidentielle : elle reste masquable dans le
  // texte nettoyé, mais ne compte dans le verdict que si c'est une date de
  // naissance (« née le », « date de naissance : »).
  let before = ''; // derniers caractères du texte d'origine avant le segment
  for (const seg of result.segments) {
    if (seg.kind !== 'entity' || seg.revealed || seen.has(seg.key)) {
      before = (before + seg.text).slice(-40);
      continue;
    }
    const isBirthDate = seg.category === 'DATE' && BIRTH_BEFORE.test(before);
    before = (before + seg.text).slice(-40);
    if (seg.category === 'DATE' && !isBirthDate) continue;
    seen.add(seg.key);
    counts.set(seg.category, (counts.get(seg.category) ?? 0) + 1);
  }
  const byCategory = [...counts.entries()];
  const total = seen.size;
  const publishable = total === 0 && sensitive === 0;
  const parts = byCategory.map(([cat, n]) => plural(n, SHORT_LABELS[cat] ?? CATEGORY_LABELS[cat]));
  const sensitiveWords = plural(sensitive, ['mot de santé ou sensible', 'mots de santé ou sensibles']);
  let detail: string;
  let sensitiveLine = '';
  if (publishable) {
    detail = "L'outil n'a repéré aucune information confidentielle.";
  } else if (total) {
    detail = `L'outil a repéré ${plural(total, ['information confidentielle', 'informations confidentielles'])} : ${parts.join(', ')}.`;
    if (sensitive) sensitiveLine = `et ${sensitiveWords}`;
  } else {
    detail = "L'outil n'a repéré aucun nom ni aucune coordonnée.";
    sensitiveLine = `mais ${sensitiveWords}`;
  }
  return { publishable, total, byCategory, sensitive, headline: publishable ? 'Oui, a priori.' : 'Non.', detail, sensitiveLine };
}
