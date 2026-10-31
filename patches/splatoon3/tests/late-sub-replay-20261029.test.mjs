import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {peer,launch,advance,send,sendRows,isMark,json} from './sub-mark-fixture.mjs';
const evidence=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(process.env.INKWAVE_REVIEW_ROOT||fileURLToPath(new URL('../../../',import.meta.url)));
const stage=process.env.INKWAVE_REVIEW_STAGE||root;
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/late-combat-before-20261029.json',import.meta.url),'utf8'));
const beforeSource=rel=>frozen.sources[rel];
const {fixture}=await import(pathToFileURL(path.join(root,'patches/splatoon3/tests/source-fixture.mjs')));
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
async function setup(before=false){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime:(rel,source)=>adaptBuildSource(rel,rel==='patches/splatoon3/runtime/all-subs.mjs'?(before?beforeSource(rel):fs.readFileSync(path.join(stage,rel),'utf8')):source)});
 f.G.scene||=new f.THREE.Scene();f.G.time=10;
 const owner=f.make(),target=f.make();Object.assign(owner,{nid:1,owner:'a',remote:true,team:0,netLife:0});Object.assign(target,{nid:2,owner:'b',remote:false,team:1,netLife:0});owner.pos.set(0,0,0);target.pos.set(250,0,250);
 const match={state:'playing',mode:'turf',time:180,actors:[owner,target],playing:()=>true};
 const nm=new f.NetMatch({myId:'b',hostId:'a',isHost:false,_members:new Map([['a',{}],['b',{}]]),tr:{broadcast(){},sendTo(){}}},{id:'late-sub-replay',map:'reef'});nm.bind(match);f.G.netm=nm;f.G.match=match;f.G.actors=match.actors;nm.byNid.set(1,owner);nm.byNid.set(2,target);nm._setupActor(owner);nm._setupActor(target);let wire=0;
 const play=(payload,from='a')=>nm._play(from,[f.G.time,'ac','sub',1,owner.netLife,{v:1,life:owner.netLife,sourceLife:0,...payload},600,++wire]);
 const birth=(subId,seq=1)=>{owner.weapon={...owner.weapon,sub:subId};const p={subId,seq,x:0,y:.5,z:0,vx:0,vy:0,vz:0,seed:1,charge:0,subPowerAP:0};play({...p,phase:'spawn'});const o=f.G.projectiles._s3SubObjects.find(o=>o.owner===owner&&o.seq===seq);assert.ok(o?.ghost);return{p,o};};
 return{f,owner,target,nm,play,birth,close(){nm.dispose();f.G.projectiles.clear();}};
}
for(const sub of ['toxicMist','splashWall','beakon'])test(`${sub}: accepted deploy is once per birth; first correction, timer and uses remain coherent`,async()=>{
 for(const before of [true,false]){const w=await setup(before);try{
  const {p,o}=w.birth(sub);const event={...p,phase:'deploy',yaw:.3,activeIn:.18,lifeSeconds:sub==='splashWall'?400/60:5,usesLeft:2};
  w.play(event);assert.ok(['deployed','wallPending'].includes(o.phase));const initial={expire:o.expireAt,active:o.activeAt,mesh:o.mesh,position:o.pos.toArray(),yaw:o.yaw};
  if(sub==='beakon'){w.play({...p,phase:'beakonUses',usesLeft:1});assert.equal(o.usesLeft,1);}
  w.f.G.time=14;
  for(let i=0;i<30;i++)w.play({...event,x:100,yaw:2,usesLeft:2});
  if(before){assert.equal(o.expireAt,initial.expire+4);if(sub==='beakon')assert.equal(o.usesLeft,2);assert.notEqual(o.mesh,initial.mesh);}
  else {assert.equal(o.expireAt,initial.expire);assert.equal(o.activeAt,initial.active);assert.equal(o.mesh,initial.mesh);assert.deepEqual(o.pos.toArray(),initial.position);assert.equal(o.yaw,initial.yaw);if(sub==='beakon')assert.equal(o.usesLeft,1);}
  const next=w.birth(sub,2);w.play({...next.p,phase:'deploy',activeIn:.1,lifeSeconds:5,usesLeft:2});assert.ok(['deployed','wallPending'].includes(next.o.phase));assert.equal(next.o.expireAt,19,'new birth is independently admitted');
 }finally{w.close();}}
});
for(const sub of ['inkMine','angleShooter'])test(`${sub}: native birth/contact rejects the former first far-target claim and prevents renewal`,async t=>{
 // Keep the pinned pre-fix negative control: its raw authenticated-looking
 // payload accepted a distant target without a receiver contact.
 const old=await setup(true);try{
  const {p}=old.birth(sub),mark={...p,phase:'mark',frames:300,targetId:2,targetLife:0,markAgeFrames:0,sourceTeam:0};
  old.play(mark);const first=old.target.s3.revealedUntil[0];assert.ok(first>old.f.G.time);
  old.f.G.time=14;old.play(mark);assert.equal(old.target.s3.revealedUntil[0],first+4,'pinned prior source reproduces renewal');
 }finally{old.close();}
 const a=await peer('a',sub,10),b=await peer('c',sub,10);t.after(()=>{a.close();b.close();});b.v.pos.set(250,0,250);
 launch(a,[b]);let mark;
 // Deliberately withhold terminal rows while testing an early mark proposal;
 // the receiver must still acquire its own native contact before accepting it.
 for(let i=0;i<180&&!mark;i++){
  advance([a,b]);send(a,b,{map(p){mark=p.e?.find(isMark);p.e=p.e?.filter(e=>e[1]!=='ac'||!['burst','expire','destroy'].includes(e[5]?.phase));}});
 }
 assert.ok(mark,'actual native source marks its near target');assert.equal(b.v.s3.revealedUntil,undefined,'an accepted native birth and source row cannot select a distant receiver target');
 for(const changes of [{frames:299},{sourceTeam:1},{targetLife:1}]){const fake=json(mark);Object.assign(fake[5],changes);sendRows(a,b,[fake]);assert.equal(b.v.s3.revealedUntil,undefined);}
 b.v.pos.copy(a.v.pos);for(let i=0;i<60&&!b.v.s3.revealedUntil?.[0];i++)advance([a,b]);assert.ok(b.v.s3.revealedUntil?.[0]>b.f.G.time,'receiver native trajectory/trigger establishes the missing contact');
 const until=b.v.s3.revealedUntil[0];for(let i=0;i<10;i++)sendRows(a,b,[mark]);assert.equal(b.v.s3.revealedUntil[0],until,'fresh transport envelopes cannot renew one contact');
 b.v.netLife++;delete b.v.s3.revealedUntil;sendRows(a,b,[mark]);assert.equal(b.v.s3.revealedUntil,undefined,'old target life cannot borrow the stored contact');
 b.f.G.projectiles.clear();const next=json(mark);next[5].targetLife=b.v.netLife;sendRows(a,b,[next]);assert.equal(b.v.s3.revealedUntil,undefined,'clear retires the native birth/contact capability');
});

test('first deploy corrects restored landing clocks and cannot undo an earlier Beakon consumption',async()=>{
 for(const before of [true,false]){const w=await setup(before);try{
  const {p,o}=w.birth('beakon');o.phase='deployed';o.activeAt=11;o.expireAt=999;
  w.play({...p,phase:'beakonUses',usesLeft:1});assert.equal(o.usesLeft,1);
  w.play({...p,phase:'deploy',activeIn:.25,lifeSeconds:8,usesLeft:2});
  assert.equal(o.activeAt,10.25);assert.equal(o.expireAt,18);assert.equal(o.usesLeft,before?2:1);
 }finally{w.close();}}
});
