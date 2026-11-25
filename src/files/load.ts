// Ouverture d'un fichier déposé : choisit le bon lecteur selon l'extension.

import type { SourceDocument } from './types';
import { suffixedName } from '../ui/helpers';
import { csvColumnSpans } from './columns';

export class UnsupportedFileError extends Error {}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function textDocument(name: string, text: string): SourceDocument {
  const ext = extensionOf(name) || 'txt';
  const type = ext === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8';
  return {
    kind: 'text',
    name,
    text,
    structured: false,
    extraSpans: ext === 'csv' ? csvColumnSpans(text) : undefined,
    async build(_replacements, maskedText) {
      // Le BOM aide Excel à lire les accents d'un .csv.
      const content = ext === 'csv' ? '\ufeff' + maskedText : maskedText;
      return {
        files: [{ blob: new Blob([content], { type }), fileName: suffixedName(name, 'nettoye', ext) }],
        report: { removedMetadata: [] },
      };
    },
  };
}

export async function loadFile(file: File): Promise<SourceDocument> {
  const ext = extensionOf(file.name);
  switch (ext) {
    case 'txt':
    case 'md':
    case 'csv':
    case 'text':
      return textDocument(file.name, await file.text());
    case 'docx': {
      const { loadDocx } = await import('./docx');
      return loadDocx(file);
    }
    case 'xlsx': {
      const { loadXlsx } = await import('./xlsx');
      return loadXlsx(file);
    }
    case 'pdf': {
      const { loadPdf } = await import('./pdf');
      return loadPdf(file);
    }
    default:
      throw new UnsupportedFileError(
        `Ce type de fichier n'est pas pris en charge (${ext ? '.' + ext : 'sans extension'}). Utilisez un fichier .txt, .md, .csv, .docx, .xlsx ou .pdf, ou collez le texte.`,
      );
  }
}
