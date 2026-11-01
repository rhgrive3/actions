import test from 'node:test';
import assert from 'node:assert/strict';
import { supportNativeProducer } from '../../network-replication/tests/support-native-producer-fixture.mjs';

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

for(const returnToFirstOwner of [false,true])test(`sensor mark resolves its own owner era even when serial 1 is reused; return=${returnToFirstOwner}`,async t=>{
  const x=await supportNativeProducer(t),{f,owner,victim,nm}=x;victim.pos.set(100,0,100);
  const first=paidSensor(x).sensor;assert.equal(first.seq,1);
  remoteHandoff(x,'host');owner.pos.x=30;
  let current=paidSensor(x).sensor;assert.equal(current.seq,1);
  if(returnToFirstOwner){remoteHandoff(x,'peer');owner.pos.x=60;current=paidSensor(x).sensor;assert.equal(current.seq,1);}
  assert.notEqual(current.admission,first.admission,'each accepted native owner era owns a distinct receipt');
  victim.pos.copy(current.pos);victim.pos.y-=.7;
  nm._play(owner.owner,[1,'ks','m',7,1,8,victim.netLife||0,480,current.sourceLife,'l']);
  assert.equal(victim.s3.revealedUntil,undefined,'a bare claim cannot substitute for native contact');
  x.step();assert.ok(victim.s3.revealedUntil?.[0]>f.G.time,'the newly received field marks through its own contact');
  assert.equal(current.seen.get(victim),victim.netLife||0);
  assert.ok(f.projectiles._s3SupportSensors.filter(s=>s!==current).every(s=>!s.seen.has(victim)),'old same-serial fields do not claim the new contact');
});

test('same-owner simultaneous sensor fields keep their independent mark identities',async t=>{
  const x=await supportNativeProducer(t),{f,owner,victim}=x;victim.pos.set(100,0,100);
  const first=paidSensor(x).sensor;owner.pos.x=30;
  const second=paidSensor(x).sensor;assert.equal(second.seq,first.seq+1);
  assert.ok(f.projectiles._s3SupportSensors.includes(first));assert.ok(f.projectiles._s3SupportSensors.includes(second));
  victim.pos.copy(first.pos);victim.pos.y-=.7;x.step();
  assert.ok(victim.s3.revealedUntil?.[0]>f.G.time);assert.equal(first.seen.get(victim),victim.netLife||0);assert.equal(second.seen.has(victim),false);
});
