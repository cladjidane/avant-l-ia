// Lit des mails par un serveur MCP de messagerie qui offre les actions
// search_messages et read_message (par exemple un serveur MCP qui lit une boîte IMAP).
// Les mails lus restent sur l'ordinateur : ils vont au programme de Claude,
// jamais à Claude lui-même.

import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface MailSearch {
  account: string;
  query: string;
  field?: string;
  since?: string;
  before?: string;
  folders?: string[] | string;
  limit: number;
}

export interface Mail {
  account: string;
  folder: string;
  uid: string;
  date: string; // date ISO quand elle se lit, sinon la date brute
  from: string;
  to: string;
  cc: string;
  subject: string;
  body: string; // texte du mail, sans l'historique cité
  attachments: string[]; // noms des pièces jointes
}

// Longueur maximale du texte de chaque mail donné au programme.
const MAX_BODY_CHARS = 6000;
// Huit lectures à la fois ont fait refuser les connexions par OVH (LOGIN failed, 25/11/2026).
const PARALLEL_READS = 4;
// Au-delà de cette durée, on arrête de lire de nouveaux mails et on traite
// ceux qui sont lus : certaines messageries mettent 8 secondes par mail.
const READ_BUDGET_MS = 40_000;

export interface MailConfig {
  url: string;
  token: string;
}

// Lit la configuration dans les variables d'environnement :
// AVANT_L_IA_MAIL_URL, et AVANT_L_IA_MAIL_TOKEN ou AVANT_L_IA_MAIL_ENV_FILE
// (un fichier .env qui contient MCP_AUTH_TOKEN=...).
export function mailConfigFromEnv(env: NodeJS.ProcessEnv): MailConfig | null {
  const url = env.AVANT_L_IA_MAIL_URL;
  if (!url) return null;
  let token = env.AVANT_L_IA_MAIL_TOKEN ?? '';
  if (!token && env.AVANT_L_IA_MAIL_ENV_FILE) {
    const line = readFileSync(env.AVANT_L_IA_MAIL_ENV_FILE, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('MCP_AUTH_TOKEN='));
    token = line?.slice('MCP_AUTH_TOKEN='.length).trim() ?? '';
  }
  return { url, token };
}

function structured(result: unknown): unknown {
  const r = result as { structuredContent?: { result?: unknown }; content?: Array<{ type: string; text?: string }>; isError?: boolean };
  if (r.isError) throw new Error(r.content?.map((c) => c.text ?? '').join(' ') || 'erreur du serveur de mails');
  if (r.structuredContent) return r.structuredContent.result ?? r.structuredContent;
  const text = r.content?.find((c) => c.type === 'text')?.text;
  return text ? JSON.parse(text) : null;
}

function isoDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}

// Dossiers à ne jamais parcourir avec « * ».
const SKIPPED_FOLDERS = /trash|junk|spam|drafts|brouillon|deleted|corbeille|ind[ée]sirable/i;
const SENT_FOLDERS = /sent|envoy/i;

// Traduit le choix de dossiers (« * », « sent », un nom ou une liste) en noms
// de dossiers réels, pour un serveur qui ne sait pas le faire lui-même.
export function resolveFolders(all: string[], spec: string[] | string | undefined): string[] {
  const wanted = spec === undefined ? ['INBOX'] : Array.isArray(spec) ? spec : [spec];
  const out = new Set<string>();
  for (const w of wanted) {
    if (w === '*') all.filter((f) => !SKIPPED_FOLDERS.test(f)).forEach((f) => out.add(f));
    else if (w.toLowerCase() === 'sent') all.filter((f) => SENT_FOLDERS.test(f) && !SKIPPED_FOLDERS.test(f)).forEach((f) => out.add(f));
    else out.add(w);
  }
  return [...out];
}

// Garde les messages dont la date est dans l'intervalle [since, before[.
export function inDateRange(raw: string | null | undefined, since?: string, before?: string): boolean {
  if (!since && !before) return true;
  const t = raw ? new Date(raw).getTime() : NaN;
  if (Number.isNaN(t)) return false;
  if (since && t < new Date(`${since}T00:00:00`).getTime()) return false;
  if (before && t >= new Date(`${before}T00:00:00`).getTime()) return false;
  return true;
}

const SEARCH_MAX = 100;

interface Found {
  uid: string;
  folder: string;
  date?: string;
}

export interface MailAccount {
  name: string;
  user: string;
}

async function withClient<T>(config: MailConfig, run: (client: Client) => Promise<T>): Promise<T> {
  const headers: Record<string, string> = config.token ? { Authorization: `Bearer ${config.token}` } : {};
  const client = new Client({ name: 'avant-l-ia', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers } }));
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

// Liste des boîtes que le serveur de mails sait lire, avec leur adresse.
export async function listAccounts(config: MailConfig): Promise<MailAccount[]> {
  return withClient(config, async (client) => {
    const r = (structured(await client.callTool({ name: 'list_accounts', arguments: {} })) ?? []) as Array<{ name: string; user: string }>;
    return r.map((a) => ({ name: a.name, user: a.user }));
  });
}

