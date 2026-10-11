import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { signedBiasSample } from '../runtime/weapon-edgecases.mjs';
import { biasQuantile } from '../runtime/weapon-accuracy.mjs';

const raw = JSON.parse(fs.readFileSync(
  new URL('../reference/weapon-audit-1130/WeaponSpinnerStandard.game__GameParameterTable.json', import.meta.url), 'utf8'
)).GameParameters.WeaponParam;
const close = (a, b, msg) => assert.ok(Math.abs(a-b)<1e-11, msg + ' '+a+' != '+b);

test('S3 11.3 Spinner pins separate Stand, Pitch and Jump angular parameters', () => {
  assert.equal(raw.Stand_DegSwerve, 3.3);
  assert.equal(raw.Stand_DegBiasMax, .3);
  assert.equal(raw.PitchDegSwerve, 1.6);
  assert.equal(raw.PitchDegBias, .4);
  assert.equal(raw.Jump_DegSwerve, 7);
  assert.equal(raw.Jump_DegBiasMax, .3);
});

test('two signed-axis quantile mappings have independent signs and exact source medians', () => {
  for (const [u, sign] of [[.125,-1],[.375,-1],[.625,1],[.875,1]]) {
    const fraction = Math.abs(2*u-1);
    close(signedBiasSample(u,raw.Stand_DegBiasMax),
      sign*biasQuantile(fraction,raw.Stand_DegBiasMax), 'horizontal signed quantile');
    close(signedBiasSample(u,raw.PitchDegBias),
      sign*biasQuantile(fraction,raw.PitchDegBias), 'pitch signed quantile');
    close(signedBiasSample(1-u,.3),-signedBiasSample(u,.3),'symmetry');
  }
  close(signedBiasSample(.5,.3),0,'zero centered');
  close(signedBiasSample(.75,.3),.3,'median horizontal angular fraction');
  close(signedBiasSample(.75,.4),.4,'median vertical angular fraction');
});

test('independent Splatling yaw/pitch samples obey separate source-defined endpoint bounds', () => {
  for (const u of [0,.001,.1,.25,.499,.5,.501,.75,.9,.999,1]) {
    const yaw = raw.Stand_DegSwerve * signedBiasSample(u,raw.Stand_DegBiasMax);
    const pitch = raw.PitchDegSwerve * signedBiasSample(1-u,raw.PitchDegBias);
    assert.ok(Math.abs(yaw)<=raw.Stand_DegSwerve+1e-12);
    assert.ok(Math.abs(pitch)<=raw.PitchDegSwerve+1e-12);
    if (u!==.5) assert.ok(yaw*pitch<=0,'opposite uniform draws need not correlate');
  }
});
