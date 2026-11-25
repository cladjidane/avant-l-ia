// Point d'entrée de l'interface : onglets, nettoyage, relecture, export,
// et remise des vrais noms dans la réponse de l'IA.

import './style.css';
import { APP_NAME, ALWAYS_MASK_STORAGE_KEY, SOURCE_URL } from './config';
import { CATEGORY_LABELS, type Category, type Span } from './detect/types';
import { maskText, type MaskResult } from './mask/engine';
import { csvToTable, scanToolLabels, tableToCsv, tableToMap, type Correspondence } from './mask/unmask';
import { absentLabels, fillPlaceholders, scanPlaceholders, type Placeholder, type ScanResult } from './mask/placeholders';
import { detectSensitive, SENSITIVE_MESSAGE } from './detect/sensitive';
import { checkText } from './mask/verdict';
import { DEMO_CASES } from './demo/cases';
import { loadFile, textDocument } from './files/load';
import type { Replacement, SourceDocument, BuiltFile } from './files/types';
import { copyToClipboard, downloadBlob, downloadText, el, plural, setupDropZone, suffixedName } from './ui/helpers';
import { setupModelUi, detectWithModelIfEnabled } from './ui/model-ui';

// --- Nom de l'outil -----------------------------------------------------------

document.title = APP_NAME;
document.querySelectorAll('[data-app-name]').forEach((n) => (n.textContent = APP_NAME));
el<HTMLAnchorElement>('source-link').href = SOURCE_URL;

// --- Onglets --------------------------------------------------------------------

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
function selectTab(tab: HTMLButtonElement, focus = false): void {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    el(t.getAttribute('aria-controls')!).hidden = !selected;
  }
  if (focus) tab.focus();
  if (tab.id === 'tab-restore') {
    refreshTableStatus();
    refreshRestore();
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') selectTab(tabs[(i + 1) % tabs.length], true);
    if (e.key === 'ArrowLeft') selectTab(tabs[(i - 1 + tabs.length) % tabs.length], true);
  });
});

// --- Indicateur de connexion ----------------------------------------------------

function refreshNetStatus(): void {
  const node = el('net-status');
  if (navigator.onLine) {
    node.textContent = 'Votre document reste sur cet ordinateur : rien n’est envoyé.';
    node.classList.remove('offline');
  } else {
    node.textContent = 'Hors ligne : votre document ne quitte pas cet ordinateur.';
    node.classList.add('offline');
  }
}
window.addEventListener('online', refreshNetStatus);
window.addEventListener('offline', refreshNetStatus);
refreshNetStatus();

// --- Liste « Toujours masquer » ------------------------------------------------

const alwaysMaskInput = el<HTMLTextAreaElement>('always-mask');
function readAlwaysMask(): string[] {
  return alwaysMaskInput.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}
try {
  const saved = localStorage.getItem(ALWAYS_MASK_STORAGE_KEY);
  if (saved) {
    alwaysMaskInput.value = saved;
    if (saved.trim()) (el<HTMLDetailsElement>('always-mask-box')).open = true;
  }
} catch {
  // Stockage indisponible (navigation privée) : la liste ne sera pas gardée.
}
alwaysMaskInput.addEventListener('input', () => {
  try {
    if (alwaysMaskInput.value.trim()) localStorage.setItem(ALWAYS_MASK_STORAGE_KEY, alwaysMaskInput.value);
    else localStorage.removeItem(ALWAYS_MASK_STORAGE_KEY);
  } catch {
    // ignoré
  }
});

// --- État du nettoyage ----------------------------------------------------------

interface CleanState {
  doc: SourceDocument | null; // fichier chargé, ou null pour un texte collé
  text: string;
  modelSpans: Span[];
  manualTerms: string[];
  revealed: Set<string>;
  result: MaskResult | null;
}

const state: CleanState = {
  doc: null,
  text: '',
  modelSpans: [],
  manualTerms: [],
  revealed: new Set(),
  result: null,
};

// Table de correspondance de la session, utilisée par l'onglet 2.
let sessionTable: Correspondence[] = [];
let loadedTable: Correspondence[] | null = null;

const sourceText = el<HTMLTextAreaElement>('source-text');
const fileName = el('file-name');
const analyzeButton = el<HTMLButtonElement>('analyze');
const analyzeError = el('analyze-error');
const reviewed = el<HTMLInputElement>('reviewed');

function showError(node: HTMLElement, message: string | null): void {
  node.textContent = message ?? '';
  node.hidden = !message;
}

async function openSourceFile(file: File): Promise<void> {
  showError(analyzeError, null);
  try {
    const doc = await loadFile(file);
    state.doc = doc;
    sourceText.value = doc.text;
    sourceText.readOnly = doc.structured;
    fileName.hidden = false;
    fileName.textContent = `Fichier chargé : ${doc.name}${doc.note ? '. ' + doc.note : ''}`;
    if (!doc.text.trim()) {
      showError(analyzeError, "Ce fichier ne contient pas de texte lisible. S'il s'agit d'un document scanné, l'outil ne peut pas le lire.");
    }
    // Nouveau document : l'ancien résultat ne correspond plus, on repose la question.
    resetResultView();
  } catch (err) {
    showError(analyzeError, err instanceof Error ? err.message : String(err));
  }
}

