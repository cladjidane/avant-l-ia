# Avant l'IA

Un outil gratuit du Kafé IA Finistère, au code ouvert, sous licence MIT.

Deux façons de s'en servir :

- **Dans le navigateur**, sans rien installer : https://cladjidane.github.io/avant-l-ia/
- **Dans Claude Desktop sur Mac**, installé par votre agent. Si vous utilisez un agent qui agit sur votre ordinateur, comme Claude Code ou Codex, copiez-lui ce message : « Installe Avant l'IA pour Claude Desktop en suivant les instructions de https://github.com/cladjidane/avant-l-ia/blob/main/AGENT-INSTALL.md ». L'agent vérifie l'ordinateur, installe l'outil, le déclare dans Claude Desktop et vous guide pour le premier essai.

L'agent doit pouvoir lancer des commandes sur votre ordinateur. Une conversation dans ChatGPT ou sur claude.ai ne le peut pas.

## Pour l'utilisateur

### À quoi ça sert

Avant de coller un mail, un devis ou un tableau dans ChatGPT, Claude, Gemini ou Le Chat, vous masquez les informations confidentielles : noms, clients, coordonnées, numéros, montants. L'outil les remplace par des étiquettes comme `[PERSONNE_1]` ou `[TELEPHONE_1]`. Quand l'IA vous répond, l'outil remet les vrais noms à la place des étiquettes.

Tout se passe dans votre navigateur. Votre texte n'est envoyé à aucun serveur.

### Comment s'en servir

1. Ouvrez l'outil. Collez votre texte dans la grande zone, ou glissez un fichier : .txt, .md, .csv, .docx, .xlsx ou .pdf (un PDF scanné ne contient pas de texte lisible).
2. Choisissez la façon de repérer. « Complète » repère mieux les noms de personnes, d'entreprises et de lieux. La première fois, elle télécharge un fichier de 115 Mo, ensuite gardé sur l'ordinateur. « Rapide » ne télécharge rien.
3. Dès que le texte est collé ou le fichier ouvert, l'outil répond tout seul à la question « Ce contenu pourrait-il être publié tel quel sur Internet ? ». S'il ne repère rien, il répond « Oui, a priori » et propose « Copier le texte ». S'il repère des informations confidentielles ou des mots de santé, il répond « Non », donne le détail (par exemple « 3 personnes, 1 entreprise, 1 téléphone ») et propose « Masquer ces informations ». En façon « Complète », le premier verdict vient de la façon « Rapide », puis il se met à jour. Le bouton « Repérer les informations à masquer », en haut, mène directement au texte nettoyé. La question vient du Guide d'usage de l'IA pour les agents publics de l'État, principe 2, et de la CNIL, questions-réponses sur l'IA générative, question 7 (consultés le 8 novembre 2026).
4. Relisez. Un clic sur une étiquette remet le mot en clair. Pour masquer un mot oublié, sélectionnez-le à la souris puis cliquez sur « Masquer aussi ce mot », ou tapez-le dans la case « Masquer aussi un mot ou un nom ». Les mots qui parlent de santé ou d'un sujet sensible (hospitalisé, arrêt maladie, enceinte, syndiqué...) sont surlignés en orange sans être masqués. Cliquez dessus : l'outil propose de les masquer aussi. Le mieux reste souvent de décrire la situation autrement.
5. Cochez « J'ai relu le texte nettoyé ». Les boutons de copie et de téléchargement se débloquent.
6. Copiez le texte nettoyé ou téléchargez le fichier nettoyé. Un .docx reste un .docx avec sa mise en page, un .xlsx reste un .xlsx, un .csv reste un .csv. Un PDF ressort en .docx et en .txt.
7. Téléchargez la table de correspondance (.csv). Gardez-la pour vous : ne l'envoyez jamais à l'IA.
8. Quand l'IA a répondu, ouvrez l'onglet « Remettre les vrais noms ». Collez sa réponse ou glissez un .docx. La colonne « À remplir » liste chaque étiquette avec sa vraie valeur, tirée de la table de la session ou du .csv gardé. Vous pouvez corriger chaque valeur. Les trous ajoutés par l'IA, comme [adresse e-mail] ou {date}, sont regroupés sous « À compléter, ajouté par l'IA » : tapez la valeur, ou laissez vide. Le texte final se met à jour à droite à chaque frappe. Un trou encore vide reste surligné en orange, et l'outil le signale quand vous copiez.

