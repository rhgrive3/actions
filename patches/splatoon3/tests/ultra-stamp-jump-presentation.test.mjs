import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fixture } from './source-fixture.mjs';
import { applyCatalogueChoice } from '../runtime/catalogue.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { compactModuleStrings } from '../../../scripts/lib/inkwave-source-compaction.mjs';

// The actual installed Actor path owns admission, jumpStampAt, cancellation
// and the emitted event. The installed presentation wrapper and real model
// produce the observed holder rotation; no extracted animation copy is used.
const rel = 'patches/splatoon3/runtime/special-presentation.mjs';
const emitted = process.env.STAMP_PRESENTATION_EMITTED === '1';
const baseline = process.env.STAMP_PRESENTATION_BASELINE;
const compile = emitted ? createRequire(import.meta.url)(process.env.ESBUILD_MODULE || 'esbuild').transformSync : null;
const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
  extraExports: "export { FX } from './inkwave-public/src/fx/fx.js'; export { installSpecialModels, SPECIAL_DEVICE_MOTION } from './patches/splatoon3/runtime/special-presentation.mjs';",
  adaptRuntime(path, raw) {
    if (path !== rel) return raw;
    const source = baseline ? fs.readFileSync(baseline, 'utf8') : raw;
    if (!emitted) return source;
    const transformed = compile(adaptBuildSource(rel, source), { loader: 'js', format: 'esm', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: rel });
    assert.equal(transformed.warnings.length, 0);
    return compactModuleStrings(transformed.code).code;
  },
});
const { THREE, G } = f, M = f.SPECIAL_DEVICE_MOTION.stamp;
G.scene = new THREE.Scene();
G.fx = new f.FX(G.scene, { quality: 'low' });
G.fx.setCollider(() => null); // Builds the actual event director without GPU/browser work.
const observations = [];
after(() => { G.fx.dispose(); if (process.env.STAMP_PRESENTATION_RECEIPT) fs.writeFileSync(process.env.STAMP_PRESENTATION_RECEIPT, JSON.stringify({ emitted, baseline: baseline || null, observations }, null, 2)); });
class PresentationCharacter {
  constructor(actor) {
    this.actor = actor; this.root = new THREE.Group(); this.kid = new THREE.Group();
    this.root.add(this.kid); this.color = new THREE.Color('#55ddaa');
  }
  update() {} dispose() {} setVisible(value) { this.root.visible = value; }
}
class PresentationProjectiles { update() {} clear() {} }
f.installSpecialModels({ THREE, G, Character: PresentationCharacter, Projectiles: PresentationProjectiles });
const events = [];
f.installedRuntime.on('all:special', e => { if (e.id === 'ultraStamp') events.push({ actor: e.actor, action: e.action, at: G.time, t: e.actor._s3AllSpecialState?.t }); });
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
function start() {
  const a = f.make(); assert.ok(applyCatalogueChoice(a, { sub: 'bomb', special: 'ultraStamp' }, f));
  a.special = a.specialCost(); a.invuln = 0; a._startSpecial(); f.tick(a, 20);
  const ch = new PresentationCharacter(a); ch.update(0);
  assert.equal(ch.s3SpecialDevices().length, 1);
  return { a, ch };
}
function arc(ch, dt = 1 / 60) { ch.update(dt); const d = ch.s3SpecialDevices()?.[0]; return d ? d.holder.rotation.x - d.spec.rot[0] : null; }
function jump(fx, alreadyAirborne = false) {
  if (alreadyAirborne) { fx.a.grounded = false; fx.a.pos.y = 2; }
  fx.a.intent.fire = true; fx.a.intent.jump = !alreadyAirborne; f.tick(fx.a); fx.a.intent.jump = false;
  return fx.a._s3AllSpecialState;
}
function retire({ a, ch }) { a.reset(); ch.dispose(); G.actors = G.actors.filter(x => x !== a); }

