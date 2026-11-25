// Cas fictifs de l'écran « Démo » (session Kafé IA du 19 novembre 2026).
// Les textes viennent du dossier de la session ; tous les noms sont inventés.

import horaires from './01-horaires-magasin.txt?raw';
import menuiserie from './02-mail-menuiserie.txt?raw';
import absence from './03-mail-equipe-absence.txt?raw';
import biscuiterie from './04-compte-rendu-client.txt?raw';
import boulanger from './05-boulanger.txt?raw';
import devisUrl from './06-devis-menuiserie.docx?url';
import clientsUrl from './07-fichier-clients.xlsx?url';
import prompt1 from './scenario-1-a-coller-dans-chatgpt.txt?raw';
import answer1 from './scenario-1-reponse-ia.txt?raw';
import prompt2 from './scenario-2-a-coller-dans-chatgpt.txt?raw';
import answer2 from './scenario-2-reponse-ia.txt?raw';
import prompt3 from './scenario-3-a-coller-dans-chatgpt.txt?raw';
import answer3 from './scenario-3-reponse-ia.txt?raw';
import type { Correspondence } from '../mask/unmask';

export interface DemoCase {
  title: string;
  show: string; // « À montrer : ... »
  text?: string;
  file?: { url: string; name: string };
  prompt?: string; // demande à coller dans l'IA
  answer?: string; // réponse de l'IA
  table?: Correspondence[]; // vraies valeurs des étiquettes de la demande
}

const t = (pairs: Array<[string, string]>): Correspondence[] => pairs.map(([label, value]) => ({ label: `[${label}]`, value }));

export const DEMO_CASES: DemoCase[] = [
  {
    title: 'Des horaires de magasin',
    show: "l'outil laisse passer un texte public.",
    text: horaires,
  },
  {
    title: 'Le devis de la menuiserie',
    show: "« le seul kiné de la commune » passe, et l'IA mélange le père et le fils.",
    text: menuiserie,
    prompt: prompt1,
    answer: answer1,
    table: t([
      ['PERSONNE_1', 'Sophie'],
      ['ENTREPRISE_1', 'Menuiserie Le Gall'],
      ['LIEU_1', 'Plouider'],
      ['MONTANT_1', '18 450 €'],
      ['PERSONNE_2', 'Kerboul'],
      ['ADRESSE_1', '12 rue de Brest'],
      ['TELEPHONE_1', '06 12 34 56 78'],
      ['EMAIL_1', 'yann.legall@menuiserie-legall.fr'],
      ['PERSONNE_3', 'Yann Le Gall'],
    ]),
  },
  {
    title: "L'absence du commercial",
    show: "« hospitalisé » est signalé, mais l'IA le remet dans le mail aux clients.",
    text: absence,
    prompt: prompt2,
    answer: answer2,
    table: t([
      ['PERSONNE_1', 'Erwan Morvan'],
      ['PERSONNE_2', 'Léon'],
      ['AUTRE_1', 'hospitalisé'],
      ['AUTRE_2', 'accident de voiture'],
      ['PERSONNE_3', 'Gaëlle Tanguy'],
      ['TELEPHONE_1', '06 47 18 22 90'],
      ['PERSONNE_4', 'Erwan'],
      ['PERSONNE_5', 'Anne Le Bihan'],
    ]),
  },
  {
    title: 'La proposition à la biscuiterie',
    show: "la marge de 18 % reste en clair et l'IA l'écrit au client.",
    text: biscuiterie,
    prompt: prompt3,
    answer: answer3,
    table: t([
      ['ENTREPRISE_1', "Biscuiterie de l'Aber"],
      ['DATE_1', '12 novembre'],
      ['PERSONNE_1', 'Marc Abgrall'],
      ['PERSONNE_2', 'Nolwenn Riou'],
      ['MONTANT_1', '0,82 €'],
      ['MONTANT_2', '0,74 €'],
      ['MONTANT_3', '0,77 €'],
      ['DATE_2', '15 décembre'],
      ['LIEU_1', 'Lannilis'],
      ['ADRESSE_1', '8 rue du Port, 29870 Lannilis'],
    ]),
  },
  {
    title: 'Le boulanger de Paimpol',
    show: 'aucun nom, mais tout le monde le reconnaît.',
    text: boulanger,
  },
  {
    title: 'Un devis Word',
    show: "l'outil efface l'auteur caché dans le fichier.",
    file: { url: devisUrl, name: '06-devis-menuiserie.docx' },
  },
  {
    title: 'Un fichier clients Excel',
    show: "la colonne « Remarque » contient « souvent à l'hôpital ».",
    file: { url: clientsUrl, name: '07-fichier-clients.xlsx' },
  },
];