La case « Toujours masquer certains mots » sert pour le nom de votre entreprise, de vos clients ou de vos produits. Cette liste est gardée dans votre navigateur, sur cet ordinateur, pour vos prochaines visites.

Après une première visite, l'outil s'ouvre et marche sans connexion internet.

### Limites

- L'outil peut laisser passer un nom rare, un surnom, une faute de frappe.
- Il ne repère pas les détails qui permettent de reconnaître quelqu'un sans le nommer : un poste, un lieu, une situation (« le seul kiné de la commune »). Reformulez-les vous-même.
- Remplacer un nom par une étiquette s'appelle pseudonymiser. Tant que la table de correspondance existe, on peut retrouver les vraies personnes : au sens du RGPD, le texte contient encore des données personnelles. Anonymiser, au sens de la loi, voudrait dire que plus personne, même vous, ne puisse remonter aux personnes. L'outil ne rend donc pas un texte anonyme. Il réduit ce que l'IA voit.
- La relecture humaine est obligatoire.
- Un nom de famille cité seul reprend l'étiquette de la personne complète : « Mme Le Bihan » et « Anne Le Bihan » deviennent tous les deux `[PERSONNE_1]`. Au retour, l'outil écrit « Mme Anne Le Bihan ».

## Avec Claude Desktop

Cette version sert aux personnes qui utilisent l'application Claude Desktop sur Mac. Claude ouvre lui-même un fichier, mais il n'en reçoit que la version masquée. Quand il a écrit sa réponse, l'outil remet les vrais noms et l'enregistre dans un fichier, sur l'ordinateur. Claude ne voit jamais ce fichier.

### Comment s'en servir

1. Rangez le fichier à traiter dans le dossier `Documents/Avant l'IA`. Pour l'instant, seuls les fichiers .txt et .md sont acceptés.
2. Dans Claude Desktop, écrivez par exemple : « Ouvre mail-menuiserie.txt avec Avant l'IA et prépare une réponse au client. »
3. Claude reçoit le texte avec les étiquettes, par exemple « Bonjour [PERSONNE_1] ». Il rédige sa réponse avec ces étiquettes.
4. Demandez-lui d'enregistrer la réponse. Le fichier `mail-menuiserie - réponse.txt` apparaît à côté du fichier d'origine, avec les vrais noms.

Le fichier `Toujours masquer.txt`, dans le même dossier, reçoit un mot ou un nom par ligne : le nom de votre entreprise, de vos clients ou de vos produits. Claude ne peut pas ouvrir ce fichier.

### Traiter tout un dossier d'un coup

Pour plusieurs fichiers, Claude écrit un petit programme au lieu de lire chaque fichier.

1. Rangez les fichiers dans un sous-dossier, par exemple `Documents/Avant l'IA/devis`.
2. Écrivez par exemple : « Avec Avant l'IA, fais-moi un tableau des devis du dossier devis : numéro, client, montant. Enregistre-le. »
3. L'outil masque tous les fichiers du dossier. Une même personne reçoit la même étiquette dans tous les fichiers.
4. Le programme de Claude tourne sur l'ordinateur, sur les textes masqués. Il n'a accès ni à internet ni aux fichiers, et il est arrêté au bout de 10 secondes. Claude ne reçoit que ce que le programme affiche, par exemple le tableau.
5. Le fichier `Résultat.txt` apparaît dans le dossier, avec les vrais noms et les vrais montants.

Le programme ne voit que des étiquettes à la place des montants. Il peut les recopier dans un tableau, mais il ne peut pas les additionner.

### Faire le point sur des mails sans que Claude les lise

