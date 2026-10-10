// #514: reference-derived 60 Hz charger partial-charge frame-to-range law.
// Verification of partial ratio (F-MinF)/(FullF-MinF):
// https://wikiwiki.jp/splatoon3mix/検証/メインウェポン
// S3 MoveParam DistanceMinCharge/DistanceMaxCharge/DistanceFullCharge:
// https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/メイン
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { chargerRangeCharge, CHARGER_MIN_LEGAL_CHARGE } from '../runtime/weapons-charger-flight.mjs';
const MIN_FRAME = 8, FULL_FRAME = 60, MIN = 9.033, FULL = 24.037;
const fraction = frame => Math.max(0, Math.min(1, (frame - MIN_FRAME) / (FULL_FRAME - MIN_FRAME)));
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, label + ' (' + a + ' vs ' + b + ')');
test('#514 legal S3 partial charge ratio aligns with each native flight endpoint', async () => {
  const f = await fixture();
  const reach = f.Projectiles.prototype.chargerReach;
  near(CHARGER_MIN_LEGAL_CHARGE, MIN_FRAME / 60, 'min legal charge');
  let last = -Infinity;
  for (const frame of [0, 1, 7, 8, 9, 12, 16, 23, 34, 48, 59, 60]) {
    const partial = fraction(frame), charge = frame / 60;
    near(chargerRangeCharge(charge), partial, frame + 'F partial ratio');
    const expected = MIN + (FULL - MIN) * partial;
    const actual = reach(charge);
    near(actual, expected, frame + 'F active flight');
    assert.ok(actual >= last, 'range cannot decrease with charge');
    last = actual;
  }
  near(reach(8 / 60), MIN, 'first legal tap reaches minimum');
  near(reach(1), FULL, 'full charge reaches full');
});
test('#514 render partition does not change fixed-tick charged range', async () => {
  const f = await fixture();
  const reach = f.Projectiles.prototype.chargerReach;
  for (const frame of [8, 16, 34, 48, 59, 60]) {
    const expected = reach(frame / 60);
    for (const hz of [30, 60, 120]) {
      let fixedTicks = 0, accumulated = 0, actual = null;
      while (fixedTicks < frame) {
        accumulated += 60 / hz;
        while (accumulated >= 1 && fixedTicks < frame) {
          fixedTicks++; accumulated -= 1;
          if (fixedTicks === frame) actual = reach(fixedTicks / 60);
        }
      }
      near(actual, expected, frame + 'F at ' + hz + ' Hz');
    }
  }
});
