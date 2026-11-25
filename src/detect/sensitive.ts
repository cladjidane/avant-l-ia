// Mots qui signalent une donnée sensible au sens du RGPD (santé, religion,
// opinions politiques, syndicat, vie sexuelle, origine, condamnations).
// Ils ne sont pas masqués d'office : ils sont signalés pour que la personne
// décide de les retirer ou de décrire la situation autrement.

export type SensitiveTheme = 'santé' | 'religion' | 'opinions' | 'syndicat' | 'vie sexuelle' | 'origine' | 'justice';

export interface SensitiveSpan {
  start: number;
  end: number;
  theme: SensitiveTheme;
}

// Chaque entrée est une expression : « (e)? » couvre le féminin, « s? » le pluriel.
const WORDS: Record<SensitiveTheme, string[]> = {
  santé: [
    'hospitalisée?s?', 'hospitalisation', 'arrêts? maladie', 'arrêts? de travail', 'congés? maladie', 'congés? de maladie',
    'malades?', 'maladies?', 'enceintes?', 'grossesses?', 'congé maternité', 'fausses? couches?', 'ivg',
    'cancers?', 'tumeurs?', 'chimiothérapie', 'chimio', 'radiothérapie', 'leucémie', 'dépression', 'dépressif', 'dépressive',
    'déprimée?', 'burn[- ]?out', 'épuisement professionnel', 'handicapée?s?', 'handicaps?', 'invalidité', 'rqth',
    'traitements? médica(?:l|ux)', 'sous traitement', "traitement(?!\\s+(?:de|des|du|d['’]))", 'opérée?s?', 'chirurgie', 'diabète', 'diabétique',
    'séropositive?', 'vih', 'sida', 'hépatite', 'alcoolisme', 'alcoolique', 'addiction', 'toxicomanie',
    'psychiatre', 'psychiatrique', 'hôpital psychiatrique', 'thérapie', 'psychothérapie', 'anxiété', 'crise d\'angoisse',
    'accident du travail', 'mi-temps thérapeutique', 'affection de longue durée', 'ald', 'autisme', 'autiste',
    'alzheimer', 'parkinson', 'avc', 'infarctus', 'convalescence', 'rééducation', 'médecin du travail',
  ],
  religion: [
    'musulmane?s?', 'juifs?', 'juives?', 'chrétiens?', 'chrétiennes?', 'catholiques?', 'protestante?s?', 'bouddhistes?',
    'athées?', 'pratiquante?s?', 'ramadan', 'mosquée', 'synagogue', 'voile islamique', 'religion', 'religieuse?',
  ],
  opinions: ['militante?s?', 'encartée?', 'parti politique', 'opinions? politiques?', 'vote pour', 'candidate? aux élections'],
  syndicat: ['syndiquée?s?', 'syndicaliste', 'délégué syndical', 'déléguée syndicale', 'syndicats?', 'cgt', 'cfdt', 'force ouvrière', 'sud solidaires'],
  'vie sexuelle': ['homosexuel(?:le)?s?', 'gays?', 'lesbiennes?', 'bisexuel(?:le)?s?', 'transgenres?', 'orientation sexuelle', 'vie sexuelle'],
  origine: ['origine ethnique', 'ethnie', 'couleur de peau', 'immigrée?s?', 'sans[- ]papiers', "d'origine (?:\\p{L}+)"],
  justice: ['casier judiciaire', 'condamnée?s?', 'condamnation', 'incarcérée?', 'prison', 'garde à vue', 'mise en examen'],
};

// Mot ambigu suivi d'un complément qui le rend banal (« opération commerciale »).
const HARMLESS_AFTER = /^\s+(?:commerciale?s?|de (?:texte|données|fichiers?|la commande|commande)|du (?:bois|cuir|fichier|dossier))/iu;

const PATTERNS: Array<{ theme: SensitiveTheme; re: RegExp }> = (Object.keys(WORDS) as SensitiveTheme[]).map((theme) => ({
  theme,
  re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${WORDS[theme].join('|')})(?![\\p{L}\\p{N}])`, 'giu'),
}));

export function detectSensitive(text: string): SensitiveSpan[] {
  const spans: SensitiveSpan[] = [];
  for (const { theme, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const end = m.index + m[0].length;
      if (HARMLESS_AFTER.test(text.slice(end, end + 30))) continue;
      spans.push({ start: m.index, end, theme });
    }
  }
  // Garde le plus long en cas de chevauchement (« arrêt maladie » plutôt que « maladie »).
  spans.sort((a, b) => b.end - b.start - (a.end - a.start));
  const kept: SensitiveSpan[] = [];
  for (const s of spans) if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
  return kept.sort((a, b) => a.start - b.start);
}

export const SENSITIVE_MESSAGE = 'Information de santé ou sensible : vérifiez qu’elle est nécessaire, ou décrivez la situation autrement.';
