// Tests du serveur pour Claude Desktop, avec les règles seules (sans modèle).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { ALWAYS_MASK_FILE, NEVER_MASK_FILE, maskFolder, maskProgramOutput, openMaskedFile, saveReply, UserError, type Workspace } from '../mcp/documents';
import { runSandboxed, sandboxAvailable } from '../mcp/program';
import { inDateRange, resolveFolders } from '../mcp/mail';

const LE_GALL = readFileSync(new URL('../fixtures/mail-le-gall.txt', import.meta.url), 'utf8');
const SECRETS = ['Sophie', 'Menuiserie Le Gall', 'Plouider', '18 450 €', 'Kerboul', '06 12 34 56 78', 'yann.legall', 'Yann Le Gall'];

let ws: Workspace;
beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'avant-l-ia-'));
  ws = { folder: join(root, 'travail'), tablesFolder: join(root, 'tables') };
  mkdirSync(ws.folder);
  writeFileSync(join(ws.folder, 'mail.txt'), LE_GALL);
});

describe('serveur pour Claude Desktop', () => {
  test('le texte renvoyé à Claude ne contient aucune vraie valeur', async () => {
    const doc = await openMaskedFile(ws, 'mail.txt');
    for (const s of SECRETS) expect(doc.maskedText).not.toContain(s);
    expect(doc.maskedText).toContain('[PERSONNE_');
    expect(doc.summary).toMatch(/personne/);
    expect(doc.id).not.toContain('mail');
  });

  test('la réponse enregistrée retrouve les vrais noms, le résultat renvoyé n’en contient aucun', async () => {
    const doc = await openMaskedFile(ws, 'mail.txt');
    const labels = [...new Set(doc.maskedText.match(/\[[A-Z]+_\d+\]/g))];
    const reply = `Bonjour,\n${labels.join(' ')}\nMerci de confirmer à [adresse e-mail].`;
    const saved = saveReply(ws, doc.id, reply);
    expect(saved.path).toBe(join(ws.folder, 'mail - réponse.txt'));
    expect(saved.restoredCount).toBe(labels.length);
    expect(saved.holes).toEqual(['[adresse e-mail]']);
    for (const s of SECRETS) expect(JSON.stringify(saved)).not.toContain(s);
    const written = readFileSync(saved.path, 'utf8');
    expect(written).toContain('Yann Le Gall');
    expect(written).not.toMatch(/\[PERSONNE_\d+\]/);
  });

  test('un second enregistrement ne remplace pas le premier', async () => {
    const doc = await openMaskedFile(ws, 'mail.txt');
    const first = saveReply(ws, doc.id, 'A');
    const second = saveReply(ws, doc.id, 'B');
    expect(second.path).not.toBe(first.path);
    expect(readFileSync(first.path, 'utf8')).toBe('A');
  });

  test('la liste « Toujours masquer » est appliquée et ne peut pas être ouverte', async () => {
    writeFileSync(join(ws.folder, ALWAYS_MASK_FILE), '# mes clients\nfenêtres\n');
    const doc = await openMaskedFile(ws, 'mail.txt');
    expect(doc.maskedText).not.toContain('fenêtres');
    await expect(openMaskedFile(ws, ALWAYS_MASK_FILE)).rejects.toThrow(UserError);
  });

  test('aucun fichier hors du dossier de travail', async () => {
    writeFileSync(join(ws.folder, '..', 'secret.txt'), 'Yann Le Gall');
    await expect(openMaskedFile(ws, '../secret.txt')).rejects.toThrow(UserError);
    await expect(openMaskedFile(ws, '/etc/hosts')).rejects.toThrow(UserError);
    const doc = await openMaskedFile(ws, 'mail.txt');
    expect(() => saveReply(ws, doc.id, 'x', '../fuite.txt')).toThrow(UserError);
    expect(existsSync(join(ws.folder, '..', 'fuite.txt'))).toBe(false);
  });

  test('un numéro de document inventé est refusé', () => {
    expect(() => saveReply(ws, 'doc-1', 'x')).toThrow(UserError);
    expect(() => saveReply(ws, '../../etc/passwd', 'x')).toThrow(UserError);
  });

  test('les sujets sensibles sont signalés', async () => {
    writeFileSync(join(ws.folder, 'absence.txt'), 'Marc est en arrêt maladie jusqu’à lundi.');
    const doc = await openMaskedFile(ws, 'absence.txt');
    expect(doc.sensitiveThemes).toContain('santé');
  });
});

