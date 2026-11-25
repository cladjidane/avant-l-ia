// Exécute le modèle sur un texte et renvoie les repérages. Séparé du
// programme à part (worker) pour pouvoir être testé hors navigateur.

import { groupPredictions, splitIntoChunks, type ModelSpan, type TokenPrediction } from './spans';

// Formes minimales du découpeur de texte et du modèle de Transformers.js.
export interface TokenizerLike {
  (text: string, options: { truncation: boolean }): { input_ids: unknown };
  decode(ids: number[], options: { skip_special_tokens: boolean }): string;
}
export interface ModelLike {
  (inputs: unknown): Promise<{ logits: unknown }>;
}

export async function runModel(
  tokenizer: TokenizerLike,
  model: ModelLike,
  id2label: Record<string, string>,
  text: string,
  minScore: number,
): Promise<ModelSpan[]> {
  const spans: ModelSpan[] = [];
  for (const chunk of splitIntoChunks(text)) {
    if (!chunk.text.trim()) continue;
    const inputs = tokenizer(chunk.text, { truncation: true });
    const output = await model(inputs);
    const logits = output.logits as { data: Float32Array; dims: number[] };
    const [, length, classes] = logits.dims;
    const ids = (inputs.input_ids as { tolist(): Array<Array<number | bigint>> }).tolist()[0].map(Number);
    const predictions: TokenPrediction[] = [];
    for (let j = 0; j < length; j++) {
      const row = logits.data.subarray(j * classes, (j + 1) * classes);
      let best = 0;
      for (let c = 1; c < classes; c++) if (row[c] > row[best]) best = c;
      // Probabilité de l'étiquette retenue (softmax).
      let sum = 0;
      for (let c = 0; c < classes; c++) sum += Math.exp(row[c] - row[best]);
      predictions.push({
        piece: tokenizer.decode([ids[j]], { skip_special_tokens: true }),
        label: id2label[best] ?? 'O',
        score: 1 / sum,
      });
    }
    for (const s of groupPredictions(chunk.text, predictions, minScore)) {
      spans.push({ ...s, start: s.start + chunk.start, end: s.end + chunk.start });
    }
  }
  return spans;
}
