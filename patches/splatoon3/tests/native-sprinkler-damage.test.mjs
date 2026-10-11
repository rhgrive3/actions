import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const extraExports="export {kitBombContact} from './patches/splatoon3/runtime/kit-subs.mjs';";
async function setup(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;}
function deploy(f,a){a.weapon={...a.weapon,sub:'sprinkler'};a.weaponRunner.reset();f.G.projectiles.throwBomb(a);const b=f.G.projectiles.bombs.at(-1);assert.ok(b);f.kitBombContact(f.SUB,b,{hit:true,point:new f.THREE.Vector3(0,0,0),normal:new f.THREE.Vector3(0,1,0)});return b;}
function round(f,a,b,damage=10,ghost=false){return {owner:a,team:a.team,damage,ghost,size:.01,prev:b.pos.clone().add(new f.THREE.Vector3(0,0,-1)),pos:b.pos.clone().add(new f.THREE.Vector3(0,0,1))};}
for(const wear of [false,true])test(`native Sprinkler is damaged once and retires without explosion, gear ${wear}`,async()=>{
 const f=await setup(),owner=f.make(),a=f.make();a.team=1;a.s3.loadout[2].main=wear?'objectShredder':'runSpeed';f.G.actors=[owner,a];const b=deploy(f,owner);assert.equal(b.s3Mode,'sprinkling');
 const p=round(f,a,b),c=f.G.projectiles.kitBarrierCandidate(p,p.prev,p.pos);assert.equal(c.kind,'native-sprinkler');c.onHit();assert.equal(b.s3DeviceHP,wear?20:110);c.onHit();assert.equal(b.s3DeviceHP,wear?20:110);
 const ghost=round(f,a,b,120,true),gc=f.G.projectiles.kitBarrierCandidate(ghost,ghost.prev,ghost.pos);gc.onHit();assert.equal(b.s3DeviceHP,wear?20:110);
 const end=round(f,a,b,120),ec=f.G.projectiles.kitBarrierCandidate(end,end.prev,end.pos);ec.onHit();assert.equal(b.s3DeviceHP,0);assert.equal(b.s3Destroyed,true);
 let explosions=0;const explode=f.G.projectiles._explodeBomb;f.G.projectiles._explodeBomb=function(...args){explosions++;return explode.apply(this,args);};f.G.projectiles.update(1/60);assert.equal(f.G.projectiles.bombs.includes(b),false);assert.equal(explosions,0);
});

