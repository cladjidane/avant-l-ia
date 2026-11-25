// Règles de repérage pour les formats français. Chaque règle renvoie des
// morceaux de texte (début, fin, catégorie). Les numéros qui ont une clé de
// contrôle (IBAN, SIREN, SIRET, sécurité sociale, TVA) ne sont retenus que si
// la clé est juste, pour éviter de masquer n'importe quelle suite de chiffres.

import type { Category, Span } from './types';
import { AMBIGUOUS_FIRST_NAMES, FIRST_NAMES } from './firstnames';
import {
  dateValid,
  ibanValid,
  nirValid,
  sirenValid,
  siretValid,
  vatValid,
} from './validators';

// Espace dans une ligne (espace, tabulation, espaces insécables).
const SP = '[ \\t\\u00a0\\u202f]';

// Mot qui commence par une majuscule (nom propre), avec tirets et apostrophes.
const NAME_WORD = "\\p{Lu}[\\p{L}'’]*\\p{L}(?:-[\\p{L}'’]+)*";

// Particules de nom de famille écrites avec une majuscule (« Le Gall »).
const PARTICLE = '(?:Le|La|Les|De|Du|Des|Van|Von|Ar|An|Ben|Mac|Mc)';

// Particules en minuscules acceptées après une civilité (« M. de Kerros »).
const LOWER_PARTICLE = "(?:de l'|de l’|de la|de|du|des|d'|d’)";

// Rend un mot insensible à la casse sans utiliser le drapeau i, qui
// fausserait la détection des majuscules dans le reste de l'expression.
function ci(word: string): string {
  return word
    .split('')
    .map((c) => {
      const lower = c.toLowerCase();
      const upper = c.toUpperCase();
      if (lower === upper) return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `[${lower}${upper}]`;
    })
    .join('');
}

export const TRADE_WORDS = [
  'Menuiserie', 'Boulangerie', 'Pâtisserie', 'Patisserie', 'Cabinet', 'Garage', 'Boucherie',
  'Charcuterie', 'Pharmacie', 'Restaurant', 'Crêperie', 'Creperie', 'Brasserie', 'Librairie',
  'Agence', 'Atelier', 'Société', 'Societe', 'Entreprise', 'Ets', 'Établissements',
  'Etablissements', 'Laboratoire', 'Clinique', 'Plomberie', 'Électricité', 'Electricite',
  'Maçonnerie', 'Maconnerie', 'Charpente', 'Couverture', 'Transports', 'Taxi', 'Ambulances',
  'Salon', 'Institut', 'Studio', 'Groupe', 'Fromagerie', 'Poissonnerie', 'Épicerie',
  'Epicerie', 'Imprimerie', 'Carrosserie', 'Scierie', 'Coiffure', 'Hôtel', 'Hotel', 'Camping',
  'Ferme', 'Domaine', 'Cave', 'Auto-école', 'Opticien', 'Optique', 'Fleuriste', 'Traiteur',
  'Cidrerie', 'Biscuiterie', 'Chocolaterie', 'Quincaillerie', 'Cordonnerie', 'Pressing',
  'Étude', 'Office', 'Bureau', 'Ébénisterie', 'Ebenisterie', 'Serrurerie', 'Paysagiste',
];

const LEGAL_FORMS = [
  'SARL', 'SAS', 'SASU', 'EURL', 'SA', 'SCI', 'SNC', 'SCOP', 'SCEA', 'GAEC', 'EARL', 'SELARL',
  'SELAS', 'SCP', 'EI', 'EIRL',
];

const CIVILITIES = [
  'M\\.', 'MM\\.', 'Mme', 'Mmes', 'Mlle', 'Monsieur', 'Madame', 'Mademoiselle', 'Me', 'Maître',
  'Dr', 'Dr\\.', 'Docteur', 'Pr', 'Professeur',
];

