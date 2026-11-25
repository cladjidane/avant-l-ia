// Fichiers PDF : on lit seulement le texte. Modifier un PDF sans risquer d'y
// laisser le texte d'origine (calques, texte caché) est très difficile, donc
// le résultat ressort en Word et en texte simple.

import type { SourceDocument } from './types';
import { suffixedName } from '../ui/helpers';
import { textToDocx } from './docx';

export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Le programme de lecture du PDF tourne à part ; son fichier est inclus dans l'outil.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str;
      if (item.hasEOL) text += '\n';
    }
    pages.push(text.replace(/[ \t]+\n/g, '\n').trim());
  }
  await task.destroy();
  return pages.filter(Boolean).join('\n\n') + '\n';
}

export async function loadPdf(file: File): Promise<SourceDocument> {
  const text = await extractPdfText(await file.arrayBuffer());
  const name = file.name;
  return {
    kind: 'pdf',
    name,
    text: text.trim() ? text : '',
    structured: true,
    note: 'Seul le texte du PDF est lu. La mise en page ne sera pas conservée.',
    async build(_replacements, maskedText) {
      const docx = await textToDocx(maskedText);
      return {
        files: [
          { blob: docx, fileName: suffixedName(name, 'nettoye', 'docx') },
          { blob: new Blob([maskedText], { type: 'text/plain;charset=utf-8' }), fileName: suffixedName(name, 'nettoye', 'txt') },
        ],
        report: { removedMetadata: [] },
      };
    },
  };
}
