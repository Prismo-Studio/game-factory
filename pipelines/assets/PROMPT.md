# Assets — produire un asset conforme au contrat, ou un placeholder qui l'est

Un ticket `todo:art` décrit un asset (nom, catégorie, dimensions, pivot, points d'attache, slots de palette, usage). Tu le produis avec Blender headless via des scripts bpy, tu l'exportes en glTF, tu génères son `.asset.json` et son prefab, tu vérifies, tu rends une PR. Si après trois rendus le résultat n'est pas acceptable, tu livres un placeholder conforme au même contrat et tu le dis.

> État : la chaîne de production d'assets n'est pas encore tranchée (charte 05). Tant que `docker/blender` n'existe pas sur le runner, cette pipeline produit **uniquement des placeholders** via `tools/bpy/placeholder.py`, et pose `needs-human:art`. Le reste de ce prompt décrit la cible.

## Runner

`claude-code`, profil `write`. Blender disponible en `blender --background --python <script>`.

## Entrée

Repo cloné, branche `art/N-slug` checkoutée, ticket reproduit plus bas, `charte/05-contrat-asset.md` à respecter à la lettre, `tools/bpy/` du template (`placeholder.py`, `export_glb.py`, `render_check.py`), `tools/asset_check.py`.

## Ce que tu ne fais jamais

Télécharger un modèle, installer un addon Blender, importer une texture photo, dépasser le budget de triangles de la catégorie, commiter un `.glb` de plus de 2 Mo, modifier un asset existant qui n'est pas dans le ticket.

## Étapes

1. Lis le ticket : si dimensions, pivot ou catégorie manquent, `BLOCKED` (`needs-human`).
2. Écris `tools/bpy/generated/<name>.py` : construis l'objet en primitives (cylindres, boîtes, capsules, extrusions simples), fusionne en un seul mesh, un seul matériau, UV projetées sur la palette (`game/assets/textures/palette.png`, une case par slot), pivot et orientation selon le contrat, échelle en mètres.
3. Exporte : `blender --background --python tools/bpy/export_glb.py -- tools/bpy/generated/<name>.py game/assets/models/<category>/<name>/<name>.glb`.
4. Rendu de contrôle : `blender --background --python tools/bpy/render_check.py -- <glb> build/art/<name>.png`. Ouvre le PNG avec `Read` et juge : silhouette lisible, proportions du ticket, pas de face manquante. Corrige le script et recommence, **3 rendus maximum**.
5. Écris `<name>.asset.json` (schéma de la charte 05, `"source": "blender"`), génère le prefab avec `make asset-prefab NAME=<name>`, puis `make asset-check` : bounds, budget triangles, points d'attache.
6. Après 3 rendus insatisfaisants : `python3 tools/bpy/placeholder.py <name> <category> <dims> <pivot>` produit un placeholder conforme, `"source": "placeholder"`, et ton rapport porte `"placeholder": true`.
7. `make check`, un commit `art(#N): add <name>`, rapport.

## Definition of done

Section art de la charte 03 : `.glb` + `.asset.json` valides (`make asset-check` vert), rendu de contrôle dans la PR (`build/art/<name>.png` référencé dans `checks`), pivot, bounds et points d'attache conformes au ticket, budget de triangles respecté.

## Blocage

`needs-human` si le ticket est incomplet ; `blocked` si Blender n'est pas disponible sur le runner (« blender: command not found »).

## Sortie

PR + `review`. Si `placeholder: true`, le script ajoute `needs-human:art` sur le ticket : le jeu avance, un humain remplacera le fichier.

## Rapport

Comme Dev, plus `"placeholder": true|false` et `"renders": ["build/art/<name>-1.png", …]`.

## Garde-fous

Ceux du profil `write`. `blender` n'est autorisé qu'en `--background`.
