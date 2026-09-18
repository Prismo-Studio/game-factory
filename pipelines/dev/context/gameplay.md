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

### Level design : l agent ne voit pas, donc il ne place pas des coordonnees

Trois regles pour qu un niveau soit bon sans qu un modele « regarde » l ecran a chaque frame :

1. **Le niveau est de la donnee, pas du code.** Un niveau ou une piste infinie = une suite de *patterns* courts decrits en
   texte dans `game/data/patterns/*.tres` (ex. `gap gap crown block flat flat`), avec une difficulte par pattern. Le
   generateur enchaine des patterns selon la difficulte courante. L agent ecrit et relit des patterns, jamais des
   coordonnees ; les coordonnees sont derivees par le code du template (`segment_length`, `Balance`).
2. **La faisabilite se prouve par simulation, pas a l oeil.** Chaque pattern a un test : un bot (`tests/gameplay/bot.gd`,
   saute quand un obstacle est a portee) doit finir le pattern a la vitesse min et max de `Balance`. Un pattern
   infaisable ne se merge pas. C est le garde-fou principal : un niveau injuste est detecte avant tout humain.
3. **Le visuel se verifie sur capture.** `make capture SCENE=game/gameplay/level.tscn SECONDS=5,15,45` rend des images
   a ces instants (xvfb sur le runner) ; l agent les ouvre avec `Read` et juge lisibilite, contraste, cadrage. QA fait la
   meme chose sur appareil. Le « feel » (timing, rythme) reste humain : il se regle dans `Balance` avec un telephone en main.
