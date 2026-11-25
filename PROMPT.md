Construis un outil web gratuit et open source qui nettoie un document ou un texte avant de l'envoyer à une IA (ChatGPT, Claude, Gemini, Le Chat). L'outil remplace les noms, les coordonnées et les numéros par des étiquettes, puis remet les vrais noms dans la réponse de l'IA. Il s'adresse à des dirigeants, salariés et indépendants qui ne connaissent rien à l'informatique. Le code sera publié sur GitHub.

## Règle de base : rien ne sort de l'ordinateur

- L'outil est une page web statique, sans serveur. Tout le traitement se fait dans le navigateur.
- Aucun appel réseau, aucune mesure d'audience, aucun cookie, aucune police chargée depuis internet. Seule exception : le téléchargement du modèle de détection à la première utilisation, depuis Hugging Face, puis mis en cache par le navigateur.
- Toutes les bibliothèques sont incluses dans le build, pas chargées depuis un CDN.
- Pose une Content-Security-Policy stricte qui autorise seulement le domaine du modèle.
- Après le premier chargement, l'outil marche sans connexion internet. Affiche un indicateur clair : « Hors ligne : votre document ne quitte pas cet ordinateur. »

## Ce que la personne fait, écran par écran

1. Elle arrive sur une page avec une grande zone : « Glissez un fichier ici ou collez votre texte. » Formats acceptés : texte collé, .txt, .md, .csv, .docx, .xlsx, .pdf (texte seulement, pas les scans).
2. L'outil analyse le contenu et affiche le texte avec chaque élément repéré surligné et remplacé par son étiquette : [PERSONNE_1], [ENTREPRISE_1], [ADRESSE_1], [TELEPHONE_1], [EMAIL_1], [IBAN_1], [SIRET_1], [NIR_1], [MONTANT_1], [DATE_1]. Une même valeur reçoit toujours la même étiquette dans tout le document, y compris avec des variantes simples (« M. Kerboul », « Kerboul »).
3. Elle relit. Un clic sur un élément surligné le remet en clair. Une sélection de texte à la souris ouvre un bouton « Masquer aussi ce mot », qui masque toutes ses occurrences. Un encadré permanent, au-dessus du texte, dit : « Relisez avant d'envoyer. L'outil peut laisser passer un nom, un poste, un lieu ou un détail qui permet de deviner de qui on parle, par exemple "le seul kiné de la commune". »
4. Pour télécharger ou copier le résultat, elle doit d'abord cocher « J'ai relu le texte nettoyé ». Les boutons restent grisés tant que la case n'est pas cochée.
5. Elle récupère :
   - le texte nettoyé (bouton « Copier ») ou le fichier nettoyé dans son format d'origine : .docx reste .docx avec sa mise en page, .xlsx reste .xlsx, .csv reste .csv. Un .pdf ressort en .docx et en .txt, avec un message qui explique pourquoi ;
   - la table de correspondance (étiquette et vraie valeur), en fichier .csv, avec l'avertissement : « Gardez ce fichier pour vous. Ne l'envoyez jamais à l'IA. »
6. Un deuxième onglet, « Remettre les vrais noms », reçoit la réponse de l'IA (collée ou glissée en .docx) et la table de correspondance (gardée dans la session ou rechargée depuis le .csv). Il rend le texte avec les vraies valeurs. Il tolère les étiquettes que l'IA a légèrement modifiées : espaces, crochets perdus, minuscules.

## Détection

Combine trois sources, dans cet ordre :

1. Des règles pour les formats français, avec validation quand elle existe : mail, URL, téléphone français (06, +33, avec ou sans espaces ni points), IBAN (vérification de la clé), SIREN et SIRET (clé de Luhn), numéro de sécurité sociale (clé de contrôle), numéro de TVA intracommunautaire, plaque d'immatriculation, code postal suivi d'une ville, adresse postale (numéro + type de voie), montant en euros, date.
2. Le modèle OpenAI Privacy Filter (openai/privacy-filter sur Hugging Face, licence Apache 2.0), exécuté dans le navigateur avec Transformers.js, en WebGPU quand le navigateur le permet, sinon en WASM. Il sert surtout aux noms de personnes et aux adresses. Il est conçu d'abord pour l'anglais : teste-le sur les textes français de test, et si un autre modèle dédié qui tourne dans le navigateur fait mieux en français (par exemple un modèle GLiNER multilingue avec export ONNX et licence commerciale), choisis-le et explique pourquoi dans le README.
3. Une liste « Toujours masquer » que la personne remplit : nom de son entreprise, noms de ses clients, de ses produits. Elle est gardée dans le navigateur (localStorage) pour les prochaines fois, et la page le dit en clair.

