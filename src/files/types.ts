// Un document chargé : le texte à analyser et, pour Word et Excel, de quoi
// reconstruire le fichier d'origine avec les remplacements.

export interface Replacement {
  start: number; // position dans le texte analysé
  end: number;
  text: string; // texte qui remplace, par exemple [PERSONNE_1]
}

export interface BuiltFile {
  blob: Blob;
  fileName: string;
}

export interface CleanReport {
  // Métadonnées retirées du fichier (auteur, société...), en phrases lisibles.
  removedMetadata: string[];
}

export interface SourceDocument {
  kind: 'text' | 'docx' | 'xlsx' | 'pdf';
  name: string;
  text: string;
  // Le texte affiché ne peut pas être modifié à la main (Word, Excel, PDF).
  structured: boolean;
  // Repérages propres au format (colonne « Nom » d'un tableau, par exemple).
  extraSpans?: import('../detect/types').Span[];
  // Message affiché à côté du nom du fichier.
  note?: string;
  // Construit le ou les fichiers nettoyés.
  build(replacements: Replacement[], maskedText: string): Promise<{ files: BuiltFile[]; report: CleanReport }>;
}
