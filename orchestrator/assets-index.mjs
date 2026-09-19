#!/usr/bin/env node
// Indexe la bibliotheque locale (packs deposes dans $GF_ASSET_LIBRARY/<pack>/... )
// → $GF_ASSET_LIBRARY/index.json : { assets: [{ id, name, tags, file, triangles, size, license }] }.
// Tags = mots du nom de fichier + de TOUS les dossiers du chemin, moins le bruit (voir NOISE) :
// les packs sont livres avec une arborescence a eux (Assets/gltf/, Characters/gltf/...) qu on ne
// veut pas voir remonter comme mots-cles de recherche. Relancer apres chaque pack ajoute
// (assets-convert.mjs d abord, les packs sans .glb ne s indexent pas sinon).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { env } from './lib/env.mjs';
import { glbStats } from './lib/glb.mjs';

// Dossiers et suffixes que les packs ajoutent d eux-memes : aucune valeur de recherche, et
// ils feraient matcher n importe quel mot-cle sur n importe quel modele.
// Le nom de l editeur du pack est sur 100 % des modeles : comme tag il ne discrimine rien et
// fait matcher n importe quelle recherche sur n importe quel modele.
const NOISE = new Set(['kay', 'kit', 'kaykit', 'kenney', 'quaternius', 'synty', 'bits', 'assets', 'asset', 'models', 'model', 'gltf', 'glb', 'fbx', 'obj', 'source', 'sources', 'samples', 'sample', 'textures', 'texture', 'materials', 'preview', 'previews', 'free', 'pack', 'packs', 'unity', 'unreal', 'godot', 'lib', 'library', 'files']);

const root = env('GF_ASSET_LIBRARY');
if (!root) throw new Error('GF_ASSET_LIBRARY requis (dossier des packs)');
const assets = [];
function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.glb$/i.test(entry)) {
            const rel = relative(root, path).replace(/\\/g, '/');
            const segments = rel.split('/');
            const pack = segments[0];
            const name = entry.replace(/\.glb$/i, '').toLowerCase();
            try {
                const stats = glbStats(readFileSync(path));
                const words = [...name.split(/(?=[A-Z])|[-_ .]+/), ...segments.slice(0, -1).flatMap((segment) => segment.split(/(?=[A-Z])|[-_ .]+/))]
                    .map((word) => word.toLowerCase())
                    .filter((word) => word.length > 2 && !NOISE.has(word) && !/^\d/.test(word));
                assets.push({ id: `${pack}:${name}`, name, tags: [...new Set(words)], file: rel, triangles: stats.triangles, size: stats.size.map((value) => Number(value.toFixed(3))), license: 'CC0' });
            } catch (error) {
                console.log(`ignore ${rel} : ${error.message}`);
            }
        }
    }
}
walk(root);
writeFileSync(join(root, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 1));
console.log(`${assets.length} assets indexes dans ${join(root, 'index.json')}`);
