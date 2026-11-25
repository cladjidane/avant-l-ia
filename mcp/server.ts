// Avant l'IA pour Claude Desktop : un serveur MCP qui tourne sur l'ordinateur.
// Claude peut lui demander d'ouvrir un fichier : il reçoit seulement la
// version masquée. Claude lui donne ensuite sa réponse avec les étiquettes :
// le serveur remet les vrais noms et enregistre le résultat dans un fichier,
// sans jamais renvoyer les vrais noms à Claude.

// Claude Desktop lit les messages du serveur sur la sortie standard. Tout
// affichage d'une bibliothèque doit donc partir sur la sortie d'erreur.
console.log = (...args: unknown[]) => console.error(...args);
console.info = console.log;
console.warn = (...args: unknown[]) => console.error(...args);

import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { APP_NAME } from '../src/config';
import { ALWAYS_MASK_FILE, maskFolder, maskProgramOutput, openMaskedFile, saveReply, UserError, type Workspace } from './documents';
import { fetchMails, listAccounts, mailConfigFromEnv, mailToText } from './mail';
import { loadModel, type Detector } from './model';
import { MAX_OUTPUT_CHARS, runSandboxed, sandboxAvailable } from './program';

const dataFolder = process.env.AVANT_L_IA_DATA ?? join(homedir(), 'Library', 'Application Support', APP_NAME);
const ws: Workspace = {
  folder: process.env.AVANT_L_IA_FOLDER ?? join(homedir(), 'Documents', APP_NAME),
  tablesFolder: join(dataFolder, 'tables'),
};
mkdirSync(ws.folder, { recursive: true });

// Le modèle se charge dès le lancement, pour que la première ouverture soit rapide.
const MODEL_WAIT_MS = 50_000;
let modelError: string | null = null;
const modelReady: Promise<Detector | null> = loadModel(join(dataFolder, 'modeles')).catch((err: unknown) => {
  modelError = err instanceof Error ? err.message : String(err);
  console.error(`Chargement du modèle impossible : ${modelError}`);
  return null;
});

async function waitForModel(): Promise<Detector> {
  const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), MODEL_WAIT_MS));
  const result = await Promise.race([modelReady, timeout]);
  if (result === 'timeout') {
    throw new UserError(
      'Le modèle qui repère les noms se télécharge encore (environ 115 Mo, la première fois seulement). Réessayez dans une minute.',
    );
  }
  if (!result) {
    throw new UserError(
      `Le modèle qui repère les noms n'a pas pu être chargé (${modelError}). Le fichier n'a pas été ouvert, pour ne pas laisser passer un nom.`,
    );
  }
  return result;
}

const server = new McpServer(
  { name: 'avant-l-ia', version: '0.1.0' },
  {
    instructions: [
      `${APP_NAME} cache les noms, les coordonnées, les numéros et les montants d'un fichier avant que tu le lises.`,
      'Ils sont remplacés par des étiquettes comme [PERSONNE_1], [ENTREPRISE_1] ou [TELEPHONE_1].',
      'Garde ces étiquettes telles quelles dans tes réponses, avec leurs crochets. Ne cherche pas à deviner les vraies valeurs.',
      'Pour livrer un texte final (une réponse à un mail, un compte rendu), appelle save_reply avec ton texte et ses étiquettes :',
      "l'outil remet les vrais noms et enregistre le fichier sur l'ordinateur de la personne. Tu ne verras jamais le résultat avec les vrais noms, c'est voulu.",
    ].join(' '),
  },
);

