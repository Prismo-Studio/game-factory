**Domaine monetisation** — placements pub, remove ads, sous `game/data/monetisation.tres` et les appels aux services.

### Où chercher
- `game/core/ads_service.gd` : `AdsService.show(placement)`, `AdsService.show_rewarded(placement, on_reward)`, `AdsService.is_enabled()`. Derrière `ProjectSettings game/ads_enabled` (false en debug). Tu ne modifies pas ce fichier.
- `game/core/iap_service.gd` : `IapService.purchase(Products.REMOVE_ADS)`, `IapService.owns(Products.REMOVE_ADS)`, `IapService.restore()`.
- `game/core/placements.gd` : enum `Placement` (INTERSTITIAL_GAME_OVER, REWARDED_CONTINUE, REWARDED_DOUBLE, BANNER_MENU). Un nouveau placement = une entrée ici (ticket dédié) et une ligne dans `game/data/monetisation.tres` (fréquence, cooldown, première partie exemptée).
- `game/ui/remove_ads/` : l'écran d'achat, déjà câblé.

### Vérifications
```
make test
make check
```
Le jeu doit se comporter identiquement avec les flags à `false` : aucun `if AdsService.is_enabled()` dans le gameplay, le service gère lui-même le no-op.

### Pièges connus
- Identifiants AdMob : uniquement ceux de test (`ca-app-pub-3940256099942544/…`) dans le repo. Le script refuse tout autre identifiant dans un diff. Les vrais sont injectés à la release par un humain.
- Un interstitiel se déclenche sur une transition d'écran (`GameState`), jamais au milieu d'une action du joueur.
- Rewarded : le callback `on_reward` est le seul endroit où la récompense est donnée. Jamais avant que la pub soit finie.
- `remove_ads` coupe interstitiels et bannières, pas les rewarded (le joueur les choisit).
- Tout ce qui touche à un vrai compte (AdMob, Play Billing, prix) est `blocked`.
