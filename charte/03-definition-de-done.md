# 03 — Definition of done

« Fini » se prouve par une commande qui sort en 0, jamais par une phrase. Tout critère qui ne peut pas
être vérifié par un script ou par un humain en moins de cinq minutes n'a pas sa place ici.

## Pour tout ticket livré par une PR

1. La branche ne porte qu'un commit au-dessus de `main`, message Conventional Commits en anglais,
   `Closes #N` en pied.
2. Le diff ne touche que le périmètre du ticket. Ce qui a été repéré à côté va dans `notes`, pas dans le diff.
3. Les vérifications de `game-template` passent, dans l'ordre, au premier plan :
   ```
   make import        # le projet s'importe sans erreur
   make lint          # aucun script ne casse au parse (--check-only)
   make test          # GUT headless vert
   make i18n-check    # toutes les clés existent dans strings.csv
   make asset-check   # contrat d'asset respecté
   make export        # l'export Android debug aboutit
   ```
   (Les commandes exactes sont dans le `Makefile` du template : `make check`. Si le template change, c'est
   lui qui fait foi.)
4. Chaque critère d'acceptation du ticket est couvert et cité dans la description de la PR, un par ligne,
   avec le fichier ou le test qui le prouve.
5. Un test a été ajouté ou modifié pour le comportement livré, sauf si le ticket est purement visuel
   (alors : un screenshot headless dans la PR).
6. Aucune nouvelle dépendance, aucun addon ajouté, aucun changement dans `export_presets.cfg`,
   `project.godot` (hors ajout de scènes/autoloads déclarés par le ticket), `.github/`, `addons/`.
7. Aucune chaîne d'interface en dur : tout passe par `tr()` et `game/i18n/`.
8. Aucune valeur d'équilibrage en dur dans un script : elles vivent dans `game/data/*.tres`.
9. Le schéma de sauvegarde est inchangé, ou bien incrémenté avec sa fonction de migration et son test.
10. Le jeu tourne avec `ads_enabled=false` et `iap_enabled=false` (flags du template) sans erreur.

## Par domaine

**gameplay** — la boucle décrite dans le ticket est jouable en headless via le harnais de test
(`tests/gameplay/`) : les entrées simulées produisent l'état attendu (score, fin de partie, progression).
Les paramètres d'équilibrage sont dans `game/data/`. 60 fps sur l'appareil de référence n'est pas
vérifiable ici ; QA s'en charge.

**ui** — chaque écran a une scène sous `game/ui/`, s'instancie sans erreur, se ferme, et ses textes sont
des clés i18n existantes (`make i18n-check`). Résolutions de référence : 1080×1920 et 1080×2400, pas de
débordement (screenshot headless dans la PR).

**meta** — progression, upgrades, sauvegarde : un test charge une sauvegarde de chaque version de schéma
connue et arrive au schéma courant. La fonction de migration est pure et testée.

**monetisation** — les placements (interstitiel, rewarded, remove-ads) sont déclarés dans
`game/data/monetisation.tres`, appelés via le service du template, et le jeu se comporte identiquement
avec le flag off. Aucune clé AdMob réelle dans le repo : identifiants de test uniquement.

**art** — voir `05-contrat-asset.md` : `.glb` + `.asset.json` valides (`make asset-check`), rendu de
contrôle en PR, pivot, bounding box et points d'attache conformes au ticket.

## Par pipeline

**Concept** — une issue avec : titre, pitch en 3 lignes, boucle de jeu en 5 étapes, ce que le joueur
voit à la seconde 0/10/60, hook de fake ad, liste des assets (≤ 15), placements pub, risque principal.
Pas de nombre inventé sur le marché.

**Bootstrap** — le repo existe, est créé depuis le template, `project.godot` et le package Android sont
renommés, les labels sont posés, `CLAUDE.md` pointe vers la charte, les workflows tournent (CI verte sur
le commit initial), l'issue `spec` contient le GDD intégral.

**Spec** — chaque ticket enfant est autonome (compréhensible sans ouvrir le parent), a un domaine
évident, des critères d'acceptation vérifiables, ses dépendances explicites, et couvre un seul travail
livrable en une PR. Le parent liste ses enfants. Aucun ticket ne dit « voir le GDD ».

**Triage** — un seul `todo:*` posé, avec une ligne de justification. En cas d'hésitation entre deux
domaines : `needs-human`, jamais un choix au hasard.

**Dev / Assets** — la PR respecte tout ce qui précède.

**Review + autofix** — la review vérifie chaque point de la DoD et chaque critère d'acceptation, cite
fichier et ligne, classe chaque remarque `bloquant` / `à corriger` / `note`. Un verdict OK = zéro
bloquant, zéro à corriger. L'autofix ne traite que `bloquant` et `à corriger`, répond dans chaque fil, et
ne résout que ce qu'il a changé.

**Build** — l'APK est signé avec le keystore debug du template, installable (`adb install` réussit sur
Waydroid), et la release porte le SHA, la taille et la version.

**QA** — le rapport compare ce qui a été observé (screenshots, logs `adb logcat`, résultats Maestro) à
chaque section du GDD, écran par écran. Un écart = un ticket `triage` avec la reproduction et la capture.
Un crash = `priority:high`. Zéro écart est un résultat valide.
