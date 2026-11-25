# Installer Avant l'IA pour Claude Desktop : instructions pour l'agent

Ce fichier s'adresse à un agent qui agit sur l'ordinateur de la personne (Claude Code, Codex, ou un agent équivalent qui sait lancer des commandes). La personne vous a donné le lien de ce dépôt et vous demande d'installer Avant l'IA. Elle ne connaît pas forcément l'informatique : parlez-lui simplement, une étape à la fois.

Avant l'IA ajoute à Claude Desktop des actions qui masquent les noms, les lieux, les coordonnées et les numéros avant que Claude lise un fichier. Les vrais noms sont remis dans les réponses enregistrées sur l'ordinateur. Le mode d'emploi complet est dans `README.md`, section « Avec Claude Desktop ».

## Règles à respecter pendant l'installation

- N'ouvrez pas et ne lisez pas les documents, les mails ou les fichiers personnels de la personne. L'installation n'en a pas besoin.
- Demandez son accord avant d'installer un logiciel (Node.js, Homebrew) et avant de modifier la configuration de Claude Desktop.
- Faites une copie de sauvegarde de la configuration de Claude Desktop avant de la modifier. Ne touchez pas aux autres entrées qu'elle contient.
- Si une étape échoue, montrez le message d'erreur à la personne et arrêtez-vous. Ne contournez pas une protection.

## Étapes

### 1. Vérifier l'ordinateur

- Le système doit être macOS. Le programme écrit par Claude est isolé avec `sandbox-exec`, qui n'existe que sur macOS. Sur Windows ou Linux, arrêtez-vous et proposez à la personne la version web : https://cladjidane.github.io/avant-l-ia/
- Claude Desktop doit être installé : le dossier `~/Library/Application Support/Claude` existe.
- Node.js 24 ou plus récent est nécessaire : `node -v`. S'il manque, proposez l'installateur officiel de https://nodejs.org ou `brew install node`, et attendez l'accord de la personne.

### 2. Récupérer et construire l'outil

Proposez un emplacement, par défaut `~/Applications/avant-l-ia`, puis :

```bash
git clone https://github.com/cladjidane/avant-l-ia.git ~/Applications/avant-l-ia
cd ~/Applications/avant-l-ia
npm install
npm run mcp:build
```

Le fichier `mcp/dist/server.mjs` doit exister à la fin.

### 3. Déclarer l'outil dans Claude Desktop

1. Notez le chemin complet de Node : `which node`.
2. Copiez `~/Library/Application Support/Claude/claude_desktop_config.json` en `claude_desktop_config.json.avant-avant-l-ia.bak`. Si le fichier n'existe pas, créez-le avec `{"mcpServers": {}}`.
3. Ajoutez dans `mcpServers` l'entrée suivante, avec les chemins complets réels :

```json
"avant-l-ia": {
  "command": "/chemin/complet/vers/node",
  "args": ["/Users/<nom>/Applications/avant-l-ia/mcp/dist/server.mjs"]
}
```

4. Vérifiez que le fichier reste un JSON valide : `python3 -m json.tool "$HOME/Library/Application Support/Claude/claude_desktop_config.json" > /dev/null`.

### 4. Prévenir la personne de deux points

- Si Claude Desktop a d'autres outils qui lisent les fichiers de l'ordinateur ou la messagerie, Claude peut lire les originaux par ce chemin-là. Proposez-lui de les désactiver pendant l'usage d'Avant l'IA.
- Au premier lancement, l'outil télécharge un modèle de repérage des noms de 115 Mo depuis Hugging Face. Il faut une connexion internet ce jour-là. Tant que le modèle n'est pas prêt, l'outil refuse d'ouvrir un fichier.

### 5. Relancer et tester

1. Demandez à la personne de quitter Claude Desktop (Cmd+Q) puis de le rouvrir.
2. L'outil crée le dossier `~/Documents/Avant l'IA`. Copiez-y le fichier d'exemple fictif : `cp ~/Applications/avant-l-ia/fixtures/mail-le-gall.txt ~/Documents/"Avant l'IA"/`.
3. Demandez-lui d'écrire dans Claude Desktop : « Ouvre mail-le-gall.txt avec Avant l'IA et prépare une réponse. Enregistre-la. »
4. Claude doit recevoir des étiquettes comme `[PERSONNE_1]`, et un fichier `mail-le-gall - réponse.txt` doit apparaître dans le dossier, avec les vrais noms.

### 6. Expliquer les deux fichiers de réglage

Dans `~/Documents/Avant l'IA`, la personne peut créer :
- `Toujours masquer.txt` : un mot ou un nom par ligne, toujours masqué (son entreprise, ses clients, ses produits) ;
- `Toujours laisser en clair.txt` : un mot par ligne, jamais masqué (le nom d'un outil ou d'un événement que le modèle prend à tort pour un nom).

## La partie mails, facultative

L'action qui travaille sur les mails demande un serveur de messagerie MCP qui offre les actions `search_messages` et `read_message`. Ce dépôt ne fournit pas ce serveur. Si la personne n'en a pas, n'installez pas cette partie. Si elle en a un, ajoutez dans l'entrée `avant-l-ia` un bloc `env` avec `AVANT_L_IA_MAIL_URL` et `AVANT_L_IA_MAIL_TOKEN`, comme décrit dans `README.md`.

## Mettre à jour plus tard

```bash
cd ~/Applications/avant-l-ia && git pull && npm install && npm run mcp:build
```

Puis quitter et rouvrir Claude Desktop.
