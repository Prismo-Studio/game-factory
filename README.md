# game-factory

L'usine qui fabrique les jeux de `Prismo-Studio`. Lire `CLAUDE.md` puis `charte/` avant tout.

## Arborescence

```
CLAUDE.md                        charte racine, dix règles, ordre de lecture
charte/00…07                     principes, board, pipelines, DoD, conventions, contrat d'asset, budgets, garde-fous
pipelines/<nom>/PROMPT.md        le prompt système de chaque pipeline (+ context/ par domaine, schema.json pour les runners llm)
orchestrator/
  run.mjs                        node orchestrator/run.mjs <pipeline> [--repo o/n] [--issue N] [--dry-run] [--runner claude|interactive]
  pipelines.mjs                  table des pipelines : runner, profil, labels, budgets (surchargeables par GF_<PIPELINE>_*)
  lib/                           github (REST), traces (balises gf:*), claim (revendication), git, env
  steps/                         scan, scan-release, prepare, run, finalize, bootstrap
  runners/                       claude-code (headless, hooks, budget), llm (Ollama ou Anthropic, schéma JSON)
  hooks/                         rules, guard-write, guard-readonly, guard-qa, deny-always
  *.test.mjs                     npm test — sans réseau
  labels.mjs, sync-all-labels    sync de .github/labels.yml
.github/
  labels.yml                     source de vérité des labels
  ISSUE_TEMPLATE/                concept, spec (GDD), ticket, art
  workflows/                     _pipeline (réutilisable) + un workflow par pipeline (cron filet + dispatch + chaînage), sync-labels, tests
docker/                          runner self-hosted (Node, Claude Code, Godot, SDK Android, adb, Maestro) + Ollama
dashboard/aggregate.mjs          agrège les balises gf:run → dashboard/out/index.html
```

## Lancer en local (phase 1)

```
export GF_GITHUB_TOKEN=…            # fine-grained, org Prismo-Studio
npm test                            # garde-fous, traces, scan, finalize, llm
node orchestrator/run.mjs triage --repo Prismo-Studio/<jeu> --dry-run                 # Ollama local, aucune écriture
node orchestrator/run.mjs dev --repo Prismo-Studio/<jeu> --issue 14 --runner interactive   # assemble le prompt, tu lances Claude Code toi-même
node orchestrator/run.mjs finalize --work <dossier affiché>                            # puis push, PR, labels
```

## État

| Étape | État |
| --- | --- |
| 1. Charte | écrite |
| 2. Repos | créés, structure en place |
| 3. Board, labels, templates d'issues | faits |
| 4. PROMPT.md | écrits (concept, spec, triage, dev ×4 contextes, review, qa, assets) ; bootstrap et build sont des scripts |
| 5. Premier jeu à la main | à faire : un concept → `concept:approved` → bootstrap → `/gf-dev` ticket par ticket |
| 6. Orchestrateur local avec Ollama | code écrit et testé hors réseau ; à exercer sur un vrai repo |
| 7. Build + QA | workflow build dans le template ; QA écrite, à exercer avec un appareil |
| 8. Assets | contrat + placeholders ; chaîne de production à trancher |
| 9. VM + clé API | Dockerfile et compose écrits ; secrets d'org à poser |
| 10. Post-launch | plus tard |

## Répartition

Personne A (usine) : `charte/`, `pipelines/`, `orchestrator/`, `.github/`, `docker/`, `dashboard/`.
Personne B (jeu) : `game-template` (Godot, export, AdMob/IAP, palette, QA sur appareil), `pipelines/build`, `pipelines/qa`, `pipelines/assets`.
Point de rencontre : le premier jeu, pipeline par pipeline, à la main, en notant chaque manque dans la charte ou le template.