describe('programme sur un dossier', () => {
  beforeEach(() => {
    mkdirSync(join(ws.folder, 'devis'));
    writeFileSync(join(ws.folder, 'devis', 'a.txt'), 'Devis pour Yann Le Gall, 12 rue de Brest.\nMontant TTC : 1 200 €');
    writeFileSync(join(ws.folder, 'devis', 'b.txt'), 'Devis pour Yann Le Gall.\nMontant TTC : 3 400 €\nContact : 06 12 34 56 78');
  });

  test('une même personne a la même étiquette dans tous les fichiers', async () => {
    const batch = await maskFolder(ws, 'devis');
    expect(batch.documents.map((d) => d.name)).toEqual(['a.txt', 'b.txt']);
    for (const d of batch.documents) expect(d.text).not.toContain('Le Gall');
    const label = (t: string) => /pour (\[PERSONNE_\d+\])/.exec(t)?.[1];
    expect(label(batch.documents[0].text)).toBe(label(batch.documents[1].text));
  });

  test('le résultat du programme est enregistré avec les vrais noms dans le dossier', async () => {
    const batch = await maskFolder(ws, 'devis');
    const labels = batch.documents.map((d) => /\[MONTANT_\d+\]/.exec(d.text)?.[0]).join('\n');
    const saved = saveReply(ws, batch.id, labels);
    expect(saved.path).toBe(join(ws.folder, 'devis', 'Résultat.txt'));
    expect(readFileSync(saved.path, 'utf8')).toBe('1 200 €\n3 400 €');
  });

  test.runIf(sandboxAvailable())('le programme tourne et affiche son résultat', async () => {
    const run = await runSandboxed('for (const d of documents) console.log(d.name, d.text.length); return "fin";', {
      documents: [{ name: 'a.txt', text: 'abc' }],
    });
    expect(run.error).toBeUndefined();
    expect(run.output).toBe('a.txt 3\nfin');
  });

  test.runIf(sandboxAvailable())('le programme n’a accès ni à internet ni aux fichiers', async () => {
    const net = await runSandboxed('try { await fetch("https://example.com"); console.log("ouvert"); } catch { console.log("bloqué"); }', {});
    expect(net.output).toBe('bloqué');
    const fs = await runSandboxed('const m = await import("node:fs"); m.readFileSync("/etc/hosts"); console.log("lu");', {});
    expect(fs.output).not.toContain('lu');
    expect(fs.error).toBeTruthy();
    const env = await runSandboxed('console.log(Object.keys(process.env).length)', {});
    expect(Number(env.output)).toBeLessThan(5);
  });

  test.runIf(sandboxAvailable())('un programme trop long est arrêté', async () => {
    const run = await runSandboxed('while (true) {}', {}, 1000);
    expect(run.timedOut).toBe(true);
  });
});

describe('affichage d’un programme qui a lu de vrais mails', () => {
  const mail = 'De : Yann Le Gall <yann.legall@menuiserie-legall.fr>\nObjet : devis\n\nBonjour Sophie,\nYann Le Gall\nPort. 06 68 88 45 80';

  test('un nom recopié en majuscules ou coupé est masqué', async () => {
    const out = await maskProgramOutput(ws, [mail], 'Expéditeur : YANN LE GALL\nDébut : Yann Le Ga\nSignature : Port. 06 68 88 45 8');
    expect(out.maskedText).not.toMatch(/le gall|le ga\b/i);
    expect(out.maskedText).not.toContain('06 68');
    expect(out.maskedText).not.toContain('45 8');
  });

  test('les chiffres d’un numéro recopiés sans espaces sont masqués', async () => {
    const out = await maskProgramOutput(ws, [mail], 'tel=0668884580 / 688845');
    expect(out.maskedText).not.toMatch(/\d{6}/);
  });

  test('la table ne garde que les étiquettes affichées et remet les vrais noms', async () => {
    const out = await maskProgramOutput(ws, [mail], 'Mail de Yann Le Gall.');
    expect(out.maskedText).toMatch(/^Mail de \[PERSONNE_\d+\]\.$/);
    const saved = saveReply(ws, out.id, out.maskedText);
    expect(readFileSync(saved.path, 'utf8')).toBe('Mail de Yann Le Gall.');
    const table = readFileSync(join(ws.tablesFolder, `${out.id}.csv`), 'utf8');
    expect(table).not.toContain('06 68');
  });
});

