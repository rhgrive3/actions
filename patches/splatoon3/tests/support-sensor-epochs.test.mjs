import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { supportNativeProducer } from '../../network-replication/tests/support-native-producer-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
function world() {
  const { G, THREE } = f;
  G.projectiles.clear(); G.scene ||= new THREE.Scene(); G.actors = []; G.netm = null; G.time = 0;
  G.match = { state: 'playing', mode: 'turf', actors: G.actors, playing: () => true };
  G.level = new f.Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    spawnPads: [[-40, 0, 0], [40, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-50, -.5, -50], max: [50, 0, 50] }] });
  G.physics = new f.Physics(G.level);
  const owner = f.make('support'), target = f.make();
  Object.assign(owner, { nid: 7, owner: 'A', isLocal: true });
  Object.assign(target, { nid: 2, owner: 'me', team: 1 }); target.pos.set(40, 0, 40);
  G.actors = G.match.actors = [owner, target];
  return { owner, target };
}
function tick(hz) { f.G.time += 1 / hz; f.G.projectiles.update(1 / hz); }
function armed(owner, hz) {
  owner.aimDir.set(0, -1, 0);
  const s = f.G.projectiles.throwBomb(owner);
  for (let i = 0; i < hz * 2 && s.activeAt === null; i++) tick(hz);
  assert.notEqual(s.activeAt, null); return s;
}

for (const hz of [30, 60, 120]) test(`an active sensor can mark a genuinely new life of the same Actor, ${hz}Hz`, () => {
  const { owner, target } = world(), s = armed(owner, hz);
  const pos = s.pos.clone(); pos.y -= .7; target.pos.copy(pos); tick(hz);
  assert.ok(target.s3.revealedUntil[0] > f.G.time);
  const before = target.netLife || 0;
  target.spawnAt(pos, 0);
  assert.equal(target.netLife, before + 1);
  assert.equal(target.s3.revealedUntil, undefined);
  tick(hz);
  assert.ok(target.s3.revealedUntil?.[0] > f.G.time, 'prior-life contact must not suppress this life');
  const until = target.s3.revealedUntil[0]; tick(hz);
  assert.equal(target.s3.revealedUntil[0], until, 'same-life duplicates never extend the mark');
});

for (const hz of [30, 60, 120]) test(`sensor contact at/after area expiry cannot mark a new entrant, ${hz}Hz`, () => {
  const { owner, target } = world(), s = armed(owner, hz);
  target.pos.copy(s.pos); target.pos.y -= .7;
  f.G.time = s.expires; f.G.projectiles.update(1 / hz);
  assert.equal(target.s3.revealedUntil, undefined);
  assert.equal(f.G.projectiles._s3SupportSensors.length, 0);
});


// A separate actual projectile collection produces the wire rows. Retiring it
// leaves previously received fields intact, including simultaneous owner eras.
function produce(x,run){
  const {f}=x,receiver=f.G.projectiles,source=new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles=source;
  try{return x.produce(run);}finally{source.clear();f.G.projectiles=receiver;}
}
function paidSensor(x,{life=x.owner.netLife||0}={}){
  const {owner,nm,f}=x;owner.ink=100;x.deliver([],100,owner.special,0,{life});owner.weaponRunner.reset();
  const rows=produce(x,()=>{
    owner.weaponRunner.update(1/60,{sub:true,subReleased:false});
    for(let i=0;i<30&&!nm.out.some(e=>e[1]==='ks'&&e[2]==='p');i++)
      owner.weaponRunner.update(1/60,{sub:false,subReleased:i===0});
  });
  const birth=rows.find(e=>e[1]==='ks'&&e[2]==='p');assert.ok(birth,'native paid release records a Sensor birth');
  const before=new Set(f.projectiles._s3SupportSensors||[]);
  x.deliver(rows,owner.ink,owner.special,0,{life});
  const sensor=f.projectiles._s3SupportSensors.find(s=>!before.has(s));
  assert.ok(sensor?.ghost,'authenticated tick admits the receiver-owned flight');
  for(let i=0;i<120&&sensor.activeAt===null;i++)x.step();
  assert.notEqual(sensor.activeAt,null,'receiver collision must activate the field');
  return {sensor,birth};
}
function remoteHandoff(x,next){
  const {nm,owner}=x,previous=owner.owner;
  nm.s._members.set(next,next);nm.s.hostId=next;nm.s.isHost=false;
  nm.onLeave(previous,false);assert.equal(owner.owner,next);assert.equal(owner.remote,true);
  owner.s3SupportSerial=0;
}

