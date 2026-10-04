import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture();
const { G, THREE, PLAYER, WEAPONS, SUB, SPECIALS, Projectiles, installSubSpecialFidelity, SUB_SPECIAL_FIDELITY, fidelityThrowVelocity, TEST_MATH } = f;
const before = { player: JSON.stringify(PLAYER), weapons: JSON.stringify(WEAPONS), slam: JSON.stringify(SPECIALS.slam) };
installSubSpecialFidelity(f, f.profile);

function resetG() {
  G.netm = null; G.local = null; G.actors = []; G.boss = null; G.input = null;
  G.teamColors = [new THREE.Color('#ff6600'), new THREE.Color('#3366ff')];
  G.audio = { play() {}, loop() { return { set() {}, stop() {} }; } };
  G.fx = { explosion() {}, rain() {}, burst() {}, ring() {} };
  G.camera = { position: new THREE.Vector3(100, 100, 100) };
  G.time = 0;
  G.paint = { sample: () => 1, splat: () => 0 };
  G.physics = {
    los: () => true,
    raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; },
    segment: (_a, _b, hit) => { hit.hit = false; return hit; },
  };
}
resetG();

test('overlay applies only the mapped Sub/Special values', () => {
  assert.equal(f.profile.referenceVersion, '11.3.0');
  assert.equal(SUB.bomb.throwSpeed, 67.2);
  assert.equal(SUB.bomb.gravity, 57.6);
  assert.equal(SUB.bomb.fuse, 1);
  assert.deepEqual(SUB.bomb.damageBands, [[3.6, 180], [7, 30]]);
  assert.equal(SUB.bomb.splashAroundCount, 15);
  assert.equal(SUB.bomb.splashAroundPaintRadius, 1.064);
  assert.equal(SPECIALS.storm.duration, 8);
  assert.equal(SPECIALS.storm.radius, 10);
  assert.equal(SPECIALS.storm.dps, 24);
  assert.equal(SPECIALS.storm.throwSpeed, 67.2);
  assert.equal(SPECIALS.storm.rainNumReference, 72);
  assert.equal(JSON.stringify(PLAYER), before.player);
  assert.equal(JSON.stringify(WEAPONS), before.weapons);
  assert.equal(JSON.stringify(SPECIALS.slam), before.slam);
});

test('actual Bomb and Storm throws use their separate inherited-Y caps', () => {
  resetG();
  const p = new Projectiles(new THREE.Scene());
  const actor = { pos: new THREE.Vector3(1,0,2), vel: new THREE.Vector3(2,12,0),
    aimYaw:.2, aimPitch:.1, team:0, remote:false, isLocal:false, _nearCamera:()=>false };
  p.throwBomb(actor);
  const b=p.bombs.at(-1), expectBomb=fidelityThrowVelocity(actor,'bomb',new THREE.Vector3());
  assert.ok(b.vel.distanceTo(expectBomb)<1e-9);
  p.throwStorm(actor);
  const storm=p.bombs.at(-1), expectStorm=fidelityThrowVelocity(actor,'storm',new THREE.Vector3());
  assert.ok(storm.vel.distanceTo(expectStorm)<1e-9);
  assert.ok(expectBomb.y>expectStorm.y);
  p.clear();
});

test('first vertical-wall contact arms Splat Bomb using the native single collision query', () => {
  resetG();
  const p = new Projectiles(new THREE.Scene());
  let calls=0;
  G.physics.segment = (_from,_to,hit) => {
    calls++; hit.hit=true; hit.point.set(.2,1,0); hit.normal.set(-1,0,0); return hit;
  };
  const body = new THREE.Mesh(new THREE.SphereGeometry(.2), new THREE.MeshStandardMaterial({color:0xffffff,emissive:0}));
  const mesh = new THREE.Group(); mesh.add(body);
  const b={kind:'bomb',owner:{team:0},team:0,mesh,body,pos:new THREE.Vector3(0,1,0),vel:new THREE.Vector3(10,0,0),
    fuse:-1,age:0,spin:new THREE.Vector3(),beepT:1};
  p.bombs.push(b);
  p._updateBombs(1/60);
  assert.equal(calls,1);
  assert.ok(b.fuse<1 && b.fuse>.98, `fuse=${b.fuse}`);
  assert.ok(b.vel.x<0);
});

test('Bomb damage/FX stay native while gameplay paint is deterministic center + 15 secondary splats', () => {
  resetG();
  const p = new Projectiles(new THREE.Scene());
  const splats=[]; let explosion=0,turf=0;
  G.paint.splat=(pos,radius,team,opts)=>{splats.push({pos:pos.clone(),radius,team,seed:opts?.seed});return 1;};
  G.fx.explosion=()=>explosion++;
  const b={kind:'bomb',ghost:false,owner:{team:0,addTurf:a=>{turf+=a;}},team:0,
    pos:new THREE.Vector3(2,0,3),spin:new THREE.Vector3(1.25,2.5,0),age:.4};
  const old=TEST_MATH.random; let draws=0; TEST_MATH.random=()=>{draws++;return .5;};
  try { p._explodeBomb(b); } finally { TEST_MATH.random=old; }
  assert.equal(draws,21);
  assert.equal(splats.length,16);
  assert.equal(splats[0].radius,SUB.bomb.paintRadius);
  for(const x of splats.slice(1)) assert.equal(x.radius,1.064);
  assert.equal(turf,16);
  assert.equal(explosion,1);
});

test('replacement Bomb paint is repeatable without adding global RNG draws', () => {
  function run() {
    resetG();
    const p=new Projectiles(new THREE.Scene()),rows=[];
    G.paint.splat=(pos,radius,_team,opts)=>{rows.push([+pos.x.toFixed(6),+pos.z.toFixed(6),radius,+opts.seed.toFixed(8)]);return 0;};
    const b={kind:'bomb',ghost:false,owner:{team:0,addTurf(){}},team:0,pos:new THREE.Vector3(4,0,-2),spin:new THREE.Vector3(3,5,0),age:.2};
    const old=TEST_MATH.random; TEST_MATH.random=()=>.125;
    try { p._explodeBomb(b); } finally { TEST_MATH.random=old; }
    return rows;
  }
  assert.deepEqual(run(),run());
});

test('ghost Bomb does not receive authoritative replacement paint', () => {
  resetG();
  const p=new Projectiles(new THREE.Scene()); let painted=0;
  G.paint.splat=()=>{painted++;return 1;};
  const b={kind:'bomb',ghost:true,owner:{team:0,addTurf(){}},team:0,pos:new THREE.Vector3(),spin:new THREE.Vector3(),age:0};
  p._explodeBomb(b);
  assert.equal(painted,0);
});

test('special activation refills ink before native Storm startup', () => {
  resetG();
  let throws=0; G.projectiles={throwStorm(){throws++;}};
  const a=f.make('charger');
  a.ink=7; a.special=a.specialCost(); a.form='squid';
  a._startSpecial();
  assert.equal(a.ink,PLAYER.inkMax);
  assert.equal(a.special,0);
  assert.equal(a.specialActive.id,'storm');
  assert.equal(throws,1);
});

test('second install is idempotent and does not stack gameplay wrappers', () => {
  const tv=Projectiles.prototype.throwVelocity, eb=Projectiles.prototype._explodeBomb;
  installSubSpecialFidelity(f,f.profile);
  assert.equal(Projectiles.prototype.throwVelocity,tv);
  assert.equal(Projectiles.prototype._explodeBomb,eb);
});