describe('dossiers et dates des mails', () => {
  const all = ['INBOX', 'INBOX.Trash', 'INBOX.Junk', 'INBOX.INBOX.Sent', 'INBOX.Envoyés', 'INBOX.Drafts', 'INBOX.Deleted Messages', 'INBOX.Clients'];
  test('« * » prend tous les dossiers sauf corbeille, spam et brouillons', () => {
    expect(resolveFolders(all, '*')).toEqual(['INBOX', 'INBOX.INBOX.Sent', 'INBOX.Envoyés', 'INBOX.Clients']);
  });
  test('« sent » prend les dossiers d’envoi, et rien par défaut donne la boîte de réception', () => {
    expect(resolveFolders(all, ['INBOX', 'sent'])).toEqual(['INBOX', 'INBOX.INBOX.Sent', 'INBOX.Envoyés']);
    expect(resolveFolders(all, undefined)).toEqual(['INBOX']);
  });
  test('le filtre de dates garde [since, before[', () => {
    expect(inDateRange('Tue, 10 Nov 2026 09:00:00 +0100', '2026-11-01', '2026-11-11')).toBe(true);
    expect(inDateRange('Wed, 11 Nov 2026 09:00:00 +0100', '2026-11-01', '2026-11-11')).toBe(false);
    expect(inDateRange('Sat, 31 Oct 2026 09:00:00 +0100', '2026-11-01')).toBe(false);
    expect(inDateRange(undefined)).toBe(true);
  });
});

describe('champs de mails et numéros restés en clair', () => {
  test('prénom seul, structure et nom d’association sont masqués', async () => {
    const mail = 'De : café associatif kérinou <contact@kerinou.example>\nÀ : Kafé IA <contact@kafe-ia.fr>\nObjet : Nouvelle inscription · Marc\n\nNom : Marc Email : marc@example.fr Structure : oksiigen Fonction : stagiaire IA';
    const out = await maskProgramOutput(ws, [mail], 'café associatif kérinou | Nouvelle inscription · Marc\nNom : Marc Email : [x] Structure : OKSIIGEN Fonction : stagiaire IA');
    expect(out.maskedText).not.toMatch(/kérinou|\bMarc\b|oksiigen/i);
    expect(out.maskedText).toContain('stagiaire IA');
  });

  test('un numéro étranger et un code à six chiffres sont masqués et restitués', async () => {
    const out = await maskProgramOutput(ws, ['De : sam <sam@example.com>\n\nCall +91 9211227472'], 'Tél : +91 9211227472, code 954453, le 12 mars, 2 500 visiteurs');
    expect(out.maskedText).not.toMatch(/9211227472|954453/);
    expect(out.maskedText).toContain('2 500 visiteurs');
    const saved = saveReply(ws, out.id, out.maskedText);
    expect(readFileSync(saved.path, 'utf8')).toContain('954453');
  });
});

test('les mots de « Toujours laisser en clair » ne sont pas masqués', async () => {
  writeFileSync(join(ws.folder, NEVER_MASK_FILE), 'Kafé IA\n');
  const out = await maskProgramOutput(ws, ['De : Kafé IA <contact@kafe-ia.fr>\n\nNom : Kafé IA'], 'Relais du Kafé IA par Yann Le Gall');
  expect(out.maskedText).toContain('Relais du Kafé IA par [');
  await expect(openMaskedFile(ws, NEVER_MASK_FILE)).rejects.toThrow(UserError);
});

test('un mot courant repéré par erreur par le modèle n’est pas masqué', async () => {
  const { isCommonWord } = await import('../mcp/model');
  expect(isCommonWord('La')).toBe(true);
  expect(isCommonWord("d'")).toBe(true);
  expect(isCommonWord('Brest')).toBe(false);
});
