// Deterministic local/remote comparison. Reuses robustness-fixture.mjs (the real
// adapted WeaponRunner/Projectiles/NetMatch in a VM) and compares the projectile
// the shooter simulates locally against the one a peer reconstructs from the wire
// packet, at 60 Hz. { network: false } reproduces the pre-fix baseline on the same
// sources so the overshoot can be shown, then the composed adapter is verified.
//
// Nothing here re-implements gameplay: the fixture loads the actual public
// modules through the real build-time adapter chain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const SIM_DT = 1 / 60;
const r3 = (x) => Math.round(x * 1000) / 1000;

// Execute the production updater, including native collision and retirement.
function simulate(f, init, {dt=SIM_DT,steps=120}={}) {
  const P=f.projectiles, previous=P.list,p=P._new(),owner=f.makeActor({nid:0,owner:'me',remote:true});
  Object.assign(p,init,{owner,team:0,type:'drop',age:0,ghost:true,damage:0,size:.15,radius:.2,trailEvery:0,seed:.5});
  p.pos=init.pos.clone();p.prev=init.pos.clone();p.start=init.pos.clone();p.vel=init.vel.clone();P.list=[p];
  const pts=[];
  try{for(let i=0;i<steps;i++){P.update(dt);pts.push(p.pos.clone());if(!P.list.length)break;}}
  finally{P.list=previous;}
  return{pts,end:p.pos.clone()};
}

// Wire packet -> the plain state a ghost would integrate (mirrors ghostProjectile).
function fromPacket(e) {
  const inkMetaOffset = e[27] === null || typeof e[27] === 'object' ? 1 : 0;
  const kitOffset = e.length === 35 || e.length === 36 || e.length === 37 ? 2 : 0;
  const birth = 27 + inkMetaOffset + kitOffset;
  return {
    type: e[3], pos: { x: e[5], y: e[6], z: e[7] }, vel: { x: e[8], y: e[9], z: e[10] },
    delay: e[11], life: e[12], straight: e[13], grav: e[16], drag: e[17],
    vertical: e[birth], seed: e[birth + 1], netId: e[birth + 2],
  };
}

// Build a THREE.Vector3-shaped state from a packet without importing THREE.
function packetState(f, e) {
  return {
    pos: new f.THREE.Vector3(e[5], e[6], e[7]),
    vel: new f.THREE.Vector3(e[8], e[9], e[10]),
    delay: e[11], life: e[12], straight: e[13], grav: e[16], drag: e[17],
  };
}

function localState(p) {
  return { pos: p.pos.clone(), vel: p.vel.clone(), delay: p.delay, life: p.life, straight: p.straight, grav: p.grav, drag: p.drag };
}

const horizontal = (v) => Math.hypot(v.x, v.z);

async function rollerCase(network, vertical) {
  const f = await fixture({ network });
  const nm = f.makeNetMatch(f.makeSession());
  const a = f.makeActor({ nid: 0, owner: 'me', vertical });
  f.bind(nm, [a]);
  nm.out.length = 0;
  f.projectiles.fireFlick(a, a.weapon);
  const local = f.projectiles.list.slice();
  const packets = nm.out.slice();
  return { f, local, packets };
}

test('horizontal roller: local physics uses final gravity/drag and the wire carries it', async () => {
  const baseline = await rollerCase(false, false);
  const fixed = await rollerCase(true, false);
  for (const { local, packets } of [baseline, fixed]) {
    assert(local.length > 0, 'flick produced drops');
    for (const p of local) { assert.equal(p.grav, 144); assert.equal(p.drag, 6); }
  }
  // #64 finalizes active Roller physics before _push, so both the base recorder
  // and the network overlay see the exact physics the shooter integrates.
  for (const row of [baseline, fixed]) {
    assert.equal(row.packets[0][16], row.local[0].grav);
    assert.equal(row.packets[0][17], row.local[0].drag);
  }
  // And the birth mode is explicit, never inferred from cosmetic nose/tail.
  assert.equal(fixed.packets[0][29], 0);
});