export interface FetchResult {
  mails: Mail[];
  found: number; // mails trouvés par la recherche, lus ou non
}

export async function fetchMails(config: MailConfig, search: MailSearch): Promise<FetchResult> {
  const started = Date.now();
  const headers: Record<string, string> = config.token ? { Authorization: `Bearer ${config.token}` } : {};
  const client = new Client({ name: 'avant-l-ia', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers } }));
  try {
    // Les versions du serveur de mails n'acceptent pas toutes les mêmes
    // réglages : on lit ceux qu'il accepte et on fait le reste ici.
    const tools = (await client.listTools()).tools;
    const params = (name: string) => new Set(Object.keys(tools.find((t) => t.name === name)?.inputSchema.properties ?? {}));
    const searchParams = params('search_messages');
    const readParams = params('read_message');

    const base: Record<string, unknown> = { account: search.account, query: search.query };
    if (search.field && searchParams.has('field')) base.field = search.field;
    const serverDates = searchParams.has('since') && searchParams.has('before');
    if (serverDates) {
      if (search.since) base.since = search.since;
      if (search.before) base.before = search.before;
    }
    // Sans filtre de dates côté serveur, on demande plus de résultats pour filtrer ici.
    const askLimit = serverDates || (!search.since && !search.before) ? search.limit : SEARCH_MAX;

    let found: Found[] = [];
    if (searchParams.has('folders') || (!search.folders && searchParams.has('folder'))) {
      const args = { ...base, limit: askLimit, ...(search.folders ? { folders: search.folders } : {}) };
      found = (structured(await client.callTool({ name: 'search_messages', arguments: args })) ?? []) as Found[];
    } else {
      const all = (structured(await client.callTool({ name: 'list_folders', arguments: { account: search.account } })) ?? []) as string[];
      for (const folder of resolveFolders(all, search.folders)) {
        const args = { ...base, limit: askLimit, folder };
        found.push(...((structured(await client.callTool({ name: 'search_messages', arguments: args })) ?? []) as Found[]));
      }
    }
    found = found
      .filter((m) => serverDates || inDateRange(m.date, search.since, search.before))
      .sort((a, b) => (new Date(b.date ?? 0).getTime() || 0) - (new Date(a.date ?? 0).getTime() || 0))
      .slice(0, search.limit);

    const serverStrips = readParams.has('strip_quotes');
    const readOne = async (m: Found) => {
      const args = { account: search.account, uid: m.uid, folder: m.folder, ...(serverStrips ? { strip_quotes: true } : {}) };
      const full = structured(await client.callTool({ name: 'read_message', arguments: args })) as Record<string, unknown>;
      return serverStrips ? full : { ...full, body_text: stripQuotes(String(full.body_text ?? '')) };
    };
    const mails: Mail[] = [];
    for (let i = 0; i < found.length; i += PARALLEL_READS) {
      if (Date.now() - started > READ_BUDGET_MS) break;
      const batch = found.slice(i, i + PARALLEL_READS);
      const read = await Promise.all(
        batch.map(async (m) => {
          const full = await readOne(m);
          const body = String(full.body_text ?? '');
          return {
            account: search.account,
            folder: m.folder,
            uid: String(m.uid),
            date: isoDate(full.date as string),
            from: String(full.from ?? ''),
            to: String(full.to ?? ''),
            cc: String(full.cc ?? ''),
            subject: String(full.subject ?? ''),
            body: body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}\n[...]` : body,
            attachments: ((full.attachments as Array<{ filename: string }>) ?? []).map((a) => a.filename),
          };
        }),
      );
      mails.push(...read);
    }
    return { mails, found: found.length };
  } finally {
    await client.close();
  }
}

// Coupe l'historique cité d'une réponse : lignes « > », et tout ce qui suit
// « Le ... a écrit : », « On ... wrote: » ou un en-tête Outlook « De : ».
export function stripQuotes(body: string): string {
  const lines = body.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    if (/^\s*(Le |On ).{0,200}(a écrit|wrote)\s*:\s*$/i.test(line)) break;
    if (/^\s*(Le |On ).{0,200}$/i.test(line) && /(a écrit|wrote)\s*:\s*$/i.test(next)) break;
    if (/^\s*-{2,}\s*(Original Message|Message d'origine)/i.test(line)) break;
    if (/^\s*(De|From)\s*:/.test(line) && /^\s*(Envoyé|Sent|Date)\s*:/.test(next)) break;
    if (/^\s*>/.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

// Texte d'un mail tel qu'il est passé au masquage, pour repérer les noms
// et les adresses qui pourraient ressortir dans l'affichage du programme.
export function mailToText(m: Mail): string {
  return [
    `De : ${m.from}`,
    `À : ${m.to}`,
    m.cc ? `Cc : ${m.cc}` : '',
    `Objet : ${m.subject}`,
    '',
    m.body,
    m.attachments.length ? `Pièces jointes : ${m.attachments.join(', ')}` : '',
  ]
    .filter((l, i) => l !== '' || i === 4)
    .join('\n');
}
