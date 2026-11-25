import { describe, expect, it } from 'vitest';
import { absentLabels, fillPlaceholders, scanPlaceholders } from '../src/mask/placeholders';
import { maskText } from '../src/mask/engine';
import { detectSensitive } from '../src/detect/sensitive';
import { restoreDocx, readDocxText, textToDocx } from '../src/files/docx';

// Exemple réel : texte envoyé à l'IA, puis sa réponse.
const SENT =
  'Bonjour, [PERSONNE_1], notre commercial sur le [LIEU_1], est hospitalisé depuis lundi [AUTRE_1]. Il sera absent jusqu’à mi-décembre. Peux-tu prévenir ses clients et leur présenter [PERSONNE_2], qui le remplace ? Merci, [PERSONNE_3]';
const ANSWER = `Objet : Votre contact commercial jusqu’à mi-décembre

Bonjour,

[PERSONNE_1], votre interlocuteur commercial sur le secteur de [LIEU_1], sera absent jusqu’à mi-décembre. Pendant son absence, [PERSONNE_2] prend le relais et assure le suivi de vos dossiers en cours. Vous pouvez lui adresser vos demandes par e-mail à [adresse e-mail] ou le joindre au [numéro de téléphone].

Bien cordialement,
[PERSONNE_3]`;

describe('réponse de l’IA avec des trous ajoutés', () => {
  const scan = scanPlaceholders(ANSWER);

  it('liste les trous dans l’ordre d’apparition, sans doublon', () => {
    expect(scan.placeholders.map((p) => p.display)).toEqual([
      '[PERSONNE_1]',
      '[LIEU_1]',
      '[PERSONNE_2]',
      '[adresse e-mail]',
      '[numéro de téléphone]',
      '[PERSONNE_3]',
    ]);
    expect(scan.placeholders.map((p) => p.kind)).toEqual(['tool', 'tool', 'tool', 'ai', 'ai', 'tool']);
  });

  it('signale [AUTRE_1], présent dans le texte envoyé et absent de la réponse', () => {
    const sentLabels = scanPlaceholders(SENT).placeholders.map((p) => p.key);
    expect(absentLabels(sentLabels, scan)).toEqual(['[AUTRE_1]']);
  });

  it('remplit avec la table et compte les deux trous restés vides', () => {
    const values = new Map([
      ['[PERSONNE_1]', 'Erwan Morvan'],
      ['[LIEU_1]', 'Léon'],
      ['[PERSONNE_2]', 'Gaëlle Tanguy'],
      ['[PERSONNE_3]', 'Anne Le Bihan'],
    ]);
    const result = fillPlaceholders(ANSWER, values, scan);
    expect(result.missing.map((p) => p.display)).toEqual(['[adresse e-mail]', '[numéro de téléphone]']);
    expect(result.text).toContain('Erwan Morvan, votre interlocuteur commercial sur le secteur de Léon');
    expect(result.text).toContain('par e-mail à [adresse e-mail] ou le joindre au [numéro de téléphone]');
    expect(result.pieces.filter((p) => p.kind === 'empty')).toHaveLength(2);
  });

  it('remplit aussi les trous de l’IA, partout où ils apparaissent', () => {
    const text = 'Écrivez à [adresse e-mail]. Rappel : [Adresse  e-mail] reste valable le {date}.';
    const s = scanPlaceholders(text);
    expect(s.placeholders).toHaveLength(2);
    const r = fillPlaceholders(text, new Map([['ai:adresse e-mail', 'g.tanguy@exemple.fr'], ['ai:date', '2 décembre']]), s);
    expect(r.text).toBe('Écrivez à g.tanguy@exemple.fr. Rappel : g.tanguy@exemple.fr reste valable le 2 décembre.');
    expect(r.missing).toHaveLength(0);
  });

  it('ignore les numéros de note et les liens', () => {
    const s = scanPlaceholders('Voir la source [1] et [le guide](https://exemple.fr).');
    expect(s.placeholders).toHaveLength(0);
  });

  it('remplit un .docx de réponse, trous de l’IA compris', async () => {
    const docx = await textToDocx(ANSWER);
    const values = new Map([
      ['[PERSONNE_1]', 'Erwan Morvan'],
      ['ai:adresse e-mail', 'e.morvan@exemple.fr'],
    ]);
    const out = await readDocxText(await restoreDocx(docx, values));
    expect(out).toContain('Erwan Morvan, votre interlocuteur');
    expect(out).toContain('par e-mail à e.morvan@exemple.fr');
    expect(out).toContain('[numéro de téléphone]');
  });
});

describe('mots sensibles dans le texte à envoyer', () => {
  const original =
    'Bonjour, Erwan Morvan, notre commercial sur le secteur de Léon, est hospitalisé depuis lundi. Il sera absent jusqu’à mi-décembre.';

  it('repère « hospitalisé » sans le masquer', () => {
    const spans = detectSensitive(original);
    expect(spans.map((s) => original.slice(s.start, s.end))).toEqual(['hospitalisé']);
    expect(spans[0].theme).toBe('santé');
    const masked = maskText(original, {}).maskedText;
    expect(masked).toContain('hospitalisé');
  });

  it('repère les mots courants de santé et de vie privée', () => {
    const text =
      'Elle est en arrêt maladie, enceinte, et sous traitement. Lui a fait un burn-out, il est syndiqué. Son fils est handicapé et a été opéré.';
    const found = detectSensitive(text).map((s) => text.slice(s.start, s.end));
    expect(found).toEqual(['arrêt maladie', 'enceinte', 'sous traitement', 'burn-out', 'syndiqué', 'handicapé', 'opéré']);
  });

  it('laisse passer les emplois courants sans rapport', () => {
    expect(detectSensitive('Le traitement des commandes prend deux jours. Le capital est détenu par la famille.')).toEqual([]);
  });
});

describe('trou de l’IA construit sur une étiquette', () => {
  it('« [MONTANT_1/3] » reste un trou à compléter, entier', () => {
    const scan = scanPlaceholders('Premier versement : [MONTANT_1/3]. Total : [MONTANT_1].');
    expect(scan.placeholders.map((p) => [p.display, p.kind])).toEqual([
      ['[MONTANT_1/3]', 'ai'],
      ['[MONTANT_1]', 'tool'],
    ]);
  });
});

