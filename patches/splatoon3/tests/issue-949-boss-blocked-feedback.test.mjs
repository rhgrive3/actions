import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

async function setup({ negative = false, guest = false, host = false } = {}) {
  const f = await fixture({
    productionComposition: true, realProjectiles: true,
    extraExports: `export { Boss } from './inkwave-public/src/boss/boss.js';
      export { BossHud } from './inkwave-public/src/ui/hud-boss.js';
      export { installWeaponsFidelity, fidelityDamage } from './patches/splatoon3/runtime/weapons-fidelity.mjs';`,
    adaptRuntime(rel, code) {
      if (!negative || rel !== 'patches/splatoon3/runtime/weapons-fidelity.mjs') return code;
      const start = code.indexOf(' else if (boss && victim===boss');
      const end = code.indexOf("\n    }\n    context.emit('weapon:impact'", start);
      assert.ok(start >= 0 && end > start, 'negative control removes only the blocked-feedback branch');
      return code.slice(0, start) + code.slice(end);

    },
  });
  f.installWeaponsFidelity(f, f.profile);
  const { G, THREE } = f, actor = f.make('slosher');
  actor.isLocal = true; actor.remote = false; actor.invuln = 0;
  actor.nid = 1; actor.owner = guest ? 'guest' : 'host';
  actor.pos.set(0, 0, 0); actor.aimDir.set(0, 0, 1);
  const events = [], impacts = [], flashes = [], wire = [], immune = [];
  // Use the real HUD event consumer; replace only the final DOM popup sink.
  const hud = Object.assign(Object.create(f.BossHud.prototype), {
    on: true, T: 1, S: f.BossHud.prototype._fresh(), hud: { _local: () => actor },
    _crit(pos, text) { immune.push({ pos, text }); },
  });
  f.on('boss:hit', event => { if (event.blocked) hud._hit(event); });
  f.on('boss:hit', event => events.push(event));
  f.on('weapon:impact', event => impacts.push(event));
  const boss = Object.assign(Object.create(f.Boss.prototype), {
    hp: 1000, visible: true, dead: false, invuln: false, stunned: false,
    pos: new THREE.Vector3(0, 0, 5), match: { state: 'playing' }, crabs: new Map(),
    model: { flash(...args) { flashes.push(args); } },
    brain: { noteDamage() {}, checkPhase() {} }, flashN: 0, weakN: 0,
    crabPop(c) { c.dead = true; }, _defeat() { this.dead = true; },
  });
  G.boss = boss;
  G.netm = null;
  G.projectiles.fireSlosh(actor, actor.weapon);
  const globs = G.projectiles.list.slice();
  assert.equal(globs.length, 9, 'actual S3 emitter produces the nine-glob volley');
  assert.ok(globs.every(p => p.s3DamageGroup === globs[0].s3DamageGroup));
  const group = globs[0].s3DamageGroup;
  if (guest || host) G.netm = { isHost: host, sendBossHit(...args) { wire.push(args); } };
  const hit = (p = globs[0], target = null, point = p.start.clone()) =>
    G.projectiles._bossImpact(p, { target, point });
  return { ...f, actor, boss, globs, group, hit, events, impacts, flashes, wire, immune, hud };
}

test('#949 PR1182 negative control suppresses the native IMMUNE popup while retaining the budget', async () => {
  const h = await setup({ negative: true });
  h.boss.invuln = true; h.hit();
  assert.equal(h.boss.hp, 1000); assert.equal(h.group.has(h.boss), false);
  assert.equal(h.events.length, 0); assert.equal(h.immune.length, 0);
  assert.equal(h.impacts.length, 1);
});

test('#949 local, host and guest blocked body hits preserve native IMMUNE without spending or sending', async () => {
  for (const mode of [{}, {host:true}, {guest:true}]) {
    for (const reason of ['invuln', 'hidden']) {
      const h = await setup(mode);
      h.boss.invuln = reason === 'invuln'; h.boss.visible = reason !== 'hidden';
      h.hit();
      assert.equal(h.boss.hp, 1000); assert.equal(h.group.has(h.boss), false);
      assert.equal(h.events.length, 1); assert.equal(h.events[0].blocked, true);
      assert.equal(h.immune.length, 1); assert.equal(h.immune[0].text, 'IMMUNE');
      assert.equal(h.wire.length, 0); assert.equal(h.impacts.length, 1);
      h.boss.invuln = false; h.boss.visible = true;
      h.hit(h.globs[1]); h.hit(h.globs[2]);
      assert.equal(h.group.get(h.boss), 70);
      assert.equal(h.boss.hp, mode.guest ? 1000 : 930);
      assert.equal(h.wire.length, mode.guest ? 1 : 0);
      assert.equal(h.events.length, 2, 'later accepted maximum applies or predicts only once');
      assert.equal(h.impacts.length, 3);
    }
  }
});

