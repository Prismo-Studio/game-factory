# Bootstrap — script, pas d'agent

Bootstrap n'appelle aucun modèle. `orchestrator/steps/bootstrap.mjs` :

1. Lit une issue `concept:approved` de `game-factory` (verrou `in-progress`, revendication).
2. Dérive `slug`, `package` (`studio.prismo.<slug>`) et le nom affiché du titre du concept.
3. Crée `Prismo-Studio/<slug>` depuis `game-template` (repo template), topics `gf-game godot android`, synchronise les labels.
4. Clone, lance `tools/bootstrap.sh "<nom>" <package> <slug>` (renomme `project.godot`, `export_presets.cfg`, `CLAUDE.md`), commit, push sur `main` (seul push direct de la factory, sur un repo vide).
5. Ouvre l'issue `GDD — <nom>` avec le corps du concept, label `spec`. Ouvre l'issue `Factory control` (support du label `factory:paused`).
6. Commente le concept (`gf:bootstrap repo= spec=`) et pose `concept:bootstrapped`.

Idempotent : relancé sur un concept déjà bootstrappé, il complète ce qui manque sans recréer.