setupDropZone(el('drop-clean'), (file) => void openSourceFile(file));
el<HTMLInputElement>('source-file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void openSourceFile(file);
  input.value = '';
});
sourceText.addEventListener('input', (e) => {
  // Un texte collé ou déposé, ou une zone vidée : l'ancien résultat ne
  // correspond plus, on remet l'écran à zéro et on repose la question.
  const kind = (e as InputEvent).inputType ?? '';
  if (!resultText.hidden && (kind === 'insertFromPaste' || kind === 'insertFromDrop' || !sourceText.value.trim())) {
    resetResultView();
  }
  scheduleCheck();
  // Un texte modifié à la main n'est plus lié au fichier chargé (texte simple seulement).
  if (state.doc && !state.doc.structured) state.doc = textDocument(state.doc.name, sourceText.value);
});

analyzeButton.addEventListener('click', () => void analyze());

// --- Verdict automatique ---------------------------------------------------------
// Dès qu'un contenu arrive, l'outil répond lui-même à la question « Ce contenu
// pourrait-il être publié tel quel sur Internet ? » avec la façon de repérer
// choisie, les mots sensibles et la liste « Toujours masquer ».

const precheck = el('precheck');
try {
  // Ancien réglage « Ne plus poser la question », retiré.
  localStorage.removeItem('avant-l-ia.skip-question');
} catch {
  // ignoré
}

function currentText(): string {
  return state.doc?.structured ? state.doc.text : sourceText.value;
}

function hasContent(): boolean {
  return !!currentText().trim();
}

function refreshPrecheck(): void {
  const resultShown = !resultText.hidden;
  const show = !resultShown && hasContent();
  precheck.hidden = !show;
  el('result-empty').hidden = resultShown || show;
  // Encadré de relecture et liste des informations masquées : seulement
  // quand le texte nettoyé est affiché.
  el('review-title').textContent = show ? 'Vérification' : 'Texte nettoyé';
  el('review-notice').hidden = !resultShown;
  el('toggle-entries').hidden = !resultShown;
  if (!resultShown && !show) setReport("Aucune analyse pour l'instant.");
}

function fullModeSelected(): boolean {
  return el<HTMLInputElement>('mode-full').checked;
}

// Repérages du modèle pour un texte : gardés, et partagés entre le verdict et
// le bouton « Masquer ces informations » pour ne pas relancer le calcul.
let modelCache: { text: string; spans: Span[] } | null = null;
let modelRunning: { text: string; promise: Promise<Span[]> } | null = null;

function modelSpansFor(text: string): Promise<Span[]> {
  if (!fullModeSelected()) return Promise.resolve([]);
  if (modelCache?.text === text) return Promise.resolve(modelCache.spans);
  if (modelRunning?.text === text) return modelRunning.promise;
  const promise = detectWithModelIfEnabled(text).then(
    (spans) => {
      modelCache = { text, spans };
      if (modelRunning?.promise === promise) modelRunning = null;
      return spans;
    },
    (err) => {
      if (modelRunning?.promise === promise) modelRunning = null;
      throw err;
    },
  );
  modelRunning = { text, promise };
  return promise;
}

let checkToken = 0;
let checkTimer: number | undefined;

function scheduleCheck(delay = 450): void {
  window.clearTimeout(checkTimer);
  checkTimer = window.setTimeout(() => void runCheck(), delay);
}

function setReport(text: string): void {
  const report = el('report');
  report.textContent = text;
  report.title = '';
}

function showVerdict(text: string, modelSpans: Span[], pending: string): void {
  const { verdict } = checkText(text, { alwaysMask: readAlwaysMask(), modelSpans: [...(state.doc?.extraSpans ?? []), ...modelSpans] });
  const box = el('verdict');
  box.className = `verdict ${verdict.publishable ? 'ok' : 'no'}`;
  el('verdict-headline').textContent = verdict.headline;
  el('verdict-detail').textContent = verdict.detail;
  const sensitive = el('verdict-sensitive');
  sensitive.hidden = !verdict.sensitiveLine;
  sensitive.textContent = verdict.sensitiveLine;
  el('verdict-help').hidden = !verdict.publishable;
  el('verdict-mask').hidden = verdict.publishable;
  const pendingNode = el('verdict-pending');
  pendingNode.hidden = !pending;
  pendingNode.textContent = pending;
  // « Oui » : la barre du bas agit sur le texte d'origine. « Non » : elle
  // reste grisée jusqu'au masquage.
  setOriginalMode(verdict.publishable, text);
  // Barre du bas : ce qui a été repéré, pas encore masqué.
  if (verdict.total) {
    setReport(`${plural(verdict.total, ['information repérée', 'informations repérées'])}, pas encore ${verdict.total > 1 ? 'masquées' : 'masquée'}`);
  } else if (verdict.sensitive) {
    setReport(plural(verdict.sensitive, ['mot de santé ou sensible repéré', 'mots de santé ou sensibles repérés']));
  } else {
    setReport('Aucune information repérée');
  }
}

