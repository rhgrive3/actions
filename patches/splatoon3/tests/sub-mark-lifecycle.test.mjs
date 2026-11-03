import test from 'node:test';
import assert from 'node:assert/strict';
import {gearCurve} from '../runtime/gear.mjs';
import {near,equip,world,peer,capture,deliver,stepUntil,tickTo} from './sub-mark-fixture.mjs';
for(const sub of ['angleShooter','inkMine'])test(`${sub} receiver binds marking to known source birth and original duration`,async()=>{
 const a=await peer('a',sub,10);const obj=a.f.G.projectiles.throwBomb(a.o);obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);if(sub==='inkMine'){obj.phase='deployed';obj.vel.set(0,0,0);obj.activeAt=0;obj.deployedAt=0;obj.expireAt=Infinity;}
 for(let i=0;i<20;i++)a.f.G.projectiles.update(1/60);
 const birth=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),mark=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='mark');assert.ok(birth&&mark);
 for(const kind of ['missingBirth','frames','sourceLife','sub']){
  const b=await peer('b',sub,10);if(kind!=='missingBirth')b.nm._play('a',JSON.parse(JSON.stringify(birth)));const row=JSON.parse(JSON.stringify(mark));if(kind==='frames')row[5].frames++;if(kind==='sourceLife')row[5].sourceLife++;if(kind==='sub')row[5].subId=sub==='inkMine'?'angleShooter':'inkMine';b.nm._play('a',row);assert.equal(b.v.s3.revealedUntil,undefined,kind);
 }
});
// #1975: a mark is settled only by the receiver's own native contact with an
// accepted native birth. A sender mark row cannot create that contact.
const phaseRow=(packets,phase)=>packets.flatMap(p=>p.e||[]).find(e=>e[1]==='ac'&&e[5]?.phase===phase);
const nonTerminal=e=>!(e[1]==='ac'&&['expire','burst'].includes(e[5]?.phase));
function stepWorld(x,frames){for(let i=0;i<frames;i++){x.f.G.time+=1/60;x.f.G.projectiles.update(1/60);}}
for(const sub of ['angleShooter','inkMine'])test(`${sub} native mark birth needs receiver contact; visual retirement, clear and match identity cannot fabricate it`,async()=>{
 const a=await peer('a',sub,10);const obj=a.f.G.projectiles.throwBomb(a.o);const births=capture(a);
 obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);if(sub==='inkMine'){obj.phase='deployed';obj.vel.set(0,0,0);obj.activeAt=0;obj.deployedAt=0;obj.expireAt=Infinity;}
 stepWorld(a,240);
 const later=capture(a),mark=phaseRow(later,'mark'),expire=phaseRow(later,'expire');assert.ok(phaseRow(births,'spawn')&&mark&&expire);assert.equal(mark[5].frames,300,'existing configured five-second mark duration');
 const scale=gearCurve(10,1,sub==='inkMine'?.55:.43,.1);
 for(const kind of ['contact','timeout','visual','retired','clear','match']){
  const b=await peer('b',sub,10);deliver(b,'a',births);assert.equal(b.f.G.projectiles._s3SubObjects.length,1,'accepted native birth');
  if(kind==='timeout'){b.f.G.projectiles._s3SubObjects[0].age=10;stepWorld(b,6);}
  else if(kind==='visual'){b.f.G.projectiles.kitDefenseCandidate=o=>({distance:0,point:o.prev.clone(),onHit(){}});stepWorld(b,6);}
  else if(kind==='clear')b.f.G.projectiles.clear();else if(kind==='match')b.f.G.match={...b.f.G.match};
  deliver(b,'a',later,kind==='retired'?()=>true:nonTerminal);
  const marked=stepUntil(b,()=>b.v.s3.revealedUntil?.[0]>b.f.G.time,60);
  // A planted mine's native trigger survives visual retirement; a line marker
  // needs its own receiver flight contact.
  const expected=kind==='contact'||sub==='inkMine'&&(kind==='timeout'||kind==='visual');
  assert.equal(marked,expected,`${sub} ${kind}`);
  if(expected){
   const actual=b.v.s3.revealedUntil[0]-b.f.G.time;
   if(sub==='inkMine')near(actual,5*scale);else assert.ok(actual>0&&actual<=5*scale+1e-8,'line contact age only shortens the mark');
   const until=b.v.s3.revealedUntil[0];deliver(b,'a',later,nonTerminal);stepWorld(b,1);assert.equal(b.v.s3.revealedUntil[0],until,'replayed rows cannot renew');
  }
 }
});
test('Angle Shooter mark keeps the longer sender age when the row leads receiver contact, and cannot be renewed',async()=>{
 const a=await peer('a','angleShooter',10),b=await peer('b','angleShooter',10);
 a.v.pos.x=10;b.v.pos.x=10;
 const shot=a.f.G.projectiles.throwBomb(a.o);tickTo(a,b);shot.pos.set(0,.7,0);shot.prev.copy(shot.pos);shot.vel.set(0,0,60);
 stepWorld(a,10);
 assert.ok(!a.nm.out.some(e=>e[1]==='ac'&&e[5].phase==='mark'),'source target is initially away from the line');
 a.v.pos.x=0;for(let i=0;i<20&&!a.nm.out.some(e=>e[1]==='ac'&&e[5].phase==='mark');i++)stepWorld(a,1);
 const packets=capture(a),mark=phaseRow(packets,'mark');assert.ok(mark,'actual late native line contact emits mark');
 const senderAge=mark[5].markAgeFrames;assert.ok(senderAge>0);
 deliver(b,'a',packets,nonTerminal);assert.equal(b.v.s3.revealedUntil,undefined,'the row alone cannot mark before receiver contact');
 b.v.pos.x=0;assert.ok(stepUntil(b,()=>b.v.s3.revealedUntil?.[0]>b.f.G.time,30),'receiver contact settles the pending mark');
 const until=b.v.s3.revealedUntil[0];assert.ok(until-b.f.G.time<=(mark[5].frames-senderAge)/60*gearCurve(10,1,.43,.1)+1e-8,'the longer sender contact age is retained');
 deliver(b,'a',packets,nonTerminal);stepWorld(b,1);assert.equal(b.v.s3.revealedUntil[0],until,'replay cannot renew the admitted target');
});

