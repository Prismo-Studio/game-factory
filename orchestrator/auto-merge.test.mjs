import test from 'node:test';
import assert from 'node:assert/strict';

// La regle testee est celle du verrou : un ticket refuse ne se fusionne pas, meme s il porte
// encore le feu vert d une passe precedente. Reproduit la logique de mergeable() sur les labels
// du ticket, la partie de la fonction qui depend du reseau n etant pas testable ici.
const REFUS = ['needs-human', 'needs-human:art', 'blocked'];
const FEU_VERT = ['review:handled', 'approved'];
const verdict = (labels) => labels.find((l) => REFUS.includes(l)) ?? (labels.some((l) => FEU_VERT.includes(l)) ? null : 'pas review:handled');

test('un ticket refuse bloque le merge meme avec un feu vert residuel', () => {
    assert.equal(verdict(['review:handled', 'needs-human']), 'needs-human');
    assert.equal(verdict(['approved', 'blocked']), 'blocked');
    assert.equal(verdict(['review:handled', 'needs-human:art']), 'needs-human:art');
});

test('un ticket valide passe', () => {
    assert.equal(verdict(['review:handled']), null);
    assert.equal(verdict(['approved']), null);
});

test('sans feu vert, pas de merge', () => {
    assert.equal(verdict(['todo:ui']), 'pas review:handled');
});
