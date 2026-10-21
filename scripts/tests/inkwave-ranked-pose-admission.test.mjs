import assert from 'node:assert/strict';
import test from 'node:test';
import { admitRankedPose, objectiveSpecialFor, rankedStageBounds, RANKED_POSE_LIMITS as L } from '../../patches/splatoon3/runtime/ranked/pose-admission.mjs';

const actor = { team:0, pos:{x:0,y:0,z:0}, specialActive:null };
const world = { floorAt:()=>0, blocked:()=>false };
const ALIVE=1, SQUID=2, GROUNDED=16, SPECIAL=8192, CHARGE=16384, FLIGHT=32768;
function row(x=0,z=0,{y=0,tp=0,f=17,jump=null}={}) {
  const r = Array(21).fill(0);
  r[0]=1; r[1]=x; r[2]=y; r[3]=z; r[10]=f; r[11]=100; r[12]=100; r[16]=tp;
  if (jump) { r[21]=0; r[22]=0; r[23]=['inkwave-adoption-v1',0,1,0,0,[1,jump.t||0,jump.dur||1.9,...jump.from,...jump.to,0,0,0,-1,0,0,0],null,null,0,null]; }
  return r;
}
// A 160×120 WU stage with home points at z=∓50 and an ally at [10,0,40].
const level = { bounds:{minX:-60,maxX:60,minZ:-80,maxZ:80}, blocks:[{aabbMin:{x:-60,y:-1,z:-80},aabbMax:{x:60,y:12,z:80}}],
  spawnPads:[{x:0,y:0,z:-50},{x:0,y:0,z:50}], homeSuperJumpPoints:[{x:0,y:0,z:-48},{x:0,y:0,z:48}] };
function context(clock, { allies = [[10,0,40]], landings } = {}) {
  return { get now() { return clock.host; }, level, fallDeathY:-1.45,
    landings: a => landings ?? [level.homeSuperJumpPoints[a.team], level.spawnPads[a.team]], allies: () => allies };
}

// Owner simulation: frames at `hz`, NetMatch's 20 Hz tick accumulator, ordered
// reliable delivery with `latency(ts)`; returns the admitted objective path.
function owner({ hz=60, seconds=6, at, flags=()=>ALIVE|SQUID|GROUNDED, latency=()=>.08, tp=()=>0, jump=()=>null,
  start=[0,0,-40], forgeTs=null, rate=20, ctx=null, state={} }) {
  const clock = { host: 0 }, c = ctx?.(clock) ?? context(clock);
  const dt = 1/hz, out = []; let t = 0, tick = 0, host = 0, ts = 0;
  const first = at(0); assert.equal(admitRankedPose(state,row(first[0],first[2],{y:first[1],f:flags(0)}),{...actor,pos:{x:start[0],y:start[1],z:start[2]}},0,world,(clock.host=0,c)),true);
  while (t < seconds - 1e-9) {
    t += dt; tick -= dt;
    if (tick > 0) continue;
    tick += 1/rate; if (tick < 0) tick = 1/rate;
    ts = forgeTs ? forgeTs(t) : t;
    host = Math.max(host, t + latency(t));
    clock.host = host;
    const p = at(t), ok = admitRankedPose(state,row(p[0],p[2],{y:p[1],f:flags(t),tp:tp(t),jump:jump(t)}),actor,ts,world,c);
    out.push({ t, ts, host, p, ok, admitted: state.last.pos.slice() });
  }
  return { out, state, rejected: out.filter(s => !s.ok).length };
}
const straight = (v, from=[0,0,-40]) => t => [from[0], from[1], from[2] + v*t];
// In-bounds back-and-forth along z ∈ [-60, 60] at speed v (long runs).
const shuttle = v => t => { const u = (v*t) % 240; return [0, 0, u < 120 ? -60 + u : 180 - u]; };