test('source-cap eviction cannot resurrect old births and owner identity changes reject receipts',async()=>{
 const a=await peer('a','angleShooter',10),b=await peer('b','angleShooter',10);const first=a.f.G.projectiles.throwBomb(a.o);first.pos.set(0,.7,0);first.prev.copy(first.pos);first.vel.set(0,0,60);for(let i=0;i<3;i++)a.f.G.projectiles.update(1/60);
 const mark=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='mark');assert.ok(mark);for(let i=0;i<100;i++)a.f.G.projectiles.throwBomb(a.o);
 for(const e of a.nm.out.filter(e=>e[1]==='ac'&&e[5].phase==='spawn'))b.nm._play('a',JSON.parse(JSON.stringify(e)));
 assert.ok(!b.f.G.projectiles._s3SubObjects.some(o=>o.seq===first.seq),'96-object render budget evicted original');b.nm._play('a',JSON.parse(JSON.stringify(mark)));assert.equal(b.v.s3.revealedUntil,undefined,'same-owner later births supersede source-cap-evicted projectile');
 const oldBirth=JSON.parse(JSON.stringify(a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn')));oldBirth[7]+=100000;b.nm._play('a',oldBirth);const replay=JSON.parse(JSON.stringify(mark));replay[7]+=100001;b.nm._play('a',replay);assert.equal(b.v.s3.revealedUntil,undefined,'new envelope cannot revive old birth');
 const c=await peer('b','angleShooter',10);const birth=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn');c.nm._play('a',JSON.parse(JSON.stringify(birth)));c.o.owner='new-owner';c.nm._play('new-owner',JSON.parse(JSON.stringify(mark)));assert.equal(c.v.s3.revealedUntil,undefined,'old birth cannot change authority with actor rebind');
});
test('other-owner burst of more than 128 legal births cannot evict a pending original mark',async()=>{
 const a=await peer('a','inkMine',10),b=await peer('b','inkMine',10),c=await peer('a','angleShooter',0);
 b.v.pos.set(0,0,50);
 const mine=a.f.G.projectiles.throwBomb(a.o);mine.pos.set(0,.7,0);mine.prev.copy(mine.pos);mine.phase='deployed';mine.vel.set(0,0,0);mine.activeAt=0;mine.deployedAt=0;mine.expireAt=Infinity;a.f.G.projectiles.update(1/60);
 const packets=capture(a);assert.ok(phaseRow(packets,'spawn')&&phaseRow(packets,'mark'));deliver(b,'a',packets,e=>!(e[1]==='ac'&&['mark','burst','expire'].includes(e[5]?.phase)));
 c.o.nid=3;c.o.owner='c';c.id='c';c.nm.myId=c.nm.s.myId='c';c.nm.byNid.delete(1);c.nm.byNid.set(3,c.o);c.nm._setupActor(c.o);
 const remote=b.f.make();Object.assign(remote,{nid:3,owner:'c',remote:true,team:0});remote.weapon={...remote.weapon,sub:'angleShooter'};b.nm.byNid.set(3,remote);b.nm._setupActor(remote);
 for(let i=0;i<150;i++){c.f.G.projectiles.throwBomb(c.o);if(i%10===9)tickTo(c,b);}tickTo(c,b);
 // The bounded visual budget may keep or evict the planted mine; either way the
 // private native proof below is independent of that presentation list.
 assert.ok(b.f.G.projectiles._s3SubObjects.length<=96,'visual budget stays bounded');assert.ok(b.f.G.projectiles._s3SubObjects.filter(o=>o.owner===remote).length>=95,'the other owner burst was accepted');
 deliver(b,'a',packets,nonTerminal);b.v.pos.set(0,0,2);
 assert.ok(stepUntil(b,()=>b.v.s3.revealedUntil?.[0]>b.f.G.time,60),'the retained native mine proof still triggers');near(b.v.s3.revealedUntil[0]-b.f.G.time,5*gearCurve(10,1,.55,.1));
});
test('leave/rejoin actor identity cannot reuse a former owner receipt',async()=>{
 const a=await peer('a','angleShooter',10),b=await peer('b','angleShooter',10);const obj=a.f.G.projectiles.throwBomb(a.o);obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);for(let i=0;i<3;i++)a.f.G.projectiles.update(1/60);
 const birth=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),mark=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='mark');assert.ok(birth&&mark);b.nm._play('a',JSON.parse(JSON.stringify(birth)));b.nm._remove(b.o);
 const fresh=b.f.make();Object.assign(fresh,{nid:1,owner:'a',team:0,remote:true});fresh.weapon={...fresh.weapon,sub:'angleShooter'};b.nm.byNid.set(1,fresh);b.nm._setupActor(fresh);b.nm._play('a',JSON.parse(JSON.stringify(mark)));assert.equal(b.v.s3.revealedUntil,undefined);
});
test('long-lived mine proof survives same-owner retired births and owner respawn',async()=>{
 const a=await peer('a','inkMine',10),b=await peer('b','inkMine',10);a.v.pos.set(0,0,50);b.v.pos.set(0,0,50);
 const mine=a.f.G.projectiles.throwBomb(a.o);mine.pos.set(0,.7,0);mine.prev.copy(mine.pos);mine.phase='deployed';mine.vel.set(0,0,0);mine.activeAt=0;mine.deployedAt=0;mine.expireAt=Infinity;
 tickTo(a,b);
 a.o.weapon={...a.o.weapon,sub:'angleShooter'};
 for(let i=0;i<110;i++){const shot=a.f.G.projectiles.throwBomb(a.o);shot.age=10;for(let j=0;j<2;j++)a.f.G.projectiles.update(1/60);tickTo(a,b);}
 assert.ok(a.f.G.projectiles._s3SubObjects.includes(mine),'source mine remained alive');
 a.o.splat(null,'water');a.o.respawn();const packets=tickTo(a,b);const remotePeer=b.nm._peer('a');remotePeer.tr=Math.max(remotePeer.tr||0,packets.at(-1).ts);b.nm._sample(b.o,remotePeer.tr,0);b.nm.applyRemote(b.o,1/60);assert.equal(b.o.netLife,a.o.netLife);assert.ok(a.o.netLife>mine.sourceLife);
 a.v.pos.set(0,0,2);a.f.G.projectiles.update(1/60);const rows=capture(a),mark=phaseRow(rows,'mark');assert.ok(mark,'old device marks after owner respawn');assert.equal(mark[5].sourceLife,mine.sourceLife);assert.equal(mark[5].life,a.o.netLife);
 deliver(b,'a',rows,nonTerminal);b.v.pos.set(0,0,2);assert.ok(stepUntil(b,()=>b.v.s3.revealedUntil?.[0]>b.f.G.time,60));near(b.v.s3.revealedUntil[0]-b.f.G.time,5*gearCurve(10,1,.55,.1));
});
test('ordered JSON tick mark cannot replace receiver contact lost to receiver visual removal',async()=>{
 const a=await peer('a','angleShooter',10),b=await peer('b','angleShooter',10);
 const shot=a.f.G.projectiles.throwBomb(a.o);tickTo(a,b);b.f.G.projectiles.kitDefenseCandidate=o=>({distance:0,point:o.prev.clone(),onHit(){}});stepWorld(b,6);assert.equal(b.f.G.projectiles._s3SubObjects.length,0);
 shot.pos.set(0,.7,0);shot.prev.copy(shot.pos);shot.vel.set(0,0,60);stepWorld(a,240);
 const events=a.nm.out.filter(e=>e[1]==='ac');assert.ok(events.findIndex(e=>e[5].phase==='mark')<events.findIndex(e=>e[5].phase==='expire'),'owner orders the mark before expiry');
 tickTo(a,b);stepWorld(b,6);assert.equal(b.v.s3.revealedUntil,undefined,'#1975: no receiver native contact, no mark');
});
test('observed authority and match replacement permanently retire old marking receipts',async()=>{
 const a=await peer('a','angleShooter',10);const shot=a.f.G.projectiles.throwBomb(a.o);shot.pos.set(0,.7,0);shot.prev.copy(shot.pos);shot.vel.set(0,0,60);for(let i=0;i<3;i++)a.f.G.projectiles.update(1/60);
 const birth=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),mark=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='mark');assert.ok(birth&&mark);
 for(const kind of ['owner','match','net','actorNet']){
  const b=await peer('b','angleShooter',10);b.nm._play('a',JSON.parse(JSON.stringify(birth)));const match=b.f.G.match,net=b.f.G.netm,actorNet=b.o.net;
  if(kind==='owner')b.o.owner='new-owner';if(kind==='match')b.f.G.match={...match};if(kind==='net')b.f.G.netm={...net};if(kind==='actorNet')b.o.net={...actorNet};
  b.nm._play(kind==='owner'?'new-owner':'a',JSON.parse(JSON.stringify(mark)));assert.equal(b.v.s3.revealedUntil,undefined,kind+' mismatch');
  b.o.owner='a';b.f.G.match=match;b.f.G.netm=net;b.o.net=actorNet;
  const replay=JSON.parse(JSON.stringify(mark));replay[7]+=10000;b.nm._play('a',replay);assert.equal(b.v.s3.revealedUntil,undefined,kind+' restored identity');
 }
});
