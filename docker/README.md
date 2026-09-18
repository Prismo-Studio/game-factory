# docker — la VM factory

Une VM Debian/Ubuntu sous Proxmox, Docker installe. Deux services : le runner GitHub (Node, Claude Code,
Godot headless + export templates, SDK Android, adb, Maestro) et Ollama.

```bash
cd docker && cp .env.example .env && chmod 600 .env   # renseigner GF_RUNNER_TOKEN
docker compose up -d --build
docker compose exec ollama ollama pull qwen2.5:14b
docker compose logs -f runner                          # attendre « Runner pret »
```

Verifier : Organization settings > Actions > Runners : `gf-<hostname>` en ligne avec le label `gf`.

## Dimensionnement

| | 1 runner | + Ollama 14B |
| --- | --- | --- |
| vCPU | 4 | 8 |
| RAM | 8 Go | 20 Go (ou un modele 7B a 8 Go) |
| Disque | 60 Go | 80 Go |

L export Android (Gradle la premiere fois) est le poste le plus gourmand. Les caches Godot et Gradle
sont dans des volumes : le deuxieme export est rapide.

## Hotes sortants a autoriser (si pare-feu)

`github.com`, `api.github.com`, `objects.githubusercontent.com` (runner, releases, artefacts),
`api.anthropic.com` (runner claude-code), `registry.npmjs.org`, `dl.google.com` (SDK Android),
`services.gradle.org`, `maven.google.com`, `repo.maven.apache.org` (export Android),
`deb.nodesource.com`, `archive.ubuntu.com` (construction de l image seulement).
Aucun port entrant. Pas de domaine.

## Secrets

Le `.env` porte le token du runner, rien d autre. `GF_GITHUB_TOKEN` et `ANTHROPIC_API_KEY` sont des
secrets d org GitHub, transmis au job par le workflow, jamais ecrits sur le disque de la VM.

## QA sur appareil

Waydroid tourne sur l hote (pas dans le conteneur), `adb tcpip 5555`, et le runner y accede par
`GF_ADB_HOST`. Un vrai telephone en adb over TCP marche pareil. Le choix est a la personne B.

## Blender

Pas encore : la pipeline Assets ne produit que des placeholders (voir `pipelines/assets/PROMPT.md`).
Quand la chaine d assets sera tranchee, `docker/blender/Dockerfile` s ajoutera ici.

## Autonomie avec un abonnement Claude (phase 1 bis)

Sans cle API, le runner peut utiliser un abonnement Pro/Max connecte dans le conteneur (identifiants
dans le volume `claude-config`, donc conserves entre rebuilds) :

```bash
docker compose exec runner claude login     # affiche une URL : l ouvrir, se connecter, coller le code
docker compose exec runner claude -p "reponds OK" --output-format text   # doit repondre
docker compose exec ollama ollama pull qwen2.5:7b   # modele local pour Triage (14b si 20 Go de RAM)
```

Puis sur `game-factory` (Settings > Secrets and variables > Actions > Variables) : `GF_OLLAMA_MODEL=qwen2.5:7b`
si tu as pris le 7b. Les crons `dev`, `review`, `triage` se mettent a travailler seuls. Ca consomme le
quota du plan (partage avec ton usage interactif) ; a quota atteint, la pipeline sort en BLOCKED proprement.
Pour du non-stop partage, passer a la cle API (charte 06).
