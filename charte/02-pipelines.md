# 02 — Pipelines

## Anatomie d'un run

Quatre étapes, toujours les mêmes, toutes dans `orchestrator/` :

```
scan      → choisit un ticket (label d'entrée, budget, dépendances, revendication), écrit ticket.json
prepare   → clone le repo du jeu (depth 1, remote nettoyé du token), crée la branche, restaure les caches
run       → assemble le prompt (PROMPT.md + charte pointée + contexte + ticket), lance le runner, exige report.json
finalize  → lit report.json, commit unique, push, PR, commentaire trace, label de sortie, chaînage
```

`finalize` tourne toujours (`if: always()`), y compris quand `run` a planté : c'est lui qui pose la
trace d'échec et retire le verrou. Sans trace, un ticket disparaît des radars.

Un run traite un seul ticket. Quand il finit, il redéclenche le workflow de sa pipeline
(`workflow_dispatch`) : la chaîne s'arrête d'elle-même quand un scan ne trouve plus rien. Le cron n'est
qu'un filet de sécurité (relance après un plantage d'infra). Un scan à vide ne coûte aucun appel modèle.

Chaque étape est un script Node lançable seul, sans GitHub Actions :

```
node orchestrator/run.mjs dev --repo prismo-studio/wheel-war --issue 14 [--dry-run] [--runner claude|ollama|interactive]
```

`--dry-run` : ni push, ni PR, ni écriture GitHub. `--runner interactive` : le prompt est assemblé et
affiché, l'humain lance Claude Code lui-même dans le clone (phase 1). Les mêmes scripts servent en local
et en CI ; s'ils divergent, c'est un bug.

## Deux runners

| Runner | Pour | Comment | Sortie |
| --- | --- | --- | --- |
| `claude-code` | tout ce qui lit ou modifie un repo : Spec, Dev, Review + autofix, QA, Assets | `claude -p` headless dans le clone, `--max-budget-usd`, hooks de garde-fous, outils interdits, timeout | `report.json` écrit par l'agent (ou extrait de sa réponse finale si l'agent n'a aucun outil d'écriture) |
| `llm` | une question, une réponse structurée : Concept, Triage, rédaction d'un commentaire | un appel HTTP (Ollama en local, ou API Anthropic) avec un schéma JSON attendu, 1 retry sur JSON invalide | JSON validé par le script |

Chaque `PROMPT.md` déclare son runner. Le modèle est une variable par pipeline (`GF_MODEL_<PIPELINE>`),
jamais codé en dur. Une pipeline `llm` doit fonctionner avec un modèle local ; si elle n'y arrive pas,
c'est qu'elle demande un jugement et devrait être `claude-code`.

## Profils d'accès

| Profil | Outils | Qui |
| --- | --- | --- |
| `write` | Read, Grep, Glob, Edit, Write, Bash filtré par hook | Dev, Review + autofix, Assets |
| `read-only` | Read, Grep, Glob ; Bash limité aux commandes git de lecture | Spec, QA |
| aucun | appel HTTP unique | Concept, Triage |

Un agent `read-only` n'a pas d'outil d'écriture : son rapport est son dernier message, extrait par le
script. Ne jamais demander à un agent sans outil d'écriture « d'écrire un fichier » — c'est ce qui l'a
poussé à contourner les garde-fous ailleurs.

## Format d'un `PROMPT.md`

Un dossier par pipeline dans `pipelines/<nom>/`. Le `PROMPT.md` est le prompt système de l'agent, dans
cet ordre, sans section facultative :

```
# <Pipeline> — <une ligne>
## Runner            claude-code | llm ; profil d'accès ; modèle par défaut
## Entrée            label lu, repo, ce que le script a déjà préparé (clone, branche, deps, ticket reproduit, artefacts)
## Ce que tu ne fais jamais   (push, PR, labels, commentaires, questions : c'est le script)
## Étapes            numérotées, chacune avec un critère d'arrêt
## Definition of done   renvoie à 03-definition-de-done.md et précise ce qui est propre à cette pipeline
## Blocage           les cas où tu te déclares BLOCKED avant d'agir ; ce que tu écris dans reason/actionRequired
## Sortie            labels possibles, artefacts attendus, format du commit et de la PR
## Rapport           le schéma JSON exact, obligatoire, avec les longueurs maximales de chaque champ
## Garde-fous        ce que le hook refuse, rappelé pour que l'agent n'insiste pas
```

