# Bibliotheque d assets locale

Niveau 1 de la cascade asset (`orchestrator/lib/assets.mjs`) : la bibliotheque locale est
consultee AVANT l API Poly Pizza, et le placeholder n arrive qu en dernier recours. Tant
qu elle est vide, chaque ticket art part chercher un modele au hasard dans un catalogue
partage : c est exactement ce qui produit du patchwork visuel. Une seule source de style
par jeu, c est la regle.

## Ou deposer les packs

Sur la machine qui heberge Docker :

```
C:\Users\Asuki\game_factory\assets-library\<pack>\...
```

Le dossier est un cran AU-DESSUS des depots (a cote de `game-factory`, `crown-roll`,
`game-template`) : il ne doit jamais etre versionne, les packs payants n ont rien a faire
dans un depot GitHub.

Exemple, tel qu installe :

```
assets-library\
  adventurers\          KayKit_Adventurers_2.0_FREE\Characters\gltf\Knight.gltf ...
  character_animations\ KayKit_Character_Animations_1.1\...
  dungeon\              KayKit_Dungeon_Pack_1.1_FREE\Assets\gltf\wall.gltf ...
  prototype_bits\       KayKit_Prototype_Bits_1.1_FREE\Assets\gltf\...
```

L arborescence interne des packs est libre, l indexeur descend recursivement. Ce qui compte,
c est le nom du dossier de premier niveau : il devient un tag de recherche. Donc minuscules,
sans accent, descriptif (`dungeon`, pas `KayKit_Dungeon_Pack_1.1_FREE`).

Les tags d un modele sont les mots de son nom de fichier plus ceux de tous les dossiers de
son chemin, moins une liste de bruit (`assets`, `gltf`, `textures`, `free`, `samples`...).

Un autre chemin est possible via `GF_ASSET_LIBRARY_HOST` dans `docker/.env` (chemin hote,
absolu ou relatif a `docker/`). Par defaut : `../../assets-library`.

## Formats

Seuls les `.glb` sont indexes, mais la plupart des packs n en livrent aucun : KayKit fournit
du `.fbx`, de l `.obj` et du `.gltf` accompagne de `.bin` et de textures separees. La passe
`assets-convert.mjs` convertit chaque `.gltf` en `.glb` autonome (buffer et textures
embarques) a cote du fichier source, avant l indexation. C est automatique, tu n as rien a
faire ; les `.fbx` et `.obj` sont ignores.

Un pack qui ne livrerait ni `.glb` ni `.gltf` (que du `.fbx`) ne peut pas etre indexe en
l etat : il faudrait passer par Blender. Aucun des packs KayKit n est dans ce cas.

## Indexation

A relancer apres chaque pack ajoute ou retire :

```
cd C:\Users\Asuki\game_factory\game-factory\docker
docker compose run --rm assets-index
```

Ce service fait les deux passes : conversion `.gltf` -> `.glb`, puis ecriture de
`assets-library\index.json` (un enregistrement par modele : tags, triangles, dimensions).
Il est idempotent, un `.glb` deja present n est pas reconverti.

Les budgets de `tools/asset_check.py` s appliquent ensuite. Un modele de bibliotheque a droit
a `BUDGET_LIBRARY`, plus large que le budget des modeles rapatries par API : les persos
rigges des packs tournent a 6000-9000 triangles et seraient tous refuses autrement. Un modele
hors budget n est pas une erreur, la cascade passe simplement au candidat suivant.

## Verification

```
docker compose run --rm assets-index | tail -1        # nombre d assets indexes
docker compose exec runner ls /assets-library         # le montage est visible du runner
```

Si le runner ne voit rien : le dossier hote n existe pas encore (Docker cree alors un
dossier vide a sa place), ou le partage de disque n est pas autorise dans Docker Desktop
(Settings > Resources > File sharing).
