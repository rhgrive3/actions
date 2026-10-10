import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const STEP = 1 / 60;
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
async function setup() {
  const installers = [
    ['installIssueFiveHotfixA', './patches/splatoon3/runtime/issue-five-hotfix-a.mjs'],
    ['installIssueFiveHotfixB', './patches/splatoon3/runtime/issue-five-hotfix-b.mjs'],
    ['installIssueFiveHotfixC', './patches/splatoon3/runtime/issue-five-hotfix-c.mjs'],
    ['installDisconnectFidelity', './patches/splatoon3/runtime/disconnect-fidelity.mjs'],
    ['installSlosherIntermediatePaint', './patches/splatoon3/runtime/slosher-intermediate-paint.mjs'],
    ['installQuality', './patches/local-quality/install.mjs'],
    ['installWeaponsFidelity', './patches/splatoon3/runtime/weapons-fidelity.mjs'],
    ['installIssueEightFollowup', './patches/splatoon3/runtime/issue-eight-followup.mjs'],
  ];
  const f = await fixture({ fullRuntime: true, realProjectiles: true,
    adapt: adaptBuildSource, adaptRuntime: adaptBuildSource,
    extraExports: installers.map(([name, path]) => `export { ${name} } from '${path}';`).join('\n') });
  const bootstrap = fs.readFileSync(new URL('../bootstrap.mjs', import.meta.url), 'utf8');
  let prior = bootstrap.indexOf('const context = install(profile);');
  for (const [name] of installers) {
    const index = bootstrap.indexOf(`  ${name}(`, prior);
    assert.ok(index > prior, `${name} retains the production bootstrap order`); prior = index;
    if (name === 'installQuality') f[name](f.profile);
    else f[name](f.installedRuntime, f.profile);
  }
  f.G.scene = new f.THREE.Scene();
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.match.state = 'playing';
  f.G.netm = null;
  return f;
}
function make(f, kind) {
  const a = f.make(kind);
  a.isLocal = true; a.remote = false; a._nearCamera = () => false;
  a.invuln = 0; a.lastFire = 0; a._resolve = function () { if (this.pos.y <= 0) { this.pos.y = 0; this.grounded = true; } };
  return a;
}

test('a funded full Charger hold never reopens the low-ink recovery exception', async () => {
  const f = await setup(), a = make(f, 'charger'), r = a.weaponRunner;
  a.ink = a.weapon.inkFull; a.intent.fire = true;
  let frames = 0;
  while (r.charge < 1 && frames++ < 300) f.tick(a);
  assert.equal(r.charge, 1); assert.equal(r.s3ChargerSpent, a.weapon.inkFull);
  const ink = a.ink;
  assert.ok(ink < a.weapon.inkMin, 'exercise the old low-tank predicate');
  f.tick(a, 180);
  close(a.ink, ink, 'no refill during full hold');
  assert.equal(r.charging, true);
});

test('insufficient-ink first charge step keeps completion seconds and charge progress synchronized', async () => {
  for (const ink of [2.25, 10, 17.99]) {
    const f = await setup(), a = make(f, 'charger'), r = a.weaponRunner;
    a.ink = ink; a.intent.fire = true;
    f.tick(a); assert.equal(r.charging, false, 'fresh 1F startup stays in real time');
    f.tick(a);
    close(r.chargeT, STEP * a.weapon.emptyChargeRate / a.weapon.chargeTime, 'first reduced step');
    close(r.s3ChargerElapsed, r.chargeT * a.weapon.chargeTime, 'same compensated clock');
    for (let i = 0; i < 20; i++) {
      f.tick(a);
      close(r.s3ChargerElapsed, r.chargeT * a.weapon.chargeTime, 'no stale first-step credit');
    }
  }
});