async function runCheck(): Promise<void> {
  const token = ++checkToken;
  refreshPrecheck();
  const text = currentText();
  if (!resultText.hidden) return;
  if (!text.trim()) return setOriginalMode(false);
  if (!fullModeSelected()) return showVerdict(text, [], '');
  if (modelCache?.text === text) return showVerdict(text, modelCache.spans, '');
  // Verdict de la façon « Rapide » tout de suite, puis mise à jour.
  showVerdict(text, [], 'Vérification complète en cours...');
  try {
    const spans = await modelSpansFor(text);
    if (token === checkToken) showVerdict(text, spans, '');
  } catch {
    if (token === checkToken) {
      showVerdict(text, [], 'La vérification complète n’a pas pu se faire. Ce verdict vient de la façon « Rapide ».');
    }
  }
}

el('verdict-mask').addEventListener('click', () => void analyze());

// Barre du bas sur le texte d'origine, quand le verdict est « Oui ».
let originalMode = false;
let originalModeText = '';

function setOriginalMode(on: boolean, text = ''): void {
  const changed = on !== originalMode || text !== originalModeText;
  originalMode = on;
  originalModeText = text;
  el('reviewed-label').textContent = on ? "J'ai relu le texte" : "J'ai relu le texte nettoyé";
  // Pas de table de correspondance sur le texte d'origine : l'avertissement n'a pas lieu d'être.
  document.querySelector<HTMLElement>('#export .keep')!.hidden = on;
  if (!changed) return;
  reviewed.disabled = !on;
  setReviewed(false);
  refreshExportButtons();
}
document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) => r.addEventListener('change', () => scheduleCheck(0)));
alwaysMaskInput.addEventListener('input', () => scheduleCheck());

function resetResultView(): void {
  state.result = null;
  resultText.hidden = true;
  resultText.replaceChildren();
  el('add-term-form').hidden = true;
  el('sensitive-banner').hidden = true;
  reviewed.disabled = true;
  setReviewed(false);
  el<HTMLButtonElement>('toggle-entries').disabled = true;
  setEntriesOpen(false);
  window.clearTimeout(checkTimer);
  el('entries-count').textContent = '0';
  el('entries-body').replaceChildren();
  el('report-detail').textContent = '';
  const report = el('report');
  report.textContent = "Aucune analyse pour l'instant.";
  report.title = '';
  void runCheck();
}

async function analyze(): Promise<void> {
  showError(analyzeError, null);
  const text = state.doc?.structured ? state.doc.text : sourceText.value;
  if (!text.trim()) {
    showError(analyzeError, 'Collez un texte ou déposez un fichier pour commencer.');
    return;
  }
  analyzeButton.disabled = true;
  const label = analyzeButton.textContent;
  analyzeButton.textContent = 'Analyse en cours...';
  try {
    state.text = text;
    state.manualTerms = [];
    state.revealed = new Set();
    state.modelSpans = [...(state.doc?.extraSpans ?? []), ...(await modelSpansFor(text))];
    recompute();
    el('result-empty').hidden = true;
    resultText.hidden = false;
    precheck.hidden = true;
    el('review-notice').hidden = false;
    el('review-title').textContent = 'Texte nettoyé';
    setOriginalMode(false);
    reviewed.disabled = false;
    el('toggle-entries').hidden = false;
    el('add-term-form').hidden = false;
    reviewed.disabled = false;
    el<HTMLButtonElement>('toggle-entries').disabled = false;
  } catch (err) {
    showError(analyzeError, err instanceof Error ? err.message : String(err));
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = label;
  }
}

// Recalcule le masquage après un changement (mot ajouté, élément remis en clair).
function recompute(): void {
  state.result = maskText(state.text, {
    alwaysMask: readAlwaysMask(),
    manualTerms: state.manualTerms,
    modelSpans: state.modelSpans,
    revealed: state.revealed,
  });
  sessionTable = state.result.entries
    .filter((e) => !e.revealed)
    .map((e) => ({ label: e.label, value: e.value }));
  renderResult();
  setReviewed(false);
}

const resultText = el('result-text');

