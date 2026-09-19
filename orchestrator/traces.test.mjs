import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alreadyReviewed, attempts, buildTrace, costSpent, dependencies, parseTraces, reviewPasses } from './lib/traces.mjs';

const c = (body, daysAgo = 0) => ({ body, created_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString() });

test('build/parse aller-retour', () => {
    const trace = buildTrace('run', { pipeline: 'dev', attempt: 2, cost_usd: '1.42', status: 'SUCCESS', model: 'claude sonnet' });
    const [parsed] = parseTraces(`texte avant\n${trace}\ntexte apres`);
    assert.deepEqual(parsed, { kind: 'run', attrs: { pipeline: 'dev', attempt: '2', cost_usd: '1.42', status: 'SUCCESS', model: 'claude sonnet' } });
});

test('compteur de tentatives et cout par pipeline', () => {
    const comments = [c(buildTrace('run', { pipeline: 'dev', cost_usd: 1 }), 3), c(buildTrace('run', { pipeline: 'dev', cost_usd: 2.5 }), 2), c(buildTrace('run', { pipeline: 'review', cost_usd: 4 }), 1)];
    assert.equal(attempts(comments, 'dev'), 2);
    assert.equal(attempts(comments, 'review'), 1);
    assert.equal(costSpent(comments, 'dev'), 3.5);
    assert.equal(costSpent(comments), 7.5);
});

test('reset remet le compteur a zero', () => {
    const comments = [c(buildTrace('run', { pipeline: 'dev', cost_usd: 9 }), 3), c(buildTrace('reset', {}), 2), c(buildTrace('run', { pipeline: 'dev', cost_usd: 1 }), 1)];
    assert.equal(attempts(comments, 'dev'), 1);
    assert.equal(costSpent(comments, 'dev'), 1);
});

test('anti-rejeu de review', () => {
    const comments = [c(buildTrace('review', { sha: 'abc1234', verdict: 'changes' }))];
    assert.ok(alreadyReviewed(comments, 'abc1234'));
    assert.ok(!alreadyReviewed(comments, 'def5678'));
    assert.equal(reviewPasses(comments), 1);
});

test('dependances dans le corps', () => {
    assert.deepEqual(dependencies('Depends on #12, #13\nDepends on: #7'), [12, 13, 7]);
    assert.deepEqual(dependencies('rien'), []);
});