test('support packets use the native-admitted remote life rather than the stale local counter',async t=>{
  const x=await supportNativeProducer(t),{f,owner,victim,nm}=x;victim.pos.set(100,0,100);
  owner.netLife=0;x.deliver([],100,0,0,{life:2});assert.equal(owner.net.lastLife,2);assert.equal(owner.netLife,0);
  nm._play('peer',[1,'ks','p',7,1,0,.7,0,0,0,1,2]);
  assert.equal(f.projectiles._s3SupportSensors?.length||0,0,'bare replay cannot create a field even with the current life');
  const {sensor,birth}=paidSensor(x,{life:2});assert.equal(sensor.sourceLife,2);
  owner.special=owner.specialCost();x.deliver([],100,owner.special,0,{life:2});
  const rows=produce(x,()=>{
    owner._startSpecial();owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;owner._updateSpecial(1/60);
    for(let i=0;i<14&&owner.specialActive;i++)owner._updateSpecial(1/60);
  });
  assert.ok(rows.some(e=>e[1]==='ev'&&e[2]==='special:use'));assert.ok(rows.some(e=>e[1]==='ks'&&e[2]==='t'));
  x.deliver(rows,100,owner.special,0,{life:2});
  assert.equal(f.projectiles._s3SupportCoolerThrows.length,1,'native charged throw reaches the receiver');
  for(let i=0;i<120&&!f.projectiles._s3SupportCoolers?.length;i++)x.step();
  assert.equal(f.projectiles._s3SupportCoolers.length,1);assert.equal(f.projectiles._s3SupportCoolers[0].sourceLife,2);
  const stale=structuredClone(birth);stale[4]+=100;stale[11]=1;
  x.deliver([],100,0,0,{life:2});x.deliver([stale],55,0,0,{life:2});
  assert.equal(f.projectiles._s3SupportSensors.length,1,'old-life birth is rejected despite a fresh resource debit');
});

test('authenticated sensor contacts distinguish successive target lives and reject old-life claims',async t=>{
  const x=await supportNativeProducer(t),{f,owner,victim,nm}=x;victim.pos.set(100,0,100);
  const {sensor}=paidSensor(x);victim.pos.copy(sensor.pos);victim.pos.y-=.7;x.step();
  assert.ok(victim.s3.revealedUntil[0]>f.G.time);
  const previous=victim.netLife||0,position=victim.pos.clone();
  f.G.physics.groundProbe=()=>({hit:false});victim.character.color=victim.color;
  victim.spawnAt(position,0);
  assert.equal(victim.netLife,previous+1);assert.equal(victim.s3.revealedUntil,undefined);
  const stale=[1000,'ks','m',7,sensor.seq,8,previous,480,sensor.sourceLife,'l',60000,1];
  nm._play('peer',stale);assert.equal(victim.s3.revealedUntil,undefined,'bare replay has no admission');
  x.deliver([stale],owner.ink,0);assert.equal(victim.s3.revealedUntil,undefined,'authenticated old-target-life claim remains rejected');
  x.step();assert.ok(victim.s3.revealedUntil?.[0]>f.G.time,'receiver contact marks the new native life');
  const until=victim.s3.revealedUntil[0];x.step();assert.equal(victim.s3.revealedUntil[0],until,'same-life contact does not extend the mark');
});

test('a sensor mark arriving at expiry cannot extend the ended field before the next cleanup tick',async t=>{
  const x=await supportNativeProducer(t),{f,owner,victim}=x;victim.pos.set(100,0,100);
  const {sensor}=paidSensor(x);victim.pos.copy(sensor.pos);victim.pos.y-=.7;
  f.G.time=sensor.expires-.05;
  assert.equal(f.projectiles._s3SupportSensors.length,1,'expiry has not reached the collection cleanup');
  x.deliver([[1000,'ks','m',7,sensor.seq,8,victim.netLife||0,480,sensor.sourceLife,'l',60000,1]],owner.ink,0);
  assert.ok(f.G.time>=sensor.expires-1e-9);assert.equal(victim.s3.revealedUntil,undefined);
  x.step();assert.equal(f.projectiles._s3SupportSensors.length,0);assert.equal(victim.s3.revealedUntil,undefined);
});

test('native peer departure retires the old support serial admission before a new owner starts',async t=>{
  const x=await supportNativeProducer(t),{f,owner,victim}=x;victim.pos.set(100,0,100);owner.s3SupportSerial=8;
  const old=paidSensor(x);assert.equal(old.sensor.seq,9);
  remoteHandoff(x,'host');owner.pos.x=30;
  const current=paidSensor(x);assert.equal(current.sensor.seq,1);assert.notEqual(current.sensor.admission,old.sensor.admission);
  victim.pos.copy(current.sensor.pos);victim.pos.y-=.7;x.step();assert.ok(victim.s3.revealedUntil?.[0]>f.G.time);
  const count=f.projectiles._s3SupportSensors.length;
  x.deliver([old.birth],55,0,0,{from:'peer'});
  assert.equal(f.projectiles._s3SupportSensors.length,count,'former owner cannot keep authoring');
});