function renderResult(): void {
  const result = state.result;
  if (!result) return;
  resultText.replaceChildren();
  let sensitiveCount = 0;
  for (const seg of result.segments) {
    if (seg.kind === 'text') {
      sensitiveCount += appendWithSensitive(resultText, seg.text);
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = seg.revealed ? 'entity revealed' : 'entity';
    button.dataset.key = seg.key;
    button.textContent = seg.revealed ? seg.text : seg.label;
    button.dataset.tip = seg.revealed ? `Laissé en clair. Cliquer pour masquer en ${seg.label}` : `${seg.text} : cliquer pour remettre en clair`;
    button.setAttribute(
      'aria-label',
      seg.revealed ? `${seg.text}, laissé en clair. Activer pour masquer.` : `${seg.text}, masqué par ${seg.label}. Activer pour remettre en clair.`,
    );
    resultText.append(button);
  }

  const banner = el('sensitive-banner');
  banner.hidden = !sensitiveCount;
  banner.textContent = sensitiveCount
    ? sensitiveCount > 1
      ? `${sensitiveCount} mots surlignés en orange parlent de santé ou d'un sujet sensible. Ils ne sont pas masqués : cliquez sur chacun pour décider.`
      : "1 mot surligné en orange parle de santé ou d'un sujet sensible. Il n'est pas masqué : cliquez dessus pour décider."
    : '';

  // Rapport : nombre d'éléments masqués par catégorie.
  const counts = new Map<Category, number>();
  for (const seg of result.segments) {
    if (seg.kind === 'entity' && !seg.revealed) counts.set(seg.category, (counts.get(seg.category) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([cat, n]) => plural(n, CATEGORY_LABELS[cat]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const report = el('report');
  report.textContent = total
    ? `${plural(total, ['information masquée', 'informations masquées'])}`
    : "Aucune information repérée. Relisez quand même : l'outil a pu en laisser passer.";
  report.title = total ? `Informations masquées : ${parts.join(', ')}.` : report.textContent;
  el('report-detail').textContent = total ? `Par catégorie : ${parts.join(', ')}.` : '';

  // Liste détaillée.
  el('entries-count').textContent = String(result.entries.filter((e) => !e.revealed).length);
  const body = el('entries-body');
  body.replaceChildren();
  for (const entry of result.entries) {
    const li = document.createElement('li');
    const row = document.createElement('button');
    row.type = 'button';
    row.className = entry.revealed ? 'entry is-revealed' : 'entry';
    row.setAttribute('aria-pressed', String(entry.revealed));
    const label = document.createElement('span');
    label.className = 'entry-label';
    label.textContent = entry.label;
    const value = document.createElement('span');
    value.className = 'entry-value';
    value.textContent = entry.value;
    const meta = document.createElement('span');
    meta.className = 'entry-meta';
    meta.textContent = `${entry.revealed ? 'En clair' : 'Masqué'}${entry.count > 1 ? `, ${entry.count} fois` : ''}`;
    row.append(label, value, meta);
    row.title = entry.revealed ? 'Cliquer pour masquer' : 'Cliquer pour remettre en clair';
    row.addEventListener('click', () => toggleKey(entry.key, row));
    li.append(row);
    body.append(li);
  }
}

// Ajoute un morceau de texte en clair, avec les mots sensibles surlignés.
// Renvoie le nombre de mots surlignés.
function appendWithSensitive(target: HTMLElement, text: string): number {
  const spans = detectSensitive(text);
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) target.append(document.createTextNode(text.slice(cursor, span.start)));
    const word = text.slice(span.start, span.end);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sensitive';
    button.textContent = word;
    button.dataset.term = word;
    button.title = SENSITIVE_MESSAGE;
    button.setAttribute('aria-label', `${word}. ${SENSITIVE_MESSAGE}`);
    target.append(button);
    cursor = span.end;
  }
  if (cursor < text.length) target.append(document.createTextNode(text.slice(cursor)));
  return spans.length;
}

const sensitivePop = el('sensitive-pop');
let sensitiveTerm = '';
let sensitiveFrom: HTMLElement | null = null;

function openSensitivePop(button: HTMLButtonElement): void {
  sensitiveTerm = button.dataset.term ?? '';
  sensitiveFrom = button;
  el('sensitive-msg').textContent = `« ${sensitiveTerm} ». ${SENSITIVE_MESSAGE}`;
  const rect = button.getBoundingClientRect();
  sensitivePop.hidden = false;
  const box = sensitivePop.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth };
  const left = Math.min(rect.left - box.left, box.width - sensitivePop.offsetWidth - 12);
  sensitivePop.style.left = `${Math.max(8, left)}px`;
  sensitivePop.style.top = `${rect.bottom - box.top + 6}px`;
  el('sensitive-mask').focus();
}

function closeSensitivePop(restoreFocus = false): void {
  if (sensitivePop.hidden) return;
  sensitivePop.hidden = true;
  if (restoreFocus) sensitiveFrom?.focus();
}

el('sensitive-mask').addEventListener('click', () => {
  closeSensitivePop();
  addManualTerm(sensitiveTerm);
});
el('sensitive-close').addEventListener('click', () => closeSensitivePop(true));
sensitivePop.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSensitivePop(true);
});
document.addEventListener('mousedown', (e) => {
  const target = e.target as HTMLElement;
  if (!sensitivePop.contains(target) && !target.closest('button.sensitive')) closeSensitivePop();
});

function toggleKey(key: string, from?: HTMLElement): void {
  if (state.revealed.has(key)) state.revealed.delete(key);
  else state.revealed.add(key);
  const scroll = resultText.scrollTop;
  recompute();
  resultText.scrollTop = scroll;
  // Garde le focus clavier là où la personne a cliqué.
  if (from) {
    const index = [...el('entries-body').querySelectorAll('button')].indexOf(from as HTMLButtonElement);
    el('entries-body').querySelectorAll<HTMLButtonElement>('button')[index]?.focus();
  } else {
    resultText.querySelector<HTMLButtonElement>(`button[data-key="${CSS.escape(key)}"]`)?.focus();
  }
}

resultText.addEventListener('click', (e) => {
  const sensitive = (e.target as HTMLElement).closest<HTMLButtonElement>('button.sensitive');
  if (sensitive) return openSensitivePop(sensitive);
  const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button.entity');
  if (target?.dataset.key) toggleKey(target.dataset.key);
});

// --- Masquer un mot sélectionné -------------------------------------------------

const maskSelection = el<HTMLButtonElement>('mask-selection');
let pendingSelection = '';

