// Test du modèle réel. Il télécharge le modèle (environ 115 Mo) : il ne
// tourne que si la variable MODEL_TESTS=1 est posée.
//   MODEL_TESTS=1 npx vitest run tests/model.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { MODEL_DTYPE, MODEL_ID, MODEL_MIN_SCORE } from '../src/config';
import { runModel, type ModelLike, type TokenizerLike } from '../src/model/run';
import { maskText } from '../src/mask/engine';
import type { Span } from '../src/detect/types';

const enabled = process.env.MODEL_TESTS === '1';

describe.runIf(enabled)('modèle de détection', () => {
  async function modelSpans(text: string): Promise<Span[]> {
    const { AutoTokenizer, AutoModelForTokenClassification, env } = await import('@huggingface/transformers');
    if (process.env.HF_CACHE) env.cacheDir = process.env.HF_CACHE;
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
    const model = await AutoModelForTokenClassification.from_pretrained(MODEL_ID, { dtype: MODEL_DTYPE });
    const id2label = (model.config as unknown as { id2label: Record<string, string> }).id2label;
    const spans = await runModel(tokenizer as unknown as TokenizerLike, model as unknown as ModelLike, id2label, text, MODEL_MIN_SCORE);
    return spans.map((s) => ({ ...s, source: 'model' as const }));
  }

  test('compte rendu de réunion : chaque personne est repérée séparément', async () => {
    const text = readFileSync(new URL('../fixtures/compte-rendu-reunion.txt', import.meta.url), 'utf8');
    const spans = await modelSpans(text);
    const values = spans.map((s) => `${s.category}:${text.slice(s.start, s.end)}`);
    console.log(values);
    for (const v of ['PERSONNE:Gaëlle Morvan', 'PERSONNE:Hervé Quéré', 'PERSONNE:Nolwenn Abgrall', 'PERSONNE:Pierre-Yves Cozic', 'LIEU:Landerneau', 'ENTREPRISE:Armor Logistique', 'ENTREPRISE:Kerhuel Distribution']) {
      expect(values).toContain(v);
    }
    const masked = maskText(text, { modelSpans: spans }).maskedText;
    console.log(masked);
    for (const name of ['Morvan', 'Quéré', 'Abgrall', 'Riou', 'Cozic', 'Landerneau', 'Armor Logistique', 'Kerhuel']) {
      expect(masked).not.toContain(name);
    }
  }, 300_000);

  test('mail Le Gall : le modèle et les règles ensemble', async () => {
    const text = readFileSync(new URL('../fixtures/mail-le-gall.txt', import.meta.url), 'utf8');
    const spans = await modelSpans(text);
    const masked = maskText(text, { modelSpans: spans }).maskedText;
    console.log(masked);
    for (const v of ['Sophie', 'Menuiserie Le Gall', 'Plouider', '18 450 €', 'Kerboul', '12 rue de Brest', '06 12 34 56 78', 'yann.legall', 'Yann Le Gall']) {
      expect(masked).not.toContain(v);
    }
  }, 300_000);
});
