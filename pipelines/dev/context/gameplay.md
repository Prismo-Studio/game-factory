**Domaine gameplay** — la boucle de jeu du titre, sous `game/gameplay/`.

### Où chercher
- `game/gameplay/` : scènes et scripts de la boucle (player, spawner, level, obstacles). Un dossier vide au premier ticket : le README y décrit les nœuds attendus par le template (`Level`, `Player`, `Spawner`).
- `game/core/game_state.gd` : la machine à états d'écrans. Le gameplay émet `GameState.game_over(score)` et `GameState.pause()`, il ne gère jamais les écrans lui-même.
- `game/core/juice.gd` : shake, squash, particules, hit stop. Utilise-les, ne les réécris pas.
- `game/data/balance.tres` : toute valeur d'équilibrage (vitesses, cadences, seuils). Un `.gd` ne contient aucun nombre de gameplay.
- `tests/gameplay/` : harnais headless. `GameplayHarness` instancie `Level`, avance `n` frames, injecte des actions d'input, expose l'état.

### Vérifications
```
make test                  # GUT, quelques secondes
make check                 # tout, export compris, plusieurs minutes — a la fin seulement
```
Un test gameplay ressemble à : instancier le level, simuler 120 frames avec l'action `jump`, asserter le score ou l'état. Pas de `await create_timer` dans la logique testée : injecte des timers via `Balance`.

### Pièges connus
- Le portrait 1080×1920 est la référence : tout ce qui dépend de la taille d'écran passe par `get_viewport_rect()`, jamais une constante.
- Les inputs sont des actions (`project.godot [input]`), jamais des keycodes dans le code. Ajouter une action = une ligne dans `[input]` déclarée dans le ticket.
- `_physics_process` pour tout ce qui bouge, `_process` pour l'affichage. Un objet qui traverse un mur a presque toujours été déplacé dans `_process`.
- Les objets recyclés (pool) : `game/core/pool.gd` si présent, sinon `queue_free()` et on regarde les perfs plus tard — pas de pool maison dans un ticket gameplay.