test('#949 native blocked HUD throttling survives repeated globs, with no budget mutation', async () => {
  const h = await setup(); h.boss.invuln = true;
  h.hit(); h.hit(h.globs[1]);
  assert.equal(h.events.length, 2); assert.equal(h.immune.length, 1);
  h.hud.T += 1; h.hit(h.globs[2]);
  assert.equal(h.immune.length, 2); assert.equal(h.group.has(h.boss), false);
});

test('#949 spent maxima do not manufacture blocked feedback; higher pending deltas remain unspent', async () => {
  const h = await setup(); h.hit(); h.boss.invuln = true; h.hit(h.globs[1]);
  assert.equal(h.events.length, 1); assert.equal(h.immune.length, 0);
  assert.equal(h.group.get(h.boss), 70); assert.equal(h.boss.hp, 930);
  const partial = await setup();
  const lowPoint = partial.globs[0].start.clone().add(new partial.THREE.Vector3(0, -100, 0));
  partial.hit(partial.globs[0], null, lowPoint); const low = partial.group.get(partial.boss);
  assert.ok(low > 0 && low < 70);
  partial.boss.invuln = true; partial.hit(partial.globs[1]);
  assert.equal(partial.group.get(partial.boss), low); assert.equal(partial.immune.length, 1);
  partial.boss.invuln = false; partial.hit(partial.globs[2]);
  assert.equal(partial.group.get(partial.boss), 70); assert.equal(partial.boss.hp, 930);
});

test('#949 dead, remote, ghost and non-playing routes do not acquire a new send or popup', async () => {
  for (const reason of ['dead', 'remote', 'ghost', 'finish', 'missing']) {
    const h = await setup({ guest:true });
    if (reason === 'dead') { h.boss.dead = true; h.boss.invuln = true; }
    if (reason === 'remote') { h.actor.remote = true; h.boss.invuln = true; }
    if (reason === 'ghost') { h.globs[0].ghost = true; h.boss.invuln = true; }
    if (reason === 'finish') h.boss.match.state = 'finish';
    if (reason === 'missing') { h.globs[0].owner = null; h.boss.invuln = true; }
    h.hit();
    assert.equal(h.boss.hp, 1000, reason); assert.equal(h.group.has(h.boss), false, reason);
    assert.equal(h.wire.length, 0, reason); assert.equal(h.immune.length, 0, reason);
  }
});

test('#949 crab admission remains independent of shell immunity and never emits body IMMUNE', async () => {
  for (const guest of [false,true]) {
    const h = await setup({ guest }); h.boss.invuln = true; h.boss.visible = false;
    const crab = { id:7, hp:200, dead:true, x:0, y:0, z:3 };
    h.hit(h.globs[0], crab);
    assert.equal(h.group.has(crab), false); assert.equal(h.events.length, 0);
    crab.dead = false; h.hit(h.globs[1], crab); h.hit(h.globs[2], crab);
    assert.equal(crab.hp, guest ? 200 : 130); assert.equal(h.group.get(crab), 70);
    assert.equal(h.immune.length, 0); assert.equal(h.wire.length, guest ? 1 : 0);
  }
});

test('#949 blocked/accepted native results agree across fixed 30, 60 and 120 Hz schedules', async () => {
  const results = [];
  for (const hz of [30,60,120]) {
    const h = await setup(), clock = new FixedClock(); let tick = 0;
    for (let frame=0; frame<hz/2; frame++) clock.advance(1/hz, () => {
      h.boss.invuln = tick < 2;
      if (tick<h.globs.length) h.hit(h.globs[tick]); tick++;
    });
    results.push([h.boss.hp,h.group.get(h.boss),h.events.length,h.immune.length]);
  }
  assert.deepEqual(results[0],results[1]); assert.deepEqual(results[1],results[2]);
  assert.deepEqual(results[0],[930,70,3,1]);
});