Un `context/` à côté contient les fiches injectées selon le cas : `pipelines/dev/context/gameplay.md`,
`ui.md`, `meta.md`, `monetisation.md` — où chercher, quelles commandes lancer, pièges connus du domaine.
Ces fiches sont le seul endroit où on capitalise ce qu'un jeu a appris ; elles profitent à tous les suivants.

Le prompt final assemblé par `run` = `PROMPT.md` + fiche de contexte + `CLAUDE.md` du jeu (chargé
nativement par Claude Code, pas réinjecté) + ticket reproduit intégralement (titre, corps, commentaires
humains, pièces jointes téléchargées) + chemin du rapport. Rien d'autre.

## Rapport JSON

Deux issues, jamais une troisième :

```json
{ "status": "SUCCESS", "ticket": 14, "summary": "…", "changes": "…", "checks": "…", "notes": "…",
  "commitTitle": "feat(#14): …", "commitBody": "…", "prTitle": "…" }
```

```json
{ "status": "BLOCKED", "ticket": 14, "reason": "…", "analysis": "…", "actionRequired": "…",
  "kind": "blocked | needs-human" }
```

`reason` : 2 phrases. `actionRequired` : 1 phrase à l'impératif. `summary`, `changes`, `checks` : 2 à 3
phrases. `analysis` est le seul champ libre. Le script tronque de toute façon à la publication.
`kind` dit quel label poser : `blocked` (il manque quelque chose d'externe) ou `needs-human` (le
travail a été tenté et ne peut pas aboutir). En cas de `BLOCKED`, l'agent ne laisse aucun commit.

Sans `report.json`, `finalize` fabrique un `BLOCKED` avec la dernière sortie du CLI, pose
`needs-human`, et le run est compté comme une tentative.

## Les pipelines

| # | Pipeline | Runner | Repo | Lit | Pose | Trace |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Concept | llm | game-factory | dispatch / cron hebdo | crée une issue `concept` avec un GDD court | `gf:concept` |
| 2 | Bootstrap | script (+ llm pour slug/package) | game-factory → nouveau repo | `concept:approved` | `concept:bootstrapped` ; dans le jeu : issue `spec` avec le GDD | `gf:bootstrap repo=` |
| 3 | Spec | claude-code read-only | jeu | `spec` | `spec:done` ; enfants `triage` avec critères d'acceptation et dépendances | `gf:spec children=` |
| 4 | Triage | llm | jeu | `triage` | `todo:<domaine>` ; `needs-human` si indécidable | `gf:triage` |
| 5 | Dev | claude-code write | jeu | `todo:gameplay/ui/meta/monetisation` | PR + `review` | `gf:run` |
| 6 | Review + autofix | claude-code write | jeu | `review` | `review:handled` (verdict OK) ; garde `review` après une correction ; `needs-human` après N passes | `gf:review sha=`, `gf:autofix from= to=` |
| 7 | Build | script | jeu | push sur `main` (release) ou `develop` (artefact) | Release `build-<n>` avec l'APK debug signé, `gf:build` | tag de release |
| 8 | QA | claude-code read-only + adb | jeu | nouvelle release `build-*` | commentaire de release ; issues `triage` + `origin:qa` pour chaque écart au GDD | `gf:qa build=` |
| 9 | Assets | claude-code write + Blender | jeu | `todo:art` | PR + `review` ; ou placeholder + `needs-human:art` | `gf:run`, `gf:asset name=` |
| 10 | Post-launch | plus tard | jeu | stats stores / AdMob | issues `triage` + `origin:post-launch` | `gf:postlaunch` |

Workflows déterministes sans modèle, dans chaque repo de jeu (copiés par le template) :
`on-pr-merged` → `done` ; `on-human-review` → `review:handled` redevient `review` ;
`ci` → `make check` sur chaque PR ; `merge-gate` → règles de branche et de contenu ; `auto-merge` → merge quand tout est vert et le label posé ; `promote` → PR `develop → main` ; `guard-direct-push` → détecte un push sans PR.

## Ce qu'une pipeline ne fait jamais

- Écrire dans `game-factory`.
- Pousser, ouvrir une PR, poser un label, commenter : c'est le script.
- Merger, même une PR triviale.
- Poser une question. Elle livre ou elle bloque.
- Lancer une commande en tâche de fond : en headless la session meurt avec le tour et le résultat n'arrive jamais.
- Toucher à un ticket `approved`, `done`, `blocked`, `needs-human*`, ou revendiqué par une autre.
- Tourner sans plafond de coût et sans timeout.
