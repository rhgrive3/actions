import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import * as footprint from '../runtime/main-ink-footprints.mjs';
import {shooterImpactRadius} from '../runtime/shooter-impact-paint.mjs';
import {ClamsRule} from '../runtime/ranked/clams.mjs';
import {createRankedStage} from '../runtime/ranked/stages.mjs';
import {RankedWorld} from '../runtime/ranked/world.mjs';
import * as barrier from '../runtime/ranked/barrier-admission.mjs';
import {advanceShooterNearestSlot} from '../runtime/shooter-nearest-paint.mjs';
const frozenPath=new URL('./fixtures/ranked-added-before-8de71b09.json',import.meta.url);
const bytes=fs.readFileSync(frozenPath),frozen=JSON.parse(bytes);
assert.equal(frozen.sourceSha,'8de71b09cd7a3bc05fa4ce06b00f99687beb44ad');
const load=async path=>{const url=new URL('../../../'+path,import.meta.url);const source=frozen.files[path].replace(/from (['"])(\.[^'"]+)\1/g,(_,q,relative)=>`from ${q}${new URL(relative,url).href}${q}`);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));};
const oldFoot=await load('patches/splatoon3/runtime/main-ink-footprints.mjs');
const oldImpact=await load('patches/splatoon3/runtime/shooter-impact-paint.mjs');
const {ClamsRule:OldClams}=await load('patches/splatoon3/runtime/ranked/clams.mjs');
const {createRankedStage:oldStage}=await load('patches/splatoon3/runtime/ranked/stages.mjs');
const oldBarrier=await load('patches/splatoon3/runtime/ranked/barrier-admission.mjs');
const digest=crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(digest,'0f2da1f1ff70386f84871f08f1e28ce45b2db6cedb1db0b2ebf5ecaf40fe00ea');

test('family and impact validation retain exact bytes, selection precedence and numeric bands',()=>{
 assert.deepEqual(footprint.INK_PROFILE_BYTES,oldFoot.INK_PROFILE_BYTES);
 for(const family of ['shooter','dualies','splatling','blaster','stringer','brella','splatana','slosher','charger','roller','brush','bad',undefined])for(const sourceActor of [undefined,'WeaponSlosherBathtub'])for(const contact of [false,true]){
  const w={family,kind:'shooter',sourceActor};
  assert.equal(footprint.mainInkFootprint(w,contact),oldFoot.mainInkFootprint(w,contact));
  assert.equal(footprint.mainInkBurstFootprint(w),oldFoot.mainInkBurstFootprint(w));
 }
 for(const near of [undefined,null,-1,0,1.1,NaN,Infinity,'1'])for(const middle of [-1,1.1,2,NaN])for(const far of [undefined,null,1,20,Infinity])for(const distance of [-1,0,1.1,2,20,30,NaN]){
  const weapon={impactPaint:{distanceNear:near,distanceMiddle:middle,distanceFar:far,widthNear:1.93,widthMiddle:1.8,widthFar:1.71}};
  const projectile={start:{distanceTo:()=>distance}};
  assert.ok(Object.is(shooterImpactRadius(weapon,projectile,{}),oldImpact.shooterImpactRadius(weapon,projectile,{})));
 }
});
test('Clams distance uses dense arrays without slice and retains unusual-input vec fallback',()=>{
 const old=Object.create(OldClams.prototype),current=Object.create(ClamsRule.prototype),target=[.1,2,-3];
 const vec=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite)?[p[0],p[1],p[2]]:[0,0,0];
 for(const p of [[0,1,2],[1e20,-0,Number.MIN_VALUE],[NaN,0,0],[Infinity,0,0],[],null,{x:0,y:1,z:2},[,,2],[0,1,2,NaN]])assert.ok(Object.is(current._pickupDistanceSq(p,target),old._distanceSq(vec(p),target)));
 const p=[0,1,2];p.slice=()=>{throw Error('per-pair slice');};assert.equal(current._pickupDistanceSq(p,target),old._distanceSq([0,1,2],target));
});
const stageFixture=id=>{let ground=0,queries=0;const G={level:{layout:{id},blocks:[],groundHeight(x,z){ground++;return .02*x+.01*z;},queryBlocks(){queries++;return[];}}};return{G,counts:()=>({ground,queries})};};
test('five live stage builders defer unused Tower work and lazily retain the exact route',()=>{
 for(const id of ['tidewater','kelpline','halyard','cargo','scorch']){
  const a=stageFixture(id),b=stageFixture(id),c=stageFixture(id);
  const baseline=oldStage(a.G),legacy=createRankedStage(b.G),tower=createRankedStage(c.G,'tower');
  assert.deepEqual(legacy,baseline);assert.deepEqual(tower,baseline);assert.deepEqual(b.counts(),a.counts());assert.deepEqual(c.counts(),a.counts());
  for(const mode of ['zones','rainmaker','clams']){
   const h=stageFixture(id),lazy=createRankedStage(h.G,mode),before=h.counts();
   assert.equal(before.queries,0);assert.ok(before.ground<a.counts().ground);
   for(const key of ['zones','rainmaker','clams'])assert.deepEqual(lazy[key],baseline[key]);
   const path=lazy.tower.path;assert.deepEqual(path,baseline.tower.path);const count=h.counts();assert.equal(lazy.tower.path,path);assert.deepEqual(h.counts(),count);
   lazy.tower.path=[[0,1,2]];lazy.tower.centerIndex=0;assert.deepEqual(lazy.tower.path,[[0,1,2]]);assert.equal(lazy.tower.centerIndex,0);
  }
 }
});
test('non-Tower disposal preserves valid stamp ownership; mutations, wrap and Tower reset safely',()=>{
 function world(extra={}){const level={blocks:[],hash:[],blockStamp:new Uint32Array(0),_stamp:37};const G={level,scene:new THREE.Scene()};const w=new RankedWorld({G,THREE},{mode:'zones',actors:[]},{zones:[],tower:{get path(){throw Error('unused route');}},clams:{},rainmaker:{}});return{w,level,stamp:level.blockStamp,...extra};}
 {const {w,level,stamp}=world();w.dispose();assert.equal(level.blockStamp,stamp);assert.equal(level._stamp,37);w.dispose();assert.equal(level.blockStamp,stamp);}
 for(const mutate of [l=>l.blocks.push({}),l=>l.hash=[],l=>l.blocks=[],l=>l._stamp=0xffffffff,l=>l.blockStamp=new Uint32Array(2),l=>l.blockStamp=new Uint32Array(0),l=>l._stamp=1]){const {w,level,stamp}=world();mutate(level);w.dispose();assert.notEqual(level.blockStamp,stamp);assert.equal(level.blockStamp.length,level.blocks.length);assert.equal(level._stamp,1);}
});
const net=()=>({isHost:true,match:{mode:'rainmaker',state:'playing',actors:[{nid:'G',owner:'guest',team:0,alive:true,pos:{x:0,y:0,z:-8},weapon:{id:'shooter',kind:'shooter',damage:36,range:19,fireInterval:.1}}],ranked:{mode:'rainmaker',rule:{state:{pos:[0,0,0],barrier:{active:true}}}},rankedBarrierHits:[]}});
const serial=nm=>JSON.parse(JSON.stringify(nm,(k,v)=>v instanceof Map?[...v]:v));
test('admission single-prune keeps exact proofs, expiry, watermark and hit order',()=>{
 const pair=[net(),net()],apis=[oldBarrier,barrier];const birth=[9.95,'p','G','shot','shooter',0,1,-8,0,0,25,0,1.1,.06,.16,.1,0,0,0,1];
 const steps=[['queueRankedBarrierHit','guest',{id:'G',seq:2,damage:36,pos:[0,0,-1.5]},10],['queueRankedBarrierHit','guest',{id:'G',seq:1,damage:36,pos:[0,0,-1.5]},10],['noteRankedBarrierShots','guest',{e:[birth]},10],['noteRankedBarrierShots','guest',{e:[birth]},10.1],['queueRankedBarrierHit','guest',{id:'G',seq:3,damage:300,pos:[0,0,-1.5]},10.2],['flushRankedBarrierHits',11],['flushRankedBarrierHits',12],['resetRankedBarrierAdmission']];
 for(const [fn,...args]of steps){for(let i=0;i<2;i++)apis[i][fn](pair[i],...args);assert.deepEqual(serial(pair[1]),serial(pair[0]),fn);if(fn==='noteRankedBarrierShots')assert.equal(pair[1].match.rankedBarrierHits.length,1);}
});
test('single-scan nearest proposal changes invalid-data evaluation order: retain production helper',()=>{
 const source={SplitNum:8,ForceSpawnNearestAddNumArray:[1,99]};let reads=0;
 const runner={get s3ShooterNearestSlot(){reads++;return Symbol('invalid');}};
 assert.throws(()=>advanceShooterNearestSlot(runner,source),RangeError);assert.equal(reads,0);
 const proposed=(r,s)=>{const slot=((r.s3ShooterNearestSlot||0)%s.SplitNum)+1;let found=false;for(let i=0;i<s.ForceSpawnNearestAddNumArray.length;i++){if(!(i in s.ForceSpawnNearestAddNumArray))continue;const v=s.ForceSpawnNearestAddNumArray[i];if(!Number.isInteger(v)||v<1||v>s.SplitNum)throw new RangeError('Invalid shooter nearest-paint cycle source');if(v===slot)found=true;}r.s3ShooterNearestSlot=slot;return slot===s.SplitNum||found;};
 assert.throws(()=>proposed(runner,source),TypeError);assert.equal(reads,1);
});

const advance=source=>new Function('G','buildFrame','api','return '+source.split('Match.prototype.advanceRanked = ')[1].split('\n  Match.prototype.playRankedEvents = ')[0].trim().replace(/;$/,''));
test('actual event wrapper keeps playback and wire ordering while guests and empty batches skip filter',()=>{
 const old=frozen.files['patches/splatoon3/runtime/ranked/install.mjs'];
 const current=fs.readFileSync(new URL('../runtime/ranked/install.mjs',import.meta.url),'utf8');
 for(const host of [false,true])for(const input of [[],[{kind:'special-gain',points:2},{kind:'zone-capture'},{kind:'rainmaker-pickup',id:'a'},{kind:'finish'}]])for(const migrate of [false,true]){
  const runs=[old,current].map(source=>{let filters=0;const events=structuredClone(input);events.filter=function(fn){filters++;return Array.prototype.filter.call(this,fn);};
   const nm={isHost:host,cfg:{id:'room'},rankedEventNext:4,_sendNow(packet){this.sent=packet;}};const G={netm:nm};
   const match={state:'playing',ranked:{time:12,winner:null,events:{length:input.length,splice:()=>events},update(){}},playRankedEvents(e){this.played=[...e];if(migrate)nm.isHost=!nm.isHost;},rankedWorld:{update(){},},rankedEffects:{update(){}}};
   advance(source)(G,()=>({actors:[]}),{}).call(match,1/60);return{played:match.played,time:match.time,sent:nm.sent,seq:nm.rankedEventNext,filters};});
  assert.deepEqual({...runs[1],played:runs[1].played||[],filters:0},{...runs[0],filters:0});if(!input.length)assert.equal(runs[1].played,undefined);assert.equal(runs[1].filters,((migrate?!host:host)&&input.length)?1:0);
 }
});

test('empty ranked batches skip splice/playback while real batches detach before reentrant enqueue',()=>{
 const source=fs.readFileSync(new URL('../runtime/ranked/install.mjs',import.meta.url),'utf8'),events=[];
 let splices=0,played=0,world=0,effects=0;const splice=events.splice;
 events.splice=function(...args){splices++;return splice.apply(this,args);};
 const packets=[],nm={isHost:true,cfg:{id:'round'},_sendNow:p=>packets.push(p)};
 const m={state:'playing',ranked:{events,time:10,winner:null,update(){}},
  playRankedEvents(batch){played++;if(batch[0].kind==='lead')events.push({kind:'special-gain'});},
  rankedWorld:{update(){world++;}},rankedEffects:{update(){effects++;}}};
 const run=()=>advance(source)({netm:nm},()=>({actors:[]}),{}).call(m,1/60);
 run();assert.equal(splices,0);assert.equal(played,0);assert.equal(world,1);assert.equal(effects,1);assert.equal(m.time,10);
 events.push({kind:'lead'});run();assert.equal(splices,1);assert.equal(played,1);assert.deepEqual([...events],[{kind:'special-gain'}]);
 assert.deepEqual(packets,[{k:'rkevent',match:'round',seq:1,events:[{kind:'lead'}]}]);
 run();assert.equal(splices,2);assert.equal(played,2);assert.equal(events.length,0);assert.equal(packets.length,1);assert.equal(world,3);assert.equal(effects,3);
});

test('actual admission source visits prune once instead of twice at each admitted entry',()=>{
 const instrument=source=>new Function(source.replace('function prune(nm,now) {','function prune(nm,now) { nm._prunes=(nm._prunes||0)+1;').replace(/^export /gm,'')+';return {queueRankedBarrierHit,noteRankedBarrierShots,flushRankedBarrierHits};')();
 const path='patches/splatoon3/runtime/ranked/barrier-admission.mjs',apis=[instrument(frozen.files[path]),instrument(fs.readFileSync(new URL('../../../'+path,import.meta.url),'utf8'))];
 for(const [method,args] of [['queueRankedBarrierHit',['guest',{id:'G',seq:1,damage:36,pos:[0,0,-1.5]},10]],['noteRankedBarrierShots',['guest',{e:[]},10]],['flushRankedBarrierHits',[10]]]){
  const counts=apis.map(api=>{const nm=net();api[method](nm,...args);return nm._prunes;});assert.deepEqual(counts,method==='flushRankedBarrierHits'?[1,1]:[2,1]);
 }
});
