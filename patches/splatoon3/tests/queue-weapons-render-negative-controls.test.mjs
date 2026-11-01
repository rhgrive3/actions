import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {markAttributeRange} from '../runtime/instance-color-upload.mjs';
import {makeRibbonPool,ribbonCandidateSource} from './ribbon-tail-fixture.mjs';
import {configureRollerVerticalPaint} from '../runtime/roller-vertical-paint.mjs';
import {createTacticooler,disposeSpecialModel} from '../runtime/special-motion.mjs';
import {kitSweepSphereBlocks} from '../runtime/trizooka-collision.mjs';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const cut=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+1);assert(i>=0&&j>i);return s.slice(i,j).trim();};
const kit=read('../runtime/special-vfx-kit.mjs');
const receipt={scope:'Actual source functions/classes and real Three.js, with explicit fixture boundaries; test-only unsafe candidates are never shipped',controls:[]};
const record=(slug,data)=>receipt.controls.push({slug,...data});

test('ShapePool deferred birth head changes an escaped dense roster before any update barrier',()=>{
 const body=cut(kit,'class ShapePool {','// The kit attached to one FX instance');
 const current=new Function(body+'\nreturn ShapePool;')();
 const deferred=new Function(body.replaceAll('if (this.recs.length >= this.cap - 1) this._retire(this.recs.shift());',
  'this._head??=0;if (this.recs.length-this._head >= this.cap - 1) this._retire(this.recs[this._head++]);')+'\nreturn ShapePool;')();
 const run=C=>{const p=Object.assign(Object.create(C.prototype),{cap:3,recs:[]}),first=p.add(10,new Float32Array(16)),second=p.add(10,new Float32Array(16)),escaped=p.recs;
  p.add(10,new Float32Array(16));return{length:escaped.length,retired:first.retired,firstIsSecond:escaped[0]===second};};
 const baseline=run(current),candidate=run(deferred);assert.deepEqual(baseline,{length:2,retired:true,firstIsSecond:true});assert.notDeepEqual(candidate,baseline);
 record('special-shapepool-full-cap-birth-shift-batching',{baseline,candidate,reason:'An escaped Array alias cannot be repaired by a getter on the pool; preserving immediate dense membership requires compaction before that observation.'});
});

test('Ribbon detached sample reuse preserves neither an escaped ring alias nor retained old point values',()=>{
 const source=ribbonCandidateSource;
 const candidate=source.replace('samples: new Array(this.M)','samples: this.free?.pop() || new Array(this.M)')
  .replace('r.samples.length=0;','this.recycle(r);')
  .replace('  end(r) {','  recycle(r){const a=r.samples;if(r.count===1)a[r.head]=undefined;r.samples=[];(this.free||=[]).push(a);}\n  end(r) {');
 const run=body=>{const p=makeRibbonPool(body,2,4),r=p.start({life:.1,spacing:0});p.push(r,1,2,3,0);p.push(r,4,5,6,.01);p.update(.02,new T.Vector3(0,0,5));
  const ring=r.samples,point=ring[0],pointBefore=[...point];p.end(r);p.update(1,new T.Vector3(0,0,5));const afterRetire=ring.length;
  const fresh=p.start({spacing:0});p.push(fresh,90,80,70,1);return{afterRetire,pointBefore,pointAfter:[...point],oldPublicLength:r.samples.length};};
 const baseline=run(source),reused=run(candidate);assert.equal(baseline.afterRetire,0);assert.equal(reused.afterRetire,4);assert.notDeepEqual(reused.pointAfter,reused.pointBefore);
 record('special-ribbonpool-recycle-detached-sample-rings',{baseline,candidate:reused,reason:'The issue protects the remaining pts[0], but earlier published sample points and the samples Array itself can also remain referenced.'});
});

const spriteBody=cut(kit,'class SpritePool {','// Ribbon trails');
function sprite(){const C=new Function('THREE','SPRITE_VERT','SPARK_FRAG','PUFF_FRAG','vfxRandom','TAU','markAttributeRange',spriteBody+'\nreturn SpritePool;')
 (T,'','','',()=>.2,Math.PI*2,markAttributeRange);return new C(T,2,false,{value:0});}