Cette action demande un serveur de messagerie qui offre les actions `search_messages` et `read_message`, par exemple un serveur MCP qui lit une boîte IMAP.

1. Écrivez par exemple : « Avec Avant l'IA, retrouve les mails reçus de la CCI, écarte les mails automatiques et fais-moi un point sur ce qu'ils me demandent. Enregistre le point. »
2. Claude écrit un programme. L'outil cherche les mails et les donne à ce programme, qui tourne sur l'ordinateur sans accès à internet ni aux fichiers.
3. Le programme trie les mails : il peut lire les vraies adresses, et reconnaître ainsi une adresse « noreply » ou une lettre d'information.
4. Avant d'arriver à Claude, tout ce que le programme affiche est masqué. Un nom ou un numéro repéré dans les mails est masqué dans l'affichage, même recopié en majuscules ou coupé au milieu.
5. Claude rédige le point avec les étiquettes. Le fichier `Résultat.txt` apparaît dans `Documents/Avant l'IA`, avec les vrais noms.

Dans cette action, le programme lit les vrais mails. La protection repose donc sur le masquage de son affichage. Un code, un mot de passe ou un numéro de réunion cité dans un mail n'est pas reconnu, et il peut passer. Un programme écrit exprès pour contourner le masquage, par exemple en affichant un nom lettre par lettre, peut aussi faire passer ce nom.

Configuration, dans `env` de l'entrée `avant-l-ia` de Claude Desktop : `AVANT_L_IA_MAIL_URL` (adresse du serveur de messagerie), et `AVANT_L_IA_MAIL_TOKEN` ou `AVANT_L_IA_MAIL_ENV_FILE` (fichier .env qui contient `MCP_AUTH_TOKEN=`). `AVANT_L_IA_MAIL_DEFAULT_ACCOUNT` donne le compte utilisé quand la demande n'en nomme aucun.

### Limites propres à cette version

- La personne ne relit pas le texte masqué avant que Claude le reçoive. Un nom raté par l'outil part chez Claude. Le texte reçu par Claude reste visible dans Claude Desktop, en dépliant l'appel à l'outil.
- Cette partie ne marche que sur macOS : l'isolement du programme repose sur `sandbox-exec`.
- Claude voit le nom du fichier. Évitez un nom comme `devis-dupont.txt`.
- Si Claude Desktop a d'autres outils qui lisent les fichiers de l'ordinateur ou la messagerie, Claude peut lire les originaux par ce chemin-là. Le masquage ne protège que ce qui passe par Avant l'IA. Désactivez ces outils pendant l'usage.

### Installation (développeur)

```bash
npm install
npm run mcp:build   # produit mcp/dist/server.mjs
```

Puis, dans `~/Library/Application Support/Claude/claude_desktop_config.json`, dans `mcpServers` :

```json
"avant-l-ia": {
  "command": "/opt/homebrew/bin/node",
  "args": ["/chemin/vers/avant-l-ia/mcp/dist/server.mjs"]
}
```

Relancez Claude Desktop. Au premier lancement, le serveur télécharge le modèle (115 Mo) dans `~/Library/Application Support/Avant l'IA/modeles`. Tant que le modèle n'est pas prêt, l'outil refuse d'ouvrir un fichier, pour ne pas laisser passer un nom.

Le serveur offre quatre actions à Claude : `open_masked_file`, `run_program`, `run_mail_program` (seulement si la messagerie est configurée) et `save_reply`. Le code est dans `mcp/` : `documents.ts` ouvre et enregistre les fichiers (testé dans `tests/mcp.test.ts`), `program.ts` exécute le programme de Claude dans un processus à part, sans internet (`sandbox-exec`) ni accès aux fichiers (`node --permission`), `model.ts` charge le modèle, `mail.ts` lit les mails, `server.ts` déclare les actions. Les tables de correspondance sont gardées dans `~/Library/Application Support/Avant l'IA/tables`, hors du dossier de travail. Les variables `AVANT_L_IA_FOLDER` et `AVANT_L_IA_DATA` changent le dossier de travail et le dossier des données.

