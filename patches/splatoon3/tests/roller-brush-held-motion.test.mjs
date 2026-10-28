import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';

const families = MAIN_WEAPON_CATALOG.records.filter(r => r.family === 'roller' || r.family === 'brush');
function exposeEmittedInspection(rel, code) {
  if (rel !== 'patches/splatoon3/runtime/weapon-models/registry.mjs') return code;
  // The production bundle retains this inspection function in its Roller
  // namespace. Alias that exact binding; never load the excluded source family
  // or replace its state reader. Existing emitted statements stay byte intact.
  const names = [], ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Property' && (node.key.name ?? node.key.value) === 'catalogRollerSwing') {
      assert.equal(node.value.type, 'ArrowFunctionExpression');
      assert.equal(node.value.body.type, 'Identifier');
      names.push(node.value.body.name);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(ast);
  assert.equal(names.length, 1, 'one actual bundled Roller inspection binding');
  assert.ok(ast.body.some(n => n.type === 'FunctionDeclaration' && n.id.name === names[0]), 'bundled function exists');
  return code + `\nexport { ${names[0]} as catalogRollerSwing };\n`;
}
let cached;
async function production() {
  if (!cached) cached = fixture({ fullRuntime: true, productionComposition: true,
    includeCharacter: true, realProjectiles: true, vmMathRandom: () => .5,
    adaptEmittedRuntime: exposeEmittedInspection,
    extraExports: `
      export { catalogRollerSwing } from './patches/splatoon3/runtime/weapon-models/${process.env.INKWAVE_BUILT_SITE ? 'registry' : 'rollers'}.mjs';
      export { recordMovementLaunch } from './patches/splatoon3/runtime/roller-freefall.mjs';
    ` }).then(f => {
    f.G.scene = new f.THREE.Scene();
    f.G.level = new f.Level({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
      spawnPads: [[-30, 0, 0], [30, 0, 0]], spawnBarrier: 0, half: [],
      single: [{ kind: 'box', min: [-40, -.5, -40], max: [40, 0, 40] }] });
    f.G.physics = new f.Physics(f.G.level);
    return f;
  });
  return cached;
}