function emit(p,x){p.spawnRaw(x,0,0,0,0,0,2,.1,.1,1,1,1,1,0,0,0,0,0,.3,0,0,0);}
test('Sprite update winner cache is stale after legal typed-array state changes before the next birth',()=>{
 const a=sprite(),b=sprite();for(const p of [a,b]){emit(p,1);emit(p,2);p.p[6]=.1;p.p[p.S+6]=.3;p.update(0);p.p[6]=1.5;}
 // The proposed first winner was slot 1 before the external state write.
 b._evict=function(){this._kill(1);};emit(a,3);emit(b,3);
 const xs=p=>[p.p[0],p.p[p.S]];assert.deepEqual(xs(a),[2,3]);assert.deepEqual(xs(b),[1,3]);
 record('special-spritepool-reuse-full-frame-eviction-winner',{baseline:xs(a),candidate:xs(b),reason:'No mutation version exists for the exposed Float32Array. Checking the old winner alone cannot observe a different slot becoming oldest.'});
});

test('omitting a distant cosmetic birth changes the already-visible particles at a full shared SpritePool',()=>{
 const a=sprite(),b=sprite();for(const p of [a,b]){emit(p,1);emit(p,2);p.p[6]=1;p.p[p.S+6]=.1;p.update(0);}
 emit(a,1000); // Candidate suppresses this out-of-view birth while consuming identical random values.
 const nearby=p=>[p.p[0],p.p[p.S]].filter(x=>x<10);assert.deepEqual(nearby(a),[2]);assert.deepEqual(nearby(b),[1,2]);
 record('splashdown-fist-distant-cosmetic-sprite-emission-gate',{baselineVisible:nearby(a),candidateVisible:nearby(b),reason:'Registration participates in global eviction; retaining RNG consumption alone does not preserve visible pool output. No guaranteed future multi-camera visibility contract exists.'});
});

test('Charger beam identity reuse suppresses the next actual FXHooks beam trail',()=>{
 const src=read('../../../inkwave-public/src/fx/fxHooks.js'),body=cut(src,'  _beams(P) {','  // ------------------------------------------------------------------ ambient life');
 const fn=new Function('_dir','ZAX','_v','_v2','_v3','_c','clamp','return ({'+body+'})._beams;')
  (new T.Vector3(),new T.Vector3(0,0,1),new T.Vector3(),new T.Vector3(),new T.Vector3(),new T.Color(),(n,a,b)=>Math.max(a,Math.min(b,n)));
 const run=reuse=>{let trails=0;const h={fx:{beamTrail(){trails++;}},seenBeams:new WeakSet(),seen:{'weapon:fire':true,'weapon:impact':true},_near:()=>true,_bump(){}};
  const mesh={quaternion:new T.Quaternion(),position:new T.Vector3(),scale:{z:4},material:{color:new T.Color(0xff0000)}};
  const first={mesh,t:0,life:.2,th:.06};fn.call(h,{beams:[first]});const next=reuse?Object.assign(first,{mesh,t:0,life:.3,th:.08}):{mesh,t:0,life:.3,th:.08};fn.call(h,{beams:[next]});return trails;};
 assert.equal(run(false),2);assert.equal(run(true),1);
 record('legacy-charger-beam-active-record-reuse',{freshTrails:2,reusedTrails:1,reason:'FXHooks.seenBeams is a lifetime WeakSet keyed by the record. Native flights also retain job.beam, and transport adds _netPeer/_netBorn/_netBornTick/_netOwner/_netSteps beyond the four proposed fields.'});
});

test('Wave Breaker marking roster sharing cannot ignore same-pass actor roster replacement',()=>{
 const src=read('../runtime/special-vfx.mjs'),body=cut(src,'  markingLines(r, o) {','  clearLines(');
 const fn=new Function('BEAM','return ({'+body+'}).markingLines;')({LINE:5});
 const viewer={isLocal:true,alive:true,team:0,pos:new T.Vector3()},enemy={alive:true,team:1,pos:new T.Vector3(2,0,0),s3:{revealedUntil:{0:10}}};
 const G={actors:[viewer,enemy],time:1},r1={d:{},color:1},r2={d:{},color:1},r3={d:{},color:1};
 const d={G,hdr:()=>[1,1,1],beam:()=>({})};fn.call(d,r1,{team:0});const cached=G.actors;G.actors=[viewer];fn.call(d,r2,{team:0});fn.call({...d,G:{...G,actors:cached}},r3,{team:0});
 assert.equal(r1.d.lines.size,1);assert.equal(r2.d.lines.size,0);assert.equal(r3.d.lines.size,1);
 record('wave-breaker-overlap-marking-beam-roster-and-instance-coalescing',{currentSecondDevice:0,cachedSecondDevice:1,reason:'Same render timestamp does not establish roster stability. Beam output also applies alpha discard and tone mapping before additive blend; multiplying pre-shader alpha is not a proven pixel-equivalent coalescing rule.'});
});

