#!/usr/bin/env node
// Convertit en .glb autonome les modeles livres en .gltf + .bin + textures externes.
// Les packs KayKit (Dungeon, Prototype Bits...) ne fournissent aucun .glb : sans cette
// passe, assets-index.mjs indexe zero modele sur ces packs. Le .glb est ecrit a cote du
// .gltf ; les .gltf deja accompagnes d un .glb sont ignores.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { env } from './lib/env.mjs';

// @gltf-transform n est pas une dependance de l usine : il est installe a cote (voir le
// service assets-index du compose) et resolu via NODE_PATH, que seul require() consulte.
const { NodeIO } = createRequire(import.meta.url)('@gltf-transform/core');

const root = env('GF_ASSET_LIBRARY');
if (!root) throw new Error('GF_ASSET_LIBRARY requis (dossier des packs)');

const sources = [];
function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.gltf$/i.test(entry)) sources.push(path);
    }
}
walk(root);

const io = new NodeIO();
let written = 0;
let skipped = 0;
for (const path of sources) {
    const out = path.replace(/\.gltf$/i, '.glb');
    if (existsSync(out)) { skipped += 1; continue; }
    try {
        // NodeIO resout .bin et images externes a la lecture, et les embarque a l ecriture.
        await io.write(out, await io.read(path));
        written += 1;
    } catch (error) {
        console.log(`ignore ${path} : ${error.message}`);
    }
}
console.log(`${written} .glb ecrits, ${skipped} deja presents (${sources.length} .gltf vus)`);
