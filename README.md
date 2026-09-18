# game-factory

L'usine qui fabrique les jeux de `prismo-studio`. Lire `CLAUDE.md` puis `charte/` avant tout.

## Arborescence cible

```
game-factory/
  CLAUDE.md                        charte racine, dix règles, ordre de lecture
  README.md
  charte/
    00-principes.md
    01-board.md                    labels, machine à états, traces, anti-rejeu
    02-pipelines.md                anatomie d'un run, runners, format PROMPT.md, rapport JSON
    03-definition-de-done.md
    04-conventions.md
    05-contrat-asset.md
    06-budgets.md
    07-garde-fous.md
  pipelines/
    concept/PROMPT.md
    bootstrap/PROMPT.md            (+ bootstrap.mjs : c'est surtout un script)
    spec/PROMPT.md
    triage/PROMPT.md  schema.json  (schéma JSON attendu du runner llm)
    dev/PROMPT.md  context/{gameplay,ui,meta,monetisation}.md
    review/PROMPT.md               review + autofix, un seul prompt, deux phases
    build/                         pas de prompt : scripts et workflow
    qa/PROMPT.md  context/adb.md  maestro/
    assets/PROMPT.md  context/blender.md
    post-launch/PROMPT.md          plus tard
  orchestrator/
    run.mjs                        point d'entrée : node orchestrator/run.mjs <pipeline> [--repo] [--issue] [--dry-run] [--runner]
    lib/github.mjs                 REST GitHub : issues, labels, commentaires, PR, reviews, releases, workflow_dispatch
    lib/traces.mjs                 lecture/écriture des balises <!-- gf:… -->, compteurs, coûts
    lib/claim.mjs                  revendication, cooldown, verrou
    lib/git.mjs
    steps/scan.mjs  prepare.mjs  run.mjs  finalize.mjs
    runners/claude-code.mjs        ALWAYS_DENIED_TOOLS, settings, hooks, budget, timeout, extraction du rapport
    runners/llm.mjs                Ollama ou Anthropic, schéma JSON, 1 retry
    hooks/guard-write.mjs  guard-readonly.mjs  guard-qa.mjs  deny-always.mjs
    labels.mjs                     sync de .github/labels.yml vers un repo
    *.test.mjs                     chaque garde-fou et chaque scan a son test, sans réseau
  .github/
    labels.yml                     source de vérité des labels
    ISSUE_TEMPLATE/concept.yml  spec.yml  ticket.yml  art.yml
    workflows/
      concept.yml  bootstrap.yml  spec.yml  triage.yml  dev.yml  review.yml  qa.yml  assets.yml
                                   un workflow par pipeline : cron filet + workflow_dispatch + concurrency
      sync-labels.yml
  docker/
    runner/Dockerfile              runner GitHub self-hosted : Node, Claude Code CLI, Godot headless + export templates, SDK Android CLI, adb
    blender/Dockerfile             Blender headless + bpy, appelé par Assets
    docker-compose.yml             runner ×1 (plus tard ×N), ollama, waydroid optionnel
    .env.example                   GF_RUNNER_TOKEN uniquement
    README.md                      hôtes sortants autorisés, dimensionnement
  dashboard/
    aggregate.mjs                  somme des gf:run par jeu/pipeline/semaine → un HTML statique sur la VM
```

## État d'avancement

| Étape | État |
| --- | --- |
| 1. Charte | écrite (`charte/`), à relire à deux |
| 2. Structure des deux repos | ce README + `game-template/README.md` |
| 3. Board, labels, templates d'issues | `labels.yml` fait ; templates d'issues à écrire |
| 4. `PROMPT.md` de chaque pipeline | à faire, format défini dans `charte/02-pipelines.md` |
| 5. Premier jeu à la main (Claude Code interactif) | — |
| 6. Orchestrateur testé en local avec Ollama | — |
| 7. Build + QA automatiques | — |
| 8. Assets | — |
| 9. Déploiement VM + clé API | — |
| 10. Post-launch | — |

## Répartition

Personne A (usine) : `charte/`, `pipelines/*/PROMPT.md`, `orchestrator/`, `.github/`, `docker/runner`, `dashboard/`.
Personne B (jeu) : `game-template`, `pipelines/build`, `pipelines/qa`, `pipelines/assets`, `docker/blender`, bibliothèque d'assets, AdMob et IAP dans le template.
Point de rencontre : le premier jeu, pipeline par pipeline, à la main, en notant chaque manque dans la charte ou le template.
