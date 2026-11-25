// Ouvre un fichier en le masquant, puis enregistre la réponse de l'IA avec
// les vrais noms. Ces fonctions ne dépendent pas de Claude : elles lisent et
// écrivent des fichiers, et elles sont testées seules.
//
// Règle de sécurité : rien de ce que renvoient ces fonctions ne contient une
// vraie valeur masquée. Le texte avec les vrais noms part seulement dans un
// fichier, sur l'ordinateur.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { maskText } from '../src/mask/engine';
import { csvToTable, tableToCsv, unmaskText, type Correspondence } from '../src/mask/unmask';
import { scanPlaceholders } from '../src/mask/placeholders';
import { detectSensitive } from '../src/detect/sensitive';
import { CATEGORY_LABELS, type Category, type Span } from '../src/detect/types';

// Formats acceptés à l'ouverture et à l'enregistrement.
const TEXT_EXTENSIONS = new Set(['.txt', '.md']);

// Fichier, dans le dossier de travail, qui liste les mots à toujours masquer.
export const ALWAYS_MASK_FILE = 'Toujours masquer.txt';
// Fichier qui liste les mots à ne jamais masquer : le nom de son propre
// événement, d'un dispositif public (« Kafé IA », « France Num »).
export const NEVER_MASK_FILE = 'Toujours laisser en clair.txt';
const SETTINGS_FILES = new Set([ALWAYS_MASK_FILE, NEVER_MASK_FILE]);

export interface Workspace {
  // Dossier où la personne range les fichiers que Claude peut ouvrir.
  folder: string;
  // Dossier où sont gardées les tables de correspondance, hors du dossier de travail.
  tablesFolder: string;
}

// Repère les noms avec le modèle. Absent si le modèle n'est pas utilisé.
export type ModelDetector = (text: string) => Promise<Span[]>;

export class UserError extends Error {}

// Chemin d'un fichier du dossier de travail. Refuse tout ce qui en sort.
function insideFolder(folder: string, name: string): string {
  const root = resolve(folder);
  const path = resolve(root, name);
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new UserError(`Le fichier « ${name} » n'est pas dans le dossier ${root}. Seuls les fichiers de ce dossier peuvent être ouverts.`);
  }
  return path;
}

// Chaque terme et chacun de ses mots sont laissés en clair : le modèle repère
// parfois « Kafé » seul comme une entreprise, sans le « IA » qui suit.
function readNeverMask(folder: string): Set<string> {
  const keys = new Set<string>();
  for (const term of readList(join(folder, NEVER_MASK_FILE))) {
    const key = term.normalize('NFC').replace(/\s+/g, ' ').toLowerCase();
    keys.add(key);
    for (const word of key.split(' ')) if (word.length >= 2) keys.add(word);
  }
  return keys;
}

function readAlwaysMask(folder: string): string[] {
  return readList(join(folder, ALWAYS_MASK_FILE));
}

function readList(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

// Résumé des éléments masqués : « 3 personnes, 1 téléphone ».
function summarize(entries: Array<{ category: Category }>): string {
  const counts = new Map<Category, number>();
  for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  if (counts.size === 0) return 'aucun';
  return [...counts]
    .map(([category, n]) => `${n} ${CATEGORY_LABELS[category][n > 1 ? 1 : 0]}`)
    .join(', ');
}

// Identifiant de document : date, heure et un nombre tiré au hasard. Il ne
// contient rien du fichier, pour ne rien révéler dans le nom de la table.
function newDocumentId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `doc-${stamp}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

interface DocumentRecord {
  source: string; // chemin du fichier d'origine
  table: Correspondence[];
}

function recordPath(ws: Workspace, id: string): string {
  if (!/^doc-[\d-]+$/.test(id)) throw new UserError(`Document inconnu : « ${id} ».`);
  return join(ws.tablesFolder, `${id}.csv`);
}

// La table est gardée en .csv, au même format que celui de la version web.
// La première ligne de commentaire garde le chemin du fichier d'origine.
function saveRecord(ws: Workspace, id: string, record: DocumentRecord): void {
  mkdirSync(ws.tablesFolder, { recursive: true, mode: 0o700 });
  const csv = tableToCsv(record.table);
  writeFileSync(recordPath(ws, id), `${csv}"# source";${JSON.stringify(record.source)}\r\n`, { mode: 0o600 });
}

function loadRecord(ws: Workspace, id: string): DocumentRecord {
  const path = recordPath(ws, id);
  if (!existsSync(path)) {
    throw new UserError(`Document inconnu : « ${id} ». Ouvrez d'abord le fichier avec l'action d'ouverture.`);
  }
  const content = readFileSync(path, 'utf8');
  const sourceLine = /"# source";(.+)\r?\n?$/.exec(content);
  return { source: sourceLine ? JSON.parse(sourceLine[1]) : '', table: csvToTable(content) };
}

