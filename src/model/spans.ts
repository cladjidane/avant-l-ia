// Transforme la sortie du modèle (une étiquette par morceau de mot) en
// repérages avec leur position exacte dans le texte. La bibliothèque ne
// donne pas ces positions : on les retrouve en recherchant chaque morceau
// dans le texte, dans l'ordre.

import type { Category } from '../detect/types';

export interface TokenPrediction {
  piece: string; // texte du morceau, tel que décodé
  label: string; // par exemple « I-PER », « B-private_person » ou « O »
  score: number;
}

export interface ModelSpan {
  start: number;
  end: number;
  category: Category;
  score: number;
}

// Correspondance entre les étiquettes des modèles et les catégories de l'outil.
const LABEL_TO_CATEGORY: Record<string, Category | null> = {
  PER: 'PERSONNE',
  ORG: 'ENTREPRISE',
  LOC: 'LIEU',
  MISC: null,
  private_person: 'PERSONNE',
  private_address: 'ADRESSE',
  private_email: 'EMAIL',
  private_phone: 'TELEPHONE',
  private_url: 'URL',
  private_date: 'DATE',
  account_number: 'AUTRE',
  secret: 'AUTRE',
};

// Découpe un long texte en morceaux d'environ « max » caractères, sur des
// fins de ligne ou de phrase, pour rester sous la limite du modèle.
export function splitIntoChunks(text: string, max = 1000): Array<{ start: number; text: string }> {
  const chunks: Array<{ start: number; text: string }> = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + max);
    if (end < text.length) {
      const window = text.slice(start, end);
      const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '));
      if (cut > max * 0.3) end = start + cut + 1;
    }
    chunks.push({ start, text: text.slice(start, end) });
    start = end;
  }
  return chunks;
}

// Retrouve la position de chaque morceau dans le texte.
export function alignPieces(text: string, pieces: string[]): Array<[number, number] | null> {
  const out: Array<[number, number] | null> = [];
  let cursor = 0;
  for (const raw of pieces) {
    const piece = raw.replace(/^[\s▁Ġ]+|[\s▁Ġ]+$/g, '');
    if (!piece) {
      out.push(null);
      continue;
    }
    const idx = text.indexOf(piece, cursor);
    if (idx < 0 || idx - cursor > 40) {
      out.push(null);
      continue;
    }
    out.push([idx, idx + piece.length]);
    cursor = idx + piece.length;
  }
  return out;
}

const CIVILITY = /^(?:M\.|MM\.|Mme|Mmes|Mlle|Monsieur|Madame|Mademoiselle|Me|Maître|Dr\.?|Docteur)\s+/u;

// Regroupe les morceaux voisins de même catégorie en repérages.
export function groupPredictions(text: string, predictions: TokenPrediction[], minScore: number): ModelSpan[] {
  const positions = alignPieces(
    text,
    predictions.map((p) => p.piece),
  );
  const spans: ModelSpan[] = [];
  let current: { start: number; end: number; type: string; scores: number[] } | null = null;
  const close = () => {
    if (!current) return;
    const category = LABEL_TO_CATEGORY[current.type];
    const score = current.scores.reduce((a, b) => a + b, 0) / current.scores.length;
    if (category && score >= minScore) {
      let start = current.start;
      let end = current.end;
      const value = text.slice(start, end);
      const civ = CIVILITY.exec(value);
      if (civ && category === 'PERSONNE') start += civ[0].length;
      while (end > start && /[\s,.;:!?)(«»"]/.test(text[end - 1])) end--;
      while (start < end && /[\s,.;:!?)(«»"]/.test(text[start])) start++;
      if (end - start >= 2) spans.push({ start, end, category, score });
    }
    current = null;
  };

  predictions.forEach((pred, i) => {
    const pos = positions[i];
    if (!pos) return;
    const match = /^(?:([BIES])-)?(.+)$/.exec(pred.label);
    if (pred.label === 'O' || !match) {
      close();
      return;
    }
    const [, prefix, type] = match;
    if (current) {
      const gap = text.slice(current.end, pos[0]);
      // Deux noms séparés par une virgule, une parenthèse ou une ligne sont deux repérages.
      const sameSpan = current.type === type && /^[ \t '’-]*$/.test(gap) && prefix !== 'B' && prefix !== 'S';
      if (!sameSpan) close();
    }
    if (current) {
      current.end = pos[1];
      current.scores.push(pred.score);
    } else {
      current = { start: pos[0], end: pos[1], type, scores: [pred.score] };
    }
    if (prefix === 'E' || prefix === 'S') close();
  });
  close();
  return spans;
}
