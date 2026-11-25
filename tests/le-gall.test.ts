import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { maskText } from '../src/mask/engine';
import { unmaskText } from '../src/mask/unmask';

const mail = readFileSync(new URL('../fixtures/mail-le-gall.txt', import.meta.url), 'utf8');

describe('mail de la menuiserie Le Gall', () => {
  const result = maskText(mail);
  const masked = result.maskedText;
  const table = result.entries.map((e) => ({ label: e.label, value: e.value }));

  test.each([
    'Sophie',
    'Menuiserie Le Gall',
    'Plouider',
    '18 450 €',
    'Kerboul',
    '12 rue de Brest',
    '06 12 34 56 78',
    'yann.legall@menuiserie-legall.fr',
    'Yann Le Gall',
  ])('« %s » est masqué', (value) => {
    expect(masked).not.toContain(value);
    expect(result.entries.some((e) => e.value === value)).toBe(true);
  });

  test('les catégories sont les bonnes', () => {
    const byValue = Object.fromEntries(result.entries.map((e) => [e.value, e.category]));
    expect(byValue['Sophie']).toBe('PERSONNE');
    expect(byValue['Kerboul']).toBe('PERSONNE');
    expect(byValue['Yann Le Gall']).toBe('PERSONNE');
    expect(byValue['Menuiserie Le Gall']).toBe('ENTREPRISE');
    expect(byValue['12 rue de Brest']).toBe('ADRESSE');
    expect(byValue['06 12 34 56 78']).toBe('TELEPHONE');
    expect(byValue['yann.legall@menuiserie-legall.fr']).toBe('EMAIL');
    expect(byValue['18 450 €']).toBe('MONTANT');
  });

  test('« M. » reste visible devant le nom masqué', () => {
    expect(masked).toMatch(/M\. \[PERSONNE_\d+\]/);
  });

  test('masquer puis remettre les vrais noms redonne le texte d\'origine', () => {
    expect(unmaskText(masked, table).text).toBe(mail);
  });

  test("le cycle tolère les étiquettes abîmées par l'IA", () => {
    const damaged = masked
      .replace('[PERSONNE_1]', 'personne_1')
      .replace('[ENTREPRISE_1]', '[ ENTREPRISE_1 ]')
      .replace('[TELEPHONE_1]', '[Téléphone 1]')
      .replace('[EMAIL_1]', 'EMAIL_1');
    expect(unmaskText(damaged, table).text).toBe(mail);
  });
});
