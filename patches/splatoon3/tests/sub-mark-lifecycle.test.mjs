import test from 'node:test';
import assert from 'node:assert/strict';
import {gearCurve} from '../runtime/gear.mjs';
import {near,equip,world,peer} from './sub-mark-fixture.mjs';
for(const sub of ['angleShooter','inkMine'])test(`${sub} receiver binds marking to known source birth and original duration`,async()=>{
 const a=await peer('a',sub,10);const obj=a.f.G.projectiles.throwBomb(a.o);obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);if(sub==='inkMine'){obj.phase='deployed';obj.vel.set(0,0,0);obj.activeAt=0;obj.deployedAt=0;obj.expireAt=Infinity;}
 for(let i=0;i<20;i++)a.f.G.projectiles.update(1/60);
 const birth=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),mark=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='mark');assert.ok(birth&&mark);
 for(const kind of ['missingBirth','frames','sourceLife','sub']){
  const b=await peer('b',sub,10);if(kind!=='missingBirth')b.nm._play('a',JSON.parse(JSON.stringify(birth)));const row=JSON.parse(JSON.stringify(mark));if(kind==='frames')row[5].frames++;if(kind==='sourceLife')row[5].sourceLife++;if(kind==='sub')row[5].subId=sub==='inkMine'?'angleShooter':'inkMine';b.nm._play('a',row);assert.equal(b.v.s3.revealedUntil,undefined,kind);
 }
});
for(const sub of ['angleShooter','inkMine'])test(`${sub} known mark birth outlives visual retirement but not clear or match identity`,async()=>{
 const a=await peer('a',sub,10);const obj=a.f.G.projectiles.throwBomb(a.o);obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);if(sub==='inkMine'){obj.phase='deployed';obj.vel.set(0,0,0);obj.activeAt=0;obj.deployedAt=0;obj.expireAt=Infinity;}
 for(let i=0;i<240;i++)a.f.G.projectiles.update(1/60);
 const birth=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),mark=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='mark'),expire=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='expire');assert.ok(birth&&mark&&expire);
 for(const kind of ['timeout','visual','retired','clear','match']){
  const b=await peer('b',sub,10);b.nm._play('a',JSON.parse(JSON.stringify(birth)));
  if(kind==='timeout'){const ghost=b.f.G.projectiles._s3SubObjects[0];ghost.age=10;for(let i=0;i<6;i++){b.f.G.time+=1/60;b.f.G.projectiles.update(1/60);}}
  else if(kind==='retired'){b.nm._play('a',JSON.parse(JSON.stringify(expire)));assert.equal(b.f.G.projectiles._s3SubObjects.length,0);}
  else{b.f.G.projectiles.kitDefenseCandidate=o=>({distance:0,point:o.prev.clone(),onHit(){}});for(let i=0;i<6;i++){b.f.G.time+=1/60;b.f.G.projectiles.update(1/60);}assert.equal(b.f.G.projectiles._s3SubObjects.length,0,'receiver visual intercept retired the ghost');}
  if(kind==='clear')b.f.G.projectiles.clear();if(kind==='match')b.f.G.match={...b.f.G.match};
  b.nm._play('a',JSON.parse(JSON.stringify(mark)));
  if(kind==='clear'||kind==='match'||kind==='retired')assert.equal(b.v.s3.revealedUntil,undefined,kind);
  else near(b.v.s3.revealedUntil[0]-b.f.G.time,(5-(mark[5].markAgeFrames||0)/60)*gearCurve(10,1,sub==='inkMine'?.55:.43,.1));
 }
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
 const mine=a.f.G.projectiles.throwBomb(a.o);mine.pos.set(0,.7,0);mine.prev.copy(mine.pos);mine.phase='deployed';mine.vel.set(0,0,0);mine.activeAt=0;mine.deployedAt=0;mine.expireAt=Infinity;a.f.G.projectiles.update(1/60);
 const birth=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),mark=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='mark');assert.ok(birth&&mark);b.nm._play('a',JSON.parse(JSON.stringify(birth)));
 c.o.nid=3;c.o.owner='c';c.nm.myId=c.nm.s.myId='c';c.nm.byNid.delete(1);c.nm.byNid.set(3,c.o);c.nm._setupActor(c.o);
 const remote=b.f.make();Object.assign(remote,{nid:3,owner:'c',remote:true,team:0});remote.weapon={...remote.weapon,sub:'angleShooter'};b.nm.byNid.set(3,remote);b.nm._setupActor(remote);
 for(let i=0;i<150;i++)c.f.G.projectiles.throwBomb(c.o);
 for(const row of c.nm.out)b.nm._play('c',JSON.parse(JSON.stringify(row)));
 assert.ok(!b.f.G.projectiles._s3SubObjects.some(o=>o.owner===b.o),'other owner evicted original visual');b.nm._play('a',JSON.parse(JSON.stringify(mark)));near(b.v.s3.revealedUntil[0]-b.f.G.time,5*gearCurve(10,1,.55,.1));
});
test('leave/rejoin actor identity cannot reuse a former owner receipt',async()=>{
 const a=await peer('a','angleShooter',10),b=await peer('b','angleShooter',10);const obj=a.f.G.projectiles.throwBomb(a.o);obj.pos.set(0,.7,0);obj.prev.copy(obj.pos);obj.vel.set(0,0,60);for(let i=0;i<3;i++)a.f.G.projectiles.update(1/60);
 const birth=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),mark=a.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='mark');assert.ok(birth&&mark);b.nm._play('a',JSON.parse(JSON.stringify(birth)));b.nm._remove(b.o);
 const fresh=b.f.make();Object.assign(fresh,{nid:1,owner:'a',team:0,remote:true});fresh.weapon={...fresh.weapon,sub:'angleShooter'};b.nm.byNid.set(1,fresh);b.nm._setupActor(fresh);b.nm._play('a',JSON.parse(JSON.stringify(mark)));assert.equal(b.v.s3.revealedUntil,undefined);
});
test('long-lived mine proof survives same-owner retired births and owner respawn',async()=>{
 const a=await peer('a','inkMine',10),b=await peer('b','inkMine',10);a.v.pos.set(0,0,50);
 const mine=a.f.G.projectiles.throwBomb(a.o);mine.pos.set(0,.7,0);mine.prev.copy(mine.pos);mine.phase='deployed';mine.vel.set(0,0,0);mine.activeAt=0;mine.deployedAt=0;mine.expireAt=Infinity;
 const deliver=()=>{for(const row of a.nm.out.splice(0))b.nm._play('a',JSON.parse(JSON.stringify(row)));};deliver();
 a.o.weapon={...a.o.weapon,sub:'angleShooter'};
 for(let i=0;i<110;i++){const shot=a.f.G.projectiles.throwBomb(a.o);shot.age=10;for(let j=0;j<2;j++)a.f.G.projectiles.update(1/60);deliver();}
 assert.ok(a.f.G.projectiles._s3SubObjects.includes(mine),'source mine remained alive');
 a.o.splat(null,'water');a.o.respawn();deliver();let packet;a.nm.s.tr.ws.send=text=>{if(text.startsWith('b|'))packet=JSON.parse(text.slice(2));};a.nm._sendTick();b.nm.onMessage('a',packet);const remotePeer=b.nm._peer('a');remotePeer.tr=Math.max(remotePeer.tr||0,packet.ts);b.nm._sample(b.o,remotePeer.tr,0);b.nm.applyRemote(b.o,1/60);assert.equal(b.o.netLife,a.o.netLife);assert.ok(a.o.netLife>mine.sourceLife);
 a.v.pos.set(0,0,2);a.f.G.projectiles.update(1/60);const rows=a.nm.out.splice(0),mark=rows.find(e=>e[1]==='ac'&&e[5].phase==='mark');assert.ok(mark,'old device marks after owner respawn');assert.equal(mark[5].sourceLife,mine.sourceLife);assert.equal(mark[5].life,a.o.netLife);
 for(const row of rows)b.nm._play('a',JSON.parse(JSON.stringify(row)));near(b.v.s3.revealedUntil[0]-b.f.G.time,5*gearCurve(10,1,.55,.1));
});
test('ordered JSON tick replays source mark before wire expiry even after receiver visual removal',async()=>{
 const a=await peer('a','angleShooter',10),b=await peer('b','angleShooter',10);let packet;a.nm.s.tr.ws.send=text=>{if(text.startsWith('b|'))packet=JSON.parse(text.slice(2));};
 const flush=()=>{a.f.G.time+=1/60;a.nm._sendTick();b.nm.onMessage('a',packet);const p=b.nm._peer('a');p.tr=packet.ts;p.sim=packet.u;b.nm._playEvents();};
 const shot=a.f.G.projectiles.throwBomb(a.o);flush();b.f.G.projectiles.kitDefenseCandidate=o=>({distance:0,point:o.prev.clone(),onHit(){}});for(let i=0;i<6;i++)b.f.G.projectiles.update(1/60);assert.equal(b.f.G.projectiles._s3SubObjects.length,0);
 shot.pos.set(0,.7,0);shot.prev.copy(shot.pos);shot.vel.set(0,0,60);for(let i=0;i<240;i++)a.f.G.projectiles.update(1/60);
 const events=a.nm.out.filter(e=>e[1]==='ac');assert.ok(events.findIndex(e=>e[5].phase==='mark')<events.findIndex(e=>e[5].phase==='expire'));flush();near(b.v.s3.revealedUntil[0]-b.f.G.time,(5-(events.find(e=>e[5].phase==='mark')[5].markAgeFrames||0)/60)*gearCurve(10,1,.43,.1));
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
