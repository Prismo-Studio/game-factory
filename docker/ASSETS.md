# Bibliotheque d assets locale

Niveau 1 de la cascade asset (`orchestrator/lib/assets.mjs`) : la bibliotheque locale est
consultee AVANT l API Poly Pizza, et le placeholder n arrive qu en dernier recours. Tant
qu elle est vide, chaque ticket art part chercher un modele au hasard dans un catalogue
partage : c est exactement ce qui produit du patchwork visuel. Une seule source de style
par jeu, c est la regle.

## Ou deposer les packs

Sur la machine qui heberge Docker :

```
C:\Users\Asuki\game_factory\assets-library\<source>\<pack>\*.glb
```

Le dossier est un cran AU-DESSUS des depots (a cote de `game-factory`, `crown-roll`,
`game-template`) : il ne doit jamais etre versionne, les packs payants n ont rien a faire
dans un depot GitHub.

Exemple avec KayKit :

```
assets-library\
  kaykit\
    dungeon\        dungeon_wall.glb, dungeon_floor.glb, torch.glb ...
    adventurers\    knight.glb, rogue.glb ...
    prototype-bits\ ...
  kenney\
    ui-3d\          ...
```

`<source>` et `<pack>` comptent : l indexeur en tire les tags de recherche, en plus des
mots du nom de fichier. Donc des noms de dossiers descriptifs et en minuscules, sans
accent, separes par des tirets.

Un autre chemin est possible via `GF_ASSET_LIBRARY_HOST` dans `docker/.env` (chemin hote,
absolu ou relatif a `docker/`). Par defaut : `../../assets-library`.

## Formats

Seuls les `.glb` sont indexes. Les packs livres en `.fbx`, `.obj` ou `.blend` doivent etre
convertis. KayKit fournit des `.glb` directement, rien a faire. Pour le reste :

```
docker compose run --rm assets-index   # ignore silencieusement ce qui n est pas .glb
```

Les textures embarquees dans le `.glb` sont conservees. Un `.glb` qui reference une texture
externe perdra son materiau : re-exporter en embarquant.

## Indexation

A relancer apres chaque pack ajoute ou retire :

```
cd C:\Users\Asuki\game_factory\game-factory\docker
docker compose run --rm assets-index
```

Ecrit `assets-library\index.json` : un enregistrement par modele avec ses tags, son nombre
de triangles et ses dimensions. Les budgets de `tools/asset_check.py` s appliquent ensuite
normalement : un modele trop lourd est refuse et la cascade passe au candidat suivant.

## Verification

```
docker compose run --rm assets-index | tail -1        # nombre d assets indexes
docker compose exec runner ls /assets-library         # le montage est visible du runner
```

Si le runner ne voit rien : le dossier hote n existe pas encore (Docker cree alors un
dossier vide a sa place), ou le partage de disque n est pas autorise dans Docker Desktop
(Settings > Resources > File sharing).
