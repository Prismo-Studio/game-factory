# 05 — Contrat d'asset

Un asset est un fichier `.glb` accompagné d'un `.asset.json`, tous deux sous
`game/assets/models/<categorie>/<nom>/`. Le jeu ne charge jamais un asset directement : il instancie le
prefab `<nom>.tscn` généré à côté, qui encapsule le mesh, le pivot et les points d'attache. C'est ce qui
permet de remplacer un placeholder par le vrai asset sans toucher au code : on dépose un nouveau `.glb`
respectant le même contrat, le prefab reste valide.

Le pipeline de production (Blender headless, bibliothèque CC0, génération IA) n'est pas décidé. Le
contrat, lui, est stable : tout ce qui produit un asset — pipeline, humain, script — le respecte. En
attendant la pipeline Assets, chaque ticket `todo:art` aboutit à un placeholder conforme et
`needs-human:art`.

## Style

Low poly, flat shading, palette limitée. Une seule texture palette par jeu
(`game/assets/textures/palette.png`, 16×16 ou 32×32, chaque teinte une case), les UV pointent sur une
case. Pas de texture photo, pas de normal map, pas de PBR au-delà de la couleur de base. Primitives
assumées : un tonneau est un cylindre à 8 faces, pas un scan.

## Le fichier `.asset.json`

```json
{
  "name": "barrel_small",
  "category": "props",
  "version": 1,
  "source": "placeholder | blender | library:<id> | generated:<provider> | human",
  "units": "meters",
  "bounds": { "min": [-0.3, 0, -0.3], "max": [0.3, 0.8, 0.3] },
  "pivot": "bottom_center",
  "attach_points": { "top": [0, 0.8, 0], "grab": [0, 0.5, 0.3] },
  "triangles": 84,
  "palette_slots": ["wood_dark", "metal"],
  "collision": "box | cylinder | sphere | mesh | none",
  "ticket": 23
}
```

Règles :
- `name` = nom du dossier = nom du `.glb` = nom du prefab. `snake_case`, unique dans le jeu.
- Unité : 1 unité Godot = 1 mètre. Y vers le haut, l'avant regarde −Z.
- Pivot en `bottom_center` sauf pour ce qui vole ou tourne (`center`), déclaré.
- `bounds` est la boîte réelle après export ; `make asset-check` la recalcule et refuse un écart > 2 %.
- Budget triangles par catégorie : `props` ≤ 300, `characters` ≤ 1500, `vehicles` ≤ 1200,
  `environment` ≤ 2000, `ui3d` ≤ 200. Dépassement = refus.
- Un seul mesh, un seul matériau, pas de hiérarchie inutile. Les points d'attache sont des `Marker3D`
  du prefab, générés depuis le JSON, pas modélisés.
- `.glb` ≤ 2 Mo commité ; au-delà, Release + référence dans le JSON (`"blob": "release:build-12/…"`) —
  et une question sur la raison, un asset low poly de 2 Mo n'est pas low poly.

## Placeholder

Même contrat, corps en primitive (boîte, cylindre, capsule, sphère) aux dimensions de `bounds`, couleur
unie tirée de la palette selon la catégorie, `"source": "placeholder"`. Il est fonctionnel : collisions,
pivot, points d'attache exacts. Le jeu doit être jouable et testable avec 100 % de placeholders. Un
placeholder est remplacé en déposant un `.glb` et en passant `source` à autre chose ; `make asset-check`
vérifie que les bounds et les points d'attache n'ont pas bougé de plus que la tolérance.

## Ce que le ticket `todo:art` doit contenir

Nom, catégorie, dimensions cibles, pivot, points d'attache attendus, slots de palette, usage en jeu
(une phrase), référence visuelle en mots (jamais « comme dans <jeu connu> », plutôt « cylindre trapu,
deux cerclages »). Un ticket art sans dimensions ne passe pas Triage : `needs-human`.

## Ce qui reste humain

Le style final d'un jeu (palette, direction artistique) est validé par un humain sur le premier lot
d'assets. `needs-human:art` signifie : le jeu tourne avec un placeholder, personne n'est bloqué, mais
il faudra un vrai asset avant publication. La liste des `needs-human:art` ouverts est la checklist d'art
avant release.