test('installed native jump owns 8F impending contact, not the 48F grounded lockout', () => {
  const fx = start(), st = jump(fx), began = st.t, scheduled = st.jumpStampAt;
  close(scheduled - began, 8 / 60, 'native airborne contact'); close(st.nextSwing - began, 48 / 60, 'native grounded lockout');
  f.tick(fx.a, 4);
  const before = JSON.stringify({ t: st.t, next: st.nextSwing, jump: st.jumpStampAt, pos: fx.a.pos, vel: fx.a.vel, seed: st.seed, swings: st.swings });
  const angle = arc(fx.ch);
  observations.push({ case: 'native-jump-before-contact', began, scheduled, groundedNext: st.nextSwing, sampleAt: st.t, holderArc: angle, raised: M.raised, strike: M.strike });
  assert.ok(angle > M.raised + .05 && angle < M.strike, 'device must already descend before its native jumpSwing');
  assert.equal(JSON.stringify({ t: st.t, next: st.nextSwing, jump: st.jumpStampAt, pos: fx.a.pos, vel: fx.a.vel, seed: st.seed, swings: st.swings }), before, 'presentation cannot author gameplay');
  assert.equal(events.filter(e => e.actor === fx.a && e.action === 'jumpSwing').length, 0);
  f.tick(fx.a, 4); const hits = events.filter(e => e.actor === fx.a && e.action === 'jumpSwing');
  assert.equal(hits.length, 1); close(hits[0].t, scheduled, 'unchanged native event time');
  assert.equal(st.jumpStampAt, null); close(arc(fx.ch), M.strike, 'accepted event mark owns strike');
  observations.push({ case: 'native-jump-contact', at: hits[0].at, t: hits[0].t, holderArc: arc(fx.ch), eventCount: hits.length });
  retire(fx);
});

test('airborne fire-edge admission also descends before its already scheduled jump contact', () => {
  const fx = start(), st = jump(fx, true); f.tick(fx.a, 5);
  assert.ok(Number.isFinite(st.jumpStampAt)); assert.ok(arc(fx.ch) > M.raised + .1, 'airborne fire uses jumpStampAt too');
  retire(fx);
});

test('native release and throw-aim cancel pending jump without a synthetic swing', () => {
  for (const cause of ['release', 'throwAim']) {
    const fx = start(), st = jump(fx); f.tick(fx.a, 4); arc(fx.ch);
    if (cause === 'release') fx.a.intent.fire = false; else fx.a.intent.sub = true;
    f.tick(fx.a); assert.equal(st.jumpStampAt, null); assert.equal(st.stampHolding, false);
    if (cause === 'release') close(arc(fx.ch), M.rest, 'cancelled airborne strike returns to existing rest');
    else { assert.equal(st.phase, 'aimThrow'); assert.ok(Number.isFinite(arc(fx.ch))); }
    f.tick(fx.a, 10); assert.equal(events.filter(e => e.actor === fx.a && e.action === 'jumpSwing').length, 0);
    retire(fx);
  }
});

test('reset and holder retirement do not carry pending anticipation into the next activation', () => {
  const fx = start(); jump(fx); f.tick(fx.a, 5); arc(fx.ch);
  fx.a.reset(); fx.ch.update(0); assert.equal(fx.ch.s3SpecialDevices(), null);
  fx.a.special = fx.a.specialCost(); fx.a._startSpecial(); fx.a.intent.fire = false; fx.a.intent.jump = false; f.tick(fx.a);
  const st = fx.a._s3AllSpecialState; assert.equal(st.jumpStampAt, null); assert.equal(st.stampHolding, false);
  close(arc(fx.ch), M.rest, 'new activation retains no pending jump'); assert.equal(fx.ch.s3SpecialDevices().length, 1);
  fx.a.alive = false; fx.ch.update(0); assert.equal(fx.ch.s3SpecialDevices(), null);
  retire(fx);
});

test('no pending jump retains the exact existing grounded anticipation curve', () => {
  const fx = start(); fx.a.intent.fire = true; f.tick(fx.a);
  const st = fx.a._s3AllSpecialState; assert.equal(st.jumpStampAt, null);
  while (st.nextSwing - st.t > 3 / 60 + 1e-8) f.tick(fx.a);
  const toNext = st.nextSwing - st.t, expected = M.strike + (M.raised - M.strike) * (1 - (1 - toNext / M.windup) ** 3);
  close(arc(fx.ch), expected, 'unchanged grounded curve');
  retire(fx);
});

test('native fixed-tick jump retains equal holder rotation at 30 60 120Hz and zero-dt redraw', () => {
  let previous;
  for (const hz of [30, 60, 120]) {
    const fx = start(); jump(fx);
    for (let tick = 1; tick <= 6; tick++) {
      f.tick(fx.a);
      if (hz === 30) { if (tick % 2 === 0) arc(fx.ch, 1 / hz); }
      else for (let render = 0; render < hz / 60; render++) arc(fx.ch, 1 / hz);
    }
    const actual = arc(fx.ch, 0);
    if (previous !== undefined) close(actual, previous, 'equal elapsed native state'); previous = actual;
    close(arc(fx.ch, 0), actual, 'zero-dt redraw is stable');
    assert.equal(fx.ch.s3SpecialDevices().length, 1);
    assert.equal(events.filter(e => e.actor === fx.a && e.action === 'jumpSwing').length, 0);
    retire(fx);
  }
});
