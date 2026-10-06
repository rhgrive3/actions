import { damageTenths } from '../runtime/final-damage.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './storm-effects-fixture.mjs';
const STEP = 1 / 60;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-8, msg || `${a} != ${b}`);
function system(f) {
  f.G.scene = new f.THREE.Scene(); f.G.actors = [];
  const p = f.G.projectiles = new f.Projectiles(f.G.scene);
  return p;
}
function cloud(f, owner, { team = owner.team, x = 0, t = 1, dur = 8, ghost = false } = {}) {
  const group = new f.THREE.Group(); group.position.set(x, 5, 0);
  const c = { owner, team, group, t, dur, dir: new f.THREE.Vector3(), rainT: 1, ghost };
  f.G.projectiles.clouds.push(c); return c;
}
function chargeActor(f) {
  const a = f.make('charger'); a._resolve = () => { a.grounded = true; }; a.special = a.specialCost(); return a;
}
function release(f, a) { a.intent.sub = true; f.tick(a); a.intent.sub = false; f.tick(a); }

test('#239 activation holds without throwing; explicit sub command uses updated aim and blocks main/sub duplication', async () => {
  const f = await fixture(), p = system(f), a = chargeActor(f);
  a.intent.fire = true; a._startSpecial(); assert.equal(a.specialActive.phase, 'hold'); assert.equal(p.bombs.length, 0);
  a.intent.move.set(1, 0, 0); f.tick(a, 60); assert.equal(p.bombs.length, 0); assert.ok(a.vel.x > 0, 'holding leaves ordinary movement admitted');
  assert.equal(a.weaponRunner.charging, false, 'held main input cannot charge a weapon behind the device');
  a.aimYaw = Math.PI / 2; release(f, a); assert.equal(p.bombs.length, 1); assert.equal(p.bombs[0].kind, 'storm');
  assert.ok(p.bombs[0].vel.x > 0 && Math.abs(p.bombs[0].vel.z) < 1e-7); assert.equal(a.specialActive.phase, 'throw');
  f.tick(a, 10); assert.equal(p.bombs.length, 1);
  p.clear();
});

test('#239 holding supports swim and bots submit an explicit press/release instead of keeping a device forever', async () => {
  const f = await fixture(), p = system(f), a = chargeActor(f); a._startSpecial();
  a.intent.squid = true; f.tick(a); assert.equal(a.form, 'squid'); assert.equal(a.specialActive.phase, 'hold');
  a.intent.squid = false; f.tick(a); assert.equal(a.form, 'kid');
  const brain = new f.BotBrain(a);
  brain._tail(STEP, new f.THREE.Vector3(), 0, 0, 6, false); assert.equal(a.intent.sub, true); f.tick(a);
  brain._tail(STEP, new f.THREE.Vector3(), 0, 0, 6, false); assert.equal(a.intent.sub, false); f.tick(a);
  assert.equal(p.bombs.length, 1); assert.equal(a.specialActive.phase, 'throw'); p.clear();
});

test('#239 actual network pack and remote application retain held/released Storm pose state', async () => {
  const f = await fixture(), p = system(f), a = chargeActor(f), remote = chargeActor(f); a.nid = 1; a._startSpecial();
  let packet;
  const sender = { byNid: new Map([[1,a]]), out: [], stats: {out:0}, s: {tr:{broadcast:m => { packet=m; }}} };
  f.NetMatch.prototype._sendTick.call(sender);
  const flags = packet.a[0][10]; assert.ok(flags & 2048, 'native subAim bit includes held Storm');
  remote.remote = true; remote.net = { ready:true, err:new f.THREE.Vector3(), prevGrounded:true, prevVy:0, cur:{ x:0,y:0,z:0,vx:0,vy:0,vz:0,yaw:0,aimYaw:0,aimPitch:0,f:flags,hp:100,ink:100,sp:0,turf:0,ch:0,lock:0 } };
  f.NetMatch.prototype.applyRemote.call({},remote,STEP); assert.equal(remote.specialActive.phase,'hold'); assert.equal(remote.weaponRunner.aimingSub,true);
  release(f,a); f.NetMatch.prototype._sendTick.call(sender); remote.net.cur.f=packet.a[0][10];
  f.NetMatch.prototype.applyRemote.call({},remote,STEP); assert.equal(remote.specialActive.phase,'throw'); assert.equal(remote.weaponRunner.aimingSub,false); p.clear();
});

test('#239 stale sub release, death, reset and match end do not release an unthrown device', async () => {
  const f = await fixture(), p = system(f), a = chargeActor(f);
  a.intent.sub = true; a._startSpecial(); a.intent.sub = false; f.tick(a); assert.equal(p.bombs.length, 0);
  a.splat(null, 'weapon'); a.reset(); f.tick(a); assert.equal(p.bombs.length, 0);
  a._startSpecial(); a.intent.sub = true; f.tick(a); f.G.match.playing = () => false; a.intent.sub = false; f.tick(a);
  assert.equal(p.bombs.length, 0); assert.equal(a.specialActive, null); p.clear();
});

test('#223 gauge lock is separate from recovery, preserves turf points, and expires at 480 ticks', async () => {
  const f = await fixture(), p = system(f), a = chargeActor(f); a._startSpecial(); release(f, a);
  close(a.stormGaugeLock, 8); a.addTurf(10); close(a.special, 0); close(a.stats.turf, 10);
  f.tick(a, 479); assert.equal(a.specialActive, null); assert.ok(a.stormGaugeLock > 0);
  a.addTurf(10); close(a.special, 0); close(a.stats.turf, 20);
  f.tick(a); close(a.stormGaugeLock, 0); a.addTurf(10); close(a.special, 10); close(a.stats.turf, 30); p.clear();
});

