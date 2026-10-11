// Source-backed *horizontal angular* CDF oracle for the S3 community formula.
// Does not claim that the game's full 2-D angle distribution / RNG is verified.
// 2024 S3 studies:
// https://note.com/kanamoji_1027/n/nfd4a961652a6
// https://note.com/kanamoji_1027/n/na3307fdc69e7
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { biasQuantile } from '../runtime/weapon-accuracy.mjs';
import { ShooterAccuracy } from '../runtime/shooter-accuracy.mjs';

// Independent cumulative distribution published for S3: P(angle <= s*r).
function angularCdf(r, b) { return Math.pow(r, Math.log(0.5) / Math.log(b)); }

test('S3 horizontal angular-bias quantiles reproduce published S3 CDF without stochastic test noise', () => {
  const N = 5000;
  for (const b of [.01, .1, .25, .4, .5]) {
    for (const r of [.01, .05, .1, .25, .5, .75, .9]) {
      let within = 0;
      // Stratified deterministic uniform samples; independent of live game RNG.
      for (let i = 0; i < N; i++) if (biasQuantile((i + .5) / N, b) <= r) within++;
      assert.ok(Math.abs(within / N - angularCdf(r, b)) <= 1 / N + 1e-9,
        `S3 horizontal CDF bias=${b} angleFraction=${r}`);
    }
  }
});

test('S3 bias median is angular fraction; 11.3 source and community default constrain Shooter', () => {
  const source = JSON.parse(fs.readFileSync(new URL('../reference/weapon-audit-1130/WeaponShooterNormal.game__GameParameterTable.json', import.meta.url))).GameParameters;
  const param = source.WeaponParam;
  assert.equal(param.Stand_DegSwerve, 4.86);
  assert.equal(param.Jump_DegSwerve, 11.66);
  assert.equal(param.Stand_DegBiasMin, .01);
  assert.equal(param.Jump_DegBiasMax, .4);
  for (const b of [.01, .1, .25, .4, .5]) {
    assert.ok(Math.abs(biasQuantile(.5, b) - b) < 1e-12, 'half of shots stay inside b times max angle');
  }
  assert.ok(!Object.hasOwn(param, 'Stand_DegBiasMax'), '11.3 sparse table omits default');
  const accuracy = new ShooterAccuracy(param, 60);
  assert.equal(accuracy.maximum, .25, 'independent S3 2024 published hit-rate data supports 0.25 default, not 0.4');
  assert.equal(accuracy.stand, .01);
});
