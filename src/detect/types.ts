// Catégories d'éléments masqués. Le nom sert directement d'étiquette : [PERSONNE_1].
export const CATEGORIES = [
  'PERSONNE',
  'ENTREPRISE',
  'ADRESSE',
  'LIEU',
  'TELEPHONE',
  'EMAIL',
  'URL',
  'IBAN',
  'SIRET',
  'SIREN',
  'NIR',
  'TVA',
  'PLAQUE',
  'MONTANT',
  'DATE',
  'AUTRE',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Origine d'un repérage, de la plus fiable à la moins fiable.
export type SpanSource = 'list' | 'manual' | 'rule' | 'model' | 'variant';

// Un morceau du texte repéré comme donnée à masquer.
export interface Span {
  start: number;
  end: number;
  category: Category;
  source: SpanSource;
  // Clé de regroupement imposée (cas d'une variante d'une valeur déjà repérée).
  aliasOf?: string;
}

// Libellés affichés à l'écran pour chaque catégorie (singulier, pluriel).
export const CATEGORY_LABELS: Record<Category, [string, string]> = {
  PERSONNE: ['personne', 'personnes'],
  ENTREPRISE: ['entreprise', 'entreprises'],
  ADRESSE: ['adresse', 'adresses'],
  LIEU: ['lieu', 'lieux'],
  TELEPHONE: ['numéro de téléphone', 'numéros de téléphone'],
  EMAIL: ['adresse mail', 'adresses mail'],
  URL: ['adresse de site', 'adresses de site'],
  IBAN: ['numéro de compte bancaire', 'numéros de compte bancaire'],
  SIRET: ['numéro SIRET', 'numéros SIRET'],
  SIREN: ['numéro SIREN', 'numéros SIREN'],
  NIR: ['numéro de sécurité sociale', 'numéros de sécurité sociale'],
  TVA: ['numéro de TVA', 'numéros de TVA'],
  PLAQUE: ["plaque d'immatriculation", "plaques d'immatriculation"],
  MONTANT: ['montant', 'montants'],
  DATE: ['date', 'dates'],
  AUTRE: ['autre élément', 'autres éléments'],
};
