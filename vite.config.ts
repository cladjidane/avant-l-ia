/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

// Règles de sécurité de la page : rien ne peut être chargé ni envoyé ailleurs
// que sur le site de l'outil, sauf le téléchargement du modèle depuis Hugging Face.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self' https://huggingface.co https://*.hf.co",
  "img-src 'self' data: blob:",
  "style-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Ajoute la règle de sécurité au build seulement : le serveur de
// développement a besoin de scripts que cette règle bloquerait.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// Écrit sw.js, le programme qui garde l'outil sur l'ordinateur pour qu'il
// marche ensuite sans connexion. Il met en réserve toutes les pages et tous
// les scripts dès la première visite. Le gros fichier du moteur de calcul
// (.wasm) n'est gardé que s'il sert, c'est-à-dire avec la façon « Complète ».
function offlineServiceWorker(): Plugin {
  return {
    name: 'offline-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const all = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const files = all.filter((f) => !f.endsWith('.wasm'));
      const version = Date.now().toString(36);
      const source = `// Fichier produit au build. Voir vite.config.ts.
const CACHE = 'avant-l-ia-${version}';
const PRECACHE = ${JSON.stringify(['./', ...files.filter((f) => f !== 'index.html')])};
// Fichiers de cette version, y compris ceux gardés seulement s'ils servent.
const KNOWN = ${JSON.stringify(all.filter((f) => f !== 'index.html'))};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  // Les noms des fichiers changent avec leur contenu : un fichier de même nom
  // gardé par une version précédente (le moteur de calcul, par exemple) est
  // repris tel quel, puis les anciennes réserves sont supprimées.
  event.waitUntil((async () => {
    const current = await caches.open(CACHE);
    const old = (await caches.keys()).filter((k) => k.startsWith('avant-l-ia-') && k !== CACHE);
    for (const name of old) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname.split('/').slice(-2).join('/');
        if (KNOWN.includes(path) && !(await current.match(request))) {
          const response = await cache.match(request);
          if (response) await current.put(request, response);
        }
      }
      await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // La page elle-même : d'abord le réseau pour avoir la dernière version,
  // la copie gardée sinon (hors ligne).
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          if (response.ok) caches.open(CACHE).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./', { ignoreVary: true })),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true, ignoreVary: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => Response.error());
    }),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [contentSecurityPolicy(), offlineServiceWorker()],
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
