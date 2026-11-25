import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { maskText } from '../src/mask/engine';
import { unmaskText } from '../src/mask/unmask';
import { ibanValid, nirValid, sirenValid, siretValid, vatValid } from '../src/detect/validators';

function categoriesOf(text: string) {
  return Object.fromEntries(maskText(text).entries.map((e) => [e.value, e.category]));
}

describe('clés de contrôle', () => {
  test('IBAN', () => {
    expect(ibanValid('FR76 3000 6000 0112 3456 7890 189')).toBe(true);
    expect(ibanValid('FR76 3000 6000 0112 3456 7890 188')).toBe(false);
  });
  test('SIREN et SIRET', () => {
    expect(sirenValid('732 829 320')).toBe(true);
    expect(sirenValid('732 829 321')).toBe(false);
    expect(siretValid('732 829 320 00074')).toBe(true);
    expect(siretValid('732 829 320 00075')).toBe(false);
  });
  test('sécurité sociale', () => {
    expect(nirValid('1 85 05 78 006 084 91')).toBe(true);
    expect(nirValid('1 85 05 78 006 084 92')).toBe(false);
  });
  test('TVA', () => {
    expect(vatValid('FR44 732 829 320')).toBe(true);
    expect(vatValid('FR45 732 829 320')).toBe(false);
  });
});

describe('formats français', () => {
  test('téléphones', () => {
    for (const phone of ['06 12 34 56 78', '0612345678', '06.12.34.56.78', '+33 6 12 34 56 78', '+33612345678']) {
      expect(categoriesOf(`Appelez le ${phone} demain.`)[phone]).toBe('TELEPHONE');
    }
  });
  test('un même numéro écrit de deux façons reçoit la même étiquette', () => {
    const r = maskText('Le 06 12 34 56 78, ou le 06.12.34.56.78.');
    expect(r.entries).toHaveLength(1);
    expect(r.maskedText).toBe('Le [TELEPHONE_1], ou le [TELEPHONE_1].');
  });
  test('« M. Kerboul » et « Kerboul » reçoivent la même étiquette', () => {
    const r = maskText('M. Kerboul a appelé. Kerboul rappellera lundi.');
    expect(r.maskedText).toBe('M. [PERSONNE_1] a appelé. [PERSONNE_1] rappellera lundi.');
  });
  test('un nom de famille seul reprend l\'étiquette de la personne', () => {
    const r = maskText('Yann Le Gall est passé. Le Gall reviendra.');
    expect(r.maskedText).toBe('[PERSONNE_1] est passé. [PERSONNE_1] reviendra.');
  });
  test('une suite de chiffres quelconque n\'est pas masquée', () => {
    expect(maskText('Commande 123 456 789 reçue.').maskedText).toBe('Commande 123 456 789 reçue.');
  });
});

describe('courrier du cabinet comptable', () => {
  const text = readFileSync(new URL('../fixtures/courrier-cabinet.txt', import.meta.url), 'utf8');
  const result = maskText(text);
  const cats = Object.fromEntries(result.entries.map((e) => [e.value, e.category]));

  test.each([
    ['Anne Le Bihan', 'PERSONNE'],
    ['SARL Iroise Chiffres', 'ENTREPRISE'],
    ['4 bis avenue de la Gare, 29200 Brest', 'ADRESSE'],
    ['14/03/1972', 'DATE'],
    ['1 85 05 78 006 084 91', 'NIR'],
    ['FR76 3000 6000 0112 3456 7890 189', 'IBAN'],
    ['732 829 320 00074', 'SIRET'],
    ['FR44 732 829 320', 'TVA'],
    ['AB-123-CD', 'PLAQUE'],
    ['+33 2 61 91 12 34', 'TELEPHONE'],
    ['contact@iroise-chiffres.example', 'EMAIL'],
    ['1 250,50 euros', 'MONTANT'],
    ['3 décembre 2026', 'DATE'],
    ['Gwenola Tanguy', 'PERSONNE'],
  ])('« %s » est repéré comme %s', (value, category) => {
    expect(cats[value]).toBe(category);
    expect(result.maskedText).not.toContain(value);
  });

  test('« Mme Le Bihan » reçoit la même étiquette que « Anne Le Bihan »', () => {
    expect(result.maskedText).not.toContain('Le Bihan');
    expect(result.maskedText).toContain('dossier de Mme [PERSONNE_1]');
    expect(result.maskedText).toContain('dossier de Mme [PERSONNE_1], née');
  });

  test('le cycle complet redonne le texte, avec le nom complet à la place du nom seul', () => {
    const table = result.entries.map((e) => ({ label: e.label, value: e.value }));
    const expected = text.replace('Objet : dossier de Mme Le Bihan', 'Objet : dossier de Mme Anne Le Bihan');
    expect(unmaskText(result.maskedText, table).text).toBe(expected);
  });
});

describe('listes', () => {
  test('« Toujours masquer » masque toutes les occurrences', () => {
    const r = maskText('Le produit Kalon et la gamme kalon.', { alwaysMask: ['Kalon'] });
    expect(r.maskedText).toBe('Le produit [AUTRE_1] et la gamme [AUTRE_1].');
  });
  test('un élément remis en clair sort de la table', () => {
    const first = maskText('Bonjour Sophie,');
    const key = first.entries[0].key;
    const r = maskText('Bonjour Sophie,', { revealed: new Set([key]) });
    expect(r.maskedText).toBe('Bonjour Sophie,');
  });
});

describe('modèle et règles ensemble', () => {
  test('une entreprise repérée par le modèle passe avant un lieu deviné après « chez »', () => {
    const text = 'Réunion chez Kerhuel Distribution demain.';
    const start = text.indexOf('Kerhuel');
    const r = maskText(text, { modelSpans: [{ start, end: start + 'Kerhuel Distribution'.length, category: 'ENTREPRISE', source: 'model' }] });
    expect(r.maskedText).toBe('Réunion chez [ENTREPRISE_1] demain.');
  });
});
