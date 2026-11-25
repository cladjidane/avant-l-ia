// Nom de l'outil, affiché partout dans l'interface. Le changer ici suffit.
export const APP_NAME = "Avant l'IA";

// Adresse du code source, affichée dans le pied de page.
// À remplacer par l'adresse du dépôt une fois qu'il est créé sur GitHub.
export const SOURCE_URL = 'https://github.com/';

// Clé de stockage local de la liste « Toujours masquer ».
export const ALWAYS_MASK_STORAGE_KEY = 'avant-l-ia.always-mask';

// Modèle de détection utilisé par la façon de repérer « Complète ».
// Voir le README, partie « Choix du modèle », pour les raisons de ce choix.
export const MODEL_ID = 'Xenova/camembert-ner';
export const MODEL_DTYPE = 'q8';
// Taille approximative du téléchargement, affichée avant le premier chargement.
export const MODEL_SIZE_MB = 115;
// Score minimal pour retenir un nom repéré par le modèle.
export const MODEL_MIN_SCORE = 0.6;