test('owner path permits smooth running but denies a finite teleport and stale timestamp',()=>{
  const s = {};
  assert.equal(admitRankedPose(s,row(),actor,10,world),true);
  assert.equal(admitRankedPose(s,row(.65,.2),actor,10.05,world),true);
  assert.equal(admitRankedPose(s,row(42,0),actor,10.1,world),false,'finite forged in-stage jump');
  assert.equal(admitRankedPose(s,row(1,0),actor,10.01,world),false,'replayed time');
  assert.deepEqual(s.last.pos,[.65,0,.2],'rejected sample does not poison next admission');
  assert.equal(admitRankedPose(s,row(1,.3),actor,10.1,world),true);
});
test('a forged teleport epoch cannot override a live normal actor',()=>{
  const s={};
  assert.equal(admitRankedPose(s,row(),actor,1,world),true);
  assert.equal(admitRankedPose(s,row(36,0,{tp:1}),actor,1.05,world),false);
  assert.equal(s.last.tp,0);
});
test('host geometry rejects grounded high-altitude and tunneling',()=>{
  const s={};
  assert.equal(admitRankedPose(s,row(),actor,1,world),true);
  assert.equal(admitRankedPose(s,row(0,0,{y:9}),actor,1.05,world),false);
  const wall={floorAt:()=>0,blocked:()=>true};
  assert.equal(admitRankedPose(s,row(2,0),actor,1.2,wall),false);
});
test('a teleport epoch after Super Jump charge must land on a host-known landing point',()=>{
  const clock={host:1}, ctx=context(clock,{allies:[[45,0,0]]});
  const charged=()=>{const s={};
    assert.equal(admitRankedPose(s,row(),actor,1,world,ctx),true);
    clock.host=1.05;assert.equal(admitRankedPose(s,row(.2,0,{f:1|CHARGE}),actor,1.05,world,ctx),true);
    clock.host=1.3;assert.equal(admitRankedPose(s,row(.3,0,{f:1|FLIGHT}),actor,1.3,world,ctx),true);
    clock.host=1.35;return s;};
  const ok=charged();
  assert.equal(admitRankedPose(ok,row(45,1.1,{f:1|FLIGHT,tp:1}),actor,1.35,world,ctx),true,'teammate landing');
  assert.equal(ok.last.tp,1);
  const forged=charged();
  assert.equal(admitRankedPose(forged,row(30,-20,{f:1|FLIGHT,tp:1}),actor,1.35,world,ctx),false,'arbitrary destination');
  assert.equal(forged.last.tp,0);
  const legacy={};
  assert.equal(admitRankedPose(legacy,row(),actor,1,world),true);
  assert.equal(admitRankedPose(legacy,row(.2,0,{f:1|CHARGE}),actor,1.05,world),true);
  assert.equal(admitRankedPose(legacy,row(45,0,{f:1|FLIGHT,tp:1}),actor,1.35,world),false,'no host landing knowledge');
});
test('remote null special cannot clear an active host-observed restriction',()=>{
  for(const id of ['krakenRoyale','zipcaster','inkjet','crabTank']) {
    assert.equal(objectiveSpecialFor({specialActive:{id}}, {special:null}),id);
  }
  assert.equal(objectiveSpecialFor(actor,{special:'storm'}),'storm');
  assert.equal(objectiveSpecialFor(actor,{special:null}),null);
});

// ---- legitimate movement across frame rates, jitter and delivery spikes
const jitter = t => .08 + .03 * Math.sin(t * 37) ** 2;
for (const hz of [30, 60, 120]) {
  test(`max Swim Speed Up swim (14.4 WU/s) is never held at ${hz} Hz with jitter`, () => {
    const r = owner({ hz, at: straight(14.4), latency: jitter, seconds: 5 });
    assert.equal(r.rejected, 0);
  });
  test(`Reefslider dash (24.3 WU/s, 54F) between swims is admitted at ${hz} Hz`, () => {
    const at = t => [0, 0, -40 + (t < 1 ? 14.4*t : t < 1.9 ? 14.4 + 24.3*(t-1) : 14.4 + 24.3*.9 + 14.4*(t-1.9))];
    assert.equal(owner({ hz, at, latency: jitter, seconds: 4, flags: t => ALIVE|SQUID|(t>=1&&t<1.9?SPECIAL:0) }).rejected, 0);
  });
  test(`chained Dualie rolls (5 WU / 0.2 s) and running are admitted at ${hz} Hz`, () => {
    const at = t => { const k = Math.floor(t / .7), u = t - k*.7; return [0, 0, -40 + k*(5 + 8.64*.5) + (u < .2 ? 25*u : 5 + 8.64*(u-.2))]; };
    assert.equal(owner({ hz, at, latency: jitter, seconds: 4.2, flags: () => ALIVE|GROUNDED }).rejected, 0);
  });
  test(`a jump and a 20 WU fall at maxFall 40 are admitted at ${hz} Hz`, () => {
    const at = t => { const y = t < 1 ? 20 : Math.max(0, 20 - 40*(t-1)); return [0, y, -40 + 6*t]; };
    const r = owner({ hz, at, seconds: 3, start:[0,20,-40], flags: t => ALIVE | (t >= 1.5 ? GROUNDED : 0) });
    assert.equal(r.rejected, 0);
  });
}
test('a 0.5 s delivery stall followed by bunched packets is admitted', () => {
  const latency = t => t > 2 && t < 2.5 ? .08 + (2.5 - t) : .08;
  assert.equal(owner({ at: straight(14.4), latency }).rejected, 0);
});
test('a longer 1.5 s stall holds briefly, then recovers to the true pose', () => {
  const latency = t => t > 2 && t < 3.5 ? .08 + (3.5 - t) : .08;
  const r = owner({ at: shuttle(14.4), start:[0,0,-60], latency, seconds: 12 });
  assert.ok(r.rejected > 0, 'beyond the bounded clock bank the objective pose holds');
  const last = r.out.at(-1);
  assert.equal(last.ok, true); assert.deepEqual(last.admitted, last.p);
  const resumed = r.out.findLastIndex(s => !s.ok);
  assert.ok(r.out[resumed].t < 10, 'recovers while the owner keeps swimming at full speed');
});
test('a low-FPS owner (8 Hz frames, 0.125 s ticks) swimming is admitted', () => {
  assert.equal(owner({ hz: 8, at: straight(14.4), latency: jitter }).rejected, 0);
});

