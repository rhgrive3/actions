import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../reliability/tests/controls-fixture.mjs';

const stage = { id: 'ranked-lifecycle', zones: [{ center: [0,0,0], size: [8,8] }],
  clams: { spawns: [], goals: [[0,0,20],[0,0,-20]] },
  rainmaker: { center: [0,0,0], checkpoints: [[],[]], goals: [[0,0,20],[0,0,-20]] } };
async function world(mode = 'clams', host = false) {
  const f = await fixture({ ranked: true, network: true });
  f.context.document.createElement = () => ({ dataset: {} });
  f.context.document.head = { appendChild() {} }; f.context.structuredClone = structuredClone;
  f.installRanked(f);
  f.G.projectiles = new f.Projectiles(new f.THREE.Scene());
  const local = f.make(), remote = f.make();
  Object.assign(local, { nid: 1, slot: 0, team: 0, owner: 'guest', isLocal: true, invuln: 0, netLife: 1 });
  Object.assign(remote, { nid: 2, slot: 0, team: 1, owner: 'host', remote: true, invuln: 0, netLife: 1 });
  const engine = new f.RankedEngine(mode, stage), m = { mode, state: 'playing', time: 300,
    actors: [local, remote], local, ranked: engine, rankedGains: [0,0], rankedBarrierHits: [],
    rankedWorld: { zoneCoverage: () => [], floorAt: () => 0, blocked: () => false, update() {} },
    playing() { return this.state === 'playing'; }, canRespawn: () => false,
    setState(state) { this.state = state; } };
  Object.assign(f.G, { match: m, actors: m.actors, mode: 'match', settings: { aimAssist: 0 }, time: 10 });
  const session = { myId: host ? 'host' : 'guest', hostId: 'host', isHost: host,
    _members: new Set(['host','guest']), tr: { broadcast() {}, sendTo() {} } };
  const nm = new f.NetMatch(session, { id: 'ranked-lifecycle', mode, map: 'tidewater' }); nm.bind(m); f.G.netm = nm;
  const input = new f.Input({}), rig = { yaw: 0, pitch: 0, mode: 'follow', target: local };
  const controller = new f.PlayerController(local, rig, input); controller.computeAim = () => {};
  controller.enabled = true; m.controller = controller; f.G.rig = rig;
  return { ...f, local, remote, engine, m, nm, input, controller };
}
const damage = f => ({ k: 'rkdamage', match: f.nm.cfg.id, seq: 1, victim: '1', attacker: '2', life: 1, damage: 30, cause: 'Gachihoko_Bullet' });

for (const device of ['keyboard', 'pad', 'touch']) test(`a ${device} throw tap released before the next tick still throws one clam`, async () => {
  const f = await world();
  f.engine.rule.state.inventories['1'] = { team: 0, small: 2, power: false };
  if (device === 'keyboard') f.input.pressed.add('KeyC');
  if (device === 'pad') f.input.padPressed.add(1);
  if (device === 'touch') {
    f.input.lastDevice = 'touch';
    f.input.mobile = { active: true, root: {}, lookDX: 0, lookDY: 0, moveX: 0, moveY: 0,
      gyro: { enabled: false, discard() {} }, down: () => false, wasPressed: id => id === 'sub' };
  }
  f.controller.update(1 / 60); f.local.update(0);
  f.engine.rule._processThrows(f.buildFrame(f.m, { G: f.G }));
  assert.equal(f.engine.rule.state.inventories['1'].small, 1, 'the press edge survives release');
  assert.equal(f.local.intent.sub, false, 'the touch throw never also arms a bomb');
  f.input.pressed.clear(); f.input.padPressed.clear();
  if (f.input.mobile) f.input.mobile.wasPressed = () => false;
  f.controller.update(1 / 60); f.local.update(0);
  f.engine.rule._processThrows(f.buildFrame(f.m, { G: f.G }));
  assert.equal(f.engine.rule.state.inventories['1'].small, 1, 'the tap is consumed once');
});

test('holding the touch throw through an empty inventory never turns the same gesture into a bomb', async () => {
  const f = await world();
  f.engine.rule.state.inventories['1'] = { team: 0, small: 1, power: false };
  let held = true, pressed = true;
  f.input.lastDevice = 'touch';
  f.input.mobile = { active: true, root: {}, lookDX: 0, lookDY: 0, moveX: 0, moveY: 0,
    gyro: { enabled: false, discard() {} },
    down: id => id === 'sub' && held, wasPressed: id => id === 'sub' && pressed };
  const step = () => {
    f.controller.update(1 / 60); f.local.update(1 / 60);
    f.engine.rule._processThrows(f.buildFrame(f.m, { G: f.G }));
  };
  step(); pressed = false;
  assert.equal(f.engine.rule.state.inventories['1'].small, 0);
  for (let i = 0; i < 20; i++) step();
  assert.equal(f.local.weaponRunner.aimingSub, false, 'the initial clam throw owns the complete hold');
  held = false; step(); step();
  assert.equal(f.G.projectiles.bombs.length, 0, 'releasing that gesture never emits a bomb');
  held = pressed = true; step();
  assert.equal(f.local.weaponRunner.aimingSub, true, 'a fresh empty-inventory gesture can still use SUB');
  held = pressed = false;
  for (let i = 0; i < 60; i++) step(); // retain the ordinary SUB ready/use delay
  assert.equal(f.G.projectiles.bombs.length, 1);
});

