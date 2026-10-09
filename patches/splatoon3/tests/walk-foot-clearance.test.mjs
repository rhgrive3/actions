import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWalkFootClearance } from '../runtime/walk-foot-clearance.mjs';

const minGap = .078, footLength = .24;
const f = (side, x, z, su = .5, planted = false) => ({
  side, cw: { x, y: 0, z }, su, sw: !planted, planted,
});
const pair = (yaw, clearance = -.014, along = 0, lu = .5, ru = .5, rp = false) => {
  const ax = Math.cos(yaw), az = -Math.sin(yaw);
  return [f(1, (clearance / 2) * ax + along / 2 * Math.sin(yaw),
               (clearance / 2) * az + along / 2 * Math.cos(yaw), lu),
          f(-1, -(clearance / 2) * ax - along / 2 * Math.sin(yaw),
                -(clearance / 2) * az - along / 2 * Math.cos(yaw), ru, rp)];
};
const gap = (feet, yaw) => {
  const [a, b] = feet;
  return ((a.cw.x - b.cw.x) * Math.cos(yaw) -
    (a.cw.z - b.cw.z) * Math.sin(yaw)) * a.side;
};
const near = (a,b,tol=1e-12) => assert.ok(Math.abs(a-b)<tol, `${a} vs ${b}`);

for (const yaw of [0, .4, -1.1, Math.PI / 2, Math.PI]) {
  test(`simultaneous stance clearance at yaw ${yaw.toFixed(3)}`, () => {
    const feet = pair(yaw);
    const start = feet.map(x => ({ ...x.cw }));
    const amount = resolveWalkFootClearance(feet, yaw, minGap, footLength);
    near(amount, minGap + .014);
    near(gap(feet, yaw), minGap);
    near(feet[0].cw.x + feet[1].cw.x, start[0].x + start[1].x);
    near(feet[0].cw.z + feet[1].cw.z, start[0].z + start[1].z);
  });
}

test('a planted contact is never shifted; swing foot takes the full gap deficit', () => {
  const feet = pair(.65, -.03, 0, .5, .5, true), fixed = {...feet[1].cw};
  near(resolveWalkFootClearance(feet, .65, minGap, footLength), minGap + .03);
  assert.deepEqual(feet[1].cw, fixed);
  near(gap(feet, .65), minGap);
});

test('lift-off and touchdown carry exactly zero correction', () => {
  for (const su of [0, 1]) {
    const feet = pair(.4, -.02, 0, su, su), old = feet.map(x => ({...x.cw}));
    assert.equal(resolveWalkFootClearance(feet, .4, minGap, footLength), 0);
    feet.forEach((x,i) => assert.deepEqual(x.cw,old[i]));
  }
});

test('separation operates only where the shoes overlap longitudinally', () => {
  const feet = pair(-.8, -.06, footLength * 1.1);
  const old = feet.map(x => ({...x.cw}));
  assert.equal(resolveWalkFootClearance(feet, -.8, minGap, footLength), 0);
  feet.forEach((x,i) => assert.deepEqual(x.cw,old[i]));
});

test('left/right processing order does not change either physical foot', () => {
  const a = pair(.8, -.04, .02, .32, .67);
  const b = a.map(x => ({...x,cw:{...x.cw}})).reverse();
  resolveWalkFootClearance(a, .8, minGap, footLength);
  resolveWalkFootClearance(b, .8, minGap, footLength);
  near(a[0].cw.x,b[1].cw.x);near(a[1].cw.z,b[0].cw.z);
  near(a[1].cw.x,b[0].cw.x);near(a[0].cw.z,b[1].cw.z);
});

test('correction has bounded continuity as swing progresses', () => {
  let previous = null;
  for (let k = 0; k <= 100; k++) {
    const u = k / 100, feet = pair(.7, -.05, 0, u, .5, true);
    const amount = resolveWalkFootClearance(feet, .7, minGap, footLength);
    assert.ok(Number.isFinite(amount) && amount >= 0 && amount <= minGap + .05 + 1e-12);
    if (previous !== null) assert.ok(Math.abs(amount - previous) < .005);
    previous = amount;
  }
});
