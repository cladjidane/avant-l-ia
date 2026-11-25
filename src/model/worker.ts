// Programme qui tourne à part de la page (Web Worker) : il charge le modèle
// de détection et l'exécute, sans bloquer l'interface.

import { AutoModelForTokenClassification, AutoTokenizer, env } from '@huggingface/transformers';
import { MODEL_DTYPE, MODEL_ID, MODEL_MIN_SCORE } from '../config';
// Fichiers du moteur de calcul, inclus dans l'outil (jamais chargés depuis un site extérieur).
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import type { ModelSpan } from './spans';
import { runModel, type ModelLike, type TokenizerLike } from './run';

export type WorkerRequest =
  | { type: 'load' }
  | { type: 'detect'; id: number; text: string };

export type WorkerResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: string }
  | { type: 'load-error'; message: string }
  | { type: 'result'; id: number; spans: ModelSpan[] }
  | { type: 'detect-error'; id: number; message: string };

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
type Model = Awaited<ReturnType<typeof AutoModelForTokenClassification.from_pretrained>>;

let tokenizer: Tokenizer | null = null;
let model: Model | null = null;
let id2label: Record<string, string> = {};

const post = (msg: WorkerResponse) => (self as unknown as Worker).postMessage(msg);

// Suivi du téléchargement, fichier par fichier, additionné.
const fileProgress = new Map<string, { loaded: number; total: number }>();
function onProgress(info: { status: string; file?: string; loaded?: number; total?: number }): void {
  if (info.status !== 'progress' || !info.file) return;
  fileProgress.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
  let loaded = 0;
  let total = 0;
  for (const p of fileProgress.values()) {
    loaded += p.loaded;
    total += p.total;
  }
  post({ type: 'progress', loaded, total });
}

async function load(): Promise<void> {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  // Les fichiers du moteur de calcul sont servis par l'outil lui-même.
  env.useWasmCache = false;
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = {
      mjs: new URL(ortMjsUrl, self.location.href).href,
      wasm: new URL(ortWasmUrl, self.location.href).href,
    };
  }
  tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback: onProgress });
  // Ce petit modèle quantifié tourne vite sur le processeur. La carte
  // graphique demanderait la version complète, quatre fois plus lourde.
  model = await AutoModelForTokenClassification.from_pretrained(MODEL_ID, {
    dtype: MODEL_DTYPE,
    device: 'wasm',
    progress_callback: onProgress,
  });
  id2label = (model.config as unknown as { id2label: Record<string, string> }).id2label;
  post({ type: 'ready', device: 'wasm' });
}

async function detect(text: string): Promise<ModelSpan[]> {
  if (!tokenizer || !model) throw new Error('Le modèle n’est pas chargé.');
  return runModel(tokenizer as unknown as TokenizerLike, model as unknown as ModelLike, id2label, text, MODEL_MIN_SCORE);
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'load') {
    try {
      await load();
    } catch (err) {
      post({ type: 'load-error', message: err instanceof Error ? err.message : String(err) });
    }
  } else if (msg.type === 'detect') {
    try {
      post({ type: 'result', id: msg.id, spans: await detect(msg.text) });
    } catch (err) {
      post({ type: 'detect-error', id: msg.id, message: err instanceof Error ? err.message : String(err) });
    }
  }
});