test('opening the Turf Map blocks a fresh C throw and requires release before a later deliberate throw', async () => {
  const f = await world(); f.engine.rule.state.inventories['1'] = { team: 0, small: 2, power: false };
  f.controller.setTurfMap(true); f.input.keys.add('KeyC'); f.controller.update(1/60);
  assert.equal(f.local.intent.throw, false);
  f.local.update(0); const frame = f.buildFrame(f.m, { G: f.G }); f.engine.rule._processThrows(frame);
  assert.equal(f.engine.rule.state.inventories['1'].small, 2);
  f.controller.setTurfMap(false); f.controller.update(1/60); assert.equal(f.local.intent.throw, false);
  f.input.keys.delete('KeyC'); f.controller.update(1/60);
  f.input.keys.add('KeyC'); f.controller.update(1/60); assert.equal(f.local.intent.throw, true);
});

test('disabled/menu/dead controller frames clear a pending throw and observe release for the next press', async () => {
  for (const state of ['disabled','menu','dead']) {
    const f = await world(); f.local._rankedThrowHeld = true; f.local.intent.throw = true; f.local._rankedThrowPending = true;
    if (state === 'disabled') f.controller.enabled = false;
    if (state === 'menu') f.controller.menuBlocked = true;
    if (state === 'dead') f.local.alive = false;
    f.controller.update(1/60);
    assert.equal(f.local.intent.throw, false, state); assert.equal(f.local._rankedThrowPending, false, state);
    f.controller.enabled = true; f.controller.menuBlocked = false; f.local.alive = true;
    f.input.keys.add('KeyC'); f.controller.update(1/60); assert.equal(f.local.intent.throw, true, state + ' new press');
  }
});

test('invalid ranked damage cannot consume sequence admission before a valid hit with that sequence', async () => {
  for (const invalid of ['damage','life','victim']) {
    const f = await world('rainmaker'), packet = damage(f), bad = { ...packet, seq: 9 };
    if (invalid === 'damage') bad.damage = NaN;
    if (invalid === 'life') bad.life = 0;
    if (invalid === 'victim') bad.victim = 'missing';
    f.nm.onMessage('host', bad);
    assert.equal(f.nm.rankedDamageSeq || 0, 0, invalid);
    f.nm.onMessage('host', packet); assert.equal(f.local.hp, 70, invalid);
    f.nm.onMessage('host', packet); assert.equal(f.local.hp, 70, 'accepted hit cannot replay');
  }
});

test('ranked damage is inactive after match end and after network disposal', async () => {
  for (const state of ['finish','judge','results','winner','disposed']) {
    const f = await world('rainmaker');
    if (state === 'winner') f.engine.finish(0);
    else if (state === 'disposed') f.nm.dispose();
    else f.m.state = state;
    f.nm.onMessage('host', damage(f));
    assert.equal(f.local.hp, 100, state); assert.equal(f.nm.rankedDamageSeq || 0, 0, state);
  }
});

test('invalid out-of-range barrier hits cannot consume valid owner sequence or enter the hit queue', async () => {
  const f = await world('rainmaker', true), packet = { k: 'rkhit', match: f.nm.cfg.id, id: '1', seq: 1, damage: 30, kind: 'shooter', pos: [0,0,0] };
  f.nm.onMessage('guest', { ...packet, seq: 9, pos: [100,0,0] });
  assert.equal(f.nm.rankedHitSeq?.get('guest') || 0, 0);
  f.nm.onMessage('guest', { ...packet, seq: 8, damage: '30' });
  assert.equal(f.m.rankedBarrierHits.length, 0);
  f.nm.onMessage('guest', packet); assert.equal(f.m.rankedBarrierHits.length, 1);
  f.nm.onMessage('guest', packet); assert.equal(f.m.rankedBarrierHits.length, 1);
});

test('stale remote ranked special input expires together with fire/throw and cannot block clam pickups', async () => {
  const f = await world('clams', true), a = f.local; a.remote = true; a.specialActive = null;
  f.nm.rankedInputs = new Map([['1',{ seq: 1, at: f.G.time-1, fire: true, throw: true, aim: [0,0,1], special: 'crabTank', specialDeployed: false, clamDrop: 0 }]]);
  f.engine.rule._newClam('small', null, a.pos.toArray());
  const frame = f.buildFrame(f.m, { G: f.G });
  assert.equal(frame.actors.find(x => x.id === '1').special, null); assert.equal(frame.inputs['1'], undefined);
  f.engine.rule._processPickups(frame);
  assert.equal(f.engine.rule.state.inventories['1'].small, 1);
});