function rig(f, id) {
  const a = new f.Actor({ team: 0, name: 'held motion regression', isLocal: true, weapon: id,
    CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character, paint = [], hits = [];
  ch.actor = a; ch.onEvent = null; ch.tr.fill(99); ch.fidget = -1; ch.shufT = 99;
  f.G.scene.add(ch.root); f.G.actors = [a];
  f.G.paint = { sample: () => 1, splat: p => { paint.push(p.clone()); return 0; } };
  const applyHit = f.G.projectiles.applyHit;
  f.G.projectiles.applyHit = (...args) => { hits.push(args); return 'accepted'; };
  a.ink = 100; a.form = 'kid'; a.yaw = a.aimYaw = 0;
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 4.8); a.intent.move.set(0, 0, 1);
  const ground = value => {
    a.grounded = value;
    f.G.physics.groundProbe(a.pos.x, a.pos.y, a.pos.z, f.PLAYER.stepUp,
      f.PLAYER.stepDown, f.PLAYER.footRadius, a.ground, false);
  };
  function step({ held = true, pressed = false, grounded = true, y = grounded ? 0 : 1.5,
    render = true, advance = true } = {}) {
    a.intent.fire = held; a.pos.y = y; if (advance) a.pos.z += a.vel.z / 60;
    ground(grounded); f.G.time += 1 / 60;
    a.weaponRunner.update(1 / 60, { fire: held, firePressed: pressed, sub: false, subReleased: false });
    if (render) { a._finishFrame(1 / 60); ch.root.updateMatrixWorld(true); }
  }
  return { a, ch, paint, hits, ground, step, close() {
    f.G.projectiles.applyHit = applyHit; f.G.projectiles.clear(); f.G.actors = [];
    f.G.scene.remove(ch.root); ch.dispose();
  } };
}

test('all five Rollers and three Brushes retain the lowered pose through jumps and downhill air frames at 30/60/120 Hz', async () => {
  const f = await production(), traces = [];
  for (const hz of [30, 60, 120]) for (const rec of families) {
    const r = rig(f, rec.id), clock = new f.FixedClock(), rows = [];
    try {
      let tick = 0, airborneInk, airbornePaint, airborneHits, heldWeight;
      while (tick < 42) clock.advance(1 / hz, () => {
        const air = tick >= 24 && tick < 33;
        if (tick === 24) {
          airborneInk = r.a.ink; airbornePaint = r.paint.length; airborneHits = r.hits.length;
          heldWeight = r.ch.wRoll;
          assert.ok(heldWeight > .99, rec.id + ' settled lowered pose');
          assert.ok(airbornePaint > 0, rec.id + ' paints on the actual floor');
          // A target at drum height in midair must receive no retained-state hit.
          const enemy = { alive: true, team: 1, pos: r.a.pos.clone().add(new f.THREE.Vector3(0, 1.5, .8)), form: 'kid' };
          f.G.actors.push(enemy);
        }
        if (tick === 33) {
          f.G.actors.length = 1;
          r.a.pos.z += 5; // landing far away must start a new contact stripe
        }
        const beforePaint = r.paint.length;
        r.step({ grounded: !air });
        const runner = r.a.weaponRunner;
        assert.equal(runner.rolling, true, rec.id + ' keeps admitted held action');
        assert.equal(runner.s3RollerSuspendedHold, air, rec.id + ' separates hold and contact');
        if (air) {
          assert.equal(r.a.ink, airborneInk, rec.id + ' no airborne roll ink spend');
          assert.equal(r.paint.length, airbornePaint, rec.id + ' no airborne floor paint');
          assert.equal(r.hits.length, airborneHits, rec.id + ' no airborne contact damage');
          assert.ok(r.ch.wRoll + 1e-9 >= heldWeight, rec.id + ' no airborne carry-pose fade');
          assert.equal(r.ch._s3RollerContactPose, false, rec.id + ' no floor IK in midair');
        }
        if (tick === 33) {
          assert.ok(r.a.ink < airborneInk, rec.id + ' contact cost resumes on landing');
          assert.ok(r.paint.length > beforePaint, rec.id + ' landing paints again');
          assert.ok(r.paint.slice(beforePaint).every(p => Math.abs(p.z - r.a.pos.z) < 2.5), rec.id + ' no stripe across airborne travel');
        }
        assert.ok(Array.from(r.ch.P).every(Number.isFinite), rec.id + ' finite actual native pose');
        rows.push([runner.rolling, runner.s3RollerSuspendedHold, r.a.ink, r.paint.length, r.ch.wRoll]);
        tick++;
      });
      traces.push({ hz, id: rec.id, rows });
    } finally { r.close(); }
  }
  for (const rec of families) {
    const runs = traces.filter(t => t.id === rec.id);
    assert.deepEqual(runs[1].rows, runs[0].rows, rec.id + ' 60 Hz matches 30 Hz');
    assert.deepEqual(runs[2].rows, runs[0].rows, rec.id + ' 120 Hz matches 30 Hz');
  }
});

test('a single downhill contact gap retains the hold, but release, cancellation and reset end it; airborne cold starts stay rejected', async () => {
  const f = await production();
  for (const rec of families) {
    const r = rig(f, rec.id);
    try {
      r.step({ grounded: false });
      assert.equal(r.a.weaponRunner.rolling, false, rec.id + ' airborne held trigger cannot create a roll');
      r.step(); r.step({ grounded: false, y: .12 });
      assert.equal(r.a.weaponRunner.rolling, true, rec.id + ' downhill contact gap keeps action');
      r.step(); assert.equal(r.a.weaponRunner.s3RollerSuspendedHold, false);
      r.step({ grounded: false }); r.step({ grounded: false, held: false });
      assert.equal(r.a.weaponRunner.rolling, false, rec.id + ' release cancels in midair');
      r.step(); r.step({ grounded: false }); r.a.weaponRunner.cancelPendingInput();
      assert.equal(r.a.weaponRunner.rolling, false, rec.id + ' input suppression clears held air action');
      assert.equal(r.a.weaponRunner.s3RollerSuspendedHold, false);
      r.step(); r.step({ grounded: false }); r.a.weaponRunner.reset();
      assert.equal(r.a.weaponRunner.rolling, false, rec.id + ' reset clears action');
      assert.equal(r.a.weaponRunner.s3RollerSuspendedHold, false);
    } finally { r.close(); }
  }
});

test('catalogue vertical swings use admitted mode and original interval when the first pose follows a landing', async () => {
  const f = await production();
  for (const rec of families.filter(r => r.family === 'roller' && !r.legacy)) {
    const r = rig(f, rec.id);
    try {
      r.a.grounded = false; f.recordMovementLaunch(r.a);
      r.step({ grounded: false, pressed: true, render: false });
      const runner = r.a.weaponRunner, interval = runner.cooldown;
      assert.equal(runner.catalogState.s3SwingMode, 'vertical');
      for (let i = 0; i < 4; i++) r.step({ grounded: true, render: false });
      r.a._finishFrame(1 / 60);
      const attack = f.catalogRollerSwing(r.ch);
      assert.ok(attack, rec.id + ' delayed first pose discovers the running swing');
      assert.equal(attack.vertical, true, rec.id + ' landing cannot change mode to horizontal');
      assert.equal(attack.swingInterval, interval, rec.id + ' full interval is retained');
      assert.ok(Math.abs(attack.elapsed - 4 / 60) < 1e-8, rec.id + ' pose catches up to actual runner time');
      assert.equal(attack.holdRoll, true);
      r.step({ grounded: false });
      assert.equal(f.catalogRollerSwing(r.ch)?.holdRoll, true, rec.id + ' grounding cannot swap the recovery curve');
    } finally { r.close(); }
  }
});

test('remote held-down rolling poses do not enable the ground-contact loop in air', async () => {
  const f = await production(), calls = [];
  const makeActor = isLocal => {
    const actor = new f.Actor({ team: 0, name: 'remote held regression', isLocal, weapon: 'roller',
      CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    actor.nid = 17; actor.owner = 'owner'; actor.ink = 100;
    actor.character.actor = actor; actor.character.onEvent = null; actor._nearCamera = () => true;
    f.G.scene.add(actor.character.root);
    return actor;
  };
  const owner = makeActor(true), actor = makeActor(false), packets = [];
  f.G.actors = [owner, actor];
  const members = new Set(['owner', 'viewer']), cfg = { id: 'held-contact', map: 'reef', difficulty: 'normal' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const sender = new f.NetMatch({ myId: 'owner', hostId: 'owner', isHost: true, _members: members,
    tr: { broadcast: msg => packets.push(clone(msg)), sendTo() {} } }, cfg);
  sender.bind({ actors: [owner], state: 'playing', time: 180, opts: {} });
  const receiver = new f.NetMatch({ myId: 'viewer', hostId: 'owner', isHost: false, _members: members,
    tr: { broadcast() {}, sendTo() {} } }, cfg);
  receiver.bind({ actors: [actor], state: 'playing', time: 180, opts: {} });
  receiver._voiceLoop = (_a, _near, key, on) => { calls.push([key, !!on]); return null; };
  const checkRoll = expected => {
    calls.length = 0; receiver._voices(1 / 60);
    assert.deepEqual(calls.find(([key]) => key === 'roll'), ['roll', expected]);
  };
  try {
    actor.grounded = true; actor.weaponRunner.rolling = true;
    checkRoll(false); // Grounded held state cannot substitute for an accepted snapshot.
    owner.alive = true; owner.grounded = true; owner.weaponRunner.rolling = true;
    sender._sendTick();
    assert.ok(packets.length, 'real owner snapshot emitted');
    const packet = packets.at(-1);
    receiver.onMessage('owner', clone(packet));
    receiver._peer('owner').tr = packet.ts;
    receiver._sample(actor, packet.ts, 0);
    assert.equal(actor.net.ready, true, 'received snapshot admitted and sampled');
    actor.grounded = false;
    checkRoll(false);
    actor.grounded = true;
    checkRoll(true);
  } finally {
    sender.dispose(); receiver.dispose();
    f.G.actors = [];
    for (const a of [owner, actor]) { f.G.scene.remove(a.character.root); a.character.dispose(); }
  }
});
