import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
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
for(const sub of ['inkMine','angleShooter'])test(`${sub}: fresh-envelope repeats cannot extend one target life; first forged target remains explicitly unresolved`,async t=>{
 for(const before of [true,false]){const w=await setup(before);try{
  const {p,o}=w.birth(sub);const mark={...p,phase:'mark',frames:300,targetId:2,targetLife:0,markAgeFrames:0};
  w.play({...mark,frames:299});assert.equal(w.target.s3.revealedUntil,undefined);
  w.play(mark,'foreign');assert.equal(w.target.s3.revealedUntil,undefined);
  w.play(mark);const first=w.target.s3.revealedUntil[0];assert.ok(first>w.f.G.time,'diagnostic: first far-target claim remains accepted without contact proof');
  w.f.G.time=14;for(let i=0;i<10;i++)w.play(mark);
  assert.equal(w.target.s3.revealedUntil[0],before?first+4:first);
  const other=w.f.make();Object.assign(other,{nid:3,owner:'c',remote:true,team:1,netLife:0});w.nm.byNid.set(3,other);w.nm._setupActor(other);w.play({...mark,targetId:3});assert.ok(other.s3.revealedUntil[0]>w.f.G.time,'one birth can mark another target');
  w.target.netLife=1;w.play(mark);assert.equal(w.target.s3.revealedUntil[0],before?first+4:first,'old target life rejected');w.play({...mark,targetLife:1});assert.ok(w.target.s3.revealedUntil[0]>w.f.G.time,'new target life has independent receipt');
  w.f.G.projectiles.clear();delete other.s3.revealedUntil;w.play({...mark,targetId:3});assert.equal(other.s3.revealedUntil,undefined,'clear retires the whole birth proof');
  if(!before)t.diagnostic('security_pass=false: first mark target contact proof remains unavailable; duplicate renewal only is fixed');
 }finally{w.close();}}
});

test('first deploy corrects restored landing clocks and cannot undo an earlier Beakon consumption',async()=>{
 for(const before of [true,false]){const w=await setup(before);try{
  const {p,o}=w.birth('beakon');o.phase='deployed';o.activeAt=11;o.expireAt=999;
  w.play({...p,phase:'beakonUses',usesLeft:1});assert.equal(o.usesLeft,1);
  w.play({...p,phase:'deploy',activeIn:.25,lifeSeconds:8,usesLeft:2});
  assert.equal(o.activeAt,10.25);assert.equal(o.expireAt,18);assert.equal(o.usesLeft,before?2:1);
 }finally{w.close();}}
});
