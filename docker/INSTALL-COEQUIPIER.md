# Rejoindre l usine — installation sur une deuxieme machine

Objectif : ta machine fait tourner des runners qui prennent les memes tickets que ceux de Mathis, avec
**ton** abonnement Claude. Le jeu sur lequel vous travaillez est le puzzle de tiges ; son depot sera
cree par l usine quand le concept sera approuve. Vos capacites s additionnent, vos comptes restent separes. GitHub garde
l etat (tickets, labels) et distribue le travail ; deux runners ne prennent jamais le meme ticket.

## 0. Prerequis

- Etre membre de l organisation **Prismo-Studio** sur GitHub (les depots sont prives). Demander l invitation.
- **Docker Desktop** installe et lance (Windows, macOS ou Linux).
- **Git**.
- Un abonnement **Claude Pro ou Max** a toi.
- Machine : 4 vCPU et 8 Go de RAM minimum pour un runner. 8 vCPU et 20 Go si tu veux deux runners plus Ollama.
- Laisser la machine allumee et **desactiver la mise en veille** : en veille, Docker s arrete et les runs echouent.

## 1. Cloner les depots

```bash
mkdir game_factory && cd game_factory
git clone https://github.com/Prismo-Studio/game-factory.git
```

C est le seul depot a cloner pour l instant : il contient l usine et le dossier `docker/` ou tout se
lance. **Le depot du jeu n existe pas encore** — il sera cree automatiquement par la pipeline Bootstrap
le jour ou le concept sera approuve. Tu le cloneras a ce moment-la pour y jouer :

```bash
git clone https://github.com/Prismo-Studio/<nom-du-jeu>.git
```

Pour y jouer il te faudra **Godot 4.7.2** exactement (pas 4.5, pas 4.8) : la CI verifie la version et
refusera tout ce qui vient d une autre.

## 2. Obtenir un token de runner

Sur GitHub : **Prismo-Studio > Settings > Actions > Runners > New self-hosted runner**, choisir Linux x64.
Copier le token affiche dans la commande `./config.sh --token XXXX`. Il expire en une heure, donc
enchainer directement avec l etape suivante.

## 3. Configurer l environnement

```bash
cd game-factory/docker
cp .env.example .env
```

Editer `.env` :

```
GF_RUNNER_TOKEN=<le token copie a l etape 2>
GF_RUNNER_URL=https://github.com/Prismo-Studio
GF_RUNNER_NAME=gf-<ton-prenom>          # OBLIGATOIRE et different de celui de Mathis
GODOT_VERSION=4.7.2
GF_ADB_HOST=
```

**Le nom du runner est le seul vrai piege** : deux machines avec le meme nom se disputent la meme
identite et se deconnectent mutuellement. Mets ton prenom.

Ne renseigne **pas** `GF_GITHUB_TOKEN` : le battement de coeur ne doit tourner que sur **une seule**
machine, celle de Mathis. Sinon vous doublez les reveils pour rien.

## 4. Demarrer

```bash
docker compose up -d --build runner runner-2 ollama
docker compose logs -f runner        # attendre « Listening for Jobs »
```

La premiere construction prend 10 a 20 minutes (Godot, SDK Android, Node). Les suivantes sont rapides.

Verifier sur **Prismo-Studio > Settings > Actions > Runners** : ton runner apparait en ligne avec le
label `gf`.

## 5. Connecter ton compte Claude

```bash
docker compose exec --user runner runner claude login
```

Une URL s affiche : l ouvrir dans le navigateur, se connecter avec **ton** compte, coller le code.
Le `--user runner` est obligatoire : les jobs tournent avec cet utilisateur, un login fait en root
ne serait pas vu.

Verifier :

```bash
docker compose exec --user runner runner claude -p "reponds OK" --output-format text
```

Repeter pour le deuxieme runner :

```bash
docker compose exec --user runner runner-2 claude login
docker compose exec --user runner runner-2 claude -p "reponds OK" --output-format text
```

## 6. Le modele local pour le triage

```bash
docker compose exec ollama ollama pull qwen2.5:7b
```

## 7. Verifier que tout marche

Sur GitHub, onglet **Actions** de `game-factory` : au prochain reveil (toutes les 10 minutes), un job
doit demarrer sur ton runner. Tu le vois aussi en direct :

```bash
docker compose logs -f runner
```

Une ligne `Running job: dev / run` signifie que ta machine travaille sur un ticket.

## Bibliotheque d assets (obligatoire)

Le depot `assets-library` contient les modeles CC0 dans lesquels l usine pioche. Sans lui, tes runs
d art produiront un rendu different de ceux de l autre machine, sur le meme jeu.

```
cd C:\Users\<toi>\game_factory
git clone https://github.com/Prismo-Studio/assets-library.git
```

Il doit atterrir **a cote** des depots, pas dedans :

```
game_factory\
  game-factory\
  game-template\
  assets-library\
```

Rien a configurer ensuite : le compose le monte tout seul sous `/assets-library` dans les runners.
Verification, depuis `game-factory\docker` :

```
docker compose run --rm assets-index
```

Le nombre d assets affiche doit etre identique sur les deux machines. S il differe, `git pull` sur
`assets-library` avant d aller plus loin.

## Pieges connus

- **Veille de la machine** : Docker s arrete, les runs en cours echouent. Desactive-la.
- **Nom de runner identique** : les deux machines se deconnectent en boucle. Prenom obligatoire.
- **Token expire** : le token de l etape 2 dure une heure. S il a expire, `config.sh` echoue ; reprends
  un token neuf et relance `docker compose up -d`.
- **Login Claude en root** : `claude login` sans `--user runner` ne sert a rien.
- **Battement de coeur en double** : ne demarre pas le service `heartbeat`.
- **Bibliotheque d assets absente ou pas a jour** : un ticket `todo:art` traite sans elle repart en
  recherche generique et ramene un modele d un autre style. Cloner `assets-library` (voir ci-dessous)
  et faire `git pull` dessus avant chaque session.

## Ce que tu ne dois pas faire

- Ne demarre pas une deuxieme usine : il n y en a qu une, sur GitHub. Ta machine n est qu une capacite
  de calcul en plus.
- Ne pousse jamais directement sur `develop` ou `main` : tout passe par une PR, meme les tiennes.
- Ne partage pas ton token de runner ni ton login Claude.