for (const [kind, special] of [['charger', 'inkVac'], ['slosher', 'slam'], ['roller', 'bubbler'], ['splatling', 'inkVac']]) {
  test(`${kind}: committed ${special} retires the pending main action and preserves its cooldown`, async () => {
    const f = await setup(), a = make(f, kind), r = a.weaponRunner;
    // Ink Vac on Splatling is a synthetic integration-boundary control;
    // every other row uses the actual equipped kit unchanged.
    if (kind === 'splatling') a.weapon = { ...a.weapon, special };
    else assert.equal(a.weapon.special, special);
    a.intent.fire = true;
    f.tick(a, 10);
    assert.ok(r.charging || r.slosh >= 0 || r.flick >= 0, 'real main admission precedes the Special');
    const cooldown = r.cooldown;
    const method = { charger: 'fireCharger', slosher: 'fireSlosh', roller: 'fireFlick', splatling: 'fireSplatling' }[kind];
    const fireMain = f.G.projectiles[method]; let staleShots = 0;
    f.G.projectiles[method] = function (...args) { staleShots++; return fireMain.apply(this, args); };
    const uses = a.stats.specials;
    a.special = a.specialCost(); a._startSpecial();
    assert.equal(a.stats.specials, uses + 1, 'real kit activation is admitted');
    if (special !== 'bubbler') assert.equal(a.specialActive?.id, special);
    assert.equal(r.charging, false); assert.equal(r.streaming, false);
    assert.equal(r.s3Stored, null); assert.equal(r.slosh, -1); assert.equal(r.flick, -1);
    close(r.cooldown, cooldown, 'the interruption is not a runner reset');
    a.intent.fire = false;
    let elapsed = 0;
    while (a.specialActive && elapsed++ < 900) f.tick(a);
    assert.equal(a.specialActive, null, 'the actual Special state machine finishes');
    f.tick(a, 60);
    assert.equal(staleShots, 0, 'no pre-Special main attack resumes after control returns');
    assert.equal(r.charging, false); assert.equal(r.streaming, false);
  });
}

test('Ink Vac interrupts a prepaid Splatling stream without later reviving its unused rounds', async () => {
  const f = await setup(), a = make(f, 'splatling'), r = a.weaponRunner;
  a.weapon = { ...a.weapon, special: 'inkVac' }; a.intent.fire = true;
  f.tick(a, 73); a.intent.fire = false; f.tick(a, 5);
  assert.equal(r.streaming, true); assert.ok(r.s3Spin.unspent > 0);
  const cooldown = r.cooldown;
  a.special = a.specialCost(); a._startSpecial();
  assert.equal(a.specialActive?.id, 'inkVac');
  assert.equal(r.streaming, false); assert.equal(r.s3Spin, null);
  assert.equal(a.ink, f.PLAYER.inkMax, 'Special refill is neither overwritten nor refunded above max');
  close(r.cooldown, cooldown, 'shot cadence is preserved');
});

test('rejected kit activation leaves existing main charge and reservation intact', async () => {
  for (const kind of ['charger', 'splatling']) {
    const f = await setup(), a = make(f, kind), r = a.weaponRunner;
    a.weapon = { ...a.weapon, special: 'inkVac' }; a.intent.fire = true;
    f.tick(a, 20); a.special = 0;
    const state = [r.charging, r.charge, r.chargeT, r.s3Spin, a.ink];
    a._startSpecial();
    assert.equal(a.specialActive, null);
    assert.deepEqual([r.charging, r.charge, r.chargeT, r.s3Spin, a.ink], state);
  }
});

test('remote Special notifications cannot cancel an unrelated authoritative owner', async () => {
  const f = await setup(), a = make(f, 'charger'), remote = make(f, 'splatling');
  a.intent.fire = true; f.tick(a, 15);
  remote.remote = true; remote.weaponRunner.charging = true;
  f.emit('special:use', { actor: remote, id: 'inkVac' });
  assert.equal(a.weaponRunner.charging, true);
  assert.equal(remote.weaponRunner.charging, true);
});

test('charge clock and committed Special cancellation are deterministic at 30/60/120Hz rendering', async () => {
  const histories = [];
  for (const hz of [30, 60, 120]) {
    const f = await setup(), a = make(f, 'charger'), r = a.weaponRunner;
    a.weapon = { ...a.weapon, special: 'inkVac' }; a.ink = 10;
    const clock = new FixedClock(), rows = []; let tick = 0;
    for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, () => {
      tick++; a.intent.fire = tick < 20;
      if (tick === 20) { a.special = a.specialCost(); a.intent.special = true; }
      if (tick === 21) a.intent.special = false;
      f.tick(a);
      rows.push([r.charging, r.chargeT, r.s3ChargerElapsed, r.s3Stored, !!a.specialActive]);
    });
    assert.equal(rows[19][0], false);
    histories.push(rows);
  }
  assert.deepEqual(histories[0], histories[1]); assert.deepEqual(histories[1], histories[2]);
});