## Pour le développeur

### Installation et lancement

Il faut Node 24.

```bash
npm install
npm run dev        # http://localhost:5173/
npm test           # tests automatiques
npm run build      # version publiable dans dist/
npm run preview    # sert dist/ pour vérifier la version publiée
```

Le test du modèle réel télécharge le modèle (115 Mo) et ne tourne qu'à la demande :

```bash
MODEL_TESTS=1 npx vitest run tests/model.test.ts
```

Les fichiers Word, Excel et PDF de test sont fabriqués par `npm run fixtures` (script `scripts/make-fixtures.mjs`). Ils contiennent les cas difficiles : nom coupé en deux morceaux de styles différents, en-tête, commentaire, métadonnées, formule, texte enrichi.

### Organisation du code

| Dossier | Contenu |
|---|---|
| `src/detect/` | Règles pour les formats français, avec les clés de contrôle (IBAN, SIREN, SIRET, NIR, TVA), et la liste de prénoms. |
| `src/mask/` | Assemblage des repérages, attribution des étiquettes, remise des vrais noms, table en .csv. |
| `src/model/` | Chargement et exécution du modèle dans un worker. |
| `src/files/` | Lecture et écriture des .docx, .xlsx, .pdf et .csv. |
| `src/ui/` | Interface. |
| `src/config.ts` | Nom de l'outil (`APP_NAME`), adresse du dépôt (`SOURCE_URL`), modèle utilisé. |

Le nom de l'outil est dans une seule constante, `APP_NAME`, dans `src/config.ts`. L'adresse du dépôt, `SOURCE_URL`, est à remplir une fois le dépôt créé.

### Ordre de la détection

