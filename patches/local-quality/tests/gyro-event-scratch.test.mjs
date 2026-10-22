import test from 'node:test';
import assert from 'node:assert/strict';
const {installGyroQuality,gyroRateTrusted}=await import(process.env.GYRO_TEST_MODULE||'../gyro.mjs');
function harness() {
 const env={document:{hidden:false},performance:{now:()=>1000}};
 class Gyro {
  constructor(){Object.assign(this,{enabled:true,_src:'ori',_tQ:0,_tRR:0,_hasQ:false,_q:[0,0,0,1],_sm:{y:0,p:0},dYaw:0,dPitch:0,_platformSensorStart:0,_platformGyroAccess:{sample(){},motionPermission:'granted'}});}
  start(){} stop(){} resync(){} discard(){} _calibrate(){} _sample(){}
  _orientation(e){return this.onOrientation?.(e);}
  _motion(e){return this.onMotion?.(e);}
 }
 installGyroQuality(Gyro,()=>0,()=>false,env);
 return new Gyro();
}
const orientation=t=>Object.freeze({alpha:1,beta:2,gamma:3,timeStamp:t});
const motion=t=>Object.freeze({rotationRate:Object.freeze({alpha:1,beta:2,gamma:3}),timeStamp:t});
test('10,000 nested pairs reuse only two internal metadata records and preserve frozen retained events',()=>{
 const g=harness(),records=new Set(),retained=[];
 for(let i=0;i<10000;i++){
  const o=orientation(1000+i),m=motion(1000+i),before=JSON.stringify([o,m]);
  g.onMotion=e=>{assert.equal(e,m);retained.push(e);const s=g._qualityGyro;assert.equal(s.event.kind,'motion');assert.equal(s.eventDepth,2);records.add(s.event);};
  g.onOrientation=e=>{assert.equal(e,o);retained.push(e);const s=g._qualityGyro,owner=s.event;assert.equal(owner.kind,'orientation');records.add(owner);g._motion(m);assert.equal(s.event,owner);assert.equal(owner.kind,'orientation');assert.equal(owner.time,o.timeStamp);assert.equal(s.eventDepth,1);};
  g._orientation(o);assert.equal(g._qualityGyro.event,undefined);assert.equal(g._qualityGyro.eventDepth,0);assert.equal(JSON.stringify([o,m]),before);
 }
 assert.equal(records.size,2);assert.equal(retained.length,20000);
 for(let i=0;i<10000;i++){assert.equal(retained[2*i].timeStamp,1000+i);assert.equal(retained[2*i+1].rotationRate.beta,2);}
 for(const record of records)assert.deepEqual(Object.keys(record).sort(),['kind','time']);
});
test('nested exceptions restore original owner and depth and propagate exact exception',()=>{
 const g=harness(),failure=new Error('nested');let owner;
 g.onMotion=()=>{throw failure;};
 g.onOrientation=()=>{owner=g._qualityGyro.event;assert.throws(()=>g._motion(motion(1000)),e=>e===failure);assert.equal(g._qualityGyro.event,owner);assert.equal(g._qualityGyro.eventDepth,1);throw failure;};
 assert.throws(()=>g._orientation(orientation(1000)),e=>e===failure);
 assert.equal(g._qualityGyro.event,undefined);assert.equal(g._qualityGyro.eventDepth,0);
});
test('motion-to-orientation nesting and cross-instance ownership remain isolated',()=>{
 const a=harness(),b=harness();let owner;
 a.onMotion=()=>{owner=a._qualityGyro.event;a._orientation(orientation(1000));b._motion(motion(1000));assert.equal(a._qualityGyro.event,owner);};
 a.onOrientation=()=>{assert.equal(a._qualityGyro.eventDepth,2);assert.notEqual(a._qualityGyro.event,owner);};
 a._motion(motion(1000));assert.notEqual(a._qualityGyro.eventSlots[0],b._qualityGyro.eventSlots[0]);
});
test('denied and malformed sensor inputs never enter original handlers',()=>{
 const g=harness();g.onOrientation=g.onMotion=()=>assert.fail('rejected event reached native handler');
 g._orientation({alpha:NaN,beta:0,gamma:0});g._motion({rotationRate:{alpha:0,beta:Infinity,gamma:0}});
 g._platformGyroAccess.motionPermission='denied';g._motion(motion(1000));assert.equal(g._qualityGyro,undefined);
});
test('#595 unchanged trust floor and freshness: 30 assertions across both mappings',()=>{
 for(const map of ['rrA','rrB'])for(const speed of [0,1e-10,1e-8,1.001e-8,1e-7]){
  const g={_src:map,_rrScale:1,_qualityGyro:{orientationTime:1000,rate:[speed,0,0]}};
  const raw=rate=>map==='rrA'?{alpha:0,beta:rate,gamma:0}:{alpha:rate,beta:0,gamma:0};
  assert.equal(gyroRateTrusted(g,raw(.01),1000),true);assert.equal(gyroRateTrusted(g,raw(10),1000),false);assert.equal(gyroRateTrusted(g,raw(.01),1076),false);
 }
});
test('same-kind depth four, nested resync and throw restore saved owner and null top-level state',()=>{
 const g=harness();g.resync();assert.equal(g._qualityGyro.event,null);
 const failure=new Error('deep resync throw'),records=new Set();
 g.onOrientation=e=>{
  const s=g._qualityGyro,owner=s.event,depth=s.eventDepth;records.add(owner);
  if(depth===4){g.resync();assert.equal(s.event,null);throw failure;}
  assert.throws(()=>g._orientation(orientation(e.timeStamp+1)),x=>x===failure);
  assert.equal(s.event,owner);assert.equal(s.eventDepth,depth);assert.equal(owner.time,e.timeStamp);
  throw failure;
 };
 assert.throws(()=>g._orientation(orientation(1000)),x=>x===failure);
 assert.equal(records.size,4);assert.equal(g._qualityGyro.event,null);assert.equal(g._qualityGyro.eventDepth,0);
 g.onOrientation=()=>{};g._orientation(orientation(1010));assert.equal(g._qualityGyro.eventSlots.length,4);assert.equal(g._qualityGyro.event,null);
});