Prévois un mode « Rapide (sans modèle) » qui utilise seulement les règles et la liste, pour les ordinateurs anciens. Le chargement du modèle affiche une barre de progression et sa taille.

Repère aussi les entreprises : formes juridiques (SARL, SAS, EURL, SA, SCI), et mots du type « Menuiserie », « Boulangerie », « Cabinet », « Garage » suivis d'un nom propre.

## Fichiers Word et Excel

- .docx : modifie le document.xml (et les en-têtes, pieds de page, commentaires) sans casser la mise en forme. Un nom peut être coupé en plusieurs morceaux de texte avec des styles différents : gère ce cas. Supprime aussi les métadonnées du fichier (auteur, dernier modificateur, société) et signale-le.
- .xlsx : remplace dans les cellules de texte, garde les formules et la mise en forme, supprime les métadonnées.
- Affiche un rapport final : nombre d'éléments masqués par catégorie, métadonnées supprimées.

## Interface

- Tout le texte affiché est en français correct, avec les accents, en phrases courtes et sans jargon. Aucun mot technique à l'écran (pas de « PII », « token », « regex », « WebGPU »). Exemple : « Données personnelles repérées », pas « Entités détectées ».
- Pas de tiret cadratin ni demi-cadratin dans les textes, pas d'emoji.
- Lisible sur un écran d'ordinateur portable, utilisable au clavier, contrastes suffisants.
- Une page « Comment ça marche » en cinq phrases, et une page « Limites » honnête : l'outil masque, il ne garantit pas l'anonymat ; tant que la table de correspondance existe, les données restent des données personnelles au sens du RGPD ; la relecture humaine est obligatoire.
- Pied de page : « Un outil gratuit du Kafé IA Finistère. Code ouvert sur GitHub. » Aucun nom d'entreprise commerciale, aucune publicité.
- Nom provisoire de l'outil : « Avant l'IA ». Mets-le dans une seule constante pour pouvoir le changer.

## Technique

- Vite + TypeScript, sans framework lourd. Tous les identifiants du code en anglais, commentaires en français.
- Bibliothèques suggérées : @huggingface/transformers, mammoth ou JSZip pour le .docx, SheetJS (version de la communauté) pour le .xlsx, pdf.js pour le .pdf. Versions figées dans package.json.
- Tests automatiques (Vitest) sur un dossier `fixtures/` de documents français fictifs, dont ce mail :

  > Bonjour Sophie,
  > Suite à notre rendez-vous de mardi chez Menuiserie Le Gall à Plouider, je vous confirme le devis de 18 450 € pour les fenêtres de la maison de M. Kerboul, 12 rue de Brest. Son fils, qui est le seul kiné de la commune, souhaite un paiement en trois fois. Vous pouvez me joindre au 06 12 34 56 78 ou à yann.legall@menuiserie-legall.fr.
  > Yann Le Gall, gérant

  Le test vérifie que Sophie, Menuiserie Le Gall, Plouider, 18 450 €, M. Kerboul, l'adresse, le téléphone, le mail et Yann Le Gall sont masqués, et que le cycle masquer puis remettre les vrais noms redonne le texte d'origine. Ajoute un .docx et un .xlsx de test.
- Déploiement automatique sur GitHub Pages par GitHub Actions, à chaque push sur main.
- Licence MIT.
- README en deux parties : d'abord pour l'utilisateur (à quoi ça sert, comment l'utiliser, les limites, en français simple), puis pour le développeur (installation, tests, déploiement, choix du modèle).

## Ordre de travail

1. Le texte collé avec les règles, la relecture, la case à cocher, la copie et l'onglet « Remettre les vrais noms ». Fais-le marcher de bout en bout avant la suite.
2. Le modèle de détection.
3. Le .docx, puis le .xlsx, puis le .pdf.
4. Tests, README, déploiement GitHub Pages.

À la fin de chaque étape, lance les tests et le build, ouvre la page dans un navigateur et vérifie toi-même avec le mail de test. Donne-moi l'adresse locale pour que je l'essaie.
