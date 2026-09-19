import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNumber, lastBuild, releaseSha } from './steps/scan-build.mjs';
import { apkPath } from './steps/build.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('buildNumber lit le numero du tag', () => {
    assert.equal(buildNumber('build-12'), 12);
    assert.equal(buildNumber('build-3-hotfix'), 3);
    assert.equal(buildNumber('v1.0'), 0);
});

test('lastBuild trie sur le numero, pas sur la date', () => {
    const releases = [
        { tag_name: 'build-9', created_at: '2026-09-19T10:00:00Z' },
        { tag_name: 'build-10', created_at: '2026-09-18T10:00:00Z' },
        { tag_name: 'v1.0', created_at: '2026-09-20T10:00:00Z' },
    ];
    assert.equal(lastBuild(releases).tag_name, 'build-10');
    assert.equal(lastBuild([]), null);
});

test('releaseSha prefere la trace a target_commitish', () => {
    assert.equal(releaseSha({ body: '<!-- gf:build sha=abc123 branch=develop -->', target_commitish: 'develop' }), 'abc123');
    assert.equal(releaseSha({ body: 'rien', target_commitish: 'deadbeef' }), 'deadbeef');
    assert.equal(releaseSha(null), null);
});

test('apkPath suit export_path du preset', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gf-apk-'));
    writeFileSync(join(dir, 'export_presets.cfg'), 'name="Android"\nexport_path="build/pin-rescue.apk"\n');
    assert.equal(apkPath(dir), join(dir, 'build/pin-rescue.apk'));
    const empty = mkdtempSync(join(tmpdir(), 'gf-apk-'));
    assert.equal(apkPath(empty), join(empty, 'build/game-debug.apk'));
});