test('Roller seven-vector lease must preserve an externally held old flight after the public null release boundary',()=>{
 const group={SplashPaintParam:{WidthHalf:1,WidthHalfNearest:1,DepthScaleMin:2,DepthScaleMax:2},Unit:[{UnitParam:{MoveParam:{FreeGravity:.1}}}],SpawnSplashBetweenLength:1,SpawnSplashFirstLength:0,SpawnSplashNum:3};
 const p={pos:new T.Vector3(1,2,3),s3RollerFlightPaint:null};configureRollerVerticalPaint(p,group,1);const old=p.s3RollerFlightPaint,point=old.sample;
 p.s3RollerFlightPaint=null;p.pos.set(9,8,7);configureRollerVerticalPaint(p,group,1);assert.notEqual(p.s3RollerFlightPaint.sample,point);assert.deepEqual(point.toArray(),[1,2,3]);
 const leaseCandidate=point;leaseCandidate.copy(p.pos);assert.notDeepEqual(leaseCandidate.toArray(),[1,2,3]);
 record('native-roller-vertical-flight-reuse-seven-vectors',{baselineRetainedPoint:[1,2,3],candidateRetainedPoint:leaseCandidate.toArray(),reason:'The null field is a release convention, not evidence that a debugger/callback has released an old flight/vector reference. No non-escape ownership capability exists for this field.'});
});

function coolerModule(candidate){
 let source=read('../runtime/support-cooler-collision.mjs').replace(/^import[^\n]*\n/gm,'').replace(/export /g,'');
 if(candidate==='empty')source=source.replace('    this._s3CoolerMovementOrigin ||= new api.THREE.Vector3();','    if(!api.G.projectiles?._s3SupportCoolers?.length)return move.call(this,dt,isSquid,...args);\n    this._s3CoolerMovementOrigin ||= new api.THREE.Vector3();');
 if(candidate==='time')source=source.replace('  level.blocks.length=0;','  if(level._sameTime===api.G.time)return level;level._sameTime=api.G.time;\n  level.blocks.length=0;');
 return new Function('createTacticooler','disposeSpecialModel','kitSweepSphereBlocks','selectTrizookaCollision','fidelityWorldCollisionRadius',source+';return {installCoolerCollision,coolerSegmentContact};')
  (createTacticooler,disposeSpecialModel,kitSweepSphereBlocks,()=>({worldRadius:.2}),()=>.2);
}
function coolerWorld(candidate){
 const api=coolerModule(candidate),system={_s3SupportCoolers:[]},G={projectiles:system,time:1},stand={pos:new T.Vector3(),expires:20,mesh:{position:new T.Vector3()}};
 class Hit{constructor(){this.point=new T.Vector3();this.normal=new T.Vector3();}}
 class Projectiles{}
 class Actor{_integrateMovementStep(){this.pos.x=3;system._s3SupportCoolers.push(stand);this._resolve(false);} _resolve(){}}
 api.installCoolerCollision({THREE:T,Projectiles,Actor,Hit,G,PLAYER:{radius:.35,height:1.7,stepUp:.25}});
 return{...api,G,system,stand,Actor};
}
test('empty cooler movement gate loses the real sweep origin when a stand is introduced synchronously',()=>{
 const run=candidate=>{const w=coolerWorld(candidate),a=new w.Actor();Object.assign(a,{pos:new T.Vector3(-3,.5,0),vel:new T.Vector3(6,0,0),alive:true,remote:false,form:'kid',contacts:{wall:false,wallNormal:new T.Vector3()}});a._integrateMovementStep(1/60,false);return a.pos.x;};
 const baseline=run(null),candidate=run('empty');assert(baseline<0);assert.equal(candidate,3);
 record('tacticooler-empty-roster-skip-actor-movement-snapshot',{baselineX:baseline,candidateX:candidate,reason:'Actual installed movement/resolve wrappers and native sphere/stand sweep, with a synchronous stand birth in the delegated movement; zero-at-entry is not zero-until-resolve.'});
});
test('cooler same-tick cached block roster misses position changes without an independent revision',()=>{
 const run=candidate=>{const w=coolerWorld(candidate);w.system._s3SupportCoolers.push(w.stand);const from=new T.Vector3(-3,1,0),to=new T.Vector3(3,1,0);assert(w.coolerSegmentContact(w.system,from,to,.2));w.stand.pos.x=10;return!!w.coolerSegmentContact(w.system,from,to,.2);};
 assert.equal(run(null),false);assert.equal(run('time'),true);
 record('tacticooler-collider-reuse-live-stand-snapshot-with-invalidation',{baselineAfterSameTimeMove:false,candidateAfterSameTimeMove:true,reason:'Stand pose, expiry, retirement, roster and Tower axes are mutable without a shared revision. The original per-query live scan is retained until all writers can provide trustworthy invalidation.'});
});

