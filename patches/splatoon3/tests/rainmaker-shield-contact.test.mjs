import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { resolveRainmakerShieldContact, SHIELD_BOUNCE_SPEED } from '../runtime/ranked/rainmaker-shield-contact.mjs';

const vec = (x, y, z) => ({ x, y, z });
const body = (x, z, extra = {}) => ({ alive: true, remote: false, pos: vec(x, 0, z), vel: vec(-3, 0, 0), yaw: 0, form: 'kid', hp: 100, s3: {},
  damage(n, attacker, cause) { this.hp -= n; this.hits = (this.hits || []).concat([[n, attacker, cause]]); if (this.hp <= 0) this.alive = false; }, ...extra });
const shield = (balance = 0, active = true) => ({ pos: [0, 0, 0], barrier: { active, balance, max: 1000 } });

test('an active shield is solid: the body leaves the sphere with an outward speed and takes contact damage', () => {
  const a = body(0.5, 0);
  const contact = resolveRainmakerShieldContact(a, shield(), 1 / 60);
  assert.ok(contact);
  assert.ok(Math.hypot(a.pos.x, a.pos.z) >= 1.5 + 0.38 - 1e-6, 'outside shield radius plus body radius');
  assert.ok(a.pos.x > 0, 'pushed out on its own side');
  assert.ok(a.vel.x >= SHIELD_BOUNCE_SPEED - 1e-9, 'outward bounce replaces the inward walk');
  assert.deepEqual(a.hits, [[10, null, 'rainmaker-shield']]);
  // Clear of the sphere: no contact, no damage, the contact clock resets.
  assert.equal(resolveRainmakerShieldContact(a, shield(), 1 / 60), null);
  assert.equal(a.s3.shieldContactClock, null);
});

test('held contact deals 10 every three frames at 30/60/120 Hz; the shield grows with damage', () => {
  for (const hz of [30, 60, 120]) {
    const a = body(0.2, 0.1);
    for (let i = 0; i < hz / 2; i++) { a.pos.x = 0.2; a.pos.z = 0.1; resolveRainmakerShieldContact(a, shield(), 1 / hz); }
    // 0.5 s of contact: first touch, then every 3/60 s → 10 ticks (± one boundary).
    const ticks = a.hits.length;
    assert.ok(ticks >= 10 && ticks <= 11, hz + ' Hz ticks ' + ticks);
  }
  const big = body(2.4, 0);
  assert.equal(resolveRainmakerShieldContact(big, shield(0), 1 / 60), null, 'outside a fresh shield');
  assert.ok(resolveRainmakerShieldContact(big, shield(1000 * 0.9), 1 / 60), 'inside a damaged, swollen shield');
});

test('inactive shields, remote bodies, dead bodies and bodies above the dome are untouched', () => {
  const cases = [[body(0.5, 0), shield(0, false)], [body(0.5, 0, { remote: true }), shield()], [body(0.5, 0, { alive: false }), shield()]];
  for (const [a, s] of cases) { const before = { ...a.pos }; assert.equal(resolveRainmakerShieldContact(a, s, 1 / 60), null); assert.deepEqual(a.pos, before); }
  const high = body(0.3, 0); high.pos.y = 3;
  assert.equal(resolveRainmakerShieldContact(high, shield(), 1 / 60), null, 'feet 3 m up clear the 1.5 m sphere centred 1 m up');
});

test('composed ranked actor update applies the shield after its own movement', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, adaptRuntime: adaptBuildSource, extraExports: `
    export { Match } from './inkwave-public/src/game/match.js';
    export { BotBrain } from './inkwave-public/src/game/bots.js';
    export { NetSession } from './inkwave-public/src/net/session.js';
    export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';` });
  f.context.structuredClone = structuredClone;
  f.installRanked({ ...f.installedRuntime, Match: f.Match, BotBrain: f.BotBrain, NetSession: f.NetSession, structuredClone });
  const a = f.make(); a.nid = 'walker'; a.invuln = 0; a.hp = 100; a.pos.set(0.6, 0, 0); a.vel.set(-2, 0, 0);
  const state = { pos: [0, 0, 0], barrier: { active: true, balance: 0, max: 1000 }, carrier: null, charge: { value: 0 } };
  const ranked = { rule: { state }, time: 0 };
  f.G.match = { mode: 'rainmaker', state: 'playing', ranked, playing: () => true, canRespawn: () => false };
  f.G.actors = [a];
  try {
    a.update(1 / 60);
    assert.ok(Math.hypot(a.pos.x, a.pos.z) >= 1.5 + f.PLAYER.radius - 1e-6);
    assert.ok(a.hp <= 90, 'contact damage reached the actor');
  } finally { f.G.match = null; f.G.actors = []; }
});
