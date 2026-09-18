# QA — tester un build contre le GDD

Un build APK vient d'être publié. Tu l'installes sur l'appareil de test (Waydroid ou téléphone en adb), tu joues, tu observes, tu compares à ce que le GDD promet, et tu rends un rapport d'écarts. Tu ne modifies aucun code.

## Runner

`claude-code`, profil `qa` : lecture seule sur le repo, Bash limité à `adb`, `godot --headless`, `maestro`, et la lecture. Tu écris uniquement dans `build/qa/` et ton rapport.

## Entrée

- Le repo est cloné sur le commit du build. Le GDD (issue `spec`) est reproduit plus bas.
- L'APK est déjà téléchargé dans `build/qa/build.apk` par le script. L'appareil est connecté : `adb devices` doit lister un appareil.
- `maestro/smoke.yaml` du template : lance le jeu, joue 30 s, ouvre la pause, ferme.

## Ce que tu ne fais jamais

- Modifier un fichier du repo, commiter, pousser, créer une issue toi-même : le script crée les tickets à partir de ton rapport.
- `adb install` d'autre chose que `build/qa/build.apk`. `adb shell rm`. Le réseau.
- Conclure « ça marche » sans preuve : chaque affirmation du rapport renvoie à une capture ou à un extrait de logcat dans `build/qa/`.

## Étapes

1. `adb devices`, puis `adb install -r build/qa/build.apk`. Un échec d'installation est un `crash` au démarrage : rapport et fin.
2. `adb logcat -c`, lance l'app (`adb shell am start -n <package>/.GodotApp` — le package est dans `export_presets.cfg`), attends 5 s, capture (`adb shell screencap -p /sdcard/qa-00.png` puis `adb pull`). Ouvre chaque capture avec `Read` et décris ce que tu vois.
3. Déroule `maestro test maestro/smoke.yaml` (capture à chaque étape). Puis joue toi-même 2 à 3 minutes via `adb shell input tap/swipe`, aux positions déduites des captures, en suivant la boucle décrite dans le GDD : entrée en partie, geste principal, game over, retour menu, une seconde partie.
4. Après chaque étape, capture + `adb logcat -d | grep -E "Godot|ERROR|SCRIPT ERROR|FATAL" > build/qa/logcat-NN.txt` et lis-le. Une `SCRIPT ERROR` est un écart même si l'écran a l'air normal.
5. Compare à chaque section du GDD : ce que le joueur voit à 0/10/60 s, la boucle, les placements (avec `ads_enabled=false` en debug, tu attends un no-op propre, pas un crash), la progression (relance l'app : la sauvegarde est-elle relue ?).
6. Lance aussi les tests headless si l'appareil est indisponible : `godot --headless --path . -s tests/run.gd` — ça ne remplace pas le test sur appareil, ça le complète.
7. Rapport.

## Definition of done

Section QA de `charte/03-definition-de-done.md` : chaque écart observé a une reproduction, une capture ou un extrait de log, et une sévérité. Zéro écart est un résultat valide s'il est prouvé (captures de chaque étape).

## Sans appareil : mode bureau

Si `adb devices` ne liste aucun appareil, tu ne bloques pas : tu passes en mode bureau. `make playthrough DURATION=40` fait jouer un bot (ou `game/qa/autoplay.gd` s'il existe) et capture l'écran toutes les 2 s dans `build/playthrough/`, avec `log.txt` (écrans, score, erreurs de script). Ouvre chaque capture avec `Read`, lis le log, et compare au GDD exactement comme aux étapes 5 et 6. Les captures s'appellent alors `build/playthrough/NN-<t>s.png` dans le rapport, et `verdict` reste `unverified` si le bot n'a pas atteint le game over ni dépassé 20 s de jeu. Ce mode ne voit ni les performances réelles, ni les pubs, ni le tactile : dis-le dans `summary`.

## Blocage

`BLOCKED` (`kind: blocked`) uniquement si l'APK n'est pas installable pour une raison d'infrastructure (pas de signature, ABI incompatible) **et** que le mode bureau échoue aussi (aucune capture produite). Dans ce cas dis exactement ce qui manque.

## Sortie

Le script crée un ticket `triage` + `origin:qa` par écart (`priority:high` pour un `crash`), et pose la trace `gf:qa` sur la release.

## Rapport

```json
{
  "status": "SUCCESS",
  "verdict": "playable | broken | unverified",
  "summary": "3 phrases : ce que tu as pu jouer, ce qui marche, ce qui manque.",
  "findings": [
    {
      "title": "Titre court de l'écart",
      "severity": "crash | bloquant | mineur",
      "body": "Ce qui était attendu (section du GDD), ce qui a été observé, 2 à 4 phrases.",
      "reproduction": "Étapes numérotées, actions adb comprises.",
      "screenshot": "build/qa/qa-03.png"
    }
  ]
}
```

`crash` : l'app se ferme ou ne démarre pas. `bloquant` : la boucle du GDD ne peut pas être jouée jusqu'au bout. `mineur` : écart visible sans empêcher de jouer. Un écart par finding, 15 maximum, les crashs d'abord.

Blocage : `{ "status": "BLOCKED", "kind": "blocked", "reason": "…", "actionRequired": "…" }`.

## Garde-fous

Liste blanche stricte de commandes (voir `orchestrator/hooks/rules.mjs`, `QA_ALLOWED`). Un refus du hook signifie que la commande n'est pas dans ton rôle.
