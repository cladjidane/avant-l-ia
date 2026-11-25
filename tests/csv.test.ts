import { expect, test } from 'vitest';
import { csvToTable, tableToCsv } from '../src/mask/unmask';

test('la table de correspondance survit à un aller-retour en .csv', () => {
  const table = [
    { label: '[PERSONNE_1]', value: 'Yann Le Gall' },
    { label: '[ENTREPRISE_1]', value: 'Menuiserie "Le Gall"; fils' },
    { label: '[ADRESSE_1]', value: '12 rue de Brest, 29260 Plouider' },
  ];
  expect(csvToTable(tableToCsv(table))).toEqual(table);
});

test('une table enregistrée par un tableur avec des virgules est relue', () => {
  const csv = 'Étiquette,Vraie valeur\n[PERSONNE_1],Sophie\n"[LIEU_1]","Plouider"\n';
  expect(csvToTable(csv)).toEqual([
    { label: '[PERSONNE_1]', value: 'Sophie' },
    { label: '[LIEU_1]', value: 'Plouider' },
  ]);
});
