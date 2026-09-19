import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArtTicket, pickCandidate, licenseAllowed, searchLocalIndex } from './lib/assets.mjs';
import { fitScale, glbStats } from './lib/glb.mjs';

const body = `## A faire\n- Nom : \`barrel_small\`, categorie \`props\`\n- Dimensions cibles : 0.6 x 0.8 x 0.6 m\n- Pivot : bottom_center\n- Collision : cylinder\n- Usage : tonneau en bois sur la piste, deux cerclages`;

test('parse d un ticket art', () => {
    const query = parseArtTicket(body);
    assert.equal(query.name, 'barrel_small');
    assert.equal(query.category, 'props');
    assert.deepEqual(query.size, [0.6, 0.8, 0.6]);
    assert.equal(query.pivot, 'bottom_center');
    assert.equal(query.collision, 'cylinder');
    assert.ok(query.keywords.includes('barrel') && query.keywords.includes('tonneau'));
});

test('licences et choix du candidat', () => {
    assert.ok(licenseAllowed('CC0'));
    assert.ok(licenseAllowed('CC BY 4.0'));
    assert.ok(!licenseAllowed('CC BY-NC'));
    const chosen = pickCandidate([{ id: 'a', license: 'CC0', triangles: 900 }, { id: 'b', license: 'CC0', triangles: 200 }, { id: 'c', license: 'CC BY-NC', triangles: 50 }], { maxTriangles: 300 });
    assert.equal(chosen.id, 'b');
});

test('index local par tags', () => {
    const index = { assets: [{ id: 'kenney:barrel', name: 'barrel', tags: ['barrel', 'wood'], file: 'x.glb' }, { id: 'kenney:tree', name: 'tree', tags: ['tree'], file: 'y.glb' }] };
    assert.equal(searchLocalIndex({ keywords: ['barrel'] }, index)[0].id, 'kenney:barrel');
    assert.equal(searchLocalIndex({ keywords: ['car'] }, index).length, 0);
});

test('echelle et lecture glb', () => {
    assert.equal(fitScale([2, 1, 2], [1, 1, 1]), 0.5);
    const json = JSON.stringify({ asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], accessors: [{ count: 8, min: [-1, 0, -1], max: [1, 2, 1] }, { count: 36 }], materials: [{}] });
    const padded = json + ' '.repeat((4 - (json.length % 4)) % 4);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length, 8);
    const chunk = Buffer.alloc(8);
    chunk.writeUInt32LE(padded.length, 0); chunk.writeUInt32LE(0x4e4f534a, 4);
    const stats = glbStats(Buffer.concat([header, chunk, Buffer.from(padded)]));
    assert.equal(stats.triangles, 12);
    assert.deepEqual(stats.size, [2, 2, 2]);
});

test('le nom ne peut pas venir d une phrase du contexte', () => {
    const body = '## Contexte\nMeme nom, meme dossier : le glb et l asset.json ecrasent le placeholder.\n\n## A faire\n- Nom : `track_segment`, categorie `environment`\n- Dimensions cibles : 2 x 0.3 x 4 m\n- Recherche : road segment, platform\n- Usage : la piste';
    const query = parseArtTicket(body);
    assert.equal(query.name, 'track_segment');
    assert.equal(query.category, 'environment');
    assert.equal(query.keywords[0], 'road segment');
});