export interface OpenResult {
  id: string;
  maskedText: string;
  summary: string;
  // Thèmes sensibles repérés (santé, religion...), laissés en clair.
  sensitiveThemes: string[];
}

export async function openMaskedFile(ws: Workspace, name: string, detectNames?: ModelDetector): Promise<OpenResult> {
  const path = insideFolder(ws.folder, name);
  if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) {
    throw new UserError('Pour l’instant, seuls les fichiers .txt et .md peuvent être ouverts.');
  }
  if (SETTINGS_FILES.has(basename(path))) {
    throw new UserError(`Le fichier « ${basename(path)} » ne peut pas être ouvert : c'est un réglage de l'outil.`);
  }
  if (!existsSync(path)) throw new UserError(`Le fichier « ${name} » n'existe pas dans le dossier ${ws.folder}.`);
  const text = readFileSync(path, 'utf8');
  const modelSpans = detectNames ? await detectNames(text) : undefined;
  const result = maskText(text, { modelSpans, alwaysMask: readAlwaysMask(ws.folder), ignored: readNeverMask(ws.folder) });
  const id = newDocumentId();
  saveRecord(ws, id, { source: path, table: result.entries.map((e) => ({ label: e.label, value: e.value })) });
  const themes = [...new Set(detectSensitive(text).map((s) => s.theme))];
  return { id, maskedText: result.maskedText, summary: summarize(result.entries), sensitiveThemes: themes };
}

// Ligne qui sépare les fichiers pendant le masquage d'un dossier. Les règles
// et le modèle ne la repèrent pas : elle ressort intacte du masquage.
const DOCUMENT_SEPARATOR = '\n\n==========\n\n';

// Retire du texte toute suite de signes « = » assez longue pour être prise
// pour le séparateur.
function withoutSeparator(text: string): string {
  return text.replace(/={10,}/g, '=========');
}

export interface FolderResult {
  id: string;
  documents: Array<{ name: string; text: string }>;
  summary: string;
  sensitiveThemes: string[];
}

// Masque tous les fichiers .txt et .md d'un dossier en une seule fois : une
// même personne citée dans deux fichiers reçoit la même étiquette partout.
export async function maskFolder(ws: Workspace, subfolder: string | undefined, detectNames?: ModelDetector): Promise<FolderResult> {
  const dir = subfolder ? insideFolder(ws.folder, subfolder) : resolve(ws.folder);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new UserError(`Le dossier « ${subfolder} » n'existe pas dans ${ws.folder}.`);
  }
  const names = readdirSync(dir)
    .filter((n) => TEXT_EXTENSIONS.has(extname(n).toLowerCase()) && !SETTINGS_FILES.has(n) && statSync(join(dir, n)).isFile())
    .sort((a, b) => a.localeCompare(b, 'fr'));
  if (names.length === 0) throw new UserError(`Aucun fichier .txt ou .md dans le dossier ${dir}.`);
  const texts = names.map((n) => withoutSeparator(readFileSync(join(dir, n), 'utf8').replace(/\r\n/g, '\n')));
  const joined = texts.join(DOCUMENT_SEPARATOR);
  const modelSpans = detectNames ? await detectNames(joined) : undefined;
  const result = maskText(joined, { modelSpans, alwaysMask: readAlwaysMask(ws.folder), ignored: readNeverMask(ws.folder) });
  const parts = result.maskedText.split(DOCUMENT_SEPARATOR);
  if (parts.length !== names.length) {
    throw new UserError('Les fichiers du dossier n’ont pas pu être séparés après le masquage. Aucun texte n’a été transmis.');
  }
  const id = newDocumentId();
  // Le dossier sert d'origine : la réponse sera enregistrée dedans.
  saveRecord(ws, id, { source: dir + sep, table: result.entries.map((e) => ({ label: e.label, value: e.value })) });
  const themes = [...new Set(detectSensitive(joined).map((s) => s.theme))];
  return {
    id,
    documents: names.map((name, i) => ({ name, text: parts[i] })),
    summary: summarize(result.entries),
    sensitiveThemes: themes,
  };
}

