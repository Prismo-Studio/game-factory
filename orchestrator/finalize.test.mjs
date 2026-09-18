import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffViolations } from './steps/finalize.mjs';

test('diff propre', () => {
    assert.deepEqual(diffViolations(['game/gameplay/player.gd', 'tests/unit/test_player.gd'], { diffText: '+var speed: float = 3.0' }), []);
});

test('fichiers proteges et secrets', () => {
    assert.ok(diffViolations(['.github/workflows/ci.yml']).length);
    assert.ok(diffViolations(['addons/admob/plugin.gd']).length);
    assert.ok(diffViolations(['game/core/ads_service.gd']).length);
    assert.ok(diffViolations(['x.gd'], { diffText: '+const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"' }).length);
    assert.ok(diffViolations(['x.gd'], { diffText: '+ca-app-pub-1234567890123456~1234567890' }).length);
    assert.equal(diffViolations(['x.gd'], { diffText: '+ca-app-pub-3940256099942544~3347511713' }).length, 0, 'les identifiants de test AdMob passent');
    assert.ok(diffViolations(['big.glb'], { sizes: { 'big.glb': 3 * 1024 * 1024 } }).length);
});

test('project.godot : autoloads et inputs seulement', () => {
    const ok = '+[autoload]\n+Spawner="*res://game/gameplay/spawner.gd"\n+[input]\n+jump={\n+"deadzone": 0.5,\n+"events": [Object(InputEventKey,"keycode":32)]\n+}';
    assert.deepEqual(diffViolations(['project.godot'], { diffText: ok }), []);
    const bad = '+[rendering]\n+renderer/rendering_method="mobile"';
    assert.ok(diffViolations(['project.godot'], { diffText: bad }).length);
});
