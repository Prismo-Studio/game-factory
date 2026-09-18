import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandDenial, pathDenial, qaBashDenial, readonlyBashDenial } from './hooks/rules.mjs';

test('profil write : commandes interdites', () => {
    for (const command of ['git push origin main', 'git commit --no-verify', 'curl https://x', 'npm install foo', 'apt-get install x', 'git checkout main', 'git reset --hard', 'adb devices', 'godot --export-release Android x.apk']) {
        assert.ok(commandDenial(command, { profile: 'write' }), `devrait refuser : ${command}`);
    }
});

test('profil write : commandes autorisees', () => {
    for (const command of ['godot --headless --path . --import', 'make check', 'git status', 'git diff', 'git commit -m "feat(#3): x"', 'ls game/', 'python3 tools/asset_check.py']) {
        assert.equal(commandDenial(command, { profile: 'write' }), null, `devrait accepter : ${command}`);
    }
});

test('profil write : ecriture sur fichier protege via Bash', () => {
    assert.ok(commandDenial('echo x > export_presets.cfg', { profile: 'write' }));
    assert.ok(commandDenial('sed -i s/a/b/ .github/workflows/ci.yml', { profile: 'write' }));
    assert.ok(commandDenial('cp x game/core/save_service.gd', { profile: 'write' }));
    assert.equal(commandDenial('cat export_presets.cfg', { profile: 'write' }), null);
});

test('profil write : chemins', () => {
    const ws = '/work/repo';
    assert.ok(pathDenial('/work/other/x.gd', ws));
    assert.ok(pathDenial('/work/repo/.github/workflows/ci.yml', ws));
    assert.ok(pathDenial('/work/repo/addons/gut/x.gd', ws));
    assert.ok(pathDenial('/work/repo/game/core/ads_service.gd', ws));
    assert.ok(pathDenial('/work/repo/keystore/release.keystore', ws));
    assert.ok(pathDenial('/work/repo/CLAUDE.md', ws));
    assert.equal(pathDenial('/work/repo/game/gameplay/player.gd', ws), null);
    assert.equal(pathDenial('/work/repo/project.godot', ws), null);
    assert.equal(pathDenial('/work/repo/game/data/balance.tres', ws), null);
});

test('profil read-only : git en lecture seulement', () => {
    assert.equal(readonlyBashDenial('git log --oneline -20'), null);
    assert.equal(readonlyBashDenial('git blame game/main.gd'), null);
    assert.ok(readonlyBashDenial('git log | head'));
    assert.ok(readonlyBashDenial('cat game/main.gd'));
    assert.ok(readonlyBashDenial('git push'));
    assert.ok(readonlyBashDenial('git log $(cat x)'));
});

test('profil qa : liste blanche', () => {
    assert.equal(qaBashDenial('adb devices'), null);
    assert.equal(qaBashDenial('adb install -r build/build-12.apk'), null);
    assert.equal(qaBashDenial('adb shell screencap -p /sdcard/s.png'), null);
    assert.equal(qaBashDenial('godot --headless --path . -s tests/run.gd'), null);
    assert.equal(qaBashDenial('maestro test maestro/smoke.yaml'), null);
    assert.ok(qaBashDenial('adb shell rm -rf /sdcard'));
    assert.ok(qaBashDenial('adb install evil.apk'));
    assert.ok(qaBashDenial('curl http://x'));
    assert.ok(qaBashDenial('git push'));
});
