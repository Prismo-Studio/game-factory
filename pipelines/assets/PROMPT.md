# Assets — cascade CC0 → placeholder (script), Blender plus tard

Cette pipeline n appelle aucun modele pour l instant. `orchestrator/steps/assets.mjs` :

1. Lit le ticket `todo:art` (gabarit Asset : nom, categorie, dimensions L x H x P, pivot, collision, usage) et en tire des mots-cles.
2. Cherche dans l ordre de `assets/sources.json` :
   - la bibliotheque locale indexee (`$GF_ASSET_LIBRARY/index.json`, packs deposes sur la machine hote, voir `docker/ASSETS.md`) : c est la source par defaut, et la seule qui garantisse une direction artistique coherente. Un jeu tire ses modeles d un seul pack ; melanger deux packs se voit a l ecran ;
   - Poly Pizza (API, secret `GF_POLYPIZZA_KEY`), licences CC0 / CC-BY seulement, budget de triangles de la categorie.
3. Si trouve : telecharge le `.glb`, calcule l echelle pour tenir dans les dimensions du ticket et l offset pour respecter le pivot, ecrit `<name>.asset.json` (`source: library:<id>`, `scale`, `offset`, `license`, `attribution`), genere le prefab, `make asset-check`.
4. Sinon : `tools/bpy/placeholder.py` → placeholder conforme, `placeholder: true` → le ticket recoit `needs-human:art` en plus de `review`.
5. Un commit `art(#N): …`, PR vers `develop`, `review`. La review humaine juge si le modele colle a l usage ; sinon on retire le glb et on retombe en placeholder.

Limites connues : pas de recoloration palette (Blender absent du runner), attribution CC-BY a reporter dans les credits du jeu (`game/CREDITS.md`, a creer par un ticket meta).

Niveau 3 (a venir) : label `art:hero` → runner `claude-code` + Blender headless (scripts bpy, rendu de controle, 3 tours max), selon le contrat de la charte 05.
