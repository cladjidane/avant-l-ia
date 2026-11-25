import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { loadDocx, readDocxText, restoreDocx } from '../src/files/docx';
import { loadXlsx } from '../src/files/xlsx';
import { maskText } from '../src/mask/engine';
import type { Replacement } from '../src/files/types';
import type { Span } from '../src/detect/types';

function fixture(name: string): Blob {
  return new Blob([readFileSync(new URL(`../fixtures/${name}`, import.meta.url))]);
}

function replacementsFor(text: string, extraSpans: Span[] = []) {
  const result = maskText(text, { modelSpans: extraSpans });
  const replacements: Replacement[] = [];
  let pos = 0;
  for (const seg of result.segments) {
    if (seg.kind === 'entity') replacements.push({ start: pos, end: pos + seg.text.length, text: seg.label });
    pos += seg.text.length;
  }
  return { result, replacements };
}

async function partText(blob: Blob, part: string): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file(part)!.async('string');
}

describe('fichier Word', () => {
  test('le texte est lu, y compris un nom coupé en deux styles, l\'en-tête et le commentaire', async () => {
    const doc = await loadDocx(fixture('devis-le-gall.docx'), 'devis.docx');
    expect(doc.text).toContain('maison de M. Kerboul, 12 rue de Brest.');
    expect(doc.text).toContain('Menuiserie Le Gall à Plouider');
    expect(doc.text).toContain('Menuiserie Le Gall\tSIRET 732 829 320 00074');
    expect(doc.text).toContain('Vérifier avec M. Kerboul.');
  });

  test('le fichier nettoyé garde la mise en forme et ne contient plus les noms ni les métadonnées', async () => {
    const doc = await loadDocx(fixture('devis-le-gall.docx'), 'devis.docx');
    const { result, replacements } = replacementsFor(doc.text);
    const { files, report } = await doc.build(replacements, result.maskedText);
    expect(files[0].fileName).toBe('devis-nettoye.docx');
    const out = files[0].blob;

    const body = await partText(out, 'word/document.xml');
    for (const v of ['Sophie', 'Kerboul', 'Ker<', '>boul', 'Le Gall', 'Plouider', '18 450', '06 12 34 56 78', 'yann.legall']) {
      expect(body).not.toContain(v);
    }
    // Les styles (gras) sont toujours là, et le commentaire est toujours accroché.
    expect(body).toContain('<w:b/>');
    expect(body).toContain('w:commentReference');
    expect(body).toMatch(/M\. <\/w:t><\/w:r><w:commentRangeStart w:id="0"\/><w:r><w:rPr><w:b\/><\/w:rPr><w:t xml:space="preserve">\[PERSONNE_\d\]<\/w:t>/);

    const header = await partText(out, 'word/header1.xml');
    expect(header).not.toContain('Le Gall');
    expect(header).not.toContain('732 829 320');

    const comments = await partText(out, 'word/comments.xml');
    expect(comments).not.toContain('Kerboul');
    expect(comments).not.toContain('Yann Le Gall');

    const core = await partText(out, 'docProps/core.xml');
    expect(core).not.toContain('Yann Le Gall');
    expect(core).not.toContain('Sophie Tanguy');
    expect(core).not.toContain('Kerboul');
    const app = await partText(out, 'docProps/app.xml');
    expect(app).not.toContain('Menuiserie');
    expect(report.removedMetadata).toEqual(
      expect.arrayContaining(['auteur', 'dernière personne à avoir modifié le fichier', 'titre', 'société', 'noms des auteurs des commentaires et des modifications']),
    );

    // Le fichier nettoyé se relit, et le texte correspond au texte nettoyé affiché.
    expect(await readDocxText(out)).toBe(result.maskedText);
  });

  test('remettre les vrais noms dans un .docx redonne le texte d\'origine', async () => {
    const doc = await loadDocx(fixture('devis-le-gall.docx'), 'devis.docx');
    const { result, replacements } = replacementsFor(doc.text);
    const { files } = await doc.build(replacements, result.maskedText);
    const table = result.entries.map((e) => ({ label: e.label, value: e.value }));
    const restored = await restoreDocx(files[0].blob, table);
    expect(await readDocxText(restored)).toBe(doc.text);
  });
});

describe('fichier Excel', () => {
  test('le texte des cellules est nettoyé, les formules et les nombres restent', async () => {
    const doc = await loadXlsx(fixture('clients-le-gall.xlsx'), 'clients.xlsx');
    expect(doc.text).toContain('Kerboul');
    expect(doc.text).toContain('Client Madame Anne Le Bihan, 29200 Brest');
    const { result, replacements } = replacementsFor(doc.text, doc.extraSpans);
    const { files, report } = await doc.build(replacements, result.maskedText);
    expect(files[0].fileName).toBe('clients-nettoye.xlsx');
    const out = files[0].blob;

    const shared = await partText(out, 'xl/sharedStrings.xml');
    for (const v of ['Kerboul', 'Le Bihan', '06 12 34 56 78', '02 61 91 12 34', 'yann.legall', 'contact@iroise', 'Anne', 'Brest']) {
      expect(shared).not.toContain(v);
    }
    // En-têtes de colonnes intacts, texte enrichi toujours en gras.
    expect(shared).toContain('<t>Nom</t>');
    expect(shared).toContain('<rPr><b/></rPr>');

    const sheet = await partText(out, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<f>"Devis "&amp;A2</f>');
    expect(sheet).toContain('<f>SUM(D2:D3)</f>');
    expect(sheet).toContain('<v>18450</v>');
    expect(sheet).not.toContain('Kerboul');
    expect(sheet).not.toContain('Le Bihan');
    expect(sheet).toContain('s="1"');

    const styles = await partText(out, 'xl/styles.xml');
    expect(styles).toContain('<b/>');
    const core = await partText(out, 'docProps/core.xml');
    expect(core).not.toContain('Yann Le Gall');
    expect(report.removedMetadata).toEqual(expect.arrayContaining(['auteur', 'société']));
  });
});

describe('fichier .csv', () => {
  test('les colonnes « Nom » et « Ville » sont masquées en entier', async () => {
    const { textDocument } = await import('../src/files/load');
    const text = readFileSync(new URL('../fixtures/clients.csv', import.meta.url), 'utf8');
    const doc = textDocument('clients.csv', text);
    const result = maskText(doc.text, { modelSpans: doc.extraSpans });
    expect(result.maskedText).toBe(
      'Nom;Ville;Téléphone;Montant\n[PERSONNE_1];[LIEU_1];[TELEPHONE_1];[MONTANT_1]\n"[PERSONNE_2]";[LIEU_2];[TELEPHONE_2];[MONTANT_2]\n',
    );
    const { files } = await doc.build([], result.maskedText);
    expect(files[0].fileName).toBe('clients-nettoye.csv');
  });
});