const GREETINGS = ['Bonjour', 'Bonsoir', 'Salut', 'Coucou', 'Cher', 'Chère', 'Chers', 'Hello', 'Merci'];

const MONTHS = [
  'janvier', 'février', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'aout',
  'septembre', 'octobre', 'novembre', 'décembre', 'decembre',
];
const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// Mots à majuscule qui ne sont jamais un nom de personne ou de lieu.
const STOP_WORDS = new Set<string>([
  ...TRADE_WORDS,
  ...LEGAL_FORMS,
  ...GREETINGS,
  ...MONTHS.map(capitalize),
  ...DAYS.map(capitalize),
  'Le', 'La', 'Les', 'De', 'Du', 'Des', 'Un', 'Une', 'Et', 'Ou', 'Mais', 'Donc', 'Car',
  'Monsieur', 'Madame', 'Mademoiselle', 'Messieurs', 'Mesdames', 'Maître', 'Docteur',
  'Cordialement', 'Bien', 'Bonne', 'Bon', 'Je', 'Tu', 'Il', 'Elle', 'Nous', 'Vous', 'Ils',
  'Elles', 'On', 'Ce', 'Cette', 'Ces', 'Mon', 'Ma', 'Mes', 'Son', 'Sa', 'Ses', 'Notre', 'Votre',
  'Suite', 'Objet', 'Réf', 'PS', 'NB', 'Tél', 'Tel', 'Mail', 'Email', 'Fax', 'Portable',
  'Mobile', 'Adresse', 'TVA', 'SIRET', 'SIREN', 'IBAN', 'BIC', 'RIB', 'HT', 'TTC', 'Euros',
  'Euro', 'EUR', 'France', 'Noël', 'Pâques', 'Toussaint', 'IA',
]);

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Ajoute un repérage en retirant les espaces et la ponctuation en bordure.
function pushSpan(spans: Span[], text: string, start: number, end: number, category: Category): void {
  while (start < end && /[\s,;:.!?)(]/.test(text[start])) start++;
  while (end > start && /[\s,;:!?)(]/.test(text[end - 1])) end--;
  // Un point final n'appartient au repérage que pour une abréviation (« M. »).
  while (end > start && text[end - 1] === '.' && category !== 'URL') end--;
  if (end > start) spans.push({ start, end, category, source: 'rule' });
}

// Lit, à partir de « pos », jusqu'à « max » mots de nom propre séparés par des
// espaces. Renvoie la position de fin, ou « pos » si aucun mot n'a été lu.
const SURNAME_STEP = new RegExp(
  `${SP}+((?:${PARTICLE}${SP}+)?(${NAME_WORD}))(?![\\p{L}\\p{N}])`,
  'uy',
);
const SURNAME_STEP_LOWER = new RegExp(
  `${SP}+((?:(?:${PARTICLE}|${LOWER_PARTICLE})${SP}*)?(${NAME_WORD}))(?![\\p{L}\\p{N}])`,
  'uy',
);

function consumeNames(text: string, pos: number, max: number, allowLower = false): number {
  let end = pos;
  for (let i = 0; i < max; i++) {
    const step = allowLower && i === 0 ? SURNAME_STEP_LOWER : SURNAME_STEP;
    step.lastIndex = end;
    const m = step.exec(text);
    if (!m) break;
    if (STOP_WORDS.has(m[2]) || STOP_WORDS.has(m[1])) break;
    end = step.lastIndex;
  }
  return end;
}

// --- Règles sur les coordonnées et les numéros -------------------------------

function findEmails(text: string, spans: Span[]): void {
  const re = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
  for (const m of text.matchAll(re)) pushSpan(spans, text, m.index, m.index + m[0].length, 'EMAIL');
}

