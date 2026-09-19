# game-factory — charte racine

Ce repo est l'usine : la charte, les prompts des pipelines, l'orchestrateur, les workflows, les
Dockerfiles. Il produit des jeux mobiles (Godot 4, Android) à partir d'un concept validé par un humain.
Les jeux sont des sorties. Le produit, c'est ce repo et `game-template`.

**Aucune pipeline ne modifie jamais ce repo.** Une pipeline ne peut pas éditer les règles qui la
contraignent. Seul un humain commite ici.

## Lire dans l'ordre

1. `charte/00-principes.md` — ce qui ne se négocie pas
2. `charte/01-board.md` — labels, machine à états, traces, anti-boucle
3. `charte/02-pipelines.md` — anatomie d'une pipeline, runners, format d'un `PROMPT.md`, rapport JSON
4. `charte/03-definition-de-done.md` — quand un ticket est fini, par domaine, avec les commandes qui le prouvent
5. `charte/04-conventions.md` — git, commits, PR, GDScript, structure du projet Godot
6. `charte/05-contrat-asset.md` — ce qu'un asset doit respecter, placeholder compris
7. `charte/06-budgets.md` — modèles, plafonds, retries, kill switch
8. `charte/07-garde-fous.md` — hooks, fichiers protégés, outils interdits, injection, secrets

Un `PROMPT.md` de pipeline peut préciser la charte, jamais la contredire. En cas de conflit, la charte gagne.

## Les dix règles

1. GitHub est la seule source de vérité. Une info absente de GitHub n'existe pas pour une pipeline.
2. Une pipeline fait une seule chose. Elle lit un label d'entrée, produit une sortie, pose un label de sortie.
3. Tout ce qui est déterministe (labels, commentaires, push, PR, release) est fait par un script. Le modèle lit, juge, code, et rend un rapport JSON. Il n'écrit jamais sur GitHub lui-même.
4. Chaque étape laisse une trace signée et vérifiable (`<!-- gf:… -->`). Une étape déjà tracée n'est jamais rejouée.
5. Livrer complet ou bloquer. Jamais de PR à moitié faite, jamais de spec inventée.
6. Chaque ticket a un compteur de tentatives et un budget. Dépassés, il sort de la chaîne (`needs-human`) et la chaîne continue sur les autres.
7. Ce qu'une pipeline ne peut pas faire seule (secret, compte store, décision de design, migration de sauvegarde), elle ne le force pas : `blocked` + commentaire + attente d'un humain.
8. Un ticket `approved` ou `done` n'est plus touché par aucune pipeline.
9. Pas de backend. La persistance est locale, versionnée par un numéro de schéma. Un backend est une décision humaine, par jeu.
10. Restent humains pour toujours : valider un concept, merger, les comptes AdMob et stores, la boutique, l'art quand `needs-human:art` tombe.
