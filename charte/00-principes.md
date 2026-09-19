# 00 — Principes

## Ce qu'on construit

Une usine, pas un jeu. Un humain valide un concept ; le système crée le repo, écrit le GDD en tickets,
route, développe, relit, corrige, build, teste, et revient vers l'humain uniquement pour merger ou
trancher. Chaque jeu qui sort doit rendre le suivant plus facile : ce qui manquait va dans la charte ou
dans le template, jamais dans un patch local au jeu.

## Où vit quoi

| Quoi | Où | Jamais |
| --- | --- | --- |
| Code des jeux | un repo par jeu (`prismo-studio/<slug>`) | — |
| État du système | issues, labels, PR, reviews, commentaires, releases, workflows | Trello, Jira, base de données, fichier d'état local |
| Exécution | la VM factory : Docker, runner GitHub, Claude Code headless, Godot, Blender, SDK Android, Waydroid, Ollama | — |
| Le lourd | disque de la VM : caches, images système, bibliothèque d'assets, APK de test | commité dans un repo |
| Secrets | secrets GitHub (org `prismo-studio`) ou `.env` sur la VM | en clair dans un repo, dans un prompt, dans un commentaire |
| Comptes externes | AdMob, Play Console, App Store — humains | pilotés par une pipeline |
| Dashboard coût/état | sur la VM, calculé à partir de GitHub | une base à part |

Un artefact produit sur la VM (glTF lourd, APK, screenshots) est soit commité s'il est léger (< 2 Mo),
soit attaché à une Release GitHub avec sa référence dans le ticket. Sans référence sur GitHub, il n'existe pas.

## Séparation des rôles

- **Scripts** (Node, déterministes) : scanner GitHub, revendiquer un ticket, cloner, préparer la branche,
  lancer l'agent, lire son rapport, commiter, pousser, ouvrir la PR, commenter, poser le label, chaîner.
- **Modèle** (Claude Code headless ou appel LLM unique) : lire, diagnostiquer, coder, vérifier, rendre un
  rapport JSON. Rien d'autre.
- **Humain** : valider un concept (`concept:approved`), approuver et merger une PR, débloquer
  (`blocked`, `needs-human`), remplacer un placeholder d'art, gérer les comptes.

C'est ce qui rend le système reproductible : un run qui échoue se lit dans les logs du script, pas dans
la tête du modèle.

## Kit hors des repos modifiés

`game-factory` n'est jamais cloné en écriture par une pipeline. Les prompts, les hooks, les scripts vivent
ici ; l'agent travaille dans le repo du jeu. Le `CLAUDE.md` du jeu pointe vers la charte, il ne la copie pas.

## Livrer complet ou bloquer

Une feature à moitié faite coûte plus cher à reprendre qu'à écrire et donne l'illusion du travail fait.
Une pipeline qui ne voit pas comment couvrir tous les critères d'acceptation du ticket se déclare
`blocked` avant d'avoir écrit une ligne, et dit précisément ce qui manque.

## Phase 1 à zéro euro

Tant que le premier jeu n'est pas sorti à la main, pipeline par pipeline, avec Claude Code interactif
sous abonnement, on ne branche pas de clé API dans la boucle. Chaque script doit donc être lançable à la
main (`node orchestrator/run.mjs <pipeline> --issue N`) exactement comme depuis un workflow. Ollama sert
à tester la tuyauterie (labels, commentaires, chaînage) sans dépenser.

L'abonnement Claude n'entre jamais dans la boucle headless non-stop.

## La boucle ne s arrete pas d elle-meme

Le lot de tickets initial est epuisable ; l usine ne doit pas l etre. La chaine complete est un
cycle, pas une ligne :

`spec` decoupe le GDD -> `triage` route -> `dev` et `assets` produisent des PR -> `review` les
relit -> l auto-merge les pose sur `develop` -> **`promote` pousse `develop` vers `main`** ->
le `build.yml` du depot du jeu publie la release `build-N` -> **`qa` installe cette release, y
joue, et depose un ticket `triage` + `origin:qa` par ecart constate** -> `triage` route ces
tickets -> `dev` les corrige -> `develop` avance -> `promote` a nouveau.

L usine ne construit pas l APK : chaque depot de jeu sait deja le faire au push sur `main`.
Le maillon qui manquait n etait pas le build, c etait la promotion — elle n arrivait que par un
cron du soir ou une main humaine.

Les deux maillons en gras sont ceux qui referment le cycle. Sans eux, l usine s arrete en silence
le jour ou le dernier ticket du lot initial est ferme : aucune erreur, aucun run rouge, juste plus
rien qui nait. C est le mode de panne le plus difficile a voir, parce qu il ressemble a du travail
termine.

Consequences pratiques :

- `promote` et `qa` sont dans `GF_HEARTBEAT_PIPELINES` au meme titre que les autres. Les en retirer
  arrete la generation de tickets.
- L auto-merge reveille `promote` des qu il a merge quelque chose : `develop` vient d avancer.
- `promote` n envoie a la QA qu un increment termine : tant qu un ticket porte `todo:*`,
  `review` ou `in-progress`, elle attend. Sans cette condition, la QA testerait un jeu a moitie
  construit et rapporterait comme defauts tout ce qui est deja dans le backlog — un doublon par
  ticket. Les tickets `needs-human` ne retiennent pas la promotion : ils peuvent rester ouverts
  des semaines, et les faire bloquer la boucle reviendrait a l arreter.
- Un jeu dont le ticket `Factory control` porte `factory:paused` sort du cycle entierement, promotion
  et QA comprises. C est le seul bouton d arret.
