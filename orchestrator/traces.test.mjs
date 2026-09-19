import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alreadyReviewed, attempts, buildTrace, claimsIn, costSpent, dependencies, parseTraces, reviewPasses } from './lib/traces.mjs';

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

test('une revendication cloturee par un rapport ne bloque plus les runs suivants', () => {
    const now = Date.now();
    const comments = [
        { body: buildTrace('claim', { pipeline: 'triage', run: '1' }), created_at: new Date(now - 9 * 60_000).toISOString() },
        { body: buildTrace('run', { pipeline: 'triage', status: 'BLOCKED' }), created_at: new Date(now - 9 * 60_000).toISOString() },
        { body: buildTrace('claim', { pipeline: 'triage', run: '2' }), created_at: new Date(now - 10_000).toISOString() },
    ];
    const alive = claimsIn(comments, 'triage', 15 * 60_000, now);
    assert.equal(alive.length, 1);
    assert.equal(alive[0].attrs.run, '2');
});
