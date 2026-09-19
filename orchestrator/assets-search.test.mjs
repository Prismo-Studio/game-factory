import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArtTicket, scoreAsset, searchLocalIndex } from './lib/assets.mjs';

const asset = (name, tags, file = 'pack/x.glb') => ({ name, tags, file, triangles: 100 });
const ticket = (name, category, search) => parseArtTicket(`- Nom : \`${name}\`\n- Categorie : \`${category}\`\n- Dimensions : 1 x 1 x 1\n- Recherche : ${search}\n`);

test('le nom exact bat le nom qui contient le mot-cle', () => {
    const query = ticket('hero', 'characters', 'knight, adventurer, barbarian');
    const hero = asset('barbarian', ['barbarian', 'characters', 'adventurers']);
    const shield = asset('shield_round_barbarian', ['shield', 'round', 'barbarian', 'adventurers']);
    assert.ok(scoreAsset(hero, query) > scoreAsset(shield, query));
    assert.equal(searchLocalIndex(query, { assets: [shield, hero] })[0].name, 'barbarian');
});

test('la categorie du ticket departage deux modeles egaux par ailleurs', () => {
    const query = ticket('hero', 'characters', 'knight');
    const inCharacters = asset('knight', ['knight', 'characters']);
    const elsewhere = asset('knight', ['knight', 'banners']);
    assert.ok(scoreAsset(inCharacters, query) > scoreAsset(elsewhere, query));
});

test('a egalite, le nom le plus court gagne', () => {
    const query = ticket('wall', 'environment', 'wall');
    assert.ok(scoreAsset(asset('wall', ['wall']), query) > scoreAsset(asset('wall_archedwindow_gated_scaffold', ['wall']), query));
});

test('aucun mot-cle ne correspond : le modele est ecarte', () => {
    assert.equal(scoreAsset(asset('torch', ['torch']), ticket('hero', 'characters', 'knight')), 0);
    assert.deepEqual(searchLocalIndex(ticket('hero', 'characters', 'knight'), { assets: [asset('torch', ['torch'])] }), []);
});
