import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibility } from './steps/scan.mjs';
import { pendingReleases } from './steps/scan-release.mjs';
import { pipelineConfig } from './pipelines.mjs';
import { buildTrace } from './lib/traces.mjs';

const dev = pipelineConfig('dev');
const issue = (labels, body = '') => ({ number: 1, labels: labels.map((name) => ({ name })), body, created_at: '2026-01-01' });
const c = (body) => ({ body, created_at: new Date().toISOString() });

test('prend un todo:* sans verrou', () => {
    assert.ok(eligibility(issue(['todo:gameplay']), [], dev).ok);
    assert.equal(eligibility(issue(['todo:gameplay']), [], dev).priority, 0);
    assert.equal(eligibility(issue(['todo:ui', 'priority:high']), [], dev).priority, 1);
});

test('refuse verrou, done, blocked, needs-human, mauvais label', () => {
    for (const labels of [['todo:ui', 'in-progress'], ['todo:ui', 'done'], ['todo:ui', 'blocked'], ['todo:ui', 'needs-human'], ['todo:ui', 'approved'], ['triage']]) {
        assert.ok(!eligibility(issue(labels), [], dev).ok, labels.join(','));
    }
});

test('needs-human:art n exclut pas (le placeholder continue sa route)', () => {
    assert.ok(eligibility(issue(['todo:ui', 'needs-human:art']), [], dev).ok);
});

test('tentatives epuisees → exhaust', () => {
    const comments = [1, 2, 3].map(() => c(buildTrace('run', { pipeline: 'dev', cost_usd: 1 })));
    const verdict = eligibility(issue(['todo:ui']), comments, dev);
    assert.ok(!verdict.ok && verdict.exhaust);
});

test('budget du ticket epuise → exhaust', () => {
    const comments = [c(buildTrace('run', { pipeline: 'dev', cost_usd: 31 }))];
    assert.ok(eligibility(issue(['todo:ui']), comments, dev).exhaust);
});

test('dependances non terminees', () => {
    const verdict = eligibility(issue(['todo:ui'], 'Depends on #4'), [], dev, { doneNumbers: new Set([5]) });
    assert.ok(!verdict.ok && /#4/.test(verdict.reason));
    assert.ok(eligibility(issue(['todo:ui'], 'Depends on #4'), [], dev, { doneNumbers: new Set([4]) }).ok);
});

test('passes de review epuisees', () => {
    const review = pipelineConfig('review');
    const comments = [1, 2, 3].map(() => c(buildTrace('review', { sha: 'x' })));
    assert.ok(eligibility(issue(['review']), comments, review).exhaust);
});

test('overrides par variable d environnement', () => {
    process.env.GF_DEV_MAX_COST_USD = '4';
    assert.equal(pipelineConfig('dev').budget.maxCostUsd, 4);
    delete process.env.GF_DEV_MAX_COST_USD;
});

test('releases en attente de QA', () => {
    const releases = [
        { tag_name: 'build-1', body: buildTrace('qa', { build: 'build-1' }), created_at: '2026-01-01' },
        { tag_name: 'build-2', body: '', created_at: '2026-01-02' },
        { tag_name: 'v1.0', body: '', created_at: '2026-01-03' },
    ];
    assert.deepEqual(pendingReleases(releases).map((release) => release.tag_name), ['build-2']);
});
