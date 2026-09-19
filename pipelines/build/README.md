# Build — workflow du repo de jeu, pas d'agent

Le build vit dans le template (`game-template/.github/workflows/build.yml`), copié dans chaque jeu :

- déclencheur : push sur `main` (donc chaque merge) ou `workflow_dispatch` ;
- `make export` → `build/<slug>-debug.apk` signé avec le keystore debug ;
- Release GitHub `build-<run_number>` (prerelease) avec l'APK, le SHA, la taille, la version de `project.godot`, et la balise `<!-- gf:build sha=… -->` dans le corps ;
- la pipeline QA de `game-factory` scanne les releases `build-*` sans trace `gf:qa`.

L'export release (keystore de prod, identifiants AdMob/IAP réels) est un workflow séparé, lancé à la main par un humain, qui lit les secrets d'org. Il n'existe pas encore.