function bind(f,myId){const owner=f.make(),a=f.make();Object.assign(owner,{nid:301,owner:'defender',netLife:3});Object.assign(a,{nid:302,owner:'attacker',netLife:7,team:1});owner.weapon={...owner.weapon,sub:'sprinkler'};owner.weaponRunner.reset();a.s3.loadout[2].main='objectShredder';const nm=new f.NetMatch({myId,hostId:'defender',isHost:myId==='defender',tr:{broadcast(){},sendTo(){}}},{id:'native-devices'});nm.bind({actors:[owner,a],state:'playing',time:180});f.G.netm=nm;f.G.match=nm.match;return {owner,a,nm};}
test('native Sprinkler birth and damage survive real JSON transport; only target owner destroys and retires the ghost',async()=>{
 const rx=await setup(),r=bind(rx,'defender'),target=deploy(rx,r.owner);assert.ok(target.s3DeviceBirth);assert.equal(target.s3DeviceBirth.life,3);
 const birth=JSON.parse(JSON.stringify(r.nm.out.find(e=>e[1]==='b')));assert.ok(birth);
 const tx=await setup(),s=bind(tx,'attacker');s.nm._play('defender',birth);const ghost=tx.G.projectiles.bombs.find(b=>b.owner===s.owner);assert.ok(ghost?.ghost);assert.deepEqual(JSON.parse(JSON.stringify(ghost.s3DeviceBirth)),JSON.parse(JSON.stringify(target.s3DeviceBirth)));
 tx.kitBombContact(tx.SUB,ghost,{hit:true,point:new tx.THREE.Vector3(0,0,0),normal:new tx.THREE.Vector3(0,1,0)});
 const p=round(tx,s.a,ghost,12),candidate=tx.G.projectiles.kitBarrierCandidate(p,p.prev,p.pos);candidate.onHit();candidate.onHit();assert.equal(ghost.s3DeviceHP,120,'attacker does not own remote HP');
 const wire=JSON.parse(JSON.stringify(s.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='nativeObjectHit')));assert.ok(wire);assert.equal(wire[5].damage,12);assert.equal(wire[5].objectShredder,true);
 r.nm._play('foreign',JSON.parse(JSON.stringify(wire)));assert.equal(target.s3DeviceHP,120);
 r.nm._play('attacker',JSON.parse(JSON.stringify(wire)));assert.equal(target.s3DeviceHP,0);assert.equal(target.s3Destroyed,true);
 const states=r.nm.out.filter(e=>e[1]==='ac'&&e[5].phase==='nativeObjectState');assert.equal(states.length,1);
 r.nm._play('attacker',JSON.parse(JSON.stringify(wire)));assert.equal(r.nm.out.filter(e=>e[1]==='ac'&&e[5].phase==='nativeObjectState').length,1);
 s.nm._play('defender',JSON.parse(JSON.stringify(states[0])));assert.equal(ghost.s3Destroyed,true);assert.equal(ghost.s3DeviceHP,0);
 tx.G.projectiles.update(1/60);rx.G.projectiles.update(1/60);assert.equal(tx.G.projectiles.bombs.includes(ghost),false);assert.equal(rx.G.projectiles.bombs.includes(target),false);
});

test('native device proposals reject stale birth/life, wrong match, distant hit, numeric gear and forged owner state',async()=>{
 const f=await setup(),r=bind(f,'defender'),b=deploy(f,r.owner),proof=b.s3DeviceBirth;
 const base={v:1,phase:'nativeObjectHit',subId:'sprinkler',actor:r.a,life:7,eventSeq:1,match:proof.match,targetOwnerId:301,targetLife:3,targetSeq:proof.seq,damage:10,objectShredder:true,x:b.pos.x,y:b.pos.y,z:b.pos.z};
 for(const delta of [{life:6},{match:'other'},{targetSeq:proof.seq+1},{targetLife:4},{targetOwnerId:999},{x:100},{damage:Infinity},{damage:0},{damage:2201},{eventSeq:0}]){
  assert.equal(f.installedRuntime.replaySub({...base,...delta}),false);assert.equal(b.s3DeviceHP,120);
 }
 assert.equal(f.installedRuntime.replaySub({...base,objectShredder:10}),true);assert.equal(b.s3DeviceHP,110,'numeric equipment multiplier is ignored');
 assert.equal(f.installedRuntime.replaySub({...base,objectShredder:true}),false,'same event cannot be reinterpreted as powered');assert.equal(b.s3DeviceHP,110);
 assert.equal(f.installedRuntime.replaySub({...base,eventSeq:2,phase:'nativeObjectState',hp:0,destroyed:true}),false,'the attacker cannot impersonate object owner');assert.equal(b.s3Destroyed,undefined);
});

test('native device birth wrapper restores recorder after exception and creates no second object authority',async()=>{
 const f=await setup(),r=bind(f,'defender'),b=deploy(f,r.owner);assert.equal((f.G.projectiles._s3SubObjects||[]).filter(o=>o.subId==='sprinkler').length,0);
 const rec=()=>{throw Error('recorder failure');};r.nm._rec=rec;assert.throws(()=>r.nm.recBomb(b),/recorder failure/);assert.equal(r.nm._rec,rec);
});