function addManualTerm(term: string): void {
  const clean = term.replace(/\s+/g, ' ').trim();
  if (clean.length < 2) return;
  // Si le mot était remis en clair, on le remasque.
  for (const key of [...state.revealed]) if (key === clean.toLowerCase()) state.revealed.delete(key);
  if (!state.manualTerms.some((t) => t.toLowerCase() === clean.toLowerCase())) state.manualTerms.push(clean);
  recompute();
}

document.addEventListener('mouseup', () => {
  setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (!sel || sel.rangeCount === 0 || text.length < 2 || text.length > 120 || !resultText.contains(sel.anchorNode)) {
      if (document.activeElement !== maskSelection) maskSelection.hidden = true;
      return;
    }
    // Une sélection qui ne contient que des étiquettes n'a rien à masquer.
    if (/^\[[A-Z]+_\d+\]$/.test(text)) return;
    pendingSelection = text;
    // Position du bouton sous la sélection, dans l'espace de travail.
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const box = maskSelection.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    maskSelection.style.left = `${rect.left - box.left}px`;
    maskSelection.style.top = `${rect.bottom - box.top + 6}px`;
    maskSelection.hidden = false;
  }, 0);
});
maskSelection.addEventListener('mousedown', (e) => e.preventDefault());
maskSelection.addEventListener('click', () => {
  maskSelection.hidden = true;
  window.getSelection()?.removeAllRanges();
  addManualTerm(pendingSelection);
});

el<HTMLFormElement>('add-term-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = el<HTMLInputElement>('add-term');
  addManualTerm(input.value);
  input.value = '';
});

// --- Export, après la case « J'ai relu » ----------------------------------------

const exportButtons = ['copy-clean', 'download-clean', 'download-clean-txt', 'download-table'].map((id) => el<HTMLButtonElement>(id));

function setReviewed(value: boolean): void {
  reviewed.checked = value;
  for (const b of exportButtons) b.disabled = !value;
  // Rien n'est masqué sur le texte d'origine : pas de table de correspondance.
  if (originalMode) el<HTMLButtonElement>('download-table').disabled = true;
  el('copy-done').textContent = '';
}
reviewed.addEventListener('change', () => setReviewed(reviewed.checked));

function currentReplacements(): Replacement[] {
  const out: Replacement[] = [];
  let pos = 0;
  for (const seg of state.result?.segments ?? []) {
    if (seg.kind === 'entity' && !seg.revealed) out.push({ start: pos, end: pos + seg.text.length, text: seg.label });
    pos += seg.text.length;
  }
  return out;
}

el('copy-clean').addEventListener('click', async () => {
  if (!reviewed.checked) return;
  if (originalMode) {
    const ok = await copyToClipboard(currentText());
    el('copy-done').textContent = ok ? 'Texte copié. Vous pouvez le coller dans votre IA.' : 'La copie a échoué. Sélectionnez le texte à la main.';
    return;
  }
  if (!state.result) return;
  const ok = await copyToClipboard(state.result.maskedText);
  el('copy-done').textContent = ok
    ? 'Texte nettoyé copié. Vous pouvez le coller dans votre IA.'
    : 'La copie a échoué. Sélectionnez le texte à la main.';
});

let builtFiles: BuiltFile[] = [];

async function buildOutput(): Promise<BuiltFile[]> {
  const doc = state.doc ?? textDocument('texte.txt', state.text);
  const { files, report } = await doc.build(currentReplacements(), state.result!.maskedText);
  const note = el('export-note');
  if (report.removedMetadata.length) {
    note.hidden = false;
    note.textContent = `Informations cachées du fichier supprimées : ${report.removedMetadata.join(', ')}.`;
  }
  return files;
}

el('download-clean').addEventListener('click', async () => {
  if (!reviewed.checked) return;
  if (originalMode) return downloadOriginal();
  if (!state.result) return;
  try {
    builtFiles = await buildOutput();
    downloadBlob(builtFiles[0].blob, builtFiles[0].fileName);
    el('copy-done').textContent = `Fichier nettoyé téléchargé : ${builtFiles[0].fileName}`;
  } catch (err) {
    el('copy-done').textContent = '';
    showError(analyzeError, `Le fichier n'a pas pu être créé : ${err instanceof Error ? err.message : String(err)}`);
  }
});

// Verdict « Oui » : le texte d'origine, ou le fichier d'origine sans ses
// informations cachées (auteur, société), sans rien masquer dans le texte.
async function downloadOriginal(asText = false): Promise<void> {
  const text = currentText();
  const doc = state.doc;
  try {
    if (!doc || asText || doc.kind === 'text') {
      const name = doc ? suffixedName(doc.name, 'verifie', 'txt') : 'texte.txt';
      downloadText(text, doc?.kind === 'text' && !asText ? doc.name : name);
      el('copy-done').textContent = 'Texte téléchargé.';
      return;
    }
    const { files } = await doc.build([], text);
    downloadBlob(files[0].blob, files[0].fileName);
    el('copy-done').textContent = `Fichier téléchargé : ${files[0].fileName}`;
  } catch (err) {
    showError(analyzeError, `Le fichier n'a pas pu être créé : ${err instanceof Error ? err.message : String(err)}`);
  }
}