test('vertical roller: remote ink no longer flies too far on the wire', async () => {
  const baseline = await rollerCase(false, true);
  const fixed = await rollerCase(true, true);
  const bLocal = baseline.local[0], bPacket = baseline.packets[0];
  const fLocal = fixed.local[0], fPacket = fixed.packets[0];

  // The shooter's own drop is identical in both runs (profile physics unchanged).
  assert.equal(bLocal.grav, 144); assert.equal(fLocal.grav, 144);
  assert.equal(fPacket[29], 1, 'vertical birth mode replicated explicitly');

  const localTraj = simulate(fixed.f, localState(fLocal));
  const wireBaseline = simulate(baseline.f, packetState(baseline.f, bPacket));
  const wireFixed = simulate(fixed.f, packetState(fixed.f, fPacket));

  const localDist = horizontal(localTraj.end);
  const baseDist = horizontal(wireBaseline.end);
  const fixedDist = horizontal(wireFixed.end);

  // Weapons Fidelity now closes the old publication-order gap before either
  // recorder runs; both packet paths must track the actual local flight.
  assert(Math.abs(baseDist - localDist) < localDist * 0.05,
    `base recorder tracks local (local ${localDist.toFixed(2)} vs wire ${baseDist.toFixed(2)})`);
  assert(Math.abs(fixedDist - localDist) < localDist * 0.05,
    `network recorder tracks local (local ${localDist.toFixed(2)} vs wire ${fixedDist.toFixed(2)})`);
});

test('60 Hz trajectory envelope matches local across the flight', async () => {
  const fixed = await rollerCase(true, true);
  const fLocal = fixed.local[0], fPacket = fixed.packets[0];
  const localTraj = simulate(fixed.f, localState(fLocal));
  const wireTraj = simulate(fixed.f, packetState(fixed.f, fPacket));
  assert.equal(localTraj.pts.length, wireTraj.pts.length, 'same step count');
  let worst = 0;
  for (let i = 0; i < localTraj.pts.length; i++) worst = Math.max(worst, localTraj.pts[i].distanceTo(wireTraj.pts[i]));
  assert(worst < 0.25, `max per-frame divergence ${worst.toFixed(3)} m`);
});

async function shooterCase(network) {
  const f = await fixture({ network });
  const nm = f.makeNetMatch(f.makeSession());
  const a = f.makeActor({ nid: 0, owner: 'me', roller: false });
  a.character.getMuzzle = (out) => out.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 0.3));
  f.bind(nm, [a]);
  nm.out.length = 0;
  f.projectiles.fireShooter(a, a.weapon, 0);
  return { f, p: f.projectiles.list[0], e: nm.out[0] };
}

test('shooter: exact delay/life/straight cross the wire without frame-boundary rounding', async () => {
  const baseline = await shooterCase(false);
  const fixed = await shooterCase(true);
  // Baseline rounds the physics boundaries (straightTime = 4 ticks at 60 Hz).
  assert.equal(baseline.e[13], r3(baseline.p.straight));
  assert.notEqual(baseline.e[13], baseline.p.straight);
  // Fixed preserves them exactly, so a peer's 60 Hz reconstruction cannot drift a frame.
  assert.equal(fixed.e[11], fixed.p.delay, 'delay');
  assert.equal(fixed.e[12], fixed.p.life, 'life');
  assert.equal(fixed.e[13], fixed.p.straight, 'straight');
  assert.equal(fixed.e[13], fixed.f.WEAPONS.shooter.straightTime, 'straight matches profile');
  assert.equal(fixed.e[16], fixed.p.grav, 'shooter gravity');
  // Packet is the source of truth for a peer reconstruction.
  assert.equal(packetState(fixed.f, fixed.e).straight, fixed.f.WEAPONS.shooter.straightTime);
});

test('splatling: burst threshold and straight-time timing are preserved on the wire', async () => {
  const f = await fixture({ network: true });
  const { splatlingBurst } = f;
  const w = f.WEAPONS.splatling;
  // Charge-cap boundary: at firstChargeTime the burst is exactly burstFirst.
  const boundary = w.firstChargeTime / w.chargeTime;
  assert.equal(splatlingBurst(w, boundary), w.burstFirst);
  assert.equal(splatlingBurst(w, 0), 0);
  assert.equal(splatlingBurst(w, 1), w.burstMax);

  const nm = f.makeNetMatch(f.makeSession());
  const a = f.makeActor({ nid: 0, owner: 'me', roller: false });
  a.weapon = w;
  a.character.getMuzzle = (out) => out.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 0.3));
  f.bind(nm, [a]);
  nm.out.length = 0;
  f.projectiles.fireSplatling(a, w, 0);
  const p = f.projectiles.list[0], e = nm.out[0];
  assert.equal(e[12], p.life);
  assert.equal(e[13], p.straight);
  // 4 ticks at 60 Hz, kept exact rather than rounded.
  assert.equal(e[13], w.straightTime);
  assert.equal(Math.round(e[13] / SIM_DT), 8);
});

