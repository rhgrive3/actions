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