el('download-clean-txt').addEventListener('click', () => {
  if (!reviewed.checked) return;
  if (originalMode) return void downloadOriginal(true);
  if (!state.result) return;
  const name = suffixedName(state.doc?.name ?? 'texte.txt', 'nettoye', 'txt');
  downloadText(state.result.maskedText, name);
  el('copy-done').textContent = `Texte nettoyé téléchargé : ${name}`;
});

el('download-table').addEventListener('click', () => {
  if (!reviewed.checked) return;
  const base = state.doc?.name ?? 'texte.txt';
  downloadText(tableToCsv(sessionTable), suffixedName(base, 'table-de-correspondance', 'csv'), 'text/csv;charset=utf-8');
});

// Affiche les boutons d'export adaptés au type de document.
export function refreshExportButtons(): void {
  const doc = state.doc;
  const main = el<HTMLButtonElement>('download-clean');
  const txt = el<HTMLButtonElement>('download-clean-txt');
  const note = el('export-note');
  note.hidden = true;
  txt.hidden = true;
  if (!doc) {
    main.textContent = 'Télécharger (.txt)';
  } else if (doc.kind === 'pdf') {
    main.textContent = 'Télécharger en Word (.docx)';
    txt.hidden = false;
    note.hidden = false;
    note.textContent = "Un PDF ne peut pas être modifié proprement sans risque d'y laisser le texte d'origine. Le texte nettoyé ressort donc en Word et en texte simple. La mise en page du PDF n'est pas conservée.";
  } else {
    const ext = doc.name.split('.').pop() ?? 'txt';
    main.textContent = `Télécharger (.${ext})`;
    if (doc.kind !== 'text') txt.hidden = false;
  }
}
analyzeButton.addEventListener('click', refreshExportButtons);

// --- Onglet 2 : remettre les vrais noms ----------------------------------------

const aiText = el<HTMLTextAreaElement>('ai-text');
let aiDocx: { file: File } | null = null;

function activeTable(): Correspondence[] {
  return loadedTable ?? sessionTable;
}

let loadedTableLabel = 'Table chargée depuis votre fichier';

function refreshTableStatus(): void {
  const status = el('table-status');
  if (loadedTable) {
    status.textContent = `${loadedTableLabel} : ${plural(loadedTable.length, ['élément', 'éléments'])}.`;
  } else if (sessionTable.length) {
    status.textContent = `Table du texte que vous venez de nettoyer : ${plural(sessionTable.length, ['élément', 'éléments'])}.`;
  } else {
    status.textContent = 'Aucune table pour l’instant. Chargez le fichier .csv que vous avez gardé.';
  }
}

el<HTMLInputElement>('table-file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const table = csvToTable(await file.text());
  if (!table.length) {
    showError(el('restore-error'), "Ce fichier ne ressemble pas à une table de correspondance. Choisissez le fichier .csv téléchargé à l'étape « Récupérez le résultat ».");
    return;
  }
  showError(el('restore-error'), null);
  loadedTable = table;
  loadedTableLabel = 'Table chargée depuis votre fichier';
  refreshTableStatus();
  refreshRestore();
});

async function openAiFile(file: File): Promise<void> {
  showError(el('restore-error'), null);
  const name = el('ai-file-name');
  try {
    if (file.name.toLowerCase().endsWith('.docx')) {
      const { readDocxText } = await import('./files/docx');
      aiText.value = await readDocxText(file);
      aiDocx = { file };
    } else {
      aiText.value = await file.text();
      aiDocx = null;
    }
    name.hidden = false;
    name.textContent = `Fichier chargé : ${file.name}`;
    refreshRestore();
  } catch (err) {
    showError(el('restore-error'), err instanceof Error ? err.message : String(err));
  }
}
setupDropZone(el('drop-restore'), (file) => void openAiFile(file));
el<HTMLInputElement>('ai-file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void openAiFile(file);
});
aiText.addEventListener('input', () => {
  aiDocx = null;
  el('ai-file-name').hidden = true;
  el('restore-done').textContent = '';
  refreshRestore();
});

// Valeurs tapées par la personne, par trou. Elles priment sur la table et
// survivent quand la réponse est modifiée ou recollée.
const typedValues = new Map<string, string>();
let restoredPlain = '';
let missingNow: Placeholder[] = [];
let lastScanSignature = '';

// Valeur proposée pour un trou : ce que la personne a tapé, sinon la table.
function currentValues(scan: ScanResult): Map<string, string> {
  const table = tableToMap(activeTable());
  const values = new Map<string, string>();
  for (const p of scan.placeholders) values.set(p.key, typedValues.get(p.key) ?? table.get(p.key) ?? '');
  return values;
}

