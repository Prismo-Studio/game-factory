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
