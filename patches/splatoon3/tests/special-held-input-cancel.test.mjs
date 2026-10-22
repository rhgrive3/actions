import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { resetPlatformInput } from '../../local-quality/platform-input.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
  extraExports: "export { inkVacState, INK_VAC_CALIBRATION } from './patches/splatoon3/runtime/kit-ink-vac.mjs';" });
const ids = ['storm', 'tacticooler', 'waveBreaker', 'splattercolorScreen', 'ultraStamp', 'tripleInkstrike', 'booyahBomb'];
function start(id) {
  const { G, THREE } = f;
  G.projectiles.clear(); G.actors = []; G.netm = null; G.time = 0;
  G.scene ||= new THREE.Scene(); G.match = { state: 'playing', playing: () => true, canRespawn: () => false };
  G.level = { blocks: [], groundHeight: () => 0 };
  G.physics = { los: () => true, raycast(_o, _d, _l, h) { h.hit = false; return h; }, segment(_o, _d, h) { h.hit = false; return h; } };
  const a = f.make(); a.weapon = { ...a.weapon, special: id, specialCost: 100 }; a.special = a.specialCost();
  a.alive = true; a.remote = false; a.grounded = true; a._resolve = () => {};
  a.intent.fire = a.intent.sub = a.intent.squid = a.intent.jump = false;
  a._startSpecial();
  if (id === 'booyahBomb') a._s3AllSpecialState.charge = 1; // isolated ready-state fixture
  return a;
}
function tick(a, hz, frames = 1) { for (let i = 0; i < frames; i++) { f.G.time += 1 / hz; a.update(1 / hz); } }
function count(a) {
  const p = f.G.projectiles;
  return [p.list, p.bombs, p._s3AllSpecialObjects, p._s3SupportCoolerThrows, p._s3SupportCoolers]
    .reduce((n, list) => n + (list || []).filter(x => x.owner === a).length, 0);
}

for (const hz of [30, 60, 120]) for (const id of ids) for (const boundary of ['platform', 'cancel-sub']) {
  test(`${id} ${boundary} cancels a held R without throwing; fresh release works, ${hz}Hz`, () => {
    const a = start(id);
    a.intent.sub = true; tick(a, hz);
    assert.equal(count(a), 0);
    if (boundary === 'platform') resetPlatformInput({}, { a });
    else { a.intent.sub = false; a.weaponRunner.cancelHold(false, true); }
    tick(a, hz, hz);
    assert.equal(count(a), 0, 'cancelled hold must not turn into a paid throw');
    assert.ok(a.specialActive, 'holding special remains available');
    a.intent.sub = true; tick(a, hz); a.intent.sub = false; tick(a, hz, hz);
    assert.ok(count(a) > 0, 'new deliberate R press/release still deploys');
  });
}

for (const id of ['waveBreaker', 'splattercolorScreen', 'ultraStamp', 'tripleInkstrike']) {
  test(`${id}: cancellation after a deliberate release preserves the accepted throw startup`, () => {
    const a = start(id);
    a.intent.sub = true; tick(a, 60, 24); a.intent.sub = false; tick(a, 60);
    assert.ok(a._s3AllSpecialState.throwAt !== undefined, 'real release admits existing startup');
    resetPlatformInput({}, { a }); tick(a, 60, 60);
    assert.ok(count(a) > 0, 'accepted action is not retroactively discarded');
  });
}

for (const hz of [30, 60, 120]) for (const boundary of ['platform', 'cancel-fire']) {
  test(`Ink Vac ${boundary} cancels held ZR without requesting a return shot, ${hz}Hz`, () => {
    const a = start('inkVac'); a.intent.fire = true;
    for (let i = 0; i < hz * 8 && f.inkVacState(a)?.phase !== 'exhale'; i++) tick(a, hz);
    assert.equal(f.inkVacState(a)?.phase, 'exhale'); tick(a, hz, hz / 2);
    assert.equal(count(a), 0);
    if (boundary === 'platform') resetPlatformInput({}, { a });
    else { a.intent.fire = false; a.weaponRunner.cancelHold(true, false); }
    tick(a, hz, hz / 2);
    assert.equal(count(a), 0, 'cancelled suction hold must not request the return shot');
    assert.equal(f.inkVacState(a)?.phase, 'exhale', 'the existing return-shot window remains open');
    a.intent.fire = true; tick(a, hz);
    assert.equal(count(a), 1, 'a fresh deliberate press still fires the return shot');
  });

  test(`Kraken ${boundary} drops a charged hold without dashing, ${hz}Hz`, () => {
    const a = start('krakenRoyale'); tick(a, hz, hz * 2);
    a.intent.fire = true; tick(a, hz, Math.ceil(.7 * hz));
    assert.equal(a._s3AllSpecialState.phase, 'charge');
    if (boundary === 'platform') resetPlatformInput({}, { a });
    else { a.intent.fire = false; a.weaponRunner.cancelHold(true, false); }
    tick(a, hz);
    assert.equal(a._s3AllSpecialState.phase, 'active', 'cancelled charged input cannot become a dash');
    a.intent.fire = true; tick(a, hz, Math.ceil(.7 * hz));
    a.intent.fire = false; tick(a, hz);
    assert.equal(a._s3AllSpecialState.phase, 'dash', 'a new deliberate charge/release still dashes');
  });
}

test('Ink Vac cancellation preserves the pinned automatic return-shot deadline', () => {
  const a = start('inkVac'); a.intent.fire = true;
  for (let i = 0; i < 480 && f.inkVacState(a)?.phase === 'inhale'; i++) tick(a, 60);
  assert.equal(f.inkVacState(a)?.phase, 'exhale');
  resetPlatformInput({}, { a });
  const seconds = f.INK_VAC_CALIBRATION.inhaleToExhaleSeconds + f.INK_VAC_CALIBRATION.exhaleHoldSeconds;
  tick(a, 60, Math.round(seconds * 60) - 1);
  assert.equal(count(a), 0); tick(a, 60);
  assert.equal(count(a), 1, 'cancel only drops input; it never extends the source deadline');
});

test('Ink Vac cancellation preserves a shot deliberately requested during the 20F transition', () => {
  const a = start('inkVac'); a.intent.fire = true;
  for (let i = 0; i < 480 && f.inkVacState(a)?.phase === 'inhale'; i++) tick(a, 60);
  assert.equal(f.inkVacState(a)?.phase, 'exhale');
  a.intent.fire = false; tick(a, 60);
  assert.equal(f.inkVacState(a)?.exhaleFireRequested, true);
  resetPlatformInput({}, { a }); tick(a, 60, 19);
  assert.equal(count(a), 1, 'already admitted countershot keeps its original startup');
});

test('fire-only cancellation preserves the independently held R special throw', () => {
  const a = start('waveBreaker'); a.intent.sub = true; tick(a, 60, 24);
  a.weaponRunner.cancelHold(true, false);
  a.intent.sub = false; tick(a, 60, 60);
  assert.equal(count(a), 1);
});
