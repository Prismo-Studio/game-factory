import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingWork } from './steps/scan-promote.mjs';

const issue = (number, ...labels) => ({ number, labels: labels.map((name) => ({ name })) });

test('un ticket en file, en revue ou verrouille retient la promotion', () => {
    assert.equal(pendingWork([issue(1, 'todo:gameplay')]).length, 1);
    assert.equal(pendingWork([issue(2, 'review')]).length, 1);
    assert.equal(pendingWork([issue(3, 'in-progress')]).length, 1);
});

test('un ticket qui attend un humain ne retient pas la promotion', () => {
    // Sinon un ticket needs-human jamais traite bloquerait la boucle pour toujours.
    assert.deepEqual(pendingWork([issue(4, 'needs-human'), issue(5, 'needs-human:art'), issue(6, 'spec:done')]), []);
});

test('file vide : la promotion part', () => {
    assert.deepEqual(pendingWork([]), []);
});