function findUrls(text: string, spans: Span[]): void {
  const re = /(?:https?:\/\/|www\.)[^\s<>"'«»]+/gu;
  for (const m of text.matchAll(re)) {
    let end = m.index + m[0].length;
    while (end > m.index && /[.,;:!?)\]]/.test(text[end - 1])) end--;
    pushSpan(spans, text, m.index, end, 'URL');
  }
  // Nom de domaine seul, par exemple « menuiserie-legall.fr ».
  const bare =
    /(?<![\p{L}\p{N}@.\-/])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:fr|com|bzh|net|org|eu|io|info|biz|pro|co|be|ch)(?![\p{L}\p{N}-])/gu;
  for (const m of text.matchAll(bare)) pushSpan(spans, text, m.index, m.index + m[0].length, 'URL');
}

function findPhones(text: string, spans: Span[]): void {
  const re = /(?<![\p{N}+])(?:(?:\+|00)33[ .\- ]?(?:\(0\)[ .\- ]?)?[1-9]|0[1-9])(?:[ .\- ]?\d{2}){4}(?!\p{N})/gu;
  for (const m of text.matchAll(re)) pushSpan(spans, text, m.index, m.index + m[0].length, 'TELEPHONE');
}

function findIbans(text: string, spans: Span[]): void {
  const re = /(?<![\p{L}\p{N}])[A-Z]{2}\d{2}(?:[  ]?[A-Z0-9]{4}){2,7}(?:[  ]?[A-Z0-9]{1,3})?(?![\p{L}\p{N}])/gu;
  for (const m of text.matchAll(re)) {
    if (ibanValid(m[0])) pushSpan(spans, text, m.index, m.index + m[0].length, 'IBAN');
  }
}

function findCompanyNumbers(text: string, spans: Span[]): void {
  const siret = /(?<![\p{N}])\d{3}[  ]?\d{3}[  ]?\d{3}[  ]?\d{5}(?![\p{N}])/gu;
  for (const m of text.matchAll(siret)) {
    if (siretValid(m[0])) pushSpan(spans, text, m.index, m.index + m[0].length, 'SIRET');
  }
  const siren = /(?<![\p{N}])\d{3}[  ]?\d{3}[  ]?\d{3}(?![\p{N}]|[  ]\d{5}(?!\p{N}))/gu;
  for (const m of text.matchAll(siren)) {
    if (sirenValid(m[0])) pushSpan(spans, text, m.index, m.index + m[0].length, 'SIREN');
  }
  const vat = /(?<![\p{L}\p{N}])FR[  ]?[0-9A-HJ-NP-Z]{2}[  ]?\d{3}[  ]?\d{3}[  ]?\d{3}(?![\p{N}])/gu;
  for (const m of text.matchAll(vat)) {
    if (vatValid(m[0])) pushSpan(spans, text, m.index, m.index + m[0].length, 'TVA');
  }
}

function findNir(text: string, spans: Span[]): void {
  const re = /(?<![\p{N}])[1278][  ]?\d{2}[  ]?\d{2}[  ]?(?:\d{2}|2[AB])[  ]?\d{3}[  ]?\d{3}[  ]?\d{2}(?![\p{N}])/gu;
  for (const m of text.matchAll(re)) {
    if (nirValid(m[0])) pushSpan(spans, text, m.index, m.index + m[0].length, 'NIR');
  }
}

function findPlates(text: string, spans: Span[]): void {
  const re = /(?<![\p{L}\p{N}])[A-HJ-NP-TV-Z]{2}[- ]?\d{3}[- ]?[A-HJ-NP-TV-Z]{2}(?![\p{L}\p{N}])/gu;
  for (const m of text.matchAll(re)) pushSpan(spans, text, m.index, m.index + m[0].length, 'PLAQUE');
}