1. Les règles : mail, adresse de site, téléphone français, IBAN (clé vérifiée), SIREN et SIRET (clé de Luhn), numéro de sécurité sociale (clé vérifiée), TVA intracommunautaire (clé vérifiée), plaque d'immatriculation, code postal et ville, adresse postale, montant en euros, date, entreprises (formes juridiques, métiers suivis d'un nom propre), personnes (prénoms courants, civilités, formules d'appel), lieux après « à » ou « chez ». Dans un .xlsx ou un .csv, une colonne titrée « Nom », « Client », « Ville », « Adresse »... est masquée en entier.
2. Le modèle, en façon « Complète ».
3. La liste « Toujours masquer » et les mots ajoutés pendant la relecture, qui passent avant tout le reste.

Quand deux repérages se chevauchent, le plus long gagne. Une valeur repérée une fois est masquée partout dans le document, avec la même étiquette.

### Choix du modèle

Le cahier des charges proposait `openai/privacy-filter`. Nous l'avons comparé à `Xenova/camembert-ner` sur les trois textes français de `fixtures/` avec `scripts/compare-models.mjs` (Transformers.js 4.3.2, novembre 2026).

| | openai/privacy-filter (q4) | Xenova/camembert-ner (q8) |
|---|---|---|
| Téléchargement | 917 Mo (809 Mo en q4f16) | 111 Mo |
| Licence | Apache 2.0 | MIT (modèle d'origine `Jean-Baptiste/camembert-ner`) |
| Langue d'entraînement | surtout l'anglais | français |
| Entreprises | pas de catégorie, rangées en adresses | catégorie dédiée (ORG) |
| Mail Le Gall | « 18 450 € » pris pour une adresse, « maison de M. Kerboul, 12 rue de Brest » d'un seul bloc | Menuiserie Le Gall, Plouider, Kerboul, Yann Le Gall, chacun à sa place |
| Compte rendu de réunion | « Thibault » sans « Riou », « asse des Ajoncs » coupé | les cinq personnes, les deux entreprises et Landerneau |
| Chargement (Node, processeur) | 91 s | 12 s |

Nous retenons `Xenova/camembert-ner`. Il est huit fois plus léger, entraîné sur du français, et il repère les entreprises, que privacy-filter ne distingue pas. Ses points faibles sont couverts par les règles : il ne repère pas les numéros, les mails ni les montants, et il manque parfois un prénom seul (« Bonjour Sophie »).

Le modèle tourne en WASM, sur le processeur. Avec la carte graphique (WebGPU), il faudrait la version non compressée, quatre fois plus lourde (440 Mo), pour un gain de temps négligeable : l'analyse d'un mail prend moins d'une seconde. La version de Transformers.js utilisée ne donne pas la position des mots repérés : `src/model/spans.ts` la retrouve en cherchant chaque morceau de mot dans le texte, ce qui permet aussi de séparer deux personnes citées à la suite.

Pour essayer un autre modèle de classification de mots, il suffit de changer `MODEL_ID` et `MODEL_DTYPE` dans `src/config.ts`. Les étiquettes de privacy-filter sont déjà reconnues dans `src/model/spans.ts`.

### Ce qui sort du navigateur

- Rien, sauf le téléchargement du modèle depuis `huggingface.co` (et ses serveurs de fichiers en `*.hf.co`), une seule fois, puis gardé par le navigateur.
- Aucune police, aucune bibliothèque chargée depuis un site extérieur. Le moteur de calcul (onnxruntime-web) et le lecteur PDF (pdf.js) sont inclus dans le build.
- La page porte une Content-Security-Policy qui n'autorise que l'outil lui-même et Hugging Face. Elle est posée par une balise `<meta>` dans `index.html` au moment du build. GitHub Pages ne permet pas d'envoyer cette règle en en-tête HTTP : elle s'applique à la page, pas aux workers. Les workers sont des fichiers de l'outil et ne contactent que Hugging Face.
- Un service worker (`sw.js`, produit au build par `vite.config.ts`) garde l'outil pour qu'il marche hors ligne.

### Couleurs, polices et logo

L'outil reprend les couleurs du Kafé IA : fond crème, menu brun foncé, boutons cuivre. Le cuivre de la charte (#b76a2b) n'atteint que 4,0:1 avec le texte clair des boutons. L'outil utilise donc un cuivre plus foncé, #9c561f (5,5:1), pour rester lisible.

Les polices sont incluses dans `src/assets/fonts/` et servies par l'outil lui-même, jamais par Google Fonts :

| Police | Usage | Licence |
|---|---|---|
| Manrope (Regular, SemiBold) | texte et titres | SIL Open Font License 1.1 |
| Newsreader Italic | nom de l'outil, question de départ | SIL Open Font License 1.1 |
| JetBrains Mono Medium | étiquettes comme [PERSONNE_1] | SIL Open Font License 1.1 |

Le texte de la licence et les mentions de droits d'auteur sont dans `src/assets/fonts/OFL.txt`. Les fichiers viennent du dossier de polices du site kafe-ia.fr et ne sont pas modifiés.

Le logo du Kafé IA (`src/assets/logos/`) est une copie des fichiers de l'identité du Kafé IA. Il est affiché en cuivre clair par la feuille de styles, sans modifier le fichier. Ce logo n'est pas couvert par la licence MIT du code.

### Déploiement

Chaque envoi sur la branche `main` lance `.github/workflows/deploy.yml` : tests, build, publication sur GitHub Pages. Dans les réglages du dépôt, choisir Settings > Pages > Source : « GitHub Actions ». Le site est construit avec des chemins relatifs, il marche donc à l'adresse `https://<compte>.github.io/<dépôt>/` sans réglage.

### Limites techniques connues

- Word : les zones de texte, les notes de bas de page et les commentaires sont traités. Les formes de dessin (SmartArt), les graphiques intégrés et les champs calculés ne le sont pas.
- Excel : le texte des formules elles-mêmes n'est pas modifié (seul leur résultat affiché l'est). Les noms des onglets ne sont pas modifiés.
- PDF : seul le texte est lu, la mise en page est perdue.
- Un .csv chargé est analysé comme du texte. La colonne « Nom » est reconnue, mais un tableur qui découpe les noms dans des colonnes aux titres inhabituels demande une relecture attentive.
