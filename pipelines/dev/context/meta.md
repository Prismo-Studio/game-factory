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


## Ajouter des cles de sauvegarde

`SaveService` est dans `game/core/`, protege : tu n y touches jamais. La version du schema et les cles
propres au jeu sont declarees dans **`game/meta/save_schema.gd`**, qui appartient au jeu. Pour persister
de nouvelles donnees : ajoute les cles dans `defaults()`, incremente `version()`, ecris la migration
`_migrate_N_to_M` correspondante dans `game/meta/migrations.gd`, et depose une fixture de l ancienne
version dans `tests/save/fixtures/vN.json` avec un test qui la fait migrer. Aucun `BLOCKED` n est
justifie pour « il faudrait changer SCHEMA_VERSION » : ce fichier n existe plus comme obstacle.
