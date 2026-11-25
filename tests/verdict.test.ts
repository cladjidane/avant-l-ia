import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkText } from '../src/mask/verdict';

const leGall = readFileSync(join(__dirname, '../fixtures/mail-le-gall.txt'), 'utf8');

describe('verdict « Ce contenu pourrait-il être publié tel quel sur Internet ? »', () => {
  it('mail Le Gall : non, avec le détail par catégorie', () => {
    const { verdict } = checkText(leGall);
    expect(verdict.publishable).toBe(false);
    expect(verdict.headline).toBe('Non.');
    expect(verdict.total).toBe(9);
    expect(verdict.detail).toBe(
      "L'outil a repéré 9 informations confidentielles : 3 personnes, 1 entreprise, 1 lieu, 1 montant, 1 adresse, 1 téléphone, 1 mail.",
    );
    expect(verdict.sensitiveLine).toBe('');
  });

  it('texte d’horaires : oui, a priori', () => {
    const { verdict } = checkText("Nos horaires d'ouverture changent en hiver. Le magasin ferme plus tôt le samedi.");
    expect(verdict.publishable).toBe(true);
    expect(verdict.headline).toBe('Oui, a priori.');
    expect(verdict.detail).toBe("L'outil n'a repéré aucune information confidentielle.");
  });

  it('« hospitalisé » seul : non, avec la ligne sensible', () => {
    const { verdict } = checkText('Notre commercial est hospitalisé depuis lundi.');
    expect(verdict.publishable).toBe(false);
    expect(verdict.headline).toBe('Non.');
    expect(verdict.total).toBe(0);
    expect(verdict.sensitiveLine).toBe('mais 1 mot de santé ou sensible');
  });

  it('noms et mot sensible : la ligne sensible commence par « et »', () => {
    const { verdict } = checkText('Erwan Morvan est hospitalisé depuis lundi.');
    expect(verdict.detail).toBe("L'outil a repéré 1 information confidentielle : 1 personne.");
    expect(verdict.sensitiveLine).toBe('et 1 mot de santé ou sensible');
  });

  it('tient compte de la liste « Toujours masquer » et des repérages du modèle', () => {
    expect(checkText('Le projet Atlantide avance bien.', { alwaysMask: ['Atlantide'] }).verdict.total).toBe(1);
    const text = 'Rendez-vous à Plouguerneau demain.';
    const start = text.indexOf('Plouguerneau');
    const spans = [{ start, end: start + 12, category: 'LIEU' as const, source: 'model' as const }];
    expect(checkText(text, { modelSpans: spans }).verdict.detail).toContain('1 lieu');
  });

  it('les dates seules ne comptent pas : texte d’horaires de la démo', () => {
    const text =
      "Nos horaires changent pour l'hiver. À partir du 1er décembre, le magasin ouvre du mardi au samedi, de 9h à 12h et de 14h à 18h30. Il ferme à 17h le samedi. Les commandes passées sur le site sont préparées sous 48 heures et peuvent être retirées en boutique. Pendant les fêtes, nous ouvrons exceptionnellement le lundi 21 décembre.";
    const { result, verdict } = checkText(text);
    expect(verdict.headline).toBe('Oui, a priori.');
    expect(verdict.publishable).toBe(true);
    // Les dates restent repérées et masquables dans le texte nettoyé.
    expect(result.entries.filter((e) => e.category === 'DATE').length).toBeGreaterThan(0);
  });

  it('une date de naissance compte', () => {
    for (const text of ['Marie, née le 12/03/1984, rejoint l’équipe.', 'Date de naissance : 12/03/1984.', 'Il est né le 3 mai 1990.']) {
      const { verdict } = checkText(text);
      expect(verdict.publishable, text).toBe(false);
      expect(verdict.detail, text).toContain('1 date');
    }
  });
});

describe('entreprises annoncées par un métier', () => {
  it('repère « Biscuiterie de l’Aber » en façon Rapide', () => {
    for (const text of ["Commande pour la Biscuiterie de l'Aber à Plouguerneau.", 'Commande pour la Biscuiterie de l’Aber.']) {
      const { result } = checkText(text);
      expect(result.entries.find((e) => e.category === 'ENTREPRISE')?.value, text).toMatch(/^Biscuiterie de l.Aber$/);
    }
  });

  it('repère les autres métiers courants', () => {
    const trades = ['Crêperie', 'Pâtisserie', 'Charcuterie', 'Poissonnerie', 'Fromagerie', 'Brasserie', 'Ferme', 'Scierie', 'Imprimerie', 'Pharmacie', 'Librairie', 'Agence', 'Atelier', 'Transports', 'Ambulances'];
    for (const trade of trades) {
      const text = `Rendez-vous chez ${trade} Kerhuel demain.`;
      expect(checkText(text).result.entries.find((e) => e.category === 'ENTREPRISE')?.value, trade).toBe(`${trade} Kerhuel`);
    }
  });
});