test('#223 death/respawn preserve remaining lock while a new match actor starts unlocked', async () => {
  const f = await fixture(), p = system(f), a = chargeActor(f); a._startSpecial(); release(f, a);
  f.tick(a, 60); close(a.stormGaugeLock, 7); a.splat(null, 'water'); f.tick(a, 60); close(a.stormGaugeLock, 6);
  a.reset(); close(a.stormGaugeLock, 6); a.addTurf(10); close(a.special, 0);
  f.tick(a, 360); a.addTurf(10); close(a.special, 10); close(chargeActor(f).stormGaugeLock || 0, 0); p.clear();
});

test('#212 allied rain uses current submerged recovery rate, not a stacked heal or shortened delay', async () => {
  const f = await fixture(), p = system(f), a = f.make(), owner = f.make();
  const c = cloud(f, owner); a.hp = 10; a.lastDamage = f.profile.resources.regenDelay - STEP * 2;
  f.tick(a); close(a.hp, 10, 'rain cannot bypass normal recovery wait');
  f.tick(a); close(a.hp, 10 + f.profile.resources.regenRateSwim * STEP);
  a.hp = 10; a.lastDamage = 5; f.tick(a, 30); close(a.hp, 10 + f.profile.resources.regenRateSwim / 2);
  a.pos.x = 20; a.hp = 10; f.tick(a, 30); close(a.hp, 10 + f.profile.resources.regenRate / 2);
  a.pos.x = 0; c.t = c.dur; a.hp = 10; f.tick(a); close(a.hp, 10 + f.profile.resources.regenRate * STEP);
  c.t = 1; c.team = 1; a.hp = 10; f.tick(a); close(a.hp, 10, 'enemy rain is not friendly recovery');
  c.team = 0; f.G.physics.los = () => false; a.hp = 10; f.tick(a); close(a.hp, 10 + f.profile.resources.regenRate * STEP);
  p.clear();
});

for (const count of [1, 2, 3]) test(`#225 ${count} overlapping rains deal only one cloud amount and keep stable attribution`, async () => {
  const f = await fixture(), p = system(f), victim = f.make(); victim.team = 1; f.G.actors = [victim];
  const owners = Array.from({ length: count }, (_, i) => { const a = f.make(); a.nid = i + 1; return a; });
  owners.forEach(owner => cloud(f, owner)); p.clouds.reverse();
  const raw=[];const nativeDamage=victim.damage;victim.damage=function(amount,...args){raw.push(amount);return nativeDamage.call(this,amount,...args);};
  p._updateClouds(STEP); assert.deepEqual(raw,[f.SPECIALS.storm.dps*STEP],'one unrounded rain amount reaches the actual Actor'); close(victim.hp, 100 - damageTenths(f.SPECIALS.storm.dps * STEP)); assert.equal(victim.lastAttacker, owners[0]);
  p.clouds.reverse(); p._updateClouds(STEP); assert.deepEqual(raw,[f.SPECIALS.storm.dps*STEP,f.SPECIALS.storm.dps*STEP]); close(victim.hp, 100 - damageTenths(f.SPECIALS.storm.dps * STEP) * 2);
  victim.damage(10, owners.at(-1), 'shooter'); close(victim.hp, 90 - damageTenths(f.SPECIALS.storm.dps * STEP) * 2, 'other weapon damage stays independent');
  p.clear();
});

test('#225 each cloud retains paint, while exit, expiration, ghost ownership and allies use separate admission', async () => {
  const f = await fixture(), p = system(f), a = f.make(), owner = f.make(); a.team = 1; f.G.actors = [a];
  const one = cloud(f, owner), two = cloud(f, owner); one.rainT = two.rainT = 0;
  let paint = 0; f.G.physics.raycast = (_p, _d, _len, h) => { h.hit = true; h.point.set(0,0,0); h.normal.set(0,1,0); return h; };
  f.G.paint.splat = () => { paint++; return 1; };
  p._updateClouds(STEP); assert.equal(paint, 2); close(a.hp, 100 - damageTenths(f.SPECIALS.storm.dps * STEP));
  a.pos.x = 20; const hp = a.hp; p._updateClouds(STEP); close(a.hp, hp);
  a.pos.x = 0; one.t = two.t = 8; p._updateClouds(STEP); close(a.hp, hp);
  cloud(f, owner, { ghost: true }); a.remote = true; p._updateClouds(STEP); close(a.hp, hp, 'remote victims remain owned by their client');
  a.remote = false; a.team = 0; p._updateClouds(STEP); close(a.hp, hp, 'same-team rain does not hurt'); p.clear();
});

test('30/60/120Hz render schedules give identical overlap damage and gauge-lock ticks', async () => {
  let expected;
  for (const hz of [30,60,120]) {
    const f = await fixture(), p = system(f), a = f.make(), owner = f.make(); a.team = 1; f.G.actors = [a];
    cloud(f, owner, { dur: 20 }); cloud(f, owner, { dur: 20 }); a.stormGaugeLock = 8; a.hp = 1000; f.G.paint.sample = () => 2;
    const clock = new f.FixedClock(), rows = [];
    for (let frame = 0; frame < hz * 8; frame++) clock.advance(1 / hz, dt => { f.G.time += dt; a.update(dt); p._updateClouds(dt); rows.push([a.hp, a.stormGaugeLock]); });
    if (expected) assert.deepEqual(rows, expected); else expected = rows;
    close(a.stormGaugeLock, 0); close(a.hp, 1000 - damageTenths(f.SPECIALS.storm.dps * STEP) * 480); p.clear();
  }
});
