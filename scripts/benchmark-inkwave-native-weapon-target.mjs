#!/usr/bin/env node
// Limited Character.update CPU experiment. Not full-battle or device FPS evidence.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {nativeWeaponTargetPair, NATIVE_WEAPON_TARGET_BASE, NATIVE_WEAPON_TARGET_FIXTURE_SHA256}
  from '../patches/local-quality/tests/native-weapon-target-fixture.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output'))
  throw Error('Usage: node --experimental-vm-modules scripts/benchmark-inkwave-native-weapon-target.mjs [--output report.json]');
const output = path.resolve(args[1] || '.benchmark-evidence/native-weapon-target.json');
const startedAt = new Date().toISOString(), apis = await nativeWeaponTargetPair();
try {
  const actors = [];
  for (const api of apis) {
    const batch = [];
    for (let i = 0; i < 8; i++) batch.push(await api.make());
    actors.push(batch);
  }
  const inputs = actors.map(batch => batch.map(() => ({form: 'kid', grounded: true, speed: 3.4,
    localMove: {x: 0, z: 1}, firing: false, ink: 1, hp: 1, aimPitch: .15})));
  for (let k = 0; k < 2; k++) for (let i = 0; i < 8; i++) {
    const ch = actors[k][i].character;
    ch.tr.fill(99); ch.fidget = -1; ch.root.position.x = i * 2; ch.sourceMotion.action = null;
  }
  const tick = (side, count) => {
    for (let frame = 0; frame < count; frame++) {
      apis[side].G.time += 1 / 60;
      for (let i = 0; i < 8; i++) {
        const ch = actors[side][i].character;
        ch.root.position.z += 3.4 / 60; ch.update(1 / 60, inputs[side][i]);
      }
    }
  };
  tick(0, 150); tick(1, 150);
  for (const batch of actors) for (const actor of batch) {
    assert.equal(actor.character.sourceMotion.active, true);
    assert.equal(actor.character.sourceMotion.keepSourceArms, true);
  }
  const measurementStart = new Date().toISOString(), pairs = [];
  for (let repetition = 0; repetition < 9; repetition++) {
    const pair = [];
    for (const side of repetition % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now(); tick(side, 120); pair[side] = performance.now() - start;
    }
    pairs.push({before: pair[0], after: pair[1], ratio: pair[1] / pair[0]});
  }
  const median = values => [...values].sort((a, b) => a - b)[values.length >> 1];
  const report = {startedAt, measurementStart, measurementEnd: new Date().toISOString(),
    baseline: NATIVE_WEAPON_TARGET_BASE, fixtureSha256: NATIVE_WEAPON_TARGET_FIXTURE_SHA256,
    scope: '8 actual source-loaded Characters, 120 x 60Hz update ticks, no rendering or full match',
    pairs, medianBefore: median(pairs.map(pair => pair.before)),
    medianAfter: median(pairs.map(pair => pair.after)), medianPairedRatio: median(pairs.map(pair => pair.ratio))};
  fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { apis.forEach(api => api.reset()); }
