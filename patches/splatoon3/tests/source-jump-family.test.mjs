// #1116: which Wii U source jump clips the production composition actually plays per weapon kind.
// Real production-adapted Actor/Character with the awaited Player00 bank (source-loaded-actor-fixture),
// real intent.jump admission and Physics. CPU only: no renderer, GPU or device capture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const CONTROLLER = 'src/game/motion/source-controller.js';
const ALIAS = "||(jumpBase==='Jump_Glng00'?this.bank.clips.get('Jump_Glngl00_St'):undefined)";
const BLEND_ENTRY = 'if(this.transitionTime===0||this.s3StateBlendSeconds===undefined)this.s3StateBlendSeconds=special?';
const BLEND_LIVE = 'const blendSeconds=special?';
// Counterfactual: the production composition without either #1116 controller fix.
function withoutFixes(rel, raw) {
  let out = adaptBuildSource(rel, raw);
  if (rel !== CONTROLLER) return out;
  for (const needle of [ALIAS, BLEND_ENTRY]) assert.equal(out.split(needle).length, 2, 'one production edit ' + needle);
  out = out.replace(ALIAS, '').replace(BLEND_ENTRY, BLEND_LIVE).replace('\n  const blendSeconds=this.s3StateBlendSeconds;', '');
  assert.ok(!out.includes('s3StateBlendSeconds'), 'counterfactual restores the per-clip crossfade length');
  return out;
}
const BONES = ['footL', 'footR', 'hips', 'head', 'handR'];
const ST_SECONDS = 5 / 60; // every *_St clip in the bank is 5 frames long

let current, legacy;
const fixture = async () => current ||= await sourceLoadedActorFixture({ sourceOnly: true, random: () => .4 });
const legacyFixture = async () => legacy ||= await sourceLoadedActorFixture({ sourceOnly: true, random: () => .4, transform: withoutFixes });

/** Idle 0.8 s, one real jump press, then 1.4 s of ticks at `hz`. */
async function jumpTrace(f, weapon, hz) {
  const a = await f.make();
  try {
    a.setWeapon(weapon);
    const c = a.character, THREE = f.THREE, rows = [];
    for (let i = 0; i < Math.round(hz * .8); i++) f.tick(a, 1 / hz);
    assert.equal(c.sourceMotion.active, true, weapon + ' source motion owns the body');
    const sample = new c.sourceMotion.pose.constructor(c.sourceMotion.bank);
    for (let i = 0; i < Math.round(hz * 1.4); i++) {
      a.intent.jump = i === 0;
      f.tick(a, 1 / hz);
      const sm = c.sourceMotion, clip = sm.debug.clips?.[0];
      // Distance of the controller's source pose from the pure clip sample (0 once a crossfade has ended).
      sm.bank.sample(clip.name, clip.frame, sample, false);
      const blendGap = Math.max(...sm.pose.wp.map((p, k) => p.distanceTo(sample.wp[k])));
      rows.push({ t: (i + 1) / hz, name: clip?.name, frame: clip?.frame, air: sm.airTime, state: sm.state, blendGap,
        pos: BONES.map(n => c.bones[n].getWorldPosition(new THREE.Vector3()).sub(c.root.position)) });
    }
    assert.ok(rows.some(r => r.state === 'air') && rows.some(r => r.state === 'land'), weapon + ' real jump and landing');
    return rows;
  } finally { f.reset(); }
}
const sequence = rows => rows.reduce((out, r) => (out.at(-1) !== r.name ? [...out, r.name] : out), []);
const ST_BLEND = Math.min(.12, ST_SECONDS / 2); // HOST_MOTION crossfade length into a 5F start clip
/** Largest per-tick displacement of the tracked bones (root-relative) inside an airborne-time window. */
function maxStep(rows, from, to) {
  let worst = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].state === 'air' && rows[i].air >= from && rows[i].air <= to)
    for (let k = 0; k < BONES.length; k++) worst = Math.max(worst, rows[i].pos[k].distanceTo(rows[i - 1].pos[k]));
  return worst;
}

test('the Wii U bank stores the Splatling jump start as Jump_Glngl00_St and it continues Jump_Glng00', async () => {
  const f = await fixture(), a = await f.make();
  try {
    for (const variant of ['Player00', 'Player01']) {
      const sm = a.character.sourceMotion;
      if (variant !== sm.variant) await sm.setVariant(variant);
      const bank = sm.bank, Pose = sm.pose.constructor, A = new Pose(bank), B = new Pose(bank);
      assert.ok(bank.clips.has('Jump_Glng00') && bank.clips.has('Jump_Glng00_Ed'), variant + ' Splatling jump body/end');
      // Player00 carries only the misspelled start; Player01 names it regularly (the lookup prefers that).
      const start = variant === 'Player00' ? 'Jump_Glngl00_St' : 'Jump_Glng00_St';
      assert.equal(bank.clips.has('Jump_Glng00_St'), variant === 'Player01', variant + ' regularly named Splatling start');
      assert.equal(bank.clips.get(start)?.frames, 5, variant + ' 5F Splatling start ' + start);
      // Weapon families with their own ordinary jump in this bank; Charger and Dualies have none.
      for (const fam of ['Nrml', 'Rllr', 'BBll', 'Glng']) assert.ok(bank.clips.has(`Jump_${fam}00`), variant + ' ' + fam);
      for (const fam of ['Chrg', 'Mnvr', 'Shtr']) assert.equal(bank.clips.has(`Jump_${fam}00`), false, variant + ' no ' + fam);
      const gap = (st, body) => {
        bank.sample(st, bank.clips.get(st).frames, A, false); A.fk(); bank.sample(body, 0, B, false); B.fk();
        const hip = bank.index.hip; let max = 0;
        for (const n of ['leg1_L', 'leg2_L', 'foot_L', 'toe_L', 'leg1_R', 'leg2_R', 'foot_R', 'toe_R', 'spine2', 'head']) {
          const i = bank.index[n];
          max = Math.max(max, A.wp[i].clone().sub(A.wp[hip]).distanceTo(B.wp[i].clone().sub(B.wp[hip])));
        }
        return max;
      };
      const own = gap(start, 'Jump_Glng00'), shooter = gap('Jump_Nrml00_St', 'Jump_Glng00');
      for (const fam of ['Nrml', 'Rllr', 'BBll']) assert.ok(gap(`Jump_${fam}00_St`, `Jump_${fam}00`) < .01, variant + ' ' + fam + ' start continues its body');
      assert.ok(own < .01, `${variant} ${start} end continues Jump_Glng00 (${own})`);
      assert.ok(shooter > 1, `${variant} the Nrml start does not (${shooter})`);
    }
  } finally { f.reset(); }
});

