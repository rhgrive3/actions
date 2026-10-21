import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const late=false;
test('native sprinkler lifetime bounded contact diagnostic',async()=>{
 const clock={ms:1000},hits=[],acks=[],ticks=[];
 async function endpoint(id){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>clock.ms}});
  const V=f.THREE.Vector3;const wall={id:0,solid:true,center:new V(0,2,3),half:new V(10,2,.2),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};f.G.level={...f.G.level,blocks:[wall],faces:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
  const o=f.make(),v=f.make();Object.assign(o,{nid:1,owner:'S',netLife:0,team:0});Object.assign(v,{nid:2,owner:'V',netLife:0,team:1,invuln:0});
  o.pos.set(0,0,0);o.aimDir.set(0,-.9,.435889894);v.pos.set(200,0,0);o.weapon={...o.weapon,sub:'sprinkler'};o.weaponRunner.reset();
  const tr={sendTo(to,p){if(p.k==='hit')hits.push(JSON.parse(JSON.stringify(p)));if(p.k==='hit_ack')acks.push(JSON.parse(JSON.stringify(p)));return true;},broadcast(p){if(p.k==='hit_ack')acks.push(JSON.parse(JSON.stringify(p)));if(p.k==='t'&&id==='S')ticks.push(JSON.parse(JSON.stringify(p)));return true;}};
  const session={myId:id,hostId:'S',isHost:id==='S',tr,_members:new Map([['S',{}],['V',{}]])};const match={actors:[o,v],playing:()=>true,state:'playing',time:180};const nm=new f.NetMatch(session,{id:'sprinkler-life',map:'reef'});nm.bind(match);session.match=nm;f.G.match=match;f.G.netm=nm;f.G.actors=match.actors;
  return {f,o,v,nm,targets:[v]};
 }
 const tx=await endpoint('S'),rx=await endpoint('V');tx.f.G.projectiles.throwBomb(tx.o);assert.equal(tx.nm._sendTick(),true);rx.nm.onMessage('S',ticks[0]);clock.ms+=150;rx.f.G.time+=.15;rx.nm.update(.15);
 assert.equal(ticks[0].e.find(e=>e[1]==='b').length,16,'tagged native sprinkler birth');assert.equal(rx.nm._combatProvenance.proofs.get('S').length,1,'native created commit');for(let n=3;n<=4;n++){for(const w of [tx,rx]){const a=w.f.make();Object.assign(a,{nid:n,owner:'V',netLife:0,team:1,invuln:0,remote:w===tx,isLocal:w===rx});a.pos.set(200,0,0);w.nm.byNid.set(n,a);w.targets.push(a);}}
 const bomb=tx.f.G.projectiles.bombs.find(b=>b.owner===tx.o);assert.ok(bomb);assert.equal(bomb.s3Resolved.spec.id,'sprinkler');assert.equal(bomb.s3PaintBirth,undefined,'identity adds no paint grant');let previous=0,contactCount=0,placed=false,awaiting=false;
 for(let i=0;i<300;i++){
  if(awaiting&&acks.length>=contactCount){awaiting=false;placed=false;for(const w of [tx,rx])for(const a of w.targets)a.pos.set(200,0,0);}
  const index=Math.min(2,Math.floor(acks.length/3));tx.v=tx.targets[index];rx.v=rx.targets[index];const st=bomb.s3Sprinkler;
  // Place a live opponent at an existing naturally emitted drop, never inject a drop or claim.
  if(!placed&&st?.drops.length&&i>(late?230:50)){const d=st.drops.find(d=>d.pos.y>.15&&d.pos.y<1.7);if(d){tx.v.pos.set(d.pos.x,0,d.pos.z);rx.v.pos.copy(tx.v.pos);placed=true;}}
  clock.ms+=1000/60;tx.f.G.time+=1/60;rx.f.G.time+=1/60;try{tx.f.G.projectiles.update(1/60);}catch(error){console.log('CRASH',i,bomb.age,bomb.s3Mode,bomb.pos.toArray(),!!bomb.mesh,tx.f.G.projectiles.bombs.includes(bomb),bomb.s3Sprinkler?.drops.length);throw error;}
  if(i%10===0){tx.nm._sendTick();rx.nm.onMessage('S',ticks.at(-1));}rx.nm.update(1/60);rx.f.G.projectiles.update(1/60);
  if(i===100||i===230)console.log('STATE',i,bomb.s3Mode,bomb.pos.toArray(),st?.drops.length,rx.nm._combatProvenance?.proofs.get('S'));
  while(previous<hits.length){const h=hits[previous++];if(awaiting)continue;awaiting=true;console.log('NATIVE_HIT',i,h.w,h.d,rx.v.hp);rx.nm.onMessage('S',h);console.log('RESULT',rx.v.hp,acks.length,rx.nm._combatProvenance?.pending.get('S')?.length);contactCount++;}
  if(acks.length>=9)break;
 }
 console.log('NINTH_FINAL',contactCount,acks.length,rx.targets.map(a=>a.hp),clock.ms);assert.equal(acks.length,9);assert.equal(rx.targets.reduce((n,a)=>n+100-a.hp,0),180);
 tx.nm.dispose();rx.nm.dispose();
});
