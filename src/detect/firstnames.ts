// Prénoms courants en France et en Bretagne. Cette liste sert au mode rapide,
// sans modèle : un prénom connu, seul ou suivi d'un nom de famille, est masqué.
const COMMON = `
Adam Adèle Adrien Agathe Agnès Aimé Alain Alan Albane Albert Alexandra Alexandre Alexis Alice Alicia
Aline Alix Amandine Amaury Amélie Anaïs Anatole André Andrée Angèle Angélique Anne Annick Annie
Anthony Antoine Antonin Apolline Armand Arnaud Arthur Aude Audrey Augustin Aurélie Aurélien Axel Axelle
Baptiste Barbara Bastien Béatrice Benjamin Benoît Bérénice Bernadette Bernard Bertrand Brigitte Bruno
Camille Carine Carole Caroline Catherine Cécile Céline Chantal Charles Charlotte Chloé Christelle
Christiane Christine Christophe Claire Clara Clarisse Claudine Clément Clémentine Colette Coralie
Corentin Corinne Cyril Cyrille Damien Daniel Danielle David Delphine Denis Denise Didier Dominique
Dorian Dylan Edith Édith Édouard Eléonore Éléonore Élisa Élise Élodie Éloïse Emma Emmanuel Emmanuelle
Enzo Éric Erwan Estelle Ethan Étienne Eugénie Eva Évelyne Fabien Fabienne Fabrice Fanny Félix Fernand
Fernande Florence Florian Francis Francine Franck François Françoise Frédéric Frédérique Gabriel
Gabrielle Gaëlle Gaëtan Gaspard Geneviève Georges Gérald Gérard Germaine Ghislaine Gilbert Gilles
Ginette Gisèle Grégoire Grégory Guillaume Guy Hélène Henri Hervé Hugo Hugues Inès Irène Isabelle
Jacqueline Jacques Jean Jeanne Jérémie Jérémy Jérôme Joël Joëlle Johan Jonathan Joseph Josette
Josiane Julia Julie Julien Juliette Justine Karine Kevin Kévin Laetitia Laëtitia Laura Laure Laurence
Laurent Léa Léna Léo Léon Léonie Liliane Lina Lionel Lise Louis Louise Luc Lucas Lucie Lucien Lucienne
Ludovic Madeleine Mathéo Manon Marc Marcel Marcelle Margaux Marguerite Maria Marianne Marie Marine
Marion Marius Martine Mathias Mathieu Mathilde Matthieu Maurice Maxime Maximilien Mélanie Mélissa
Michel Michèle Micheline Mickaël Monique Morgane Muriel Myriam Nadia Nadine Natacha Nathalie Nathan
Nicolas Nicole Noah Noé Noémie Océane Odette Odile Olivier Pascal Pascale Patrice Patricia Patrick
Paul Paule Pauline Perrine Philippe Pierre Quentin Raphaël Raymond Raymonde Rémi Rémy Renaud René
Renée Richard Robert Robin Rodolphe Roger Roland Romain Romane Rosalie Sabine Sabrina Samuel Sandra
Sandrine Sarah Sébastien Serge Simon Simone Solène Sophie Stéphane Stéphanie Suzanne Sylvain Sylvie
Tatiana Thérèse Thibault Thibaut Thierry Thomas Timothée Tristan Valentin Valentine Valérie Vanessa
Véronique Victor Vincent Virginie Viviane Xavier Yannick Yolande Yves Yvette Yvonne Zoé
`;

const BRETON = `
Annaïg Armelle Aziliz Brendan Brieuc Briac Corentine Denez Efflam Elouan Émilien Enora Erell Ewen
Gaël Goulven Gurvan Gwen Gwenaël Gwenaëlle Gwendal Gwénola Gwenola Hervé Jakez Katell Klervi Kilian
Killian Loeiz Loïc Loïg Lomig Maël Maëlle Maïwenn Malo Marzhin Mikaël Morgan Nolwenn Padrig Pierrick
Riwal Ronan Soazig Soizic Solenn Tanguy Tifenn Titouan Tugdual Yann Yannig Yuna Youenn Yvon Yvonnick
`;

// Prénoms qui sont aussi des mots courants : on ne les masque que suivis
// d'un nom de famille, après « M. » ou « Madame », ou après « Bonjour ».
export const AMBIGUOUS_FIRST_NAMES = new Set(
  'Pierre Marine Claude France Rose Grace Ange Jade Olive Aurore Victoire Fleur Prune Constance Iris Violette Capucine Gwen Guy Marc Morgan Valentine'
    .split(/\s+/)
    .filter(Boolean),
);

export const FIRST_NAMES: string[] = Array.from(
  new Set(
    `${COMMON} ${BRETON}`
      .split(/\s+/)
      .filter((name) => name.length > 1 && name !== 'Le'),
  ),
);