// Body family per weapon kind in the production composition: Charger has no Jump_Chrg00, Dualies no
// source family, and Roller/Slosher keep the owner-selected Nrml source body (weapon-models/registry
// SOURCE_BODY) whose ground clips their landings blend into. Only the Splatling plays its own family.
const EXPECTED = {
  shooter: 'Jump_Nrml00', blaster: 'Jump_Nrml00', charger: 'Jump_Nrml00', dualies: 'Jump_Nrml00',
  roller: 'Jump_Nrml00', slosher: 'Jump_Nrml00', splatling: 'Jump_Glng00',
};
test('each weapon kind plays its start, body and landing jump clips at 60 Hz', async () => {
  const f = await fixture();
  for (const [weapon, body] of Object.entries(EXPECTED)) {
    const rows = await jumpTrace(f, weapon, 60), seq = sequence(rows);
    const start = body === 'Jump_Glng00' ? 'Jump_Glngl00_St' : body + '_St';
    assert.deepEqual(seq.slice(0, 3), [start, body, body + '_Ed'], weapon + ' ' + seq.join(' > '));
  }
});

test('Splatling take-off plays Jump_Glngl00_St on the same airborne timeline at 30/60/120 Hz', async () => {
  const f = await fixture(), old = await legacyFixture(), report = {};
  for (const hz of [30, 60, 120]) {
    const rows = await jumpTrace(f, 'splatling', hz), before = await jumpTrace(old, 'splatling', hz);
    assert.deepEqual(sequence(rows).slice(0, 4), ['Jump_Glngl00_St', 'Jump_Glng00', 'Jump_Glng00_Ed', 'WaitHold_Glng'], hz + ' Hz');
    assert.equal(sequence(before)[0], 'Jump_Glng00', hz + ' Hz counterfactual skips the start clip');
    for (const r of rows.filter(r => r.state === 'air')) {
      if (r.air < ST_SECONDS - 1e-9) {
        assert.equal(r.name, 'Jump_Glngl00_St', `${hz} Hz air ${r.air}`);
        assert.ok(Math.abs(r.frame - r.air * 60) < 1e-9, `${hz} Hz start frame follows airborne time`);
      } else assert.equal(r.name, 'Jump_Glng00', `${hz} Hz air ${r.air}`);
    }
    report[hz] = { takeoffMaxStep: +maxStep(rows, 0, .3).toFixed(4), counterfactual: +maxStep(before, 0, .3).toFixed(4) };
  }
  console.log(JSON.stringify({ scope: 'production source-loaded Actor/Physics/Character, CPU; metres per tick', report }));
});

test('the take-off crossfade does not reopen at the start -> body handover at 30/60/120 Hz', async () => {
  const f = await fixture(), old = await legacyFixture(), report = {};
  for (const [weapon, fixed, legacyWeapon] of [['shooter', f, 'shooter'], ['splatling', f, null]]) {
    for (const hz of [30, 60, 120]) {
      const rows = await jumpTrace(fixed, weapon, hz);
      const settled = rows.filter(r => r.state === 'air' && r.air >= ST_BLEND + 1e-9);
      assert.ok(settled.some(r => r.name.endsWith('_St')), `${weapon} ${hz} Hz start clip settles before the handover`);
      assert.ok(settled.some(r => !r.name.endsWith('_St')), `${weapon} ${hz} Hz body clip covered`);
      const gap = Math.max(...settled.map(r => r.blendGap));
      assert.ok(gap < 1e-9, `${weapon} ${hz} Hz after the ${ST_BLEND}s take-off crossfade the source pose is the clip (${gap})`);
      report[`${weapon}@${hz}`] = { gap };
      if (legacyWeapon) {
        const before = await jumpTrace(old, legacyWeapon, hz);
        const reopened = Math.max(...before.filter(r => r.state === 'air' && r.air >= ST_SECONDS - 1e-9 && r.air < .12).map(r => r.blendGap));
        // The old per-clip length re-opened the finished crossfade toward the pre-jump ground pose.
        assert.ok(reopened > .05, `${hz} Hz counterfactual reopens the take-off crossfade (${reopened})`);
        report[`${weapon}@${hz}`].counterfactualReopen = +reopened.toFixed(4);
      }
    }
  }
  console.log(JSON.stringify({ scope: 'production source-loaded Actor/Physics/Character, CPU; source units', report }));
});
