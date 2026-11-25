// Exécute un programme écrit par Claude sur les textes masqués d'un dossier.
// Le programme tourne dans un processus Node à part :
// - sans accès à internet (sandbox-exec de macOS refuse toute connexion) ;
// - sans accès aux fichiers ni aux autres programmes (option --permission de Node) ;
// - avec une durée et une taille d'affichage limitées.
// Selon l'action, il reçoit des textes déjà masqués (fichiers du dossier) ou
// les vrais mails : dans ce cas, son affichage est masqué avant d'aller à Claude.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const SANDBOX_PROFILE = '(version 1)(allow default)(deny network*)';
const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_OUTPUT_CHARS = 20_000;

export interface ProgramResult {
  output: string;
  error?: string;
  timedOut: boolean;
  truncated: boolean;
}

// Programme lancé dans le processus isolé. Il lit sur l'entrée standard le
// code de Claude et les documents, exécute le code comme le corps d'une
// fonction async, et renvoie ce qu'il a affiché.
const RUNNER = `
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', async () => {
  const { code, vars } = JSON.parse(input);
  const lines = [];
  const format = (args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join(' ');
  const log = (...args) => lines.push(format(args));
  const AsyncFunction = (async () => {}).constructor;
  const send = (payload) => process.stdout.write(JSON.stringify({ ...payload, output: lines.join('\\n') }));
  try {
    const deepFreeze = (v) => {
      if (v && typeof v === 'object') {
        Object.values(v).forEach(deepFreeze);
        Object.freeze(v);
      }
      return v;
    };
    const names = Object.keys(vars);
    const fn = new AsyncFunction(...names, 'console', code);
    const value = await fn(...names.map((n) => deepFreeze(vars[n])), { log, info: log, warn: log, error: log });
    if (value !== undefined) lines.push(format([value]));
    send({ ok: true });
  } catch (err) {
    send({ ok: false, error: err instanceof Error ? err.name + ': ' + err.message : String(err) });
  }
});
`;

export function sandboxAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SANDBOX_EXEC);
}

// « vars » donne les variables que le programme peut lire, par exemple
// { documents: [...] }. Elles sont figées : le programme ne peut pas les modifier.
export function runSandboxed(
  code: string,
  vars: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ProgramResult> {
  return new Promise((resolve, reject) => {
    if (!sandboxAvailable()) {
      reject(new Error('L’exécution de programme n’est possible que sur Mac.'));
      return;
    }
    const child = spawn(SANDBOX_EXEC, ['-p', SANDBOX_PROFILE, process.execPath, '--permission', '-e', RUNNER], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {}, // aucune variable de l'utilisateur n'est transmise
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (c: string) => {
      stdout += c;
      if (stdout.length > MAX_OUTPUT_CHARS * 4) child.kill('SIGKILL');
    });
    child.stderr.setEncoding('utf8').on('data', (c: string) => (stderr += c));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ output: '', timedOut: true, truncated: false, error: `Le programme a dépassé ${timeoutMs / 1000} secondes et a été arrêté.` });
        return;
      }
      let parsed: { ok: boolean; output: string; error?: string };
      try {
        parsed = JSON.parse(stdout);
      } catch {
        resolve({ output: '', timedOut: false, truncated: false, error: `Le programme s'est arrêté sans réponse. ${stderr.slice(0, 500)}`.trim() });
        return;
      }
      const truncated = parsed.output.length > MAX_OUTPUT_CHARS;
      resolve({
        output: truncated ? parsed.output.slice(0, MAX_OUTPUT_CHARS) : parsed.output,
        error: parsed.error,
        timedOut: false,
        truncated,
      });
    });
    child.stdin.end(JSON.stringify({ code, vars }));
  });
}