function fieldRow(p: Placeholder, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = `field ${p.kind}${value.trim() ? '' : ' is-empty'}`;
  const id = `field-${[...p.key].map((c) => c.charCodeAt(0).toString(36)).join('')}`;
  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = id;
  label.textContent = p.display;
  if (p.count > 1) {
    const times = document.createElement('small');
    times.textContent = `${p.count} fois`;
    label.append(times);
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = value;
  input.dataset.key = p.key;
  input.placeholder = p.kind === 'ai' ? 'Valeur à mettre à la place' : 'Vraie valeur';
  row.append(label, input);
  return row;
}

// Reconstruit la liste des champs quand la réponse ou la table change.
function refreshRestore(): void {
  const text = aiText.value;
  const scan = scanPlaceholders(text);
  const values = currentValues(scan);
  const signature = JSON.stringify([scan.placeholders.map((p) => [p.key, p.count]), [...values]]);
  if (signature !== lastScanSignature) {
    lastScanSignature = signature;
    const tool = scan.placeholders.filter((p) => p.kind === 'tool');
    const ai = scan.placeholders.filter((p) => p.kind === 'ai');
    el('fields-tool-list').replaceChildren(...tool.map((p) => fieldRow(p, values.get(p.key) ?? '')));
    el('fields-ai-list').replaceChildren(...ai.map((p) => fieldRow(p, values.get(p.key) ?? '')));
    el('fields-tool').hidden = !tool.length;
    el('fields-ai').hidden = !ai.length;
    el('fields').hidden = !scan.placeholders.length;
    const count = el('fields-count');
    count.hidden = !scan.placeholders.length;
    count.textContent = String(scan.placeholders.length);
    const empty = el('fields-empty');
    empty.hidden = !!scan.placeholders.length;
    empty.querySelector('p')!.textContent = text.trim()
      ? "Aucune étiquette ni aucun trou entre crochets dans ce texte. Vérifiez que c'est bien la réponse de l'IA au texte nettoyé."
      : "Collez la réponse de l'IA. Chaque étiquette apparaîtra ici avec sa valeur, que vous pouvez corriger.";

    // Étiquettes de la table que la réponse ne reprend pas : simple information.
    const absent = text.trim() ? absentLabels(activeTable().map((c) => canonicalOf(c.label)), scan) : [];
    const absentNode = el('fields-absent');
    absentNode.hidden = !absent.length;
    const shown = absent.slice(0, 6).join(', ');
    absentNode.textContent = absent.length
      ? `${absent.length > 1 ? 'Absentes' : 'Absente'} de la réponse : ${shown}${absent.length > 6 ? ` et ${absent.length - 6} autres` : ''}. Rien à faire si c'est voulu.`
      : '';
  }
  renderRestored(text, scan, values);
}

function canonicalOf(label: string): string {
  return scanToolLabels(label)[0]?.label ?? label;
}

function renderRestored(text: string, scan: ScanResult, values: Map<string, string>): void {
  const result = fillPlaceholders(text, values, scan);
  restoredPlain = result.text;
  missingNow = result.missing;
  const out = el('restored-text');
  out.replaceChildren();
  for (const piece of result.pieces) {
    if (piece.kind === 'plain') {
      out.append(document.createTextNode(piece.text));
      continue;
    }
    const mark = document.createElement('mark');
    mark.className = piece.kind === 'filled' ? 'restored' : 'hole';
    mark.textContent = piece.text;
    mark.title = piece.kind === 'filled' ? `À la place de ${scan.placeholders.find((p) => p.key === piece.key)?.display ?? ''}` : 'Pas encore rempli';
    out.append(mark);
  }
  const hasText = !!text.trim();
  el('restore-result').hidden = !hasText;
  el('restore-empty').hidden = hasText;
  el<HTMLButtonElement>('copy-restored').disabled = !hasText;
  const download = el<HTMLButtonElement>('download-restored');
  download.disabled = !hasText;
  download.textContent = aiDocx ? 'Télécharger (.docx)' : 'Télécharger (.txt)';

  const report = el('restore-report');
  const filled = scan.placeholders.length - result.missing.length;
  report.classList.toggle('warn', result.missing.length > 0);
  if (!hasText) report.textContent = '';
  else if (!scan.placeholders.length) report.textContent = 'Rien à remplacer dans ce texte.';
  else if (result.missing.length) report.textContent = missingMessage(result.missing);
  else report.textContent = `Tout est rempli : ${plural(filled, ['élément remplacé', 'éléments remplacés'])}.`;
}

function missingMessage(missing: Placeholder[]): string {
  const list = missing.map((p) => p.display).join(', ');
  return missing.length > 1
    ? `${missing.length} éléments ne sont pas remplis : ${list}.`
    : `1 élément n'est pas rempli : ${list}.`;
}

el('fields').addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  if (!input.dataset.key) return;
  typedValues.set(input.dataset.key, input.value);
  input.closest('.field')?.classList.toggle('is-empty', !input.value.trim());
  // Mise à jour de l'aperçu seulement : la liste garde le focus.
  const scan = scanPlaceholders(aiText.value);
  const values = currentValues(scan);
  lastScanSignature = JSON.stringify([scan.placeholders.map((p) => [p.key, p.count]), [...values]]);
  renderRestored(aiText.value, scan, values);
});
el('fields').addEventListener('submit', (e) => e.preventDefault());

el('copy-restored').addEventListener('click', async () => {
  const ok = await copyToClipboard(restoredPlain);
  const done = el('restore-done');
  if (!ok) done.textContent = 'La copie a échoué. Sélectionnez le texte à la main.';
  else done.textContent = missingNow.length ? `Texte copié. Attention : ${missingMessage(missingNow)}` : 'Texte copié.';
});