// ---- modified owners: sustained budget, forged clocks, packet floods
// Admitted objective path length (sum of admitted horizontal steps).
function travelled(r) {
  let sum = 0, prev = r.out[0].admitted;
  for (const s of r.out) { sum += Math.hypot(s.admitted[0]-prev[0], s.admitted[2]-prev[2]); prev = s.admitted; }
  return sum;
}
const budget = seconds => L.sustainedSpeed * (seconds + L.clockSlack) + L.burst + 1;
test('continuous per-sample-limit motion is bounded by the sustained budget', () => {
  // The original gate allowed 1 + 18·dt every sample (38 WU/s at 20 Hz); stay just inside it.
  const r = owner({ at: shuttle(37), start:[0,0,-60], seconds: 5 });
  assert.ok(r.rejected > 0);
  assert.ok(travelled(r) <= budget(5), `travelled ${travelled(r)}`);
});
test('a forged sender clock (+0.35 s per real 50 ms) gains no distance', () => {
  const r = owner({ at: shuttle(140), start:[0,0,-60], forgeTs: t => t * 7, seconds: 5 });
  assert.ok(travelled(r) <= budget(5), `travelled ${travelled(r)}`);
});
test('flooding 120 packets/s gains no per-packet allowance', () => {
  const r = owner({ at: shuttle(130), start:[0,0,-60], rate: 120, hz: 240, seconds: 5 });
  assert.ok(travelled(r) <= budget(5), `travelled ${travelled(r)}`);
});
test('stage AABB rejects a pose beyond the level bounds', () => {
  assert.deepEqual(rankedStageBounds(level), { minX:-60, maxX:60, minZ:-80, maxZ:80, maxY:12 });
  const r = owner({ at: t => [60 + 8*t, 0, -40], start:[60,0,-40], seconds: 4 });
  assert.ok(r.rejected > 0);
  assert.ok(r.state.last.pos[0] <= 60 + L.boundsMargin);
  const high = {}, clock = { host: 0 }, c = context(clock);
  assert.equal(admitRankedPose(high,row(0,0,{y:0}),actor,0,world,c),true);
  clock.host = 30;
  assert.equal(admitRankedPose(high,row(0,0,{y:12 + L.ceiling + 1,f:1}),actor,30,{floorAt:()=>null},c),false);
});
test('a grounded claim with no floor under any probe is not objective support', () => {
  const s = {}, clock = { host: 0 }, c = context(clock), voidWorld = { floorAt: () => null, blocked: () => false };
  assert.equal(admitRankedPose(s,row(0,0),actor,0,voidWorld,c),true);
  assert.equal(s.last.grounded,false);
  const ledge = { floorAt: (x) => x > .3 ? 0 : -4, blocked: () => false }, t = {};
  assert.equal(admitRankedPose(t,row(0,0),actor,0,ledge,c),true,'ledge lip within the foot probe');
  assert.equal(t.last.grounded,true);
});

