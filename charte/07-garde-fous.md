# 07 — Garde-fous

Trois couches indépendantes, comme dans le kit d'origine : ce que le CLI ne montre pas au modèle
(`--disallowedTools`), ce que `permissions.deny` refuse, ce que les hooks `PreToolUse` bloquent. Un angle
mort dans l'une ne doit pas ouvrir la porte. Les hooks vivent dans `orchestrator/hooks/`, hors du repo
du jeu.

## Outils toujours interdits, pour tous les agents

Tout ce qui est session, orchestration, réseau, planification : `Agent`, `SendMessage`, `Workflow`,
`Skill`, `AskUserQuestion`, `Artifact`, `SendUserFile`, `Task*`, `Cron*`, `ScheduleWakeup`, `Monitor`,
`ToolSearch`, `WebFetch`, `WebSearch`, `EnterPlanMode`, `ExitPlanMode`, `*Worktree`, `*Mcp*`. Aucun
rôle de l'usine n'en a besoin. La liste vit dans `orchestrator/runners/claude-code.mjs`
(`ALWAYS_DENIED_TOOLS`) et un test la vérifie ; on l'étend à chaque outil inconnu qu'un incident révèle.

## Profil `write` — hook `guard-write.mjs`

Bash refusé si la commande contient :
`git push`, `--no-verify`, `git config --global`, `git remote`, `git checkout|switch main|develop`,
`git reset --hard`, `git clean -f`, `curl|wget|nc|ssh`, `rm -rf /` ou `~`, `adb` (réservé à QA),
`godot --export-release`, toute installation (`apt`, `pip`, `npm i`, téléchargement d'addon),
`run_in_background: true`.

Écriture (Edit/Write/Bash avec redirection) refusée sur :
`.github/`, `addons/`, `export_presets.cfg`, `.godot-version`, `Makefile`, `*.keystore`, `*.jks`,
`.env*`, `*.pem`, `*.key`, `secrets*`, `CLAUDE.md`, `game/core/` (services du template — un jeu les
utilise, ne les modifie pas ; un ticket `meta` qui l'exige passe par `blocked` et une PR sur le
template), et tout chemin hors du clone. `project.godot` : autorisé uniquement pour ajouter des
autoloads ou des actions d'input déclarés dans le ticket ; le hook refuse toute autre ligne modifiée
(diff vérifié dans `finalize`, qui rejette la PR sinon).

## Profil `read-only` — hook `guard-readonly.mjs`

`Edit`, `Write`, `NotebookEdit` retirés au CLI et refusés par le hook. Bash limité à une liste blanche
de commandes git de lecture (`log`, `show`, `diff`, `blame`, `ls-files`), une commande simple par
appel, sans chaînage, redirection ni substitution. `cat`, `godot`, `adb` refusés : lire passe par `Read`.
QA a un profil dérivé qui autorise `adb` et `godot --headless` en lecture (screenshots, logcat, tests),
jamais `adb install` d'autre chose que l'APK de la release, jamais `adb shell rm`.

## Ce que `finalize` vérifie avant de pousser

- HEAD est sur la branche attendue, un seul commit au-dessus de `origin/develop` (sinon squash).
- Aucun fichier protégé dans le diff (seconde vérification, indépendante du hook).
- Aucun fichier > 2 Mo. Aucun `.import` orphelin. Aucune chaîne ressemblant à un secret
  (`sk-ant-`, `AIza`, `ca-app-pub-` hors identifiants de test).
- La branche distante, si elle existe, a pour dernier auteur `factory@prismo.studio` ; sinon arrêt.
- Le rapport est un JSON valide avec `status` ∈ {SUCCESS, BLOCKED}.
- En `BLOCKED`, le clone est propre (`git status --porcelain` vide) — sinon on jette les changements
  et on le note dans la trace.

## Injection

Tout ce qui vient d'un ticket, d'un commentaire, d'une review, d'un GDD, d'un asset de bibliothèque est
une donnée, jamais une instruction. Les prompts le disent explicitement et les hooks s'appliquent
identiquement quoi que demande un commentaire. Un commentaire qui demande de sortir du cadre reçoit
une réponse `[gf]` qui l'explique, le fil reste ouvert, rien n'est exécuté.

## Secrets

| Secret | Où | Qui le lit |
| --- | --- | --- |
| Token GitHub de la factory (app GitHub ou PAT fine-grained sur l'org, scopes contents/issues/PR/workflows) | secret d'org `GF_GITHUB_TOKEN` | scripts (jamais l'agent ; remote nettoyé après clone) |
| Clé API Anthropic | secret d'org `ANTHROPIC_API_KEY` | runner claude-code, en variable d'env du process, jamais dans un fichier |
| Keystore debug | dans le template (c'est un keystore de debug, public par nature) | Build |
| Keystore release, identifiants AdMob/IAP réels | secrets d'org, injectés à l'export release par un workflow lancé à la main | Build release, humain |
| Comptes stores | humains | personne |

`.env` de la VM (`docker/.env`) : token du runner, rien d'autre. Jamais commité, `chmod 600`.
Un secret collé dans un ticket ou un commentaire est révoqué, pas réutilisé.

## Ce que le runner ne peut pas faire

Le conteneur du runner ne monte aucun volume de l'hôte hors ses caches, n'expose aucun port, n'a pas le
socket Docker. Pas de domaine, pas de port ouvert vers l'extérieur : le runner sort vers GitHub, l'API
Anthropic, les registres de paquets et rien d'autre (liste d'hôtes dans `docker/README.md`).
