#!/usr/bin/env node
// Indexe la bibliotheque locale (packs Kenney/Quaternius deposes dans $GF_ASSET_LIBRARY/<source>/<pack>/)
// → $GF_ASSET_LIBRARY/index.json : { assets: [{ id, name, tags, file, triangles, size, license }] }.
// Tags = mots du nom de fichier + du pack. Relancer apres chaque pack ajoute.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { env } from './lib/env.mjs';
import { glbStats } from './lib/glb.mjs';

const root = env('GF_ASSET_LIBRARY');
if (!root) throw new Error('GF_ASSET_LIBRARY requis (dossier des packs)');
const assets = [];
function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.glb$/i.test(entry)) {
            const rel = relative(root, path).replace(/\\/g, '/');
            const [source, pack] = rel.split('/');
            const name = entry.replace(/\.glb$/i, '').toLowerCase();
            try {
                const stats = glbStats(readFileSync(path));
                assets.push({ id: `${source}:${pack}:${name}`, name, tags: [...new Set([...name.split(/[-_ .]+/), ...(pack ?? '').split(/[-_ .]+/)].filter((word) => word.length > 2))], file: rel, triangles: stats.triangles, size: stats.size.map((value) => Number(value.toFixed(3))), license: 'CC0' });
            } catch (error) {
                console.log(`ignore ${rel} : ${error.message}`);
            }
        }
    }
}
walk(root);
writeFileSync(join(root, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 1));
console.log(`${assets.length} assets indexes dans ${join(root, 'index.json')}`);
