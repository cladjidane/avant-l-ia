// Vocabulaire de l'interface : l'outil « masque » des « informations
// confidentielles ». « Anonymiser », « pseudonymiser » et « données
// personnelles » ne servent que dans les limites, pour expliquer la loi.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const FORBIDDEN = /anonymis|anonymat|anonyme|pseudonymis|données? personnelles?/i;

function withoutComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('vocabulaire', () => {
  it('la page n’emploie ces mots que dans « Limites »', () => {
    const html = read('index.html').replace(/<section id="panel-limits"[\s\S]*?<\/section>/, '');
    expect(html.match(FORBIDDEN)).toBeNull();
    expect(read('index.html')).toMatch(/pseudonymiser[\s\S]*Anonymiser/);
  });

  it('le README ne les emploie que dans « Limites »', () => {
    const readme = read('README.md').replace(/### Limites[\s\S]*?(?=\n## )/, '');
    expect(readme.match(FORBIDDEN)).toBeNull();
  });

  it('les textes affichés par le code ne les emploient pas', () => {
    const dirs = ['src', 'src/ui', 'src/files', 'src/mask', 'src/model'];
    for (const dir of dirs) {
      for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith('.ts'))) {
        const code = withoutComments(read(join(dir, f)));
        expect(code.match(FORBIDDEN), `${dir}/${f}`).toBeNull();
      }
    }
  });

  it('le bouton principal et le compteur parlent d’informations à masquer', () => {
    expect(read('index.html')).toContain('Repérer les informations à masquer');
    expect(read('src/main.ts')).toContain("['information masquée', 'informations masquées']");
  });
});

describe('question posée avant le masquage', () => {
  const html = read('index.html');
  it('affiche la question avec le verdict de l’outil, sans boutons de réponse', () => {
    expect(html).toContain('Ce contenu pourrait-il être publié tel quel sur Internet ?');
    expect(html).not.toMatch(/precheck-yes|precheck-no|skip-question|Ne plus poser la question/);
    expect(html).toMatch(/id="verdict-mask"[^>]*>Masquer ces informations</);
    // Les actions se font dans la barre du bas, pas dans l'encadré du verdict.
    expect(html).not.toContain('Copier le texte');
    expect(html).toMatch(/<span id="reviewed-label">J'ai relu le texte nettoyé<\/span>/);
    expect(html).toContain("Un détail peut lui échapper, par exemple un poste ou un lieu qui désigne quelqu'un. Relisez avant d'envoyer.");
  });
  it('cite sa source dans « Comment ça marche » seulement', () => {
    const how = html.match(/<section id="panel-how"[\s\S]*?<\/section>/)![0];
    expect(how).toContain("Guide d'usage de l'IA pour les agents publics de l'État, principe 2, et CNIL, questions-réponses sur l'IA générative, question 7 (consultés le 8 novembre 2026).");
    expect(html.replace(how, '')).not.toContain('CNIL');
  });
});