const NUMERIC_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'TELEPHONE', 'IBAN', 'SIRET', 'SIREN', 'NIR', 'TVA', 'PLAQUE', 'MONTANT',
]);
const MIN_FRAGMENT_CHARS = 5;
const MIN_FRAGMENT_DIGITS = 6;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Un programme peut couper une valeur (« 06 68 88 45 8 », « Yann Le G ») ou
// la recopier en morceaux : les règles ne la reconnaissent plus. On masque
// donc aussi les débuts de valeur assez longs, et toute suite de chiffres
// tirée d'un numéro repéré.
export function maskFragments(text: string, entries: Array<{ label: string; value: string; category: Category }>): string {
  let out = text;
  const byLength = [...entries].sort((a, b) => b.value.length - a.value.length);
  for (const e of byLength) {
    const value = e.value.trim();
    const minLength = Math.max(MIN_FRAGMENT_CHARS, Math.ceil(value.length * 0.6));
    for (let len = value.length; len >= minLength; len--) {
      const prefix = value.slice(0, len).trim();
      if (prefix.length < minLength) break;
      const pattern = prefix.split(/\s+/).map(escapeRegex).join('\\s+');
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}`, 'giu');
      out = out.replace(re, e.label);
    }
  }
  // Suites d'au moins six chiffres (espaces, points et tirets permis) qui
  // appartiennent à un numéro repéré.
  const numbers = entries
    .filter((e) => NUMERIC_CATEGORIES.has(e.category))
    .map((e) => ({ label: e.label, digits: e.value.replace(/\D/g, '') }))
    .filter((n) => n.digits.length >= MIN_FRAGMENT_DIGITS);
  out = out.replace(/\d[\d\s.\-]*\d/g, (run) => {
    const digits = run.replace(/\D/g, '');
    if (digits.length < MIN_FRAGMENT_DIGITS) return run;
    const owner = numbers.find((n) => n.digits.includes(digits));
    return owner ? owner.label : run;
  });
  return out;
}

// Champs des mails et des formulaires qui contiennent toujours un nom :
// le nom affiché de l'expéditeur et des destinataires (« Café associatif
// Kérinou <contact@...> »), et les lignes « Nom : », « Prénom : »,
// « Structure : » des notifications d'inscription. Les règles et le modèle
// les manquent quand le nom est un prénom seul ou une association.
const FORM_FIELD = /(?<![\p{L}])(Nom|Prénom|Nom complet|Structure|Société|Entreprise|Organisation)\s*:\s*(.+?)(?=\s+(?:E-?mail|Email|Source|Structure|Fonction|Téléphone|Tél|Profil|Ville|Message)\s*:|\s*\n|$)/giu;
const HEADER_LINE = /^(?:De|À|Cc) : (.+)$/gmu;

export function mailFieldSpans(text: string): Span[] {
  const spans: Span[] = [];
  const push = (start: number, value: string, category: Category) => {
    const trimmed = value.trim().replace(/^"|"$/g, '');
    if (trimmed.length < 2 || trimmed.includes('@') || /^\[.*\]$/.test(trimmed)) return;
    const offset = start + value.indexOf(trimmed);
    spans.push({ start: offset, end: offset + trimmed.length, category, source: 'rule' });
  };
  for (const m of text.matchAll(FORM_FIELD)) {
    const field = m[1].toLowerCase();
    const category: Category = field.startsWith('nom') || field === 'prénom' ? 'PERSONNE' : 'ENTREPRISE';
    push(m.index + m[0].length - m[2].length, m[2], category);
  }
  for (const m of text.matchAll(HEADER_LINE)) {
    const lineStart = m.index + m[0].length - m[1].length;
    // Plusieurs destinataires séparés par des virgules : « A <a@x>, B <b@y> ».
    for (const part of m[1].matchAll(/(?:^|,)\s*("?)([^,<"]+?)\1\s*<[^>]+>/gu)) {
      const name = part[2];
      push(lineStart + part.index + part[0].indexOf(name), name, 'AUTRE');
    }
  }
  return spans;
}

// Masque les suites d'au moins six chiffres qui restent en clair : numéros
// étrangers, codes de vérification, numéros de dossier.
const LONG_NUMBER = /(?<![\p{L}_\d])\+?\d[\d\s.\-]{4,}\d(?![\d])/gu;

export function maskLongNumbers(
  text: string,
  entries: Array<{ label: string; category: Category }>,
): { text: string; added: Array<{ label: string; value: string; category: Category }> } {
  let next = Math.max(0, ...entries.filter((e) => e.category === 'AUTRE').map((e) => Number(/_(\d+)\]/.exec(e.label)?.[1] ?? 0))) + 1;
  const added: Array<{ label: string; value: string; category: Category }> = [];
  const byValue = new Map<string, string>();
  const out = text.replace(LONG_NUMBER, (run) => {
    const trimmed = run.trim();
    if (trimmed.replace(/\D/g, '').length < 6) return run;
    // Une date écrite AAAA-MM-JJ n'est pas un numéro : les règles des dates s'en chargent.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return run;
    let label = byValue.get(trimmed);
    if (!label) {
      label = `[AUTRE_${next++}]`;
      byValue.set(trimmed, label);
      added.push({ label, value: trimmed, category: 'AUTRE' });
    }
    return run.replace(trimmed, label);
  });
  return { text: out, added };
}

export interface MaskedOutput {
  id: string;
  maskedText: string;
  summary: string;
}

// Masque l'affichage d'un programme qui a lu de vraies données (des mails).
// Les sources sont masquées avec l'affichage, en une seule fois : un nom repéré
// dans un mail est aussi masqué dans l'affichage, même écrit en majuscules ou
// cité seul dans un tableau.
export async function maskProgramOutput(
  ws: Workspace,
  sources: string[],
  output: string,
  detectNames?: ModelDetector,
): Promise<MaskedOutput> {
  const joined = [...sources, output].map(withoutSeparator).join(DOCUMENT_SEPARATOR);
  const modelSpans = detectNames ? await detectNames(joined) : [];
  const result = maskText(joined, { modelSpans: [...modelSpans, ...mailFieldSpans(joined)], alwaysMask: readAlwaysMask(ws.folder), ignored: readNeverMask(ws.folder) });
  const parts = result.maskedText.split(DOCUMENT_SEPARATOR);
  if (parts.length !== sources.length + 1) {
    throw new UserError('L’affichage du programme n’a pas pu être masqué correctement. Rien n’a été transmis.');
  }
  const numbers = maskLongNumbers(maskFragments(parts[parts.length - 1], result.entries), result.entries);
  const maskedText = numbers.text;
  const entries = [...result.entries, ...numbers.added];
  // La table ne garde que les étiquettes présentes dans l'affichage.
  const used = entries.filter((e) => maskedText.includes(e.label));
  const id = newDocumentId();
  saveRecord(ws, id, { source: resolve(ws.folder) + sep, table: used.map((e) => ({ label: e.label, value: e.value })) });
  return { id, maskedText, summary: summarize(used) };
}

export interface SaveResult {
  path: string;
  restoredCount: number;
  unknownLabels: string[];
  // Trous ajoutés par l'IA ([adresse e-mail], {date}), à compléter par la personne.
  holes: string[];
}

// Nom du fichier de réponse, dans le dossier du fichier d'origine.
function replyPath(ws: Workspace, source: string, fileName?: string): string {
  let path: string;
  if (fileName) {
    path = insideFolder(ws.folder, fileName);
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) path += '.txt';
  } else if (source.endsWith(sep)) {
    path = join(source, 'Résultat.txt');
  } else {
    const ext = extname(source) || '.txt';
    path = join(dirname(source), `${basename(source, extname(source))} - réponse${ext}`);
  }
  // Ne remplace jamais un fichier existant : ajoute (2), (3)...
  const ext = extname(path);
  const stem = path.slice(0, path.length - ext.length);
  for (let n = 2; existsSync(path); n++) path = `${stem} (${n})${ext}`;
  return path;
}

export function saveReply(ws: Workspace, id: string, text: string, fileName?: string): SaveResult {
  const record = loadRecord(ws, id);
  const unmasked = unmaskText(text, record.table);
  const path = replyPath(ws, record.source, fileName);
  writeFileSync(path, unmasked.text);
  const holes = scanPlaceholders(unmasked.text)
    .placeholders.filter((p) => p.kind === 'ai')
    .map((p) => p.display);
  return { path, restoredCount: unmasked.restoredCount, unknownLabels: unmasked.unknownLabels, holes };
}