function findAmounts(text: string, spans: Span[]): void {
  const num = '\\d{1,3}(?:[ \\u00a0\\u202f.]\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';
  const cur = `(?:€|k€|K€|M€|${ci('euros')}|${ci('euro')}|EUR)`;
  const after = new RegExp(`(?<![\\p{L}\\p{N},.])(?:${num})[ \\u00a0\\u202f]?${cur}(?![\\p{L}])`, 'gu');
  for (const m of text.matchAll(after)) pushSpan(spans, text, m.index, m.index + m[0].length, 'MONTANT');
  const before = new RegExp(`€[ \\u00a0\\u202f]?(?:${num})(?![\\p{N}])`, 'gu');
  for (const m of text.matchAll(before)) pushSpan(spans, text, m.index, m.index + m[0].length, 'MONTANT');
}

function findDates(text: string, spans: Span[]): void {
  const numeric = /(?<![\p{N}/.-])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?![\p{N}/-]|\.\d)/gu;
  for (const m of text.matchAll(numeric)) {
    const year = m[3].length === 4 ? Number(m[3]) : undefined;
    if (dateValid(Number(m[1]), Number(m[2]), year)) {
      pushSpan(spans, text, m.index, m.index + m[0].length, 'DATE');
    }
  }
  const iso = /(?<![\p{N}-])(\d{4})-(\d{2})-(\d{2})(?![\p{N}-])/gu;
  for (const m of text.matchAll(iso)) {
    if (dateValid(Number(m[3]), Number(m[2]), Number(m[1]))) {
      pushSpan(spans, text, m.index, m.index + m[0].length, 'DATE');
    }
  }
  const days = DAYS.map(ci).join('|');
  const months = MONTHS.map(ci).join('|');
  const written = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:(?:${days})${SP}+)?(1er|\\d{1,2})${SP}+(?:${months})(?:${SP}+\\d{4})?(?![\\p{L}\\p{N}])`,
    'gu',
  );
  for (const m of text.matchAll(written)) {
    const day = m[1] === '1er' ? 1 : Number(m[1]);
    if (day >= 1 && day <= 31) pushSpan(spans, text, m.index, m.index + m[0].length, 'DATE');
  }
}

// --- Adresses et lieux -------------------------------------------------------

const STREET_TYPES = [
  'rue', 'avenue', 'av.', 'bd', 'boulevard', 'place', 'pl.', 'chemin', 'impasse', 'allée',
  'allee', 'route', 'rte', 'quai', 'cours', 'square', 'résidence', 'residence', 'lotissement',
  'lieu-dit', 'lieu dit', 'hameau', 'passage', 'venelle', 'ruelle', 'sentier', 'esplanade',
  'parvis', 'rond-point', 'cité', 'cite', 'voie', 'faubourg', 'promenade', 'traverse', 'montée',
  'zone artisanale', 'zone industrielle', 'za', 'zi', 'zac', 'parc',
];

const CITY = `\\p{Lu}[\\p{L}'’-]*\\p{L}(?:${SP}+(?:(?:sur|sous|en|de|du|des|la|le|lès|les|aux)${SP}+)?\\p{Lu}[\\p{L}'’-]*\\p{L}){0,3}(?:${SP}+(?:Cedex|CEDEX)(?:${SP}+\\d{1,2})?)?`;
const POSTAL = '(?:F-)?(?:0[1-9]|[1-8]\\d|9[0-578])\\d{3}';

function findAddresses(text: string, spans: Span[]): void {
  const types = STREET_TYPES.map(ci).join('|');
  const word = `(?:(?:de|du|des|la|le|les|aux?|en|sur|sous|et)(?=${SP})|[dlDL]['’]\\p{L}+|\\p{Lu}[\\p{L}'’-]*|\\d{1,4}(?![\\p{N}]))`;
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])\\d{1,4}(?:${SP}?(?:bis|ter|quater|[A-D]))?,?${SP}+(?:${types})(?:${SP}+${word})+(?:,?${SP}+${POSTAL}${SP}+${CITY})?`,
    'gu',
  );
  for (const m of text.matchAll(re)) {
    let value = m[0];
    // Retire les petits mots restés en fin (« 12 rue de Brest à » devient « 12 rue de Brest »).
    const trimmed = value.replace(new RegExp(`(?:${SP}+(?:de|du|des|la|le|les|aux?|en|sur|sous|et))+$`, 'u'), '');
    value = trimmed;
    pushSpan(spans, text, m.index, m.index + value.length, 'ADRESSE');
  }
  const postal = new RegExp(`(?<![\\p{N}])${POSTAL}${SP}+${CITY}(?![\\p{L}])`, 'gu');
  for (const m of text.matchAll(postal)) {
    const city = m[0].replace(/^\S+\s+/, '');
    if (STOP_WORDS.has(city.split(/\s/)[0])) continue;
    pushSpan(spans, text, m.index, m.index + m[0].length, 'ADRESSE');
  }
}

