// Côté page : démarre le programme du modèle et lui envoie les textes.

import { MODEL_ID } from '../config';
import type { ModelSpan } from './spans';
import type { WorkerRequest, WorkerResponse } from './worker';

let worker: Worker | null = null;
let loadPromise: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (s: ModelSpan[]) => void; reject: (e: Error) => void }>();
let progressListener: ((loaded: number, total: number) => void) | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'progress') progressListener?.(msg.loaded, msg.total);
      if (msg.type === 'result') pending.get(msg.id)?.resolve(msg.spans);
      if (msg.type === 'detect-error') pending.get(msg.id)?.reject(new Error(msg.message));
      if (msg.type === 'result' || msg.type === 'detect-error') pending.delete(msg.id);
    });
  }
  return worker;
}

export function isModelLoaded(): boolean {
  return loadPromise !== null;
}

export function loadModel(onProgress: (loaded: number, total: number) => void): Promise<void> {
  progressListener = onProgress;
  if (loadPromise) return loadPromise;
  const w = getWorker();
  loadPromise = new Promise<void>((resolve, reject) => {
    const listener = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === 'ready') {
        w.removeEventListener('message', listener);
        resolve();
      } else if (event.data.type === 'load-error') {
        w.removeEventListener('message', listener);
        loadPromise = null;
        reject(new Error(event.data.message));
      }
    };
    w.addEventListener('message', listener);
    const request: WorkerRequest = { type: 'load' };
    w.postMessage(request);
  });
  return loadPromise;
}

export function detectWithModel(text: string): Promise<ModelSpan[]> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: WorkerRequest = { type: 'detect', id, text };
    w.postMessage(request);
  });
}

// Le modèle est-il déjà gardé par le navigateur (pas de téléchargement à prévoir) ?
export async function isModelCached(): Promise<boolean> {
  try {
    if (!('caches' in window)) return false;
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((req) => req.url.includes(MODEL_ID) && req.url.includes('.onnx'));
  } catch {
    return false;
  }
}