el('download-restored').addEventListener('click', async () => {
  try {
    if (aiDocx) {
      const { restoreDocx } = await import('./files/docx');
      const blob = await restoreDocx(aiDocx.file, currentValues(scanPlaceholders(aiText.value)));
      downloadBlob(blob, suffixedName(aiDocx.file.name, 'vrais-noms', 'docx'));
    } else {
      downloadText(restoredPlain, 'reponse-avec-vrais-noms.txt');
    }
    el('restore-done').textContent = missingNow.length ? `Fichier téléchargé. Attention : ${missingMessage(missingNow)}` : 'Fichier téléchargé.';
  } catch (err) {
    showError(el('restore-error'), err instanceof Error ? err.message : String(err));
  }
});

// --- Menu latéral et liste des éléments masqués ---------------------------------

const app = el('app');
const sidebarToggle = el<HTMLButtonElement>('toggle-sidebar');
const SIDEBAR_KEY = 'avant-l-ia.sidebar-collapsed';
function setSidebarCollapsed(collapsed: boolean): void {
  app.classList.toggle('collapsed', collapsed);
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.title = collapsed ? 'Déplier le menu' : 'Replier le menu';
}
try {
  setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === '1');
} catch {
  // Stockage indisponible : le menu reste déplié.
}
sidebarToggle.addEventListener('click', () => {
  const collapsed = !app.classList.contains('collapsed');
  setSidebarCollapsed(collapsed);
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  } catch {
    // ignoré
  }
});

// Sur un petit écran, les réglages commencent repliés pour laisser la place au texte.
if (window.matchMedia('(max-width: 900px)').matches) {
  document.querySelectorAll<HTMLDetailsElement>('.setting').forEach((d) => (d.open = false));
}

const entriesToggle = el<HTMLButtonElement>('toggle-entries');
const entriesPanel = el('entries-panel');
function setEntriesOpen(open: boolean): void {
  entriesPanel.hidden = !open;
  entriesToggle.setAttribute('aria-expanded', String(open));
}
entriesToggle.addEventListener('click', () => setEntriesOpen(entriesToggle.getAttribute('aria-expanded') !== 'true'));
el('close-entries').addEventListener('click', () => {
  setEntriesOpen(false);
  entriesToggle.focus();
});

// --- Modèle de détection --------------------------------------------------------

setupModelUi();

// --- Fonctionnement sans connexion ---------------------------------------------

// Après la première visite, l'outil est gardé par le navigateur et s'ouvre
// même sans internet. Seulement sur la version publiée.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Sans ce programme, l'outil marche quand même, mais pas hors ligne.
    });
  });
}

// --- Écran « Démo » ---------------------------------------------------------------
// Chaque bouton fait tout en un clic : charger un texte, copier la demande à
// coller dans l'IA, charger la réponse de l'IA avec la table du cas.

function demoButton(label: string, primary: boolean, onClick: () => void | Promise<void>): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `button ${primary ? 'primary' : 'ghost'} small`;
  b.textContent = label;
  b.addEventListener('click', () => void onClick());
  return b;
}

function demoLoadText(text: string): void {
  selectTab(el<HTMLButtonElement>('tab-clean'));
  state.doc = null;
  sourceText.readOnly = false;
  fileName.hidden = true;
  sourceText.value = text.trim();
  sourceText.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  // Le verdict tout de suite, sans attendre la pause de frappe.
  resetResultView();
}

async function demoOpenFile(url: string, name: string): Promise<void> {
  const blob = await (await fetch(url)).blob();
  selectTab(el<HTMLButtonElement>('tab-clean'));
  await openSourceFile(new File([blob], name, { type: blob.type }));
}

function demoLoadAnswer(answer: string, table: Correspondence[]): void {
  loadedTable = table;
  loadedTableLabel = 'Table du cas de démonstration';
  typedValues.clear();
  aiDocx = null;
  el('ai-file-name').hidden = true;
  aiText.value = answer.trim();
  selectTab(el<HTMLButtonElement>('tab-restore'));
}

for (const demo of DEMO_CASES) {
  const li = document.createElement('li');
  li.className = 'demo-card';
  const h = document.createElement('h2');
  h.textContent = demo.title;
  const p = document.createElement('p');
  p.textContent = `À montrer : ${demo.show}`;
  const actions = document.createElement('div');
  actions.className = 'demo-actions';
  const done = document.createElement('span');
  done.className = 'demo-done';
  done.setAttribute('role', 'status');
  const steps = !!demo.prompt;
  if (demo.text) actions.append(demoButton(steps ? '1. Charger le texte' : 'Charger le texte', true, () => demoLoadText(demo.text!)));
  if (demo.file) actions.append(demoButton('Ouvrir le fichier', true, () => demoOpenFile(demo.file!.url, demo.file!.name)));
  if (demo.prompt) {
    actions.append(
      demoButton('2. Copier la demande pour ChatGPT', false, async () => {
        const ok = await copyToClipboard(demo.prompt!.trim());
        done.textContent = ok ? 'Demande copiée.' : 'La copie a échoué.';
      }),
    );
  }
  if (demo.answer && demo.table) actions.append(demoButton("3. Charger la réponse de l'IA", false, () => demoLoadAnswer(demo.answer!, demo.table!)));
  actions.append(done);
  li.append(h, p, actions);
  el('demo-list').append(li);
}
