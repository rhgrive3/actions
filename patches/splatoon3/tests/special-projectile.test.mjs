import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
test('native special projectile keeps its descriptor and direct damage across a Shooter owner', async () => {
  const f = await fixture(), system = new f.Projectiles(new f.THREE.Scene()), owner = f.make('shooter');
  const victim = f.make(); victim.team = 1; victim.pos.set(.8, 0, 0);
  f.G.actors = [victim]; f.G.physics.segment = () => ({ hit: false });
  const calls = []; system.applyHit = (_a, e, damage, cause) => calls.push({ e, damage, cause });
  const descriptor = { id: 'trizooka', kind: 'special', splashRadius: 8, burstRadius: 8, impactRadius: 5,
    splashBands: [[0, 220], [8, 60]], splashDamageMax: 220, splashDamageMin: 60 };
  const p = system._new();
  Object.assign(p, { owner, team: 0, type: 'blast', wid: 'trizooka', damage: 220, size: .15, radius: .3,
    age: 0, life: 1, straight: 1, grav: 0, drag: 0, trailEvery: 0, s3SpecialWeapon: descriptor });
  p.pos.set(0, 1, 0); p.prev.copy(p.pos); p.start.copy(p.pos); p.vel.set(100, 0, 0);
  system._push(p);
  assert.equal(p.s3Weapon, descriptor);
  assert.equal(system._step(p, 1 / 60), true);
  assert.deepEqual(calls.map(x => [x.damage, x.cause]), [[220, 'trizooka']]);
  // Reuse must erase special metadata before an ordinary main-weapon round.
  system.pool.push(p);
  const reused = system._new();
  assert.equal(reused, p); assert.equal(reused.s3SpecialWeapon, null);
});
test('native blast uses per-projectile splash radius, paint and cause without mutating Blaster config', async () => {
  const f = await fixture(), system = new f.Projectiles(new f.THREE.Scene()), owner = f.make('charger');
  const victim = f.make(); victim.team = 1; victim.pos.set(5, 0, 0);
  f.G.actors = [victim];
  const hits = [], paint = [], original = JSON.stringify(f.WEAPONS.blaster);
  system.applyHit = (_a, e, damage, cause) => hits.push({ e, damage, cause });
  f.G.paint.splat = (_point, radius) => { paint.push(radius); return 1; };
  f.G.physics.raycast = (_a, _b, _c, out) => { out.hit = true; out.point.set(0, 0, 0); out.normal.set(0, 1, 0); return out; };
  const p = { owner, team: 0, wid: 'inkVac', s3SpecialWeapon: { kind: 'special', splashRadius: 11,
    burstRadius: 11, impactRadius: 11, splashBands: [[0, 220], [11, 220]], splashDamageMax: 220, splashDamageMin: 220 } };
  system._blastBurst(p, new f.THREE.Vector3(), null);
  assert.deepEqual(hits.map(x => [x.damage, x.cause]), [[220, 'inkVac']]);
  assert.deepEqual(paint, [11]); assert.equal(JSON.stringify(f.WEAPONS.blaster), original);
});

test('real NetMatch projectile packet restores ghost special descriptor without authoring damage or paint', async () => {
  const f=await fixture(),system=new f.Projectiles(new f.THREE.Scene()),owner=f.make('charger');owner.nid=7;
  const descriptor={id:'inkVac',kind:'special',splashRadius:11,burstRadius:11,impactRadius:11,
    splashBands:[[0,220],[11,220]],splashDamageMax:220,splashDamageMin:220};
  f.SPECIALS.inkVac={id:'inkVac',projectileDescriptor:()=>descriptor};
  const nm=new f.NetMatch({myId:'owner'},{});f.G.netm=nm;
  const p=system._new();Object.assign(p,{owner,team:0,type:'blast',wid:'inkVac',damage:220,size:.2,radius:11,
    life:50/60,straight:0,grav:10.8,drag:.6,trailEvery:0,s3SpecialWeapon:descriptor});
  p.pos.set(0,1,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(33,0,0);system._push(p);
  const packet=JSON.parse(JSON.stringify(nm.out.find(e=>e[1]==='p')));assert.ok(packet);
  const remote=f.make('charger');remote.remote=true;remote.nid=7;
  const before=nm.out.length;system.ghostProjectile(remote,packet);const ghost=system.list.at(-1);
  assert.equal(ghost.s3SpecialWeapon,descriptor);assert.equal(ghost.s3Weapon,descriptor);
  assert.equal(ghost.damage,0);assert.equal(ghost.ghost,true);assert.equal(ghost.grav,10.8);
  assert.equal(ghost.life,Math.round(50/60*1000)/1000);assert.equal(nm.out.length,before);
});