test('old native hit cannot replay in a fresh envelope after more than 1024 accepted proposals',async()=>{
 const rx=await setup(),r=bind(rx,'defender'),target=deploy(rx,r.owner),tx=await setup(),s=bind(tx,'attacker');
 s.nm._play('defender',JSON.parse(JSON.stringify(r.nm.out.find(e=>e[1]==='b'))));const ghost=tx.G.projectiles.bombs.at(-1);tx.kitBombContact(tx.SUB,ghost,{hit:true,point:new tx.THREE.Vector3(0,0,0),normal:new tx.THREE.Vector3(0,1,0)});
 let first;
 for(let i=0;i<1026;i++){
  const p=round(tx,s.a,ghost,.001);tx.G.projectiles.kitBarrierCandidate(p,p.prev,p.pos).onHit();const e=JSON.parse(JSON.stringify(s.nm.out.at(-1)));first||=JSON.parse(JSON.stringify(e));r.nm._play('attacker',e);
 }
 const hp=target.s3DeviceHP;assert.ok(hp<120&&hp>0);first[first.length-1]+=10000;first[first.length-2]+=10000;first[0]+=10;
 r.nm._play('attacker',first);assert.equal(target.s3DeviceHP,hp,'application id remains spent even after old transport envelopes are evicted');
 const replacement=rx.make();Object.assign(replacement,{nid:302,owner:'attacker',netLife:7,team:1,remote:true});r.nm.byNid.set(302,replacement);
 first[first.length-1]+=10000;first[first.length-2]+=10000;first[0]+=10;r.nm._play('attacker',first);
 assert.equal(target.s3DeviceHP,hp,'same owner/nid/life cannot reset the application ledger by rebinding Actor');
});

test('real tick ingress sorts reordered native proposals before the monotone application gate',async()=>{
 const rx=await setup(),r=bind(rx,'defender'),b=deploy(rx,r.owner),tx=await setup(),s=bind(tx,'attacker');s.nm._play('defender',JSON.parse(JSON.stringify(r.nm.out.find(e=>e[1]==='b'))));const ghost=tx.G.projectiles.bombs.at(-1);tx.kitBombContact(tx.SUB,ghost,{hit:true,point:new tx.THREE.Vector3(),normal:new tx.THREE.Vector3(0,1,0)});
 for(let i=0;i<3;i++){const p=round(tx,s.a,ghost,1);tx.G.projectiles.kitBarrierCandidate(p,p.prev,p.pos).onHit();}
 const rows=s.nm.out.filter(e=>e[1]==='ac'),ts=Math.max(...rows.map(e=>e[0]))+.01,u=Math.max(...rows.map(e=>e.at(-2)));
 r.nm.onMessage('attacker',JSON.parse(JSON.stringify({k:'t',r:2,ts,u,a:[],e:[...rows].reverse()})));const peer=r.nm._peer('attacker');peer.tr=ts;peer.sim=u;
 assert.deepEqual(Array.from(peer.events,e=>e[5].eventSeq),Array.from(rows,e=>e[5].eventSeq));r.nm._playEvents();assert.equal(b.s3DeviceHP,90,'all three legitimate proposals survive sorted playback');
});

test('native records are fresh after retirement and old-life proposals never damage the replacement Sprinkler',async()=>{
 const f=await setup(),r=bind(f,'defender'),first=deploy(f,r.owner),old=JSON.parse(JSON.stringify(first.s3DeviceBirth));
 first.s3DeviceHP=0;first.s3Destroyed=true;f.G.projectiles.update(1/60);r.owner.reset();r.owner.netLife=4;r.owner.alive=true;
 const second=deploy(f,r.owner);assert.notEqual(second,first);assert.equal(second.s3Destroyed,undefined);assert.equal(second.s3DeviceHP,120);assert.equal(second.s3DeviceBirth.life,4);assert.notEqual(second.s3DeviceBirth.seq,old.seq);
 const proposal={v:1,phase:'nativeObjectHit',subId:'sprinkler',actor:r.a,life:7,eventSeq:1,match:old.match,targetOwnerId:301,targetLife:old.life,targetSeq:old.seq,damage:120,objectShredder:true,x:second.pos.x,y:second.pos.y,z:second.pos.z};
 assert.equal(f.installedRuntime.replaySub(proposal),false);assert.equal(second.s3DeviceHP,120);
});
