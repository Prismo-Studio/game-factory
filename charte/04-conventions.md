# 04 — Conventions

## Langues

Code, identifiants, commentaires techniques, messages de commit : **anglais**. Issues, PR, commentaires
de pipeline, charte : **français**. Les clés i18n sont en anglais, les textes dans `game/i18n/<lang>.csv`.

## Git

- `develop` = intégration (cible des PR de tickets), `main` = release (promotion `develop → main` par PR).
- Branche par ticket depuis `develop` fraîchement fetché : `feat/14-slug`, `fix/14-slug`, `art/14-slug`,
  `spec/…` n'existe pas (Spec n'écrit pas de code).
- Un commit par PR au moment du push. `finalize` squashe. Pas de commit de merge : rebase.
- Commit : `<type>(#<N>): <impératif, une ligne>` puis corps (cause, changement, 2 à 5 lignes),
  `Closes #<N>`. Types : `feat`, `fix`, `art`, `chore`, `test`.
- PR : titre en français, corps = ce que ça change pour le joueur, critères d'acceptation cochés un par
  un avec la preuve, commandes lancées et résultat, notes hors périmètre, puis
  `<!-- gf:pr ticket=N pipeline=dev -->`.
- Jamais de push sur `main` ni `develop`. Jamais de `--force` hors `--force-with-lease` par `finalize` sur une branche
  dont le dernier commit est celui de la factory (`factory@prismo.studio`). Si un humain a commité sur la
  branche, la pipeline s'arrête.
- Aucun fichier binaire > 2 Mo dans un commit : Release ou disque + référence.

## Godot

- Godot 4.x (4.7.2 aujourd hui), dernière stable pinnée dans `game-template/.godot-version` ; tout le monde (VM, template,
  Dockerfile) lit ce fichier. GDScript uniquement, typé statiquement (`var x: int`, `-> void`),
  `@warning_ignore` interdit.
- Scènes en `.tscn` texte, ressources en `.tres` texte. Rien de binaire sauf les assets.
- Nommage : fichiers et dossiers `snake_case`, classes `PascalCase` avec `class_name`, signaux au passé
  (`score_changed`), constantes `UPPER_SNAKE`.
- Structure imposée par le template :
  ```
  game/
    main.tscn / main.gd        point d'entrée, ne contient que le routage d'écrans
    core/                       autoloads du template : GameState, SaveService, AdsService, IapService, Analytics, Audio
    gameplay/                   la boucle de jeu du titre
    ui/                         un dossier par écran : menu, hud, pause, game_over, shop, settings
    meta/                       progression, upgrades, économie
    data/                       .tres d'équilibrage et de configuration, jamais de nombre dans un .gd
    assets/models|textures|audio|fonts   voir 05-contrat-asset.md
    i18n/
  addons/                       gérés par le template uniquement (GUT, AdMob, IAP)
  tests/                        GUT : unit/, gameplay/, save/
  tools/                        scripts bpy, export, captures
  build/                        ignoré par git
  ```
- Pas de nouvel autoload hors ceux du template sans ticket `meta` qui le justifie.
- Signaux plutôt que références montantes ; un nœud ne connaît pas son parent.
- `get_node("../../x")` interdit : `@export var x: NodeType` ou `%UniqueName`.
- Aucun `await get_tree().create_timer()` dans la logique de jeu testée : timers injectables.
- Juiciness de base (squash & stretch, particules, screen shake, feedback sonore) vient du template,
  via `Juice.*` ; un jeu l'utilise, il ne le réécrit pas.

## Sauvegarde locale

Un fichier `user://save.json`, `{ "schema": 3, "data": {...} }`. `SaveService.migrate(from, to)` applique
les migrations une à une, chacune une fonction pure `_migrate_2_to_3(data) -> Dictionary`, chacune
testée avec une fixture dans `tests/save/fixtures/v2.json`. On ne supprime jamais une migration.
Une pipeline qui devrait modifier une sauvegarde existante autrement que par une migration se déclare
`blocked`.

## Monétisation

AdMob et IAP sont derrière `AdsService` et `IapService` du template, activés par `ProjectSettings`
(`game/ads_enabled`, `game/iap_enabled`, `false` en debug). Les placements sont des ressources, pas des
appels dispersés. L'achat `remove_ads` est le seul IAP du template ; tout autre IAP est une décision
humaine. Les identifiants réels ne sont jamais dans le repo : injectés à l'export par le workflow de
release depuis les secrets.

## Ce qu'on ne fait pas

- Pas de commentaire qui paraphrase la ligne. Le code se lit seul ; l'explication va dans le commit.
- Pas de `# TODO` laissé dans une PR : un TODO est un ticket.
- Pas de refacto opportuniste. Pas de fichier > 300 lignes.
- Pas de nombre magique. Pas de texte en dur. Pas de chemin absolu.
- Pas de dépendance ajoutée par une pipeline, jamais.