test('Squid Spawn target must re-probe same coordinates when ground changes without query-stamp change',()=>{
 const source=read('../runtime/respawn-lifecycle.mjs'),body=cut(source,'  const supportedTarget =','  const targetFor =');
 let height=0,queries=0;const G={level:{_stamp:5,groundHeight:()=>height},physics:{collideBody(){}}};
 const supported=new Function('G',body+';return supportedTarget;')(G);
 const actor={pos:new T.Vector3(),vel:new T.Vector3(),ground:{hit:true,normal:new T.Vector3(0,1,0)},groundN:new T.Vector3(0,1,0),contacts:{groundNormal:new T.Vector3(0,1,0),wallNormal:new T.Vector3()},_resolve(){queries++;this.grounded=true;this.ground.hit=true;}};
 const first=supported(actor,4,6);height=2;const second=supported(actor,4,6);assert.equal(G.level._stamp,5);assert.deepEqual(first,{x:4,y:0,z:6});assert.deepEqual(second,{x:4,y:2,z:6});assert.equal(queries,2);
 record('turf-squidspawn-idle-aim-supported-target-physics-probe-gate',{first,second,queryStamp:G.level._stamp,reason:'The real target probe delegates to mutable ground/resolve behavior. No authenticated static collision epoch is exposed; matching coordinates or query stamp cannot authorize reuse.'});
});

test('targeted special hand matrix refresh omits a synchronous unrelated descendant update',()=>{
 const src=read('../runtime/special-motion.mjs'),body=cut(src,'  function fit(ch,m,g){','  cp._buildPose=');
 const candidate=body.replace('ch.kid.updateWorldMatrix(true,true);','g.updateWorldMatrix(true,false);ch.bones.handL.updateWorldMatrix(true,false);ch.bones.handR.updateWorldMatrix(true,false);');
 const run=source=>{const fit=new Function(source+';return fit;')(),kid=new T.Group(),root=new T.Group();root.add(kid);
  const handL=new T.Object3D(),handR=new T.Object3D(),other=new T.Object3D(),g=new T.Group();kid.add(handL,handR,other,g);let callbacks=0;const native=other.updateWorldMatrix;other.updateWorldMatrix=function(...args){callbacks++;return native.apply(this,args);};
  const limb=end=>({a:1,b:1,up:{parent:kid,position:new T.Vector3()},end}),ch={kid,bones:{handL,handR},limbs:{armL:limb(handL),armR:limb(handR)},_kidXform(_p,out,q){out.set(0,0,0);q.identity();},_solveLimb(l,p){l.end.position.copy(p);}};
  for(const key of ['handL','handR','gripL','gripR','holeL','holeR'])g.userData[key]=new T.Vector3(.1,.2,.3);g.userData.handQL=new T.Quaternion();g.userData.handQR=new T.Quaternion();
  const m={a:new T.Vector3(),b:new T.Vector3(),p:new T.Vector3(),pole:new T.Vector3(),handQ:new T.Quaternion(),shoulders:[new T.Vector3(),new T.Vector3()]};other.position.x=7;fit(ch,m,g);return{callbacks,otherWorldX:other.matrixWorld.elements[12],handError:m.error};};
 const baseline=run(body),targeted=run(candidate);assert.equal(baseline.callbacks,1);assert.equal(targeted.callbacks,0);assert.equal(baseline.otherWorldX,7);assert.equal(targeted.otherWorldX,0);assert.equal(baseline.handError,targeted.handError);
 record('special-motion-trizooka-inkvac-targeted-ik-matrix-refresh',{baseline,candidate:targeted,reason:'The actual fit body can match all three immediately measured nodes while changing other synchronous consumers. Unlike bomb preview there is no enclosing whole-rig rollback transaction. Full traversal remains until guarded downstream equivalence and device benefit are established.'});
});

test.after(()=>{const file=new URL('../../../reports/queue-weapons-render-20261030/negative-controls.json',import.meta.url);fs.mkdirSync(new URL('./',file),{recursive:true});fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');});
