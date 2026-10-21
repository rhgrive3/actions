// #1097 in the production composition WITH the Wii U source rig loaded (the other #1097 tests run
// the native fallback rig, which production only uses until the bank has loaded).
// CPU only: production-adapted Actor/Character/Physics, no renderer, GPU or device capture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';

const HIT_INSTALL = Symbol.for('inkwave.s3.weapon-hit-reaction.install.v1');
let cached;
const fixture = async () => cached ||= await sourceLoadedActorFixture({ sourceOnly: true, random: () => .4 });

test('the source bank has one generic one-shot hit clip; the class *Damage_* clips are long loops', async () => {
  const f = await fixture(), a = await f.make();
  try {
    for (const variant of ['Player00', 'Player01']) {
      const sm = a.character.sourceMotion;
      if (variant !== sm.variant) await sm.setVariant(variant);
      const bank = sm.bank, damage = bank.clips.get('Damage');
      assert.equal(damage?.frames, 20, variant + ' Damage is 20F');
      assert.equal(damage.loop, false, variant + ' Damage is a one-shot');
      for (const fam of ['Nrml', 'Rllr', 'Glng', 'BBll', 'Chrg', 'Shtr', 'Mnvr', 'Slsh', 'Spnr'])
        assert.equal(bank.clips.has(`Damage_${fam}`), false, `${variant} no Damage_${fam}`);
      for (const fam of ['Nrml', 'Rllr', 'Glng', 'BBll']) {
        assert.deepEqual([bank.clips.get(`WaitDamage_${fam}`).frames, bank.clips.get(`WaitDamage_${fam}`).loop], [360, true], `${variant} WaitDamage_${fam}`);
        assert.deepEqual([bank.clips.get(`WalkDamage_${fam}`).frames, bank.clips.get(`WalkDamage_${fam}`).loop], [240, true], `${variant} WalkDamage_${fam}`);
      }
    }
  } finally { f.reset(); }
});

/** Idle, one nonlethal hit, 24 ticks: rendered bone matrices, source applyBody calls and layer state. */
async function hitTrace(f, weapon, enabled, hz = 60) {
  const a = await f.make();
  try {
    a.setWeapon(weapon);
    const c = a.character, sm = c.sourceMotion;
    c.s3WeaponHitReactionEnabled = enabled;
    for (let i = 0; i < Math.round(hz * .6); i++) f.tick(a, 1 / hz);
    let bodies = 0;
    const applyBody = sm.applyBody;
    sm.applyBody = function (...args) { bodies++; return applyBody.apply(this, args); };
    c.trigger('hit', { x: .6, z: .8, amp: 1 });
    const rows = [];
    for (let i = 0; i < Math.round(hz * .4); i++) {
      bodies = 0;
      f.tick(a, 1 / hz);
      const s = c.constructor.prototype[HIT_INSTALL].states.get(c);
      rows.push({ bodies, layer: !!s?.on, upper: sm.sourceUpper, clips: sm.debug.clips.map(x => x.name),
        bones: c.boneList.flatMap(b => Array.from(b.matrixWorld.elements)),
        weapon: Array.from(c.weapon.off.matrixWorld.elements) });
    }
    return rows;
  } finally { f.reset(); }
}
const maxDiff = (a, b) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);

test('a source-owned upper body plays the generic Damage clip and skips the invisible class layer', async () => {
  const f = await fixture(), report = {};
  for (const weapon of ['shooter', 'blaster', 'charger', 'splatling']) for (const hz of weapon === 'shooter' ? [30, 60, 120] : [60]) {
    const on = await hitTrace(f, weapon, true, hz), off = await hitTrace(f, weapon, false, hz);
    assert.ok(on.every(r => r.upper), `${weapon} source upper body stays the owner`);
    assert.ok(on.some(r => r.clips.includes('Damage')), `${weapon} the source hit is the generic Damage clip`);
    assert.ok(on.every(r => r.bodies === 1 && !r.layer), `${weapon} ${hz} Hz one pose pass, no class layer`);
    let bones = 0, weaponDiff = 0;
    for (let i = 0; i < on.length; i++) { bones = Math.max(bones, maxDiff(on[i].bones, off[i].bones)); weaponDiff = Math.max(weaponDiff, maxDiff(on[i].weapon, off[i].weapon)); }
    assert.ok(bones < 1e-9 && weaponDiff < 1e-9, `${weapon} ${hz} Hz rendered bones and weapon unchanged (${bones}, ${weaponDiff})`);
    report[`${weapon}@${hz}`] = { bones, weaponDiff };
  }
  console.log(JSON.stringify({ scope: 'production source-loaded Actor/Character, CPU', report }));
});

test('native-upper families still draw the class hit layer over the source legs', async () => {
  const f = await fixture(), report = {};
  for (const weapon of ['roller', 'dualies', 'slosher']) {
    const on = await hitTrace(f, weapon, true), off = await hitTrace(f, weapon, false);
    assert.ok(on.every(r => !r.upper), `${weapon} native upper body`);
    // Control for the pass counter: the layer's ordinary-pose muzzle pass still runs here.
    assert.ok(on.some(r => r.layer && r.bodies === 2), `${weapon} layer and its muzzle pose pass run`);
    assert.ok(off.every(r => r.bodies === 1), `${weapon} disabled layer: one pass`);
    const bones = Math.max(...on.map((r, i) => maxDiff(r.bones, off[i].bones)));
    assert.ok(bones > 1e-3, `${weapon} the class layer changes rendered bones (${bones})`);
    report[weapon] = { bones };
  }
  console.log(JSON.stringify({ scope: 'production source-loaded Actor/Character, CPU', report }));
});
