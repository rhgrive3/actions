import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { replaceOnce, adaptSource, checkCompatibility } from '../adapter.mjs';
const publicRoot = process.env.INKWAVE_UPSTREAM_SOURCE ? pathToFileURL(process.env.INKWAVE_UPSTREAM_SOURCE + '/') : new URL('../../../inkwave-public/', import.meta.url);
test('upstream compatibility matches the audited original; patches do not edit source', () => {
  assert.doesNotThrow(() => checkCompatibility(fileURLToPath(publicRoot)));
  const actor = fs.readFileSync(new URL('src/game/actor.js', publicRoot), 'utf8');
  assert.ok(!actor.includes('beforeActions'));
  const generated = adaptSource('src/game/actor.js', actor);
  assert.ok(generated.includes('beforeActions(this, dt, jumpPressed)'));
  assert.ok(generated.includes('!actionHandled && this.jumpBuffer'));
});
test('missing or duplicated upstream connections fail closed', () => {
  assert.throws(() => replaceOnce('no-hook', 'hook!', 'replacement', 'test'), /conflict/);
  assert.throws(() => replaceOnce('hook!hook!', 'hook!', 'replacement', 'test'), /conflict/);
  assert.throws(() => adaptSource('src/main.js', ''), /conflict/);
  assert.throws(() => adaptSource('index.html', '<html>'), /conflict/);
});
test('an upstream change to the planted-leg reach connection stops the build', () => {
  const character = fs.readFileSync(new URL('src/game/character.js', publicRoot), 'utf8');
  const anchor = 'const d = _v5.length(), mxr = this.legReach * 0.97;';
  assert.throws(() => adaptSource('src/game/character.js', character.replace(anchor, 'const d = _v5.length(), mxr = this.legReach * 0.95;')), /walking planted ankle reach/);
  assert.throws(() => adaptSource('src/game/character.js', character + '\n' + anchor), /walking planted ankle reach/);
});
test('walking support pelvis correction requires its unique native drop connection', () => {
  const character = fs.readFileSync(new URL('src/game/character.js', publicRoot), 'utf8');
  const anchor = 'B.hips.position.y -= Math.max(drop * 0.85, this.hipDrop);';
  assert.throws(() => adaptSource('src/game/character.js', character.replace(anchor, 'B.hips.position.y -= drop;')), /walking support pelvis reach/);
  assert.throws(() => adaptSource('src/game/character.js', character + '\n' + anchor), /walking support pelvis reach/);
});
test('bomb sampling requires the exact native pose functions and captures them before decoration', () => {
  const character = fs.readFileSync(new URL('src/game/character.js', publicRoot), 'utf8');
  assert.throws(() => adaptSource('src/game/character.js', character.replace('  _poseThrow(P, tt) {', '  _changedThrow(P, tt) {')), /native bomb throw pose/);
  assert.throws(() => adaptSource('src/game/character.js', character + '\n  _applyPose(dt, s) {'), /native bomb pose application/);
});
test('bomb preview and creation connections fail closed on upstream changes', () => {
  const weapons = fs.readFileSync(new URL('src/game/weapons.js', publicRoot), 'utf8');
  for (const [anchor, label] of [
    ['const pos = _v.copy(a.pos); pos.y += 1.35;', 'bomb release origin'],
    ['const p = _v.copy(a.pos); p.y += 1.35;', 'bomb preview origin'],
    ['        vel.y -= 24 * dt;', 'bomb preview gravity'],
  ]) {
    assert.throws(() => adaptSource('src/game/weapons.js', weapons.replace(anchor, '/* upstream changed */')), new RegExp(label));
    assert.throws(() => adaptSource('src/game/weapons.js', weapons + '\n' + anchor), new RegExp(label));
  }
});
test('the deployment entry always installs patches before importing the game', () => {
  const html = fs.readFileSync(new URL('index.html', publicRoot), 'utf8');
  const built = adaptSource('index.html', html);
  assert.ok(built.includes('src="./patches/splatoon3/bootstrap.mjs"'));
  assert.ok(!built.includes('src="./src/main.js"'));
  const main = adaptSource('src/main.js', fs.readFileSync(new URL('src/main.js', publicRoot), 'utf8'));
  assert.ok(main.includes('installGame(Game);\nconst game'));
  assert.ok(main.includes('runSimulation(this, dt)'));
  assert.ok(!main.includes('dt = Math.min(dt, 1 / 24)'));
});

test('special foot-plant ownership requires its unique upstream timer boundary', () => {
  const character = fs.readFileSync(new URL('src/game/character.js', publicRoot), 'utf8');
  const anchor = 'this.tr[T_LEAP] > 1.9 && this.tr[T_SLAM] > 1.4';
  assert.throws(() => adaptSource('src/game/character.js', character.replace(anchor, 'true')), /special foot-plant ownership/);
  assert.throws(() => adaptSource('src/game/character.js', character + '\n' + anchor), /special foot-plant ownership/);
});
