import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAgainstSchema } from './runners/llm.mjs';
import { extractJsonFromText } from './runners/claude-code.mjs';
import { readFileSync } from 'node:fs';

const triage = JSON.parse(readFileSync(new URL('../pipelines/triage/schema.json', import.meta.url), 'utf8'));

test('schema triage', () => {
    assert.deepEqual(validateAgainstSchema({ label: 'todo:ui', justification: 'ecran' }, triage), []);
    assert.ok(validateAgainstSchema({ label: 'todo:backend', justification: 'x' }, triage).length);
    assert.ok(validateAgainstSchema({ justification: 'x' }, triage).length);
});

test('extraction JSON depuis une reponse', () => {
    assert.deepEqual(extractJsonFromText('Voici :\n```json\n{"a":1}\n```\nmerci'), { a: 1 });
    assert.deepEqual(extractJsonFromText('blabla {"a":{"b":2}} fin'), { a: { b: 2 } });
    assert.equal(extractJsonFromText('rien'), null);
});
