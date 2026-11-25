// Compare les modèles de détection candidats sur les textes français de test.
// Usage : node scripts/compare-models.mjs [dossier-cache]
// Le premier lancement télécharge les modèles (plusieurs centaines de Mo).
import { readFileSync } from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';

if (process.argv[2]) env.cacheDir = process.argv[2];

const texts = ['mail-le-gall.txt', 'courrier-cabinet.txt', 'compte-rendu-reunion.txt'].map((f) =>
  readFileSync(new URL(`../fixtures/${f}`, import.meta.url), 'utf8'),
);

const candidates = [
  { id: 'Xenova/camembert-ner', dtype: 'q8' },
  { id: 'openai/privacy-filter', dtype: 'q4' },
];

for (const { id, dtype } of candidates) {
  const t0 = Date.now();
  const classifier = await pipeline('token-classification', id, { dtype });
  console.log(`\n===== ${id} (${dtype}) chargé en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const text of texts) {
    const t1 = Date.now();
    const out = await classifier(text, { aggregation_strategy: 'simple' });
    console.log(`--- texte (${Date.now() - t1} ms)`);
    for (const e of out) console.log(`  ${e.entity_group.padEnd(16)} ${e.score.toFixed(2)}  ${JSON.stringify(e.word)}`);
  }
}