// Nom de commune après « à », « chez », « près de »... (« à Plouider »).
function findPlaces(text: string, spans: Span[]): void {
  const triggers = ['à', 'À', 'au', 'chez', 'vers', 'près de', 'commune de', 'ville de', 'habite', 'domicilié à', 'domiciliée à', 'originaire de', 'basé à', 'basée à', 'située à', 'situé à'];
  const re = new RegExp(`(?<![\\p{L}])(?:${triggers.map(escapeRegex).join('|')})(?=${SP})`, 'gu');
  for (const m of text.matchAll(re)) {
    const pos = m.index + m[0].length;
    const end = consumeNames(text, pos, 4);
    if (end > pos) pushSpan(spans, text, pos, end, 'LIEU');
  }
}

// --- Personnes et entreprises -----------------------------------------------

const FIRST_NAME_ALT = FIRST_NAMES.map(escapeRegex)
  .sort((a, b) => b.length - a.length)
  .join('|');

function findPersons(text: string, spans: Span[]): void {
  // 1. Prénom connu, éventuellement composé, suivi ou non d'un nom de famille.
  const first = new RegExp(`(?<![\\p{L}\\p{N}])(${FIRST_NAME_ALT})(?:-(${FIRST_NAME_ALT}))?(?![\\p{L}\\p{N}'’])`, 'gu');
  for (const m of text.matchAll(first)) {
    const nameEnd = m.index + m[0].length;
    const end = consumeNames(text, nameEnd, 3);
    const hasSurname = end > nameEnd;
    const compound = m[2] !== undefined;
    if (!hasSurname && !compound && AMBIGUOUS_FIRST_NAMES.has(m[1])) continue;
    pushSpan(spans, text, m.index, end, 'PERSONNE');
  }

  // 2. Civilité suivie d'un nom : on masque le nom, la civilité reste.
  const civ = new RegExp(`(?<![\\p{L}])(?:${CIVILITIES.join('|')})(?=${SP})`, 'gu');
  for (const m of text.matchAll(civ)) {
    const pos = m.index + m[0].length;
    const end = consumeNames(text, pos, 3, true);
    if (end > pos) pushSpan(spans, text, pos, end, 'PERSONNE');
  }

  // 3. Formule d'appel suivie d'un nom propre (« Bonjour Gwenola, »).
  const greet = new RegExp(`(?<![\\p{L}])(?:${GREETINGS.join('|')})(?=${SP})`, 'gu');
  for (const m of text.matchAll(greet)) {
    const pos = m.index + m[0].length;
    const end = consumeNames(text, pos, 3);
    if (end > pos) pushSpan(spans, text, pos, end, 'PERSONNE');
  }
}

