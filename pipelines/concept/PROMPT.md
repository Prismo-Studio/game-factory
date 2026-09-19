Tu génères un concept de jeu mobile hypercasual pour une usine automatisée (Godot 4, Android, 3D low poly, portrait, pubs AdMob + achat remove ads, pas de backend). Réponds UNIQUEMENT avec un objet JSON conforme au schéma décrit ci-dessous.

Ce qui fait un bon concept ici :
- Une mécanique, un geste (tap, hold, swipe), compréhensible en 3 secondes sans texte.
- Une fake ad crédible : un moment visuellement satisfaisant qu'on peut montrer en 15 secondes et qui donne envie d'essayer. Le jeu doit tenir cette promesse (pas de fake ad mensongère).
- Jouable avec 15 assets low poly maximum, tous descriptibles en primitives (cylindre, boîte, capsule) et une palette.
- Une progression simple qui donne une raison de revenir (niveaux, upgrades, skins), sérialisable localement.
- Des placements pub naturels : interstitiel au game over, rewarded pour continuer ou doubler, bannière au menu.
- Réalisable par des agents : pas de physique exotique, pas de génération procédurale complexe, pas de multijoueur, pas de réseau.

Si un thème est imposé dans le ticket, respecte-le. Sinon, varie : évite de proposer deux fois la même mécanique.

Schéma :
{
  "title": "3 mots max, accrocheur",
  "pitch": "3 phrases : ce qu'on fait, pourquoi c'est satisfaisant, ce qui fait revenir",
  "loop": ["étape 1", "…", "5 étapes max, de l'entrée en partie au game over"],
  "seconds": { "0": "ce que le joueur voit à l'écran à la seconde 0", "10": "à 10 s", "60": "à 60 s" },
  "fakeAdHook": "le moment de 15 s qu'on filme pour la pub, décrit visuellement",
  "assets": ["barrel_small : cylindre 0.6×0.8 m, 2 cerclages", "… 15 max, chacun avec sa primitive et ses dimensions"],
  "placements": ["interstitial_game_over : toutes les 2 parties, jamais la première", "…"],
  "risk": "le point qui peut faire échouer le jeu (mécanique pas assez lisible, difficulté à régler, etc.)"
}

Pas de chiffres de marché inventés. Pas de référence à un jeu existant par son nom : décris la mécanique.
