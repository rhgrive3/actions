import test from 'node:test';
import assert from 'node:assert/strict';
import {specialNativeProducer} from './special-native-producer-fixture.mjs';
import {objectDamageScale} from '../../splatoon3/runtime/sub-resistance.mjs';

const cases={
 tripleSplashdown:{frames:100,targetZ:5,configure:x=>{x.target.pos.set(0,.35,2.5);x.attacker._resolve=()=>{if(x.attacker.pos.y<=0){x.attacker.pos.y=0;x.attacker.grounded=true;}};}},
 zipcaster:{frames:100,targetZ:9.5,configure:x=>{x.f.G.physics.raycast=(origin,dir,max,hit)=>{hit.hit=false;if(dir.z>0){const distance=(10-origin.z)/dir.z;if(distance>=0&&distance<=max){hit.hit=true;hit.point.copy(origin).addScaledVector(dir,distance);hit.normal.set(0,0,-1);hit.dist=distance;}}return hit;};},step:(x,i)=>{x.attacker.intent.sub=i===0;}},
 booyahBomb:{frames:900,targetZ:1000,afterStep:x=>{const o=x.f.projectiles._s3AllSpecialObjects?.find(o=>o.kind==='booyahBlast');if(o)x.target.pos.copy(o.pos).add(new x.f.THREE.Vector3(5,0,0));}},
 ultraStamp:{frames:140,targetZ:1.25,step:x=>{x.attacker.intent.fire=true;}},
 reefslider:{frames:180,targetZ:1,configure:x=>{x.attacker.contacts.wall=true;x.attacker._resolve=()=>{x.attacker.pos.y=0;x.attacker.grounded=true;};}},
 killerWail:{frames:340,targetZ:20,configure:x=>{x.target.pos.y=.1;}},
 inkjet:{frames:30,targetZ:0},
 crabTank:{frames:110,targetZ:1,step:x=>{x.attacker.intent.squid=true;}},
 krakenRoyale:{frames:90,targetZ:1,step:(x,i)=>{x.attacker.intent.jump=i===65;}},
 superChump:{frames:400,targetZ:25,step:x=>{x.attacker.intent.fire=true;},afterStep:x=>{const o=x.f.projectiles._s3AllSpecialObjects?.find(o=>o.kind==='decoy');if(o)x.target.pos.copy(o.target);}},
 inkVac:{frames:80,targetZ:2,fullActor:true,step:x=>{x.attacker.intent.fire=true;}},
};
for(const [id,opts]of Object.entries(cases))test(`${id}: native source actions and object-hit consumer agree`,async t=>{
 const x=await specialNativeProducer(t,id,opts);assert.ok(x.claims.length,`${id}: actual producer contacts the device`);
 const at=x.target.pos.clone(),out=[];
 const malicious=rows=>rows.flatMap(e=>{if(e[5]?.phase!=='objectHit')return[e];
  const inflated=structuredClone(e),far=structuredClone(e),replayed=structuredClone(e);
  inflated[5].damage=10000;inflated[5].eventSeq+=1000000;far[5].eventSeq+=2000000;far[5].x+=500;replayed[5].eventSeq+=3000000;
  return[inflated,far,e,replayed];});
 for(const p of x.packets)out.push(...x.deliver(p,malicious,e=>{if(e[5]?.eventSeq>=2000000&&e[5]?.eventSeq<3000000)x.target.pos.x+=500;},()=>x.target.pos.copy(at)));
 const applied=out.filter(o=>o.damage>0);
 assert.ok(applied.every(o=>o.event[5]?.phase!=='objectHit'||o.event[5].eventSeq<1000000),`${id}: inflated, off-path and fresh-sequence repeated contact are rejected`);
 assert.equal(applied.length,x.claims.length,`${id}: ${applied.length}/${x.claims.length} actual native contacts; first=${JSON.stringify(x.claims[0])}; received=${JSON.stringify(out.filter(o=>o.event[5]?.phase==='objectHit').map(o=>[o.event._netTick,o.damage]))}`);
});

test('Splashdown cannot re-trace one accepted impact past a destroyed first native barrier',async t=>{
 const x=await specialNativeProducer(t,'tripleSplashdown',cases.tripleSplashdown),{f,owner,target}=x;
 const read=f.projectiles.nativeSpecialSplashdownDeviceContact;let acceptedArgs;
 f.projectiles.nativeSpecialSplashdownDeviceContact=function(...args){const value=read.apply(this,args);if(value)acceptedArgs=args;return value;};
 let first;for(const packet of x.packets){
  const out=x.deliver(packet);if(out.some(o=>o.damage>0)){first=packet;break;}
 }
 assert.ok(first,'actual body/fist native barrier contact was accepted');
 target.dead=true;target.hp=0;
 const behind=f.projectiles.throwBomb(owner);assert.ok(behind);behind.phase='deployed';behind.pos.set(0,.35,3.8);behind.hp=1e9;behind.activeAt=Infinity;behind.expireAt=Infinity;
 const claim=structuredClone(first.e.find(e=>e[5]?.phase==='objectHit'));
 assert.ok(claim);Object.assign(claim[5],{eventSeq:claim[5].eventSeq+100000,targetSeq:behind.seq,x:behind.pos.x,y:behind.pos.y,z:behind.pos.z});
 const delayed=structuredClone(x.packets.find(p=>p.u>first.u));assert.ok(delayed);delayed.e=[claim];x.deliver(delayed);
 assert.equal(behind.hp,1e9,'accepted impact cannot gain another first barrier when its original one disappears');
 assert.ok(acceptedArgs,'native consumer supplied the private use and action receipts');
 const retry=acceptedArgs.slice();retry[2]=behind;assert.equal(!!read.apply(f.projectiles,retry),false,'private source checkpoint itself keeps the original first barrier');
});

