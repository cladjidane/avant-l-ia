// Charge le modèle de repérage des noms sur l'ordinateur, avec le même
// réglage que la façon « Complète » de la version web. Le premier lancement
// télécharge le modèle (environ 115 Mo) depuis Hugging Face, puis le garde.

import { MODEL_DTYPE, MODEL_ID, MODEL_MIN_SCORE } from '../src/config';
import { runModel, type ModelLike, type TokenizerLike } from '../src/model/run';
import type { Span } from '../src/detect/types';

export type Detector = (text: string) => Promise<Span[]>;

// Mots courts que le modèle prend parfois pour un nom (« La » en début de
// phrase repéré comme un lieu). Un seul de ces repérages suffit à masquer le
// mot partout dans le texte : on les écarte.
const COMMON_WORDS = new Set([
  'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'un', 'une', 'et', 'en', 'au', 'aux', 'à', 'a', 'ce', 'ces',
  'se', 'sa', 'son', 'ses', 'sur', 'par', 'pour', 'dans', 'avec', 'il', 'elle', 'on', 'nous', 'vous', 'je', 'tu',
  'the', 'of', 'and', 'to', 'in', 'on', 'at', 'for',
]);

export function isCommonWord(value: string): boolean {
  const v = value.trim().toLowerCase().replace(/['’]$/, '');
  return v.length < 3 || COMMON_WORDS.has(v);
}

export async function loadModel(cacheDir: string): Promise<Detector> {
  const { AutoModelForTokenClassification, AutoTokenizer, env } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  env.allowLocalModels = false;
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
  const model = await AutoModelForTokenClassification.from_pretrained(MODEL_ID, { dtype: MODEL_DTYPE });
  const id2label = (model.config as unknown as { id2label: Record<string, string> }).id2label;
  return async (text: string) => {
    const spans = await runModel(
      tokenizer as unknown as TokenizerLike,
      model as unknown as ModelLike,
      id2label,
      text,
      MODEL_MIN_SCORE,
    );
    return spans
      .filter((s) => !isCommonWord(text.slice(s.start, s.end)))
      .map((s) => ({ start: s.start, end: s.end, category: s.category, source: 'model' as const }));
  };
}
