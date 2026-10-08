import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from '../../../scripts/weapons-fixture.mjs';
import { adaptSource } from '../adapter.mjs';

test('#891 full production composition uses the pinned Dualies normal-fire bias and fixed-frame recovery', async () => {
  const f = await fixture({ fidelity: true, network: true });
  const a = f.make('dualies');
  const other = f.make('dualies');
  const runner = a.weaponRunner;
  const initial = runner.s3DualiesFireBiasState(a.weapon);
  assert.equal(initial.supported, true);
  assert.equal(initial.bias, 0.01);
  assert.equal(initial.distribution, 'unknown');
  assert.ok(f.sourceFiles.some(file => file.endsWith('/patches/splatoon3/runtime/dualies-fire-bias.mjs')),
    'the production fixture must load the independent firing-bias module');

  f.context.Math.random = () => 0;
  for (let frame = 0; frame < 10 && runner.s3DualiesFireBiasShotCount === 0; frame++)
    f.tick(a, { fire: true });
  assert.equal(runner.s3DualiesFireBiasSampleOuter, true,
    'the current 1% state controls the production projectile sample');
  f.context.Math.random = () => 0.99;
  for (let frame = 0; frame < 200 && runner.s3DualiesFireBiasShotCount < 24; frame++)
    f.tick(a, { fire: true });
  assert.equal(runner.s3DualiesFireBiasShotCount, 24);
  assert.equal(runner.s3DualiesFireBias, 0.25, 'the sourced maximum takes 24 increments from its 1% minimum');
  assert.equal(other.weaponRunner.s3DualiesFireBias, 0.01,
    'bias and release clocks are isolated per WeaponRunner');
  assert.equal(runner._spreadDeg(a.weapon), 2, 'the grounded angular envelope stays at its sourced endpoint');
  assert.equal(runner.s3DualiesFireBiasSampleOuter, false,
    'the 25% authoritative state is used by the forced 99% non-outer sample');

  const shotsAtCap = f.fires.length;
  a.ink = 0;
  for (let frame = 0; frame < 6; frame++) f.tick(a, { fire: true });
  assert.equal(f.fires.length, shotsAtCap, 'empty clicks do not count as successful bias increments');
  assert.equal(runner.s3DualiesFireBias, 0.25);

  for (let frame = 0; frame < 5; frame++) f.tick(a, { fire: false });
  assert.equal(runner.s3DualiesFireBias, 0.25, 'the first five release frames are a dry hold');
  f.tick(a, { fire: false });
  assert.equal(runner.s3DualiesFireBias, 0.245, 'recovery subtracts 0.5 percentage points per fixed frame');

  const hudPath = fileURLToPath(new URL('../../../inkwave-public/src/ui/hud.js', import.meta.url));
  const hud = adaptSource('src/ui/hud.js', fs.readFileSync(hudPath, 'utf8'));
  assert.match(hud, /s3DualiesFireBiasState/, 'the reticle reads the runner-owned bias state');
  assert.match(hud, /dualiesBiasEl/, 'the Dualies HUD cue is composed into the public HUD module');
  assert.doesNotThrow(() => new vm.SourceTextModule(hud), 'the adapted HUD remains valid module syntax');
});