// Nom construit à partir d'une adresse mail (« yann.legall@... » retrouve
// « Yann Le Gall » dans le texte, même si le prénom n'est pas dans la liste).
function findNamesFromEmails(text: string, spans: Span[]): void {
  const emails = text.matchAll(/([\p{L}\p{N}._%+-]+)@/gu);
  const targets = new Set<string>();
  for (const m of emails) {
    const local = m[1].toLowerCase();
    if (!/[._-]/.test(local)) continue;
    const parts = local.split(/[._-]+/).filter((p) => p.length > 1 && !/\d/.test(p));
    if (parts.length < 2) continue;
    targets.add(normalizeLetters(parts.join('')));
  }
  if (targets.size === 0) return;
  const seq = new RegExp(`(?<![\\p{L}])${NAME_WORD}(?:${SP}+(?:${PARTICLE}${SP}+)?${NAME_WORD}){1,3}(?![\\p{L}])`, 'gu');
  for (const m of text.matchAll(seq)) {
    // On essaie toutes les sous-suites de mots pour retrouver le nom exact.
    const words = [...m[0].matchAll(/\S+/gu)];
    for (let i = 0; i < words.length; i++) {
      for (let j = words.length; j > i + 1; j--) {
        const startIdx = m.index + words[i].index;
        const endIdx = m.index + words[j - 1].index + words[j - 1][0].length;
        const candidate = normalizeLetters(text.slice(startIdx, endIdx));
        if (targets.has(candidate)) pushSpan(spans, text, startIdx, endIdx, 'PERSONNE');
      }
    }
  }
}

function normalizeLetters(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function findCompanies(text: string, spans: Span[]): void {
  // 1. Métier suivi d'un nom propre (« Menuiserie Le Gall », « Boulangerie du Port »).
  const trade = new RegExp(`(?<![\\p{L}])(?:${TRADE_WORDS.map(escapeRegex).join('|')})(?=${SP})`, 'gu');
  for (const m of text.matchAll(trade)) {
    const pos = m.index + m[0].length;
    const end = consumeNames(text, pos, 3, true);
    if (end > pos) pushSpan(spans, text, m.index, end, 'ENTREPRISE');
  }

  // 2. Forme juridique avant ou après le nom (« SARL Breizh Bois », « Breizh Bois SAS »).
  const legal = new RegExp(`(?<![\\p{L}])(?:${LEGAL_FORMS.join('|')})(?![\\p{L}])`, 'gu');
  const before = new RegExp(`(?:(?:${PARTICLE}${SP}+)?${NAME_WORD}${SP}+){1,3}$`, 'u');
  for (const m of text.matchAll(legal)) {
    const formEnd = m.index + m[0].length;
    const after = consumeNames(text, formEnd, 3);
    if (after > formEnd) {
      pushSpan(spans, text, m.index, after, 'ENTREPRISE');
      continue;
    }
    const head = text.slice(Math.max(0, m.index - 80), m.index);
    const b = before.exec(head);
    if (b) {
      const words = b[0].trim().split(/\s+/);
      if (words.every((w) => !STOP_WORDS.has(w) || /^(?:Le|La|Les|De|Du|Des)$/.test(w))) {
        pushSpan(spans, text, m.index - b[0].length, formEnd, 'ENTREPRISE');
      }
    }
  }
}

// Applique toutes les règles et renvoie les repérages bruts (ils peuvent se chevaucher).
export function detectWithRules(text: string): Span[] {
  const spans: Span[] = [];
  findEmails(text, spans);
  findUrls(text, spans);
  findIbans(text, spans);
  findNir(text, spans);
  findCompanyNumbers(text, spans);
  findPhones(text, spans);
  findPlates(text, spans);
  findAddresses(text, spans);
  findAmounts(text, spans);
  findDates(text, spans);
  findCompanies(text, spans);
  findPersons(text, spans);
  findNamesFromEmails(text, spans);
  findPlaces(text, spans);
  return spans;
}

// Repère toutes les occurrences d'un terme donné (liste « Toujours masquer »,
// mot ajouté à la main), sans tenir compte des majuscules.
export function findTerm(text: string, term: string): Array<[number, number]> {
  const clean = term.trim();
  if (clean.length < 2) return [];
  const pattern = clean
    .split(/\s+/)
    .map(escapeRegex)
    .join(`${SP}+`);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'giu');
  return [...text.matchAll(re)].map((m) => [m.index, m.index + m[0].length]);
}