// A paint stub that mirrors world/paint.js: while a sender's replay is muted,
// visual ghost rounds claim no turf.
function paintSpy(f) {
  const calls = [];
  f.G.paint = {
    sample: () => 1,
    splat: (c, r, t, o) => { if (f.G.netm?.mute > 0) return 0; calls.push({ x: c.x, y: c.y, z: c.z, r, t }); return Math.PI * r * r; },
  };
  return calls;
}

test('paint: owner drops claim turf, ghost drops never paint', async () => {
  // Owner: a downward shot lands and splats.
  const owner = await fixture({ network: true });
  const ownerCalls = paintSpy(owner);
  const nm1 = owner.makeNetMatch(owner.makeSession());
  const a1 = owner.makeActor({ nid: 0, owner: 'me', roller: false });
  a1.aimPoint.set(0, 0.4, 8); a1.aimDir.set(0, -0.15, 1).normalize();
  a1.character.getMuzzle = (out) => out.copy(a1.pos).add(new owner.THREE.Vector3(0, 1.05, 0.3));
  owner.bind(nm1, [a1]);
  nm1.out.length = 0;
  owner.projectiles.fireShooter(a1, a1.weapon, 0);
  for (let i = 0; i < 60; i++) owner.projectiles.update(SIM_DT);
  assert(ownerCalls.length > 0, 'the shooter paints its own turf');

  // Ghost: the same flight replayed on a peer claims nothing.
  const peer = await fixture({ network: true });
  const peerCalls = paintSpy(peer);
  const nm2 = peer.makeNetMatch(peer.makeSession());
  const a2 = peer.makeActor({ nid: 0, owner: 'me', remote: true, roller: false });
  peer.bind(nm2, [a2]);
  const clk = { tr: 1000 };
  nm2.peers.set('me', clk);
  nm2._play('me', [1000, 'p', 0, 'shot', 'shooter', 0, 2, 8, 0, -10, 30, 0, 1.2, 0, 0.1, 0.15, 57.6, 0.8, 0, 0, 0.1, 0.8, 1.3, 0.035, 26, 0.3, 3, 0, 0.5, 1]);
  for (let i = 0; i < 40; i++) { clk.tr = 1000 + (i + 1) * SIM_DT; peer.projectiles.update(SIM_DT); }
  assert.equal(peerCalls.length, 0, 'ghost rounds are visual only');
});

test('visual envelope: curtain follows immutable birth mode, not mutable actor mode', async () => {
  for (const network of [false, true]) {
    const f = await fixture({ network });
    const nm = f.makeNetMatch(f.makeSession());
    const a = f.makeActor({ nid: 0, owner: 'me', vertical: true });
    f.bind(nm, [a]);
    nm.out.length = 0;
    f.projectiles.fireFlick(a, a.weapon);
    const p = f.projectiles.list[0];
    assert.equal(p.s3Vertical, true, 'birth mode recorded on the projectile');
    // The actor's live mode is reset later (e.g. it landed) before the envelope builds.
    a.weaponRunner.s3FlickVertical = false;
    const sources = f.rollerCurtainSources(f.G, a, {});
    if (network) assert(sources?.includes(p), 'immutable birth mode owns the curtain');
    else assert(!sources?.includes(p), 'baseline inferred the curtain from mutable actor mode');
  }
});

test('slosher: true-birth unit and lifetime survive the wire exactly', async () => {
  const f = await fixture({ network: true });
  const nm = f.makeNetMatch(f.makeSession());
  const a = f.makeActor({ nid: 0, owner: 'me', roller: false });
  a.weapon = f.WEAPONS.slosher;
  a.character.getMuzzle = (out) => out.copy(a.pos).add(new f.THREE.Vector3(0, 1.05, 0.3));
  f.bind(nm, [a]);
  nm.out.length = 0;
  f.projectiles.fireSlosh(a, a.weapon);
  const local = f.projectiles.list.slice();
  assert.equal(nm.out.filter(e => e[1] === 'p').length, 0, 'pending globs are not published at precreation');
  for (let tick = 1; tick <= 16; tick++) {
    f.G.time = tick / 60; f.clock.set(1000 + f.G.time); f.projectiles.update(1 / 60);
  }
  const packets = nm.out.filter(e => e[1] === 'p');
  assert(local.length > 1 && packets.length === local.length);
  for (let i = 0; i < local.length; i++) {
    const born=local[packets[i][33]];
    assert.equal(packets[i][11], 0, `drop ${i} remaining delay`);
    assert.equal(packets[i][12], born.life, `drop ${i} life`);
    assert.equal(packets[i][13], born.straight, `drop ${i} straight`);
  }
});