for(const [label,step] of [
 ['landing source frame',(x,i)=>{x.attacker.intent.jump=i===65;if(i===68){x.attacker.grounded=true;x.attacker.vel.y=0;}}],
 ['airborne dash spin',(x,i)=>{x.attacker.intent.fire=i>=65&&i<102;if(i>=105)x.attacker.grounded=false;}],
])test(`Kraken ${label} keeps its native device contacts`,async t=>{
 const x=await specialNativeProducer(t,'krakenRoyale',{frames:114,targetZ:1,step});assert.ok(x.claims.length,'actual native source emitted device contact');
 let applied=0;for(const packet of x.packets)applied+=x.deliver(packet).reduce((n,o)=>n+o.damage,0);
 const expected=x.claims.reduce((n,e)=>n+e[5].damage*objectDamageScale(x.attacker,'beakon',e[5].cause),0);
 assert.equal(applied,expected,`${label}: every native contact, including the final landing frame, is admitted`);
});

test('Booyah terrain burst keeps its final source frame without granting early or expired contact',async t=>{
 const x=await specialNativeProducer(t,'booyahBomb',cases.booyahBomb);
 assert.equal(x.claims.length,25,'the native producer retains its independently observed contact span');
 const early=structuredClone(x.claims[0]),late=structuredClone(x.claims.at(-1));
 early[0]=Math.round((early[0]-1/60)*1000)/1000;early[early.length-2]--;
 early[5].eventSeq+=4000000;
 late[0]=Math.round((late[0]+1/60)*1000)/1000;late[late.length-2]++;
 late[5].eventSeq+=5000000;
 let insertedEarly=false,insertedLate=false;const applied=[];
 for(const packet of x.packets){
  const extra=[];
  if(!insertedEarly&&packet.u>=early.at(-2)){extra.push(early);insertedEarly=true;}
  if(!insertedLate&&packet.u>=late.at(-2)){extra.push(late);insertedLate=true;}
  const rows=x.deliver(packet,events=>[...extra,...events]);
  applied.push(...rows.filter(row=>row.damage>0));
 }
 assert.equal(insertedEarly,true);assert.equal(insertedLate,true);
 assert.ok(applied.every(row=>row.event[5]?.eventSeq<4000000),
  'a new sequence cannot move the same blast one source frame early or beyond expiry');
 assert.equal(applied.length,x.claims.length,'every genuine source contact, including frame 80, survives');
 assert.deepEqual(applied.map(row=>row.event[5].eventSeq),x.claims.map(event=>event[5].eventSeq));
});

test('Booyah body burst preserves its native center and current-tick world clock',async t=>{
 let sourceBirth;
 const x=await specialNativeProducer(t,'booyahBomb',{
  frames:900,targetZ:1000,configure:x=>x.owner.pos.set(0,0,11.1),
  afterStep(x,i){
   const object=x.f.projectiles._s3AllSpecialObjects?.find(o=>o.kind==='booyahBlast');
   if(!object)return;
   sourceBirth ||= {tick:i+1,pos:object.pos.clone()};
   x.target.pos.copy(object.pos).add(new x.f.THREE.Vector3(4,0,0));
  },
 });
 assert.ok(sourceBirth?.pos.y>.3,'the native body collision creates an airborne blast');
 assert.equal(x.claims.length,28);assert.equal(x.claims.at(-1).at(-2)-sourceBirth.tick,80);
 const frames=[],centers=[],terminals=[],burst=x.f.projectiles.nativeSpecialProjectileBurstContact;
 const area=x.f.projectiles.nativeSubDeviceAreaContact;
 x.f.projectiles.nativeSpecialProjectileBurstContact=function(p,target,at,options){
  const result=burst.call(this,p,target,at,options);
  if(result&&p.wid==='booyahBomb'){
   terminals.push(at.clone());
   frames.push([options.receipt?.tick,Number(result.contactKey.split(':').at(-1))]);
  }
  return result;
 };
 x.f.projectiles.nativeSubDeviceAreaContact=function(p,target,center,...args){
  if(p.wid==='booyahBomb')centers.push(center.clone());
  return area.call(this,p,target,center,...args);
 };
 let applied=0;for(const packet of x.packets)applied+=x.deliver(packet).filter(row=>row.damage>0).length;
 assert.equal(applied,x.claims.length,'an immediate body burst loses neither its first nor its final contact');
 assert.ok(frames.length>=x.claims.length);assert.ok(centers.length>=x.claims.length);
 for(const at of terminals)assert.ok(at.distanceTo(sourceBirth.pos)<.002,`the private terminal retains the native body entry, within wire quantization: ${at.toArray()} vs ${sourceBirth.pos.toArray()}`);
 for(const [tick,frame]of frames)assert.equal(frame,tick-sourceBirth.tick,'body burst keeps its current-tick epoch');
 const center=sourceBirth.pos.clone();center.y+=.2;
 for(const actual of centers)assert.ok(actual.distanceTo(center)<.002,'native body blast stays at its source height');
});
