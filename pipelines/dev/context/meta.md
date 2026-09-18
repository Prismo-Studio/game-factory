**Domaine meta** — progression, upgrades, économie, sauvegarde, sous `game/meta/`.

### Où chercher
- `game/meta/progression.gd`, `upgrades.gd`, `economy.gd` : squelettes branchés sur `SaveService`. Les données d'upgrades sont dans `game/data/upgrades.tres` (ressource `UpgradeTable`), pas dans le code.
- `game/core/save_service.gd` : `SaveService.data` (Dictionary), `SaveService.save()`, `SaveService.SCHEMA_VERSION`, `SaveService.migrate(from, to)`. Tu **ne modifies pas** ce fichier ; tu ajoutes tes migrations dans `game/meta/migrations.gd` (`_migrate_N_to_N1(data) -> Dictionary`) que `SaveService` découvre par nom.
- `tests/save/fixtures/vN.json` : une fixture par version de schéma. Un test charge chaque fixture et vérifie qu'on arrive au schéma courant.
- `game/core/analytics.gd` : `Analytics.track(event, props)` pour les événements de progression (`level_complete`, `upgrade_bought`).

### Vérifications
```
make test
make check
```

### Pièges connus
- Changer la forme de `SaveService.data` sans incrémenter le schéma et sans migration = refus en review. La migration est une fonction pure, testée avec une fixture réelle de la version précédente.
- Ne supprime jamais une migration existante.
- Les identifiants d'upgrades sont des `StringName` stables (`&"speed_1"`) : renommer un id casse les sauvegardes existantes → migration obligatoire.
- Une économie se règle dans `game/data/`, pas dans un `match`. Le ticket donne les valeurs ; s'il n'en donne pas, `BLOCKED`.
- Pas de backend, pas d'appel réseau : la persistance est locale, point. Un ticket qui parle de leaderboard en ligne ou de cloud save est `blocked` (décision humaine, charte 00).
