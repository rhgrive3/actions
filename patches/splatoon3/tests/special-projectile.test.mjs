import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture as sourceFixture } from './source-fixture.mjs';
async function fixture() {
  const f=await sourceFixture({adaptNative:(rel,code)=>adaptNetworkSource(rel,adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,code))))),extraExports:"export { installWeaponsFidelity } from './patches/splatoon3/runtime/weapons-fidelity.mjs'; export { installKitTrizooka, throwVolley, trizookaSpecialWeapon, VOLLEY_CONFIG } from './patches/splatoon3/runtime/kit-trizooka.mjs';"});
  f.installWeaponsFidelity(f,f.profile); f.installKitTrizooka(f,f.profile);
  return f;
}
test('native special projectile keeps its descriptor and direct damage across a Shooter owner', async () => {
  const f = await fixture(), system = new f.Projectiles(new f.THREE.Scene()), owner = f.make('shooter');
  const victim = f.make(); victim.team = 1; victim.pos.set(.8, 0, 0);
  f.G.actors = [victim]; f.G.physics.segment = () => ({ hit: false });
  const calls = []; system.applyHit = (_a, e, damage, cause) => calls.push({ e, damage, cause });
  // Current Trizooka admission requires the real volley/carrier metadata.
  const descriptor=f.trizookaSpecialWeapon();
  const p=f.throwVolley(system,owner,descriptor)[f.VOLLEY_CONFIG.damageLobeIndex];
  p.pos.set(0,1,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(100,0,0);
  assert.equal(p.s3Weapon, descriptor);
  assert.equal(system._step(p, 1 / 60), true);
  assert.deepEqual(calls.map(x => [x.damage, x.cause]), [[220, 'trizooka']]);
  // Reuse must erase special metadata before an ordinary main-weapon round.
  system.pool.push(p);
  const reused = system._new();
  assert.equal(reused, p); assert.equal(reused.s3SpecialWeapon == null, true, 'cleared special descriptor cannot survive reuse');
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
  const packet=JSON.parse(JSON.stringify(nm.out.find(e=>e[1]==='p')));assert.ok(packet);assert.equal(packet.length,36,'actual network metadata plus Kit slots');
  assert.equal(packet.some(x=>x&&typeof x==='object'&&'s3SpecialPowerAP' in x),false,'#977 unrelated special descriptors keep their pre-AP wire shape');
  const remote=f.make('charger');remote.remote=true;remote.nid=7;
  const before=nm.out.length,beforeProjectiles=system.list.length;system.ghostProjectile(remote,packet);
  assert.equal(system.list.length,beforeProjectiles+1,'one accepted ghost, not the unchanged owner list tail');const ghost=system.list.at(-1);assert.notEqual(ghost,p);
  assert.equal(ghost.s3SpecialWeapon,descriptor);assert.equal(ghost.s3Weapon,descriptor);
  assert.equal(ghost.damage,0);assert.equal(ghost.ghost,true);assert.equal(ghost.grav,10.8);
  assert.equal(packet[12],50/60,'current transport preserves the finite flight lifetime');assert.equal(ghost.life,packet[12]);assert.equal(nm.out.length,before);
});
