// #579 build contract: adaptMapLook connects through two exact anchors, changes
// nothing else in the composed tree, and fails closed if it is ever applied
// twice. No virtual machine is started here — these are pure source checks, so
// they are the cheapest possible guard on the build connection.
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptMapLook } from '../map-look.mjs';
import { RELIABILITY_ROOT, reliabilityIdentity } from '../adapter.mjs';
import { composed } from './map-look-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UP = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');

const CLASS_LINE = 'export class PlayerController {';
const MAP_UP_LINE = "    const mapUp = (G.rig?.mapK ?? 0) > 0.05 || inp.down('Tab') || inp.down('KeyM') || inp.padButton(8) || !!touch?.mapOpen;";
const CALL_LINE = '    maintainPadLook(this, inp, mapUp, dt);';
const CALL_COMMENT = '    // #579: keep the gameplay filter tracking the live stick while the map suppresses it.';
const CALL_BLOCK = CALL_COMMENT + '\n' + CALL_LINE + '\n';
const CALL_SITE = MAP_UP_LINE + '\n' + CALL_BLOCK;

// Split the composed source back into (helper injected above the class, source
// with the call block removed) so both insertions can be isolated exactly.
function splitInsertions(patched, bare) {
  const bareAt = bare.indexOf(CLASS_LINE), at = patched.indexOf(CLASS_LINE);
  assert.ok(bareAt >= 0 && at >= 0, 'PlayerController must be declared once in each composition');
  assert.equal(patched.slice(0, bareAt), bare.slice(0, bareAt), 'everything before the class must be untouched');
  const helper = patched.slice(bareAt, at);
  let body = patched.slice(0, bareAt) + patched.slice(at);
  const callAt = body.indexOf(CALL_BLOCK);
  assert.ok(callAt >= 0, 'the maintenance call must be present');
  body = body.slice(0, callAt) + body.slice(callAt + CALL_BLOCK.length);
  return { helper, body };
}

test('the dispatcher runs adaptMapLook and the identity list hashes map-look.mjs', () => {
  const dispatcher = fs.readFileSync(path.join(RELIABILITY_ROOT, 'adapter.mjs'), 'utf8');
  assert.match(dispatcher, /import \{ adaptMapLook \} from '\.\/map-look\.mjs';/);
  const order = dispatcher.match(/const adapters = \[([^\]]+)\]/)?.[1].split(',').map(s => s.trim());
  assert.ok(Array.isArray(order), 'adapter dispatcher must declare its list');
  assert.equal(order.at(-1), 'adaptMapLook', 'look maintenance must run after input ownership/pause adapters');
  const identity = reliabilityIdentity();
  assert.ok('map-look.mjs' in identity, 'identity must cover map-look.mjs so drift fails closed');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(RELIABILITY_ROOT, 'map-look.mjs'))).digest('hex');
  assert.equal(identity['map-look.mjs'], hash);
});

test('composition delta is exactly the helper block plus one maintenance call', () => {
  const bare = composed('src/game/player.js', false);
  const patched = composed('src/game/player.js', true);
  const { helper, body } = splitInsertions(patched, bare);

  assert.ok(helper.startsWith('// #579:'), 'the injected helper must carry its issue marker');
  assert.ok(helper.endsWith('}\n'), 'the injected helper must be a complete declaration');
  assert.equal(body, bare, 'every other byte of player.js must be untouched');
  assert.ok(patched.includes(CALL_SITE), 'the call must connect right after the mapUp line');
  assert.equal(patched.split(CALL_LINE).length - 1, 1, 'exactly one maintenance call');
  assert.equal(patched.split('function maintainPadLook').length - 1, 1, 'exactly one maintenance helper');

  // Placement: right after mapUp, before the map-suppressed look branch. The gate
  // itself is matched loosely because open input-ownership PRs rewrite it to
  // `if (usingPad && !mapUp) {` without changing where the maintenance must sit.
  const gate = patched.indexOf('!mapUp) {');
  assert.ok(gate >= 0, 'the map-suppressed look branch must exist');
  assert.ok(patched.indexOf(CALL_LINE) < gate, 'the call must run before the map-suppressed look branch');
  assert.ok(patched.indexOf(CALL_LINE) > patched.indexOf('if (!this.enabled) {'), 'the call must run after the disabled-controller early return');
});

test('adaptMapLook leaves every other module byte-identical', () => {
  for (const rel of ['src/core/input.js', 'src/main.js', 'src/game/actor.js', 'src/game/weapons.js', 'src/game/cameraRig.js', 'index.html']) {
    assert.equal(adaptMapLook(rel, 'SENTINEL'), 'SENTINEL', `${rel} must not be touched`);
  }
});

test('a second application fails closed instead of duplicating the call', () => {
  const raw = fs.readFileSync(path.join(UP, 'src/game/player.js'), 'utf8');
  const once = adaptMapLook('src/game/player.js', raw);
  assert.ok(once.includes(CALL_LINE));
  assert.throws(() => adaptMapLook('src/game/player.js', once), /map-look conflict/);
  assert.throws(() => adaptMapLook('src/game/player.js', composed('src/game/player.js', true)), /map-look conflict/);
});

test('the injected filter step matches the gameplay branch and never touches the camera', () => {
  const { helper } = splitInsertions(composed('src/game/player.js', true), composed('src/game/player.js', false));

  // Same response curve: the helper calls the native lookCurve instead of keeping
  // a second copy that could drift.
  assert.ok(helper.includes('lookCurve(_mapStick.mag)'), 'the helper must use the native response curve');
  assert.ok(!helper.includes('function lookCurve'), 'no duplicate curve may be introduced');
  for (const expr of [
    'inp.padStick(2, 3, _mapStick, 0.11, 0.96)',
    '_mapStick.mag > 0.93',
    'Math.min(0.5, c.edgeT + dt)',
    'c.edgeT = Math.max(0, c.edgeT - dt * 3)',
    '1 - Math.exp(-60 * dt)',
    'c.padLook.x += (_mapStick.x * mc - c.padLook.x) * k',
    'c.padLook.y += (_mapStick.y * mc - c.padLook.y) * k',
  ]) assert.ok(helper.includes(expr), `the maintained filter must keep the native step: ${expr}`);

  assert.ok(!helper.includes('rig.'), 'map-cursor stick input must never reach the gameplay camera');
  assert.ok(!helper.includes('padPressed'), 'no gamepad edge may be synthesized');
  assert.ok(!helper.includes('wasPressed'), 'no button edge may be synthesized');
  assert.ok(!helper.includes('lastDevice'), 'device ownership must not be rewritten');
});

test('player.js stays self-contained so the published tree needs no new runtime file', () => {
  const patched = composed('src/game/player.js', true);
  const imports = [...patched.matchAll(/^import[^;]*;/gm)].map(m => m[0]);
  const bare = [...composed('src/game/player.js', false).matchAll(/^import[^;]*;/gm)].map(m => m[0]);
  assert.deepEqual(imports, bare, 'adaptMapLook must not add a module the built site would have to ship');
  assert.ok(!patched.includes('patches/reliability/'), 'the built site copies no patches/reliability runtime files');
});
