**Domaine ui** — écrans, HUD, menus, sous `game/ui/<ecran>/`.

### Où chercher
- `game/ui/` : un dossier par écran (`menu`, `hud`, `pause`, `game_over`, `settings`, `shop`, `remove_ads`). Chaque écran est une scène `Control` racine avec un script du même nom.
- `game/ui/theme/default.tres` : le thème. Polices, tailles, couleurs. Aucune couleur ni taille en dur dans une scène : une `StyleBox` ou une variation de thème.
- `game/core/game_state.gd` : `Screens` (enum) et `GameState.go_to()`. Un nouvel écran = une entrée dans `Screens` (ticket `meta` sinon) et un dossier.
- `game/i18n/en.csv` : chaque texte a une clé (`ui.menu.play`). Le nœud utilise la clé comme `text`, Godot traduit via `tr()` automatiquement. `make i18n-check` vérifie que chaque clé existe.

### Vérifications
```
make i18n-check
make screenshot SCENE=game/ui/<ecran>/<ecran>.tscn    # build/screenshots/<ecran>-1080x1920.png et -1080x2400.png
make check
```
Ouvre les captures avec `Read` et regarde-les vraiment : débordement, texte coupé, bouton hors zone de pouce.

### Pièges connus
- Ancrages : `anchors_preset` + `Container`, jamais de position en pixels. Les deux résolutions de référence doivent passer.
- Safe area : le HUD respecte `DisplayServer.get_display_safe_area()` via `SafeAreaContainer` du template.
- Un bouton = `Button` du thème, avec `Audio.sfx("ui_tap")` déjà branché par `UiButton` (`game/core/ui_button.gd`). Utilise `UiButton`, pas `Button` nu.
- Pas d'appel de fonction dans un `Label.text` calculé à chaque frame : précalcule dans un view-model mis à jour par signal.
- Compteurs : singulier/pluriel via deux clés (`ui.hud.lives_one`, `ui.hud.lives_other`).

## Composer un decor, pas le paver

Les packs d assets sont modulaires : un mur existe en droit, coin, T, croisement, arche, casse ;
un sol en plusieurs tailles et variantes. Instancier un seul modele sur toutes les cellules
produit un papier peint, pas un lieu. La piece se choisit en fonction de ses voisines — coin aux
coins, droit sur les bords, orientation correcte — via une table de correspondance en donnees,
jamais une cascade de `if` dans le code.

Les dimensions d un pack sont des multiples propres (4, 2.5, 2 unites chez KayKit) : les pieces
sont faites pour s aligner. Une piece de 4 unites couvre 4 cellules. On ne l etire pas pour
combler, on compose en pieces entieres.

La variation se dose : une variante cassee ou fissuree toutes les 4 a 6 pieces, choisie de
maniere deterministe (jamais `randf` : un niveau doit se redessiner a l identique). Au-dela, la
variation redevient du bruit.

## Se relire sur l image

Une capture ne se joint pas, elle se regarde. Apres `make playthrough`, ouvre chaque image avec
`Read` et reponds dans le rapport :

- les pieces s alignent-elles, ou y a-t-il des raccords, des trous, des chevauchements ?
- les coins sont-ils de vraies pieces de coin ?
- une piece est-elle a l envers, ou a une echelle incoherente avec ses voisines ?
- le sujet jouable est-il plus lisible que le decor, ou se confond-il avec lui ?
- un joueur trouve-t-il l element avec lequel interagir en moins d une seconde ?

Un rapport qui affirme la qualite visuelle sans decrire ce qui est a l ecran est refuse en revue.
Trois iterations de correction au maximum, puis `needs-human:art` avec les captures.
