// Issue #580 — build-chain composition (cheap, native, no browser).
// finish-tape.test.mjs proves the adapter alone; this file proves it still applies when the real
// scripts/build-inkwave.mjs chain runs: splatoon3 -> touch-layout -> reliability -> local-quality.
// If an upstream adapter moved one of the six anchors, replaceOnceFinish throws here instead of
// the shipped build silently keeping the TIME'S UP card.
//
// Presentation only, checked structurally: the `playing -> finish -> judge` trigger in main.js and
// the boss early-return in hud.js must survive composition untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { adaptFinishTape } from '../finish-tape-adapter.mjs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const compose = (rel, code = read('inkwave-public/' + rel)) =>
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

test('composed hud.js ships the Finish tape instead of the two-splat TIME\'S UP card', () => {
  const hud = compose('src/ui/hud.js');
  assert.ok(hud.includes(`timesup: 'FINISH!'`), 'reference word survives the chain');
  assert.ok(hud.includes('iw-bn--finish') && hud.includes('iw-bn__tape'), 'tape markup survives the chain');
  assert.ok(!hud.includes('iw-bn--timesup'), 'the old splat card is gone from the build output');
  assert.ok(!hud.includes(`timesup: "TIME'S UP!"`), 'no TIME\'S UP default left in the build output');
  // team-neutral finish treatment, and it must stay after the boss guard
  const early = hud.indexOf(`if (kind === 'timesup' && this.boss.timesUp())`);
  const branch = hud.indexOf(`} else if (k === 'timesup') {`);
  assert.ok(early > 0 && branch > early, 'boss early-return still precedes the finish branch');
  const slice = hud.slice(branch, hud.indexOf(`} else if (k === 'one_minute') {`));
  for (const teamish of ['iw-fself', 'iw-fenemy', 'splatSVG']) {
    assert.ok(!slice.includes(teamish), `composed finish treatment stays team-neutral (${teamish})`);
  }
  // the tape holds for the whole finish phase and is dropped only at the judge hand-over
  assert.ok(hud.includes(`if (k !== 'timesup') {`), 'auto-removal skipped for the tape');
  assert.ok(hud.includes(`if (state === 'judge') this.clearFinishTape();`), 'judge clears the tape');
});

test('composed styles/hud.css gains the tape rules append-only', () => {
  const raw = read('inkwave-public/styles/hud.css');
  const css = compose('styles/hud.css');
  const tape = adaptFinishTape('styles/hud.css', '');
  assert.equal(adaptFinishTape('styles/hud.css', raw), raw + tape, 'the finish owner only appends its rules');
  assert.equal(css.split(tape).length - 1, 1, 'the exact appended tape survives all other CSS owners once');
  assert.ok(css.includes('.iw-bn--finish') && css.includes('@keyframes iw-bn-fin'), 'tape CSS present');
  assert.ok(css.includes('repeating-linear-gradient(115deg'), 'striped ribbon present');
});

test('main.js keeps the authoritative playing -> finish -> judge trigger', () => {
  const main = compose('src/main.js');
  assert.equal((main.match(/this\.hud\?\.banner\('timesup'\);/g) || []).length, 1,
    'the finish trigger call site is untouched');
  assert.ok(main.includes(`state === 'finish'`), 'finish state handling intact');
});

test('a second quality pass throws instead of double-applying (wired guard)', () => {
  assert.throws(() => adaptQualitySource('src/ui/hud.js', compose('src/ui/hud.js')),
    /quality patch conflict/, 'hud.js double-apply guarded through the real chain');
  assert.throws(() => adaptQualitySource('styles/hud.css', compose('styles/hud.css')),
    /quality patch conflict/, 'hud.css double-apply guarded through the real chain');
});

test('the adapter is part of the local-quality build identity', () => {
  const identity = qualityIdentity();
  assert.ok(identity['finish-tape-adapter.mjs'], 'finish-tape adapter is hashed into the build identity');
  assert.ok(identity['finish-tape-adapter.mjs'].length === 64, 'sha256 hex digest');
  assert.equal(identity['finish-tape-adapter.mjs'],
    crypto.createHash('sha256')
      .update(fs.readFileSync(new URL('../finish-tape-adapter.mjs', import.meta.url))).digest('hex'),
    'digest matches the shipped adapter bytes');
});