function toolError(err: unknown) {
  const message = err instanceof UserError ? err.message : `Erreur inattendue : ${err instanceof Error ? err.message : String(err)}`;
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

server.registerTool(
  'open_masked_file',
  {
    title: 'Ouvrir un fichier masqué',
    description:
      `Ouvre un fichier .txt ou .md du dossier « ${ws.folder} » et renvoie sa version masquée : ` +
      'les noms, coordonnées, numéros et montants sont remplacés par des étiquettes. ' +
      'Renvoie aussi un numéro de document, à donner ensuite à save_reply.',
    inputSchema: {
      file: z.string().describe('Nom du fichier dans le dossier, par exemple « mail-client.txt ».'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ file }) => {
    try {
      const detector = await waitForModel();
      const doc = await openMaskedFile(ws, file, detector);
      const lines = [
        `Numéro de document : ${doc.id}`,
        `Éléments masqués : ${doc.summary}.`,
      ];
      if (doc.sensitiveThemes.length) {
        lines.push(
          `Attention : le texte contient des mots liés à ces sujets sensibles, laissés en clair : ${doc.sensitiveThemes.join(', ')}. ` +
            'Signale-le à la personne.',
        );
      }
      lines.push('', '--- Texte masqué ---', doc.maskedText);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  'save_reply',
  {
    title: 'Enregistrer la réponse avec les vrais noms',
    description:
      'Reçoit un texte écrit avec les étiquettes du document ([PERSONNE_1]...), remet les vraies valeurs ' +
      "et enregistre le résultat dans un fichier, à côté du fichier d'origine. " +
      'Renvoie seulement le chemin du fichier et le nombre d’étiquettes remplacées, jamais les vraies valeurs.',
    inputSchema: {
      document_id: z.string().describe('Numéro de document donné par open_masked_file, run_program ou run_mail_program, par exemple « doc-20261125-143012-0042 ».'),
      text: z.string().describe('Le texte à enregistrer, avec les étiquettes telles quelles.'),
      file_name: z
        .string()
        .optional()
        .describe('Nom du fichier à créer dans le dossier. Par défaut : le nom du fichier d’origine suivi de « - réponse ».'),
    },
  },
  async ({ document_id, text, file_name }) => {
    try {
      const saved = saveReply(ws, document_id, text, file_name);
      const lines = [
        `Fichier enregistré : ${saved.path}`,
        `Étiquettes remplacées par les vraies valeurs : ${saved.restoredCount}.`,
      ];
      if (saved.unknownLabels.length) {
        lines.push(`Étiquettes inconnues, laissées telles quelles : ${saved.unknownLabels.join(', ')}.`);
      }
      if (saved.holes.length) {
        lines.push(`Trous à compléter par la personne dans le fichier : ${saved.holes.join(', ')}.`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  'run_program',
  {
    title: 'Traiter tous les fichiers d’un dossier avec un programme',
    description: [
      `Masque tous les fichiers .txt et .md d'un dossier de « ${ws.folder} », puis exécute sur ces textes masqués un programme JavaScript que tu écris.`,
      'À utiliser pour traiter plusieurs fichiers d’un coup (lister, compter, trier, extraire) sans lire chaque fichier.',
      'Le code est le corps d’une fonction async. Il reçoit la variable « documents » : une liste de { name, text }, où text est le texte masqué.',
      'Il affiche son résultat avec console.log (ou le renvoie avec return). Tu reçois seulement cet affichage, limité à ' + MAX_OUTPUT_CHARS + ' caractères.',
      'Le programme n’a accès ni à internet, ni aux fichiers, et il est arrêté au bout de 10 secondes.',
      'Les montants, noms et dates sont masqués ([MONTANT_1]...) : le programme peut les recopier mais pas les additionner ni les comparer.',
      'Une même valeur a la même étiquette dans tous les fichiers. Pour livrer le résultat avec les vraies valeurs, passe le numéro de document à save_reply.',
      'Exemple : for (const d of documents) { const m = d.text.match(/Montant[^\\n]*?(\\[MONTANT_\\d+\\])/); console.log(d.name, m?.[1] ?? "?"); }',
    ].join(' '),
    inputSchema: {
      code: z.string().describe('Corps de la fonction async, en JavaScript.'),
      subfolder: z.string().optional().describe('Sous-dossier à traiter, par exemple « devis ». Par défaut : le dossier principal.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ code, subfolder }) => {
    try {
      if (!sandboxAvailable()) throw new UserError('Cette action n’est disponible que sur Mac.');
      const detector = await waitForModel();
      const batch = await maskFolder(ws, subfolder, detector);
      const run = await runSandboxed(code, { documents: batch.documents });
      const lines = [
        `Numéro de document : ${batch.id}`,
        `Fichiers traités : ${batch.documents.length}.`,
        `Éléments masqués : ${batch.summary}.`,
      ];
      if (batch.sensitiveThemes.length) {
        lines.push(`Attention : les fichiers contiennent des mots liés à ces sujets sensibles : ${batch.sensitiveThemes.join(', ')}.`);
      }
      if (run.error) lines.push(`Erreur du programme : ${run.error}`);
      if (run.truncated) lines.push(`L’affichage a été coupé à ${MAX_OUTPUT_CHARS} caractères.`);
      lines.push('', '--- Affichage du programme ---', run.output || '(rien)');
      return { isError: Boolean(run.error) && !run.output, content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      return toolError(err);
    }
  },
);

// Accès aux mails, seulement si un serveur de messagerie est configuré.
const mailConfig = mailConfigFromEnv(process.env);
const MAIL_DEFAULT_LIMIT = 20;
// Compte utilisé quand la demande n'en nomme aucun.
const MAIL_DEFAULT_ACCOUNT = process.env.AVANT_L_IA_MAIL_DEFAULT_ACCOUNT;
const MAIL_MAX_LIMIT = 60;

// Boîtes disponibles, lues au lancement, pour que Claude sache laquelle choisir.
async function describeAccounts(): Promise<string> {
  if (!mailConfig) return '';
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), 8000));
    const accounts = await Promise.race([listAccounts(mailConfig), timeout]);
    return accounts.map((a) => `« ${a.name} » (${a.user})`).join(', ');
  } catch (err) {
    console.error(`Liste des boîtes indisponible : ${err instanceof Error ? err.message : String(err)}`);
    return '';
  }
}
const accountList = await describeAccounts();

if (mailConfig) {
  server.registerTool(
    'run_mail_program',
    {
      title: 'Traiter des mails avec un programme, sans les lire',
      description: [
        'Cherche des mails dans la messagerie de la personne et exécute sur ces mails un programme JavaScript que tu écris.',
        'Fais une seule recherche, la plus étroite possible, et n’en relance pas d’autre sans que la personne le demande.',
        'Quand la personne parle des « réponses à mes mails », cherche « Re: » dans l’objet (field SUBJECT).',
        'Pour un mot qui peut être dans le texte du mail (« janvier », un lieu), utilise field FULL.',
        'Sur la boîte par défaut, cherche dans tous les dossiers (folders « * »), envois compris : elle est petite et la recherche reste rapide.',
        'Sur une grosse boîte (plusieurs milliers de mails), FULL et tous les dossiers (« * ») prennent plus d’une minute : ajoute une date de début (since) et reste dans la boîte de réception.',
        'Le programme reçoit les vrais mails, dans un processus sans accès à internet ni aux fichiers, arrêté au bout de 10 secondes.',
        'Tu ne reçois que ce que le programme affiche, et cet affichage est masqué avant de t’arriver : noms, adresses, téléphones, montants deviennent des étiquettes ([PERSONNE_1]...).',
        'Le code est le corps d’une fonction async. Il reçoit la variable « mails » : une liste de',
        '{ account, folder, uid, date (ISO), from, to, cc, subject, body (texte sans l’historique cité, coupé à 6000 caractères), attachments (noms des pièces jointes) },',
        'du plus récent au plus ancien. Il affiche avec console.log, ou renvoie avec return.',
        'Le programme peut comparer les vraies adresses, par exemple pour séparer les mails envoyés par une personne des mails automatiques',
        '(adresses noreply, no-reply, notification, newsletter, mailer ; mots « se désabonner », « unsubscribe », « ne pas répondre », « message automatique » dans le texte ; objets « Réponse automatique », « Absence », « Out of office »).',
        'Pour un résumé, fais afficher par le programme la date, l’expéditeur, l’objet et le début du texte des seuls mails utiles : n’affiche pas tout.',
        `Affichage limité à ${MAX_OUTPUT_CHARS} caractères. Pour livrer ton résumé avec les vrais noms, passe le numéro de document à save_reply.`,
      ].join(' '),
      inputSchema: {
        account: (MAIL_DEFAULT_ACCOUNT ? z.string().optional() : z.string()).describe(
          [
            MAIL_DEFAULT_ACCOUNT ? `Compte de messagerie. Par défaut : « ${MAIL_DEFAULT_ACCOUNT} ».` : 'Compte de messagerie.',
            accountList ? `Comptes disponibles : ${accountList}.` : '',
            'Commence par le compte par défaut. Un autre compte seulement si la personne le demande.',
          ].filter(Boolean).join(' '),
        ),
        query: z.string().describe('Texte cherché, par exemple le nom ou le domaine d’une entreprise : « kerhuel » ou « kerhuel-distribution.fr ».'),
        field: z
          .enum(['FROM', 'SUBJECT', 'ALL', 'FULL'])
          .optional()
          .describe('FROM : expéditeur seulement (par défaut). SUBJECT : objet seulement. ALL : expéditeur, destinataire et objet. FULL : aussi le texte des mails, plus lent.'),
        since: z.string().optional().describe('Date AAAA-MM-JJ incluse.'),
        before: z.string().optional().describe('Date AAAA-MM-JJ exclue.'),
        folders: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Dossiers : « INBOX » (par défaut), « sent » pour les envois, « * » pour tous sauf corbeille et spam, ou une liste.'),
        limit: z.number().int().min(1).max(MAIL_MAX_LIMIT).optional().describe(`Nombre de mails, les plus récents d’abord. Par défaut ${MAIL_DEFAULT_LIMIT}.`),
        code: z.string().describe('Corps de la fonction async, en JavaScript. Variable disponible : mails.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ account, query, field, since, before, folders, limit, code }) => {
      try {
        if (!sandboxAvailable()) throw new UserError('Cette action n’est disponible que sur Mac.');
        const detector = await waitForModel();
        const t0 = Date.now();
        const chosenAccount = account ?? MAIL_DEFAULT_ACCOUNT;
        if (!chosenAccount) throw new UserError('Indique le compte de messagerie à utiliser.');
        const { mails, found } = await fetchMails(mailConfig, {
          account: chosenAccount,
          query,
          field: field ?? 'FROM',
          since,
          before,
          folders,
          limit: limit ?? MAIL_DEFAULT_LIMIT,
        });
        if (mails.length === 0) {
          return { content: [{ type: 'text', text: 'Aucun mail trouvé pour cette recherche. Le programme n’a pas été lancé.' }] };
        }
        const t1 = Date.now();
        const run = await runSandboxed(code, { mails });
        const t2 = Date.now();
        // L'erreur du programme peut citer un mail : elle est masquée avec l'affichage.
        const raw = [run.error ? `Erreur du programme : ${run.error}` : '', run.output].filter(Boolean).join('\n');
        const masked = await maskProgramOutput(ws, mails.map(mailToText), raw || '(rien)', detector);
        // Durées de chaque étape, dans le journal du serveur (jamais envoyées à Claude).
        console.error(`run_mail_program : lecture ${t1 - t0} ms, programme ${t2 - t1} ms, masquage ${Date.now() - t2} ms`);
        const lines = [
          `Numéro de document : ${masked.id}`,
          found > mails.length
            ? `Mails lus par le programme : ${mails.length} sur ${found} trouvés. La messagerie est lente : la lecture a été arrêtée au bout de 40 secondes, les plus anciens n'ont pas été lus. Pour tout lire, relance avec une date plus récente (since), moins de dossiers ou un limit plus petit.`
            : `Mails lus par le programme : ${mails.length}.`,
          `Éléments masqués dans l’affichage : ${masked.summary}.`,
        ];
        if (run.truncated) lines.push(`L’affichage a été coupé à ${MAX_OUTPUT_CHARS} caractères.`);
        lines.push('', '--- Affichage du programme, masqué ---', masked.maskedText);
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      } catch (err) {
        return toolError(err);
      }
    },
  );
}

console.error(`${APP_NAME} : dossier de travail ${ws.folder}. Mots à toujours masquer : « ${ALWAYS_MASK_FILE} » dans ce dossier.`);
await server.connect(new StdioServerTransport());