// ---- relocation epochs
function superJump(to, { claimedTo = to, hz = 60 } = {}) {
  const from = [0,0,-40], d = Math.hypot(to[0]-from[0], to[2]-from[2]), dur = 1.15 + Math.min(.6, d/80);
  const apex = 11 + Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]) * .08;
  const pos = t => { if (t < 1) return from; if (t < 1 + dur) { const k = (t-1)/dur, e = k < .5 ? 2*k*k : 1 - (-2*k+2)**2/2;
      return [from[0]+(to[0]-from[0])*e, from[1]+(to[1]-from[1])*e + Math.sin(Math.PI*k**.86)*apex, from[2]+(to[2]-from[2])*e]; } return to; };
  return owner({ hz, seconds: 1 + dur + 1, at: pos, latency: jitter,
    flags: t => ALIVE | (t >= .2 && t < 1 ? CHARGE : t >= 1 && t < 1 + dur ? FLIGHT : GROUNDED),
    jump: t => t >= 1 && t < 1 + dur ? { from, to: claimedTo, t: t - 1, dur } : null });
}
for (const hz of [30, 60, 120]) test(`a Super Jump to a teammate is admitted along its flight at ${hz} Hz`, () => {
  const r = superJump([10,0,39], { hz });
  assert.equal(r.rejected, 0); assert.deepEqual(r.state.last.pos, [10,0,39]);
});
test('a Super Jump home is admitted', () => {
  const r = superJump([0,0,-48]);
  assert.equal(r.rejected, 0);
});
test('a Super Jump to an arbitrary point holds the pre-jump objective pose', () => {
  const r = superJump([-30,0,30]);
  assert.ok(r.rejected > 0);
  assert.ok(r.out.every(s => Math.hypot(s.admitted[0]+30, s.admitted[2]-30) > 20), 'never admitted near the forged landing during flight');
});
test('a forged flight corridor off the claimed segment is rejected', () => {
  const r = superJump([10,0,39], { claimedTo: [10,0,39] });
  assert.equal(r.rejected, 0);
  const s = r.state, clock = { host: 100 }, c = context(clock);
  s.last.flags |= CHARGE; s.jumpSince = s.last.t - 1; clock.host = s.last.host + .05;
  const flight = { from: s.last.pos, to: [10,0,39] };
  assert.equal(admitRankedPose(s,row(40,39,{f:1|FLIGHT,jump:flight}),actor,s.last.t + .05,world,c),false);
});
test('a Zipcaster/Inkjet return lands on the host-recorded special origin', () => {
  const s = {}, clock = { host: 0 }, c = context(clock, { allies: [], landings: [] });
  let t = 0; const send = (x, z, f) => { t += .05; clock.host = t + .08; return admitRankedPose(s,row(x,z,{f}),actor,t,world,c); };
  assert.equal(admitRankedPose(s,row(0,-40),{...actor,pos:{x:0,y:0,z:-40}},0,world,c),true);
  assert.equal(send(0,-40,ALIVE|SPECIAL),true);
  for (let i = 1; i <= 40; i++) assert.equal(send(0,-40 + i*.9,ALIVE|SPECIAL),true);
  for (let i = 0; i < 16; i++) assert.equal(send(0,-4,ALIVE|CHARGE),true);
  const from = [0,0,-4], flight = to => row(0,-7.5,{f:ALIVE|FLIGHT,jump:{from,to}});
  const fork = () => ({ ...s, last: { ...s.last } });
  t += .05; clock.host = t + .08;
  assert.equal(admitRankedPose(fork(),flight([20,0,-20]),actor,t,world,c),false,'return to an unrecorded point');
  assert.equal(admitRankedPose(s,flight([0,0,-40]),actor,t,world,c),true,'return to the recorded origin');
});
test('respawn relocates only to the owner team spawn pad', () => {
  const dead = () => { const s = {}, clock = { host: 0 }, c = context(clock);
    assert.equal(admitRankedPose(s,row(0,10),{...actor,pos:{x:0,y:0,z:10}},0,world,c),true);
    clock.host = .5; assert.equal(admitRankedPose(s,row(0,10,{f:0}),actor,.5,world,c),true);
    clock.host = 9; return [s, c]; };
  const [ok, c1] = dead();
  assert.equal(admitRankedPose(ok,row(1.1,-50,{y:4.5,f:1,tp:1}),actor,9,world,c1),true);
  const [forged, c2] = dead();
  assert.equal(admitRankedPose(forged,row(0,30,{y:1,f:1,tp:1}),actor,9,world,c2),false,'enemy-side respawn');
  const [enemy, c3] = dead();
  assert.equal(admitRankedPose(enemy,row(0,50,{y:4.5,f:1,tp:1}),actor,9,world,c3),false,'other team pad');
});
