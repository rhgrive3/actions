import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { markAttributeRange } from '../runtime/instance-color-upload.mjs';
import { installShapePoolBounds, updateShapePoolBounds } from '../runtime/shape-pool-bounds.mjs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {SnapshotPool} from '../runtime/snapshot-pool.mjs';
import {buildPointBlocks,pointBlockMinimum} from '../runtime/point-block-minimum.mjs';
import {catalogDepletedDescriptor} from '../runtime/catalog-depletion.mjs';
import {validSpecialWorldPayload,admitsRemoteWorldBirth,REMOTE_WORLD_OBJECTS_PER_ACTOR} from '../runtime/special-world-payload.mjs';
import {cataloguePayload} from '../runtime/catalogue-payload.mjs';
import {buildSubModel} from '../runtime/sub-models.mjs';
import '../runtime/special-models.mjs';
import {perpendicularBasis,TRIZOOKA,VOLLEY_CONFIG} from '../runtime/kit-trizooka.mjs';
import {fixture} from './source-fixture.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const before=JSON.parse(read('./fixtures/queue-weapons-before-20261024.json'));
function declarations(source,names){const found={};function walk(n){if(!n||typeof n!=='object')return;if((n.type==='FunctionDeclaration'||n.type==='ClassDeclaration')&&names.includes(n.id.name))found[n.id.name]=source.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));return found;}
const compile=(code,name,bindings={})=>new Function(...Object.keys(bindings),code+'\nreturn '+name+';')(...Object.values(bindings));
function rng(seed=0x15f){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}

test('roster leases preserve mutation snapshots and nested callbacks, then release every actor reference',()=>{
 const pool=new SnapshotPool(),actors=[{id:1},{id:2}],first=pool.take(actors);
 actors.splice(0,1);actors.push({id:3});assert.deepEqual(first.map(a=>a.id),[1,2]);
 const second=pool.take(actors,[{id:4}]);assert.notEqual(first,second);assert.deepEqual(second.map(a=>a.id),[2,3,4]);
 pool.release(second);assert.equal(second.length,0);assert.equal(pool.depth,1);
 assert.throws(()=>pool.take({*[Symbol.iterator](){yield actors[0];throw Error('stop');}}),/stop/);
 assert.equal(pool.depth,1);assert.equal(pool.arrays[1].length,0);
 pool.release(first);assert.equal(pool.depth,0);assert.equal(first.length,0);assert.equal(pool.take(actors),first);pool.release(first);
});

test('depletion templates match original values, own-key order and nested ownership across live parameter changes',()=>{
 const old=compile(before.catalogDepletedDescriptor,'catalogDepletedDescriptor'),random=rng();
 const values=[undefined,NaN,Infinity,-Infinity,-0,0,-1,.25,1,2],collision=['InitRadiusForPlayer','EndRadiusForPlayer','InitRadiusForField','EndRadiusForField'];
 for(let group=0;group<1500;group++){
  const pick=()=>values[Math.floor(random()*values.length)],c={},paint={WidthHalfNear:pick(),DepthScaleFar:pick(),Unscaled:pick()};
  for(const k of collision)if(random()>.15)c[k]=pick();
  const sym=Symbol('source');paint[sym]=group;
  const unit={UnitParam:{CollisionParam:{DepletionRate:pick()},PaintParam:{DepletionDepthWidthRate:pick()}}};
  const source={key:'horizontal',index:0,c,b:{Extra:1,CollisionParam:c,PaintParam:paint},radius:pick()},cache={},results=[];
  for(let index=0;index<7;index++){
   if(index===2){paint.WidthHalfAdded=pick();c.EndRadiusForField=pick();}
   if(index===3)delete paint.DepthScaleFar;
   if(index===4)unit.UnitParam.PaintParam.DepletionDepthWidthRate=pick();
   if(index===5)unit.UnitParam.CollisionParam.DepletionRate=pick();
   const original=old({...source,index},unit,true),next=catalogDepletedDescriptor({...source,index},unit,true,cache);
   assert.deepEqual(next,original);for(const pair of [[next,original],[next.c,original.c],[next.b,original.b],[next.b.PaintParam,original.b.PaintParam]])assert.deepEqual(Reflect.ownKeys(pair[0]),Reflect.ownKeys(pair[1]));
   assert.equal(next.b.CollisionParam,next.c);assert.notEqual(next.c,c);assert.notEqual(next.b.PaintParam,paint);
   for(const prev of results){assert.notEqual(prev.c,next.c);assert.notEqual(prev.b,next.b);assert.notEqual(prev.b.PaintParam,next.b.PaintParam);}
   results.push(next);next.c.InitRadiusForPlayer=999;next.b.PaintParam.WidthHalfNear=999;
  }
 }
});

const diskNames=['paintDiskCentres','paintDiskLayout','paintDiskTile','paintDisk','paintBooyahGrowth','paintStamp'];
const newDisk=declarations(read('../runtime/all-specials.mjs'),diskNames);
function diskWorld(definitions,scenario){
 const stamps=[],rays=[],normal=new T.Vector3(0,1,0),actor={remote:false,team:0,area:0,addTurfNoSpecial(v){this.area+=v;}},object={owner:actor,pos:new T.Vector3(1,0,2)};
 const rt={up:new T.Vector3(0,1,0),down:new T.Vector3(0,-1,0),v4:new T.Vector3(),v5:new T.Vector3(),hit:{},api:{THREE:T,G:{physics:{raycast(from,_d,_len,h){rays.push(from.toArray());h.hit=true;h.normal=normal;return h;}},paint:{splat(at,r,_team,opts){stamps.push([...at.toArray(),r,opts.seed]);if(scenario==='callback-plane'&&stamps.length===7)normal.set(.25,.9,.1);if(scenario==='callback-center'&&stamps.length===9)object.pos.x+=.125;return 1;}}}}};
 const code=diskNames.map(n=>definitions[n]).join('\n');
 const f=compile(code,'({paintBooyahGrowth,paintDiskLayout,paintDiskCentres})',{MAX_STAMP_RADIUS:3.74,finite:Number.isFinite,q2:v=>Math.round(v*100)/100,seedUnit:(s)=>s/1000,groundAt:(_r,p,out)=>out.copy(p)});
 return {stamps,rays,rt,object,normal,f};
}
test('Booyah layout cache retains the exact stamp sequence and probes, including callback terrain/center changes',()=>{
 for(const scenario of ['flat','moving-plane','callback-plane','callback-center']){
  const a=diskWorld(before,scenario),b=diskWorld(newDisk,scenario);
  for(let frame=1;frame<=6;frame++){
   if(scenario==='moving-plane'&&frame===4){a.normal.set(.3,.9,.05);b.normal.copy(a.normal);}
   a.f.paintBooyahGrowth(a.rt,a.object,frame,13.5,13);b.f.paintBooyahGrowth(b.rt,b.object,frame,13.5,13);
   assert.deepEqual(b.stamps,a.stamps,scenario+' frame '+frame);assert.deepEqual(b.rays,a.rays);
   assert.deepEqual(b.object.paintDiskTiles,a.object.paintDiskTiles);assert.equal(b.object.owner.area,a.object.owner.area);
  }
 }
});
test('Booyah layout reuses immutable output only after a fresh plane query and invalidates same-array edits',()=>{
 const w=diskWorld(newDisk,'flat'),plan=w.f.paintDiskCentres(13.5),cache={};
 const first=w.f.paintDiskLayout(w.rt,w.object.pos,13.5,plan,cache);
 assert.equal(w.f.paintDiskLayout(w.rt,w.object.pos,13.5,plan,cache),first);assert.equal(w.rays.length,2);
 plan[2][0]+=.125;const second=w.f.paintDiskLayout(w.rt,w.object.pos,13.5,plan,cache);assert.notEqual(second,first);
 w.normal.set(.4,1,0);assert.notEqual(w.f.paintDiskLayout(w.rt,w.object.pos,13.5,plan,cache),second);
});

test('Stringer volley scratch matches original Three.js arrow births, clipping and recursively published volleys',()=>{
 const next=declarations(read('../runtime/main-weapon-catalog.mjs'),['emitArrow']).emitArrow;
 function run(code,count,tilt,reenter){const out=[],muzzle=new T.Vector3(1,2,3),dir=new T.Vector3(.2,.3,.9).normalize(),s={bowTilt:tilt,arrowShotOrdinal:0},runner={a:{}},record={family:'stringer',parameters:{spl__WeaponStringerParam:{ShotParam:{ArrowNum:count,ArrowMargin:.4}}}};let nested=false;
  const bindings={THREE:T,RAD:Math.PI/180,EPS:1e-9,finite:(x,d)=>Number.isFinite(x)?x:d,chargeFrames:()=>60,stageValue:()=>7,stringerArrowDegrees:()=>7,mode:()=>({b:{}}),state:()=>s,addedFamilySplash:()=>null,origin:()=>{},muzzle,dir,G:{physics:{}},constrainMuzzle:(_p,a,b)=>{if(b.x>a.x+.2)b.x=a.x+.2;},notify:(_a,_r,p,d,c)=>out.push(['notify',...p.toArray(),...d.toArray(),c]),spawn:(_a,_r,_d,aim,birth,options)=>{out.push([options.index,...aim.toArray(),...birth.toArray(),options.bowTilt]);if(reenter&&!nested){nested=true;f(runner,record,.4);}}};
  const f=compile(code,'emitArrow',bindings);f(runner,record,.7);return{out,ordinal:s.arrowShotOrdinal};}
 for(const count of [0,1,2,3,5,9])for(const tilt of [-90,-21,0,30,90])for(const nested of [false,true])assert.deepEqual(run(next,count,tilt,nested),run(before.emitArrow,count,tilt,nested));
});

const newShape=declarations(read('../runtime/special-vfx-kit.mjs'),['ShapePool']).ShapePool;
function shape(Class){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(9),3));return new Class(T,'parity',g,16,['a','b','c','d'],'','',false,{value:0});}
const shapeState=p=>({recs:p.recs.map(r=>({id:r.id,t:r.t,life:r.life,dead:r.dead,retired:r.retired,v:Array.from(r.v)})),buf:p.buf.map(b=>Array.from(b.array)),draw:p.mesh.geometry.instanceCount});
test('ShapePool compaction retains order, callbacks, reentrant births and every uploaded Float32 value',()=>{
 const Old=compile(before.ShapePool,'ShapePool'),Next=compile(newShape,'ShapePool',{markAttributeRange,installShapePoolBounds,updateShapePoolBounds});
 for(const mode of ['plain','follow','onEnd','reenter']){
  const a=shape(Old),b=shape(Next),logs=[[],[]];
  for(const [which,p]of [a,b].entries())for(let i=0;i<13;i++){
   const values=Array.from({length:16},(_,k)=>k===3?-0:i*.1+k),r=which===0?p.add(i%3===0?.05:0,values):p.addRaw(i%3===0?.05:0,...values);
   r.id=i;if(i%5===0)r.dead=true;
   if(mode==='follow')r.follow=(r,dt)=>{logs[which].push(['follow',r.id]);r.v[0]+=dt;return r.id!==7;};
   if(mode==='onEnd'||mode==='reenter')r.onEnd=()=>{logs[which].push(['end',i]);if(mode==='reenter'&&i===3){const spawned=p.add(0,new Array(16).fill(8));spawned.id=99;}};
  }
  for(const dt of [.01,.02,.03,.04]){a.update(dt);b.update(dt);assert.deepEqual(shapeState(b),shapeState(a),mode);assert.deepEqual(logs[1],logs[0]);}
  a.clear();b.clear();assert.deepEqual(logs[1],logs[0]);a.mesh.geometry.dispose();a.mesh.material.dispose();b.mesh.geometry.dispose();b.mesh.material.dispose();
 }
});
test('ShapePool unchanged buffers keep their pending upload range/version and write changed values once',()=>{
 const p=shape(compile(newShape,'ShapePool',{markAttributeRange,installShapePoolBounds,updateShapePoolBounds})),r=p.addRaw(0,...new Array(16).fill(.2));p.update(0);
 const versions=p.buf.map(x=>x.version),ranges=p.buf.map(x=>x.updateRanges[0]);p.update(.01);
 assert.deepEqual(p.buf.map(x=>x.version),versions);assert.deepEqual(p.buf.map(x=>x.updateRanges[0]),ranges);
 r.v[5]=.7;p.update(.01);assert.deepEqual(p.buf.map(x=>x.version),versions.map((v,i)=>v+(i===1?1:0)));
 p.mesh.geometry.dispose();p.mesh.material.dispose();
});

test('Kraken point-block pruning is bit-identical on the actual model and finite/non-finite boundary samples',t=>{
 const model=buildSubModel(T,'spKraken',new T.MeshStandardMaterial()),getPoints=compile(declarations(read('../runtime/special-presentation.mjs'),['krakenPoints']).krakenPoints,'krakenPoints'),points=getPoints(model),blocks=buildPointBlocks(points),random=rng(77);
 const brute=(p,a,b,c)=>{let m=Infinity;for(let i=0;i<p.length;i+=3){const y=a*p[i]+b*p[i+1]+c*p[i+2];if(y<m)m=y;}return m;};
 let scans=0,skipped=0;
 for(let i=0;i<1500;i++){const a=(random()-.5)*.4,b=random()*1.4,c=(random()-.5)*.4,stats={points:0,skipped:0};assert.ok(Object.is(pointBlockMinimum(blocks,a,b,c,stats),brute(points,a,b,c)));scans+=stats.points;skipped+=stats.skipped;}
 assert.ok(scans<points.length/3*1500*.7,'bounds must remove a meaningful number of actual-model point evaluations');
 for(const a of [-Infinity,-0,0,NaN,Infinity])for(const b of [-1,0,1])assert.ok(Object.is(pointBlockMinimum(blocks,a,b,0),brute(points,a,b,0)));
 const edge=new Float32Array(Array.from({length:600},(_,i)=>i===190?NaN:i===193?Infinity:i%7===0?-0:random()-.5)),edgeBlocks=buildPointBlocks(edge);
 for(let i=0;i<200;i++){const a=random()-.5,b=random()-.5,c=random()-.5;assert.ok(Object.is(pointBlockMinimum(edgeBlocks,a,b,c),brute(edge,a,b,c)));}
 t.diagnostic(JSON.stringify({actualModelPoints:points.length/3,poses:1500,scannedPoints:scans,baselinePoints:points.length/3*1500,skippedBlocks:skipped}));model.dispose?.();
});

test('Trizooka zero-spread fast path retains signed-zero and non-finite native expression boundaries',()=>{
 const next=declarations(read('../runtime/kit-trizooka.mjs'),['throwVolley']).throwVolley;
 const bindings={VOLLEY_CONFIG,TRIZOOKA,perpendicularBasis,trizookaBirthLife:()=>0};
 const old=compile(before.throwVolley,'throwVolley',bindings),fresh=compile(next,'throwVolley',bindings);
 function fire(f,aim){const system={_new:()=>({pos:new T.Vector3(),prev:new T.Vector3(),start:new T.Vector3(),vel:new T.Vector3()}),_muzzle:(_a,out)=>out.set(1,2,3),_aimFrom:(_a,_m,out)=>out.copy(aim),_push:()=>{}};return f(system,{team:0},{}).map(p=>p.vel.toArray());}
 for(const x of [-1,-0,0,1])for(const y of [-1,-0,0,1])for(const z of [-1,-0,0,1]){const aim=new T.Vector3(x,y,z).normalize();assert.deepEqual(fire(fresh,aim),fire(old,aim));}
 for(const v of [NaN,Infinity,-Infinity])assert.deepEqual(fire(fresh,new T.Vector3(v,1,0)),fire(old,new T.Vector3(v,1,0)));
});

const screen={id:'splattercolorScreen',action:'deploy',activation:1,object:1,seed:9,pos:[0,0,0],target:[0,0,1],kind:'screen',duration:11.333,radius:15,width:15,height:9,hp:0};
test('remote world payload validation rejects allocation/lifetime/width escalation and admits rounded local maxima',()=>{
 assert.ok(validSpecialWorldPayload(screen));assert.ok(cataloguePayload(screen));
 for(const key of ['duration','radius','width','height','hp','gravity','vx','vy','vz','specialPowerAP','waveFrame'])for(const value of [1e9,Infinity,NaN,-1e9]){const packet={...screen,[key]:value};assert.equal(validSpecialWorldPayload(packet),false,key);assert.equal(cataloguePayload(packet),null,key);}
 for(const [id,kind,duration,radius,hp]of [['waveBreaker','wave',6.5,27,480],['waveBreaker','waveFront',3.6,27,0],['superChump','decoy',5.3,7.2,60],['tripleInkstrike','marker',2.217,7.7,0],['tripleInkstrike','strike',.85,7.7,0],['booyahBomb','booyahBlast',1.333,12.6,0]])assert.ok(validSpecialWorldPayload({...screen,id,kind,duration,radius,hp,width:undefined,height:undefined}),kind);
 assert.equal(validSpecialWorldPayload({...screen,kind:'decoy'}),false);assert.ok(validSpecialWorldPayload({...screen,action:'objectHit',hp:1e5}),'owner-adjudicated hit proposal retains its separate guard');
});
test('remote world quota ignores dead devices and admits an existing identity without allowing another birth',()=>{
 const actor={remote:true},objects=Array.from({length:REMOTE_WORLD_OBJECTS_PER_ACTOR},(_,i)=>({owner:actor,remote:true,id:screen.id,activation:1,serial:i+1}));
 assert.equal(admitsRemoteWorldBirth(objects,actor,{...screen,object:100}),false);
 assert.equal(admitsRemoteWorldBirth(objects,actor,screen),true);objects[0].dead=true;
 assert.equal(admitsRemoteWorldBirth(objects,actor,{...screen,object:100}),true);
 assert.equal(admitsRemoteWorldBirth(objects,actor,{...screen,object:100,action:'destroy'}),true);
});
test('remote screen rejects before ledger/mesh/VFX admission, permits a corrected birth and releases quota on retirement',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {replaySpecial} from './patches/splatoon3/runtime/all-specials.mjs';"});
 f.G.scene=new f.THREE.Scene();
 const actor=f.make();actor.remote=true;let fx=0;f.G.fx={ring(){fx++;},burst(){fx++;}};
 const objects=()=>f.G.projectiles._s3AllSpecialObjects||[],bad={...screen,actor,duration:1e9};
 const children=f.G.scene.children.length;assert.equal(f.replaySpecial(f,bad),false);assert.equal(objects().length,0);assert.equal(f.G.scene.children.length,children);assert.equal(fx,0);
 assert.equal(f.replaySpecial(f,{...screen,actor}),true);assert.equal(objects().length,1);assert.ok(fx>0);
 const emitted=fx;assert.equal(f.replaySpecial(f,{...screen,actor}),false);assert.equal(fx,emitted);
 for(let object=2;object<=REMOTE_WORLD_OBJECTS_PER_ACTOR;object++)assert.equal(f.replaySpecial(f,{...screen,actor,object,seed:object}),true);
 const next={...screen,actor,object:100,seed:100};assert.equal(f.replaySpecial(f,next),false);assert.equal(objects().length,REMOTE_WORLD_OBJECTS_PER_ACTOR);
 assert.equal(f.replaySpecial(f,{...screen,actor,action:'destroy',seed:200}),true);assert.equal(f.replaySpecial(f,next),true,'quota rejection did not poison the replay ledger');
 f.G.projectiles.clear();assert.equal(objects().length,0);
});

test('Custom Crab sine functions keep the original two expressions and every model matrix bit-identical at 30/60/120Hz',t=>{
 const code=declarations(read('../runtime/sub-models.mjs'),['poseSubModel']).poseSubModel,legs=[['legL0','legR0'],['legL1','legR1'],['legL2','legR2']];
 let originalCalls=0,optimizedCalls=0;
 const oldMath=Object.create(Math),newMath=Object.create(Math);oldMath.sin=x=>{originalCalls++;return Math.sin(x);};newMath.sin=x=>{optimizedCalls++;return Math.sin(x);};
 const nativeBindings=new Function(read('../runtime/sub-models.mjs').match(/const CRAB_NATIVE_SIN =[^;]+;/)[0]+read('../runtime/sub-models.mjs').match(/const CRAB_CALL_SIN =[^;]+;/)[0]+'return {CRAB_NATIVE_SIN,CRAB_CALL_SIN};')();
 const old=compile(before.poseSubModel,'poseSubModel',{CRAB_LEGS:legs,Math:oldMath}),next=compile(code,'poseSubModel',{CRAB_LEGS:legs,Math:newMath,...nativeBindings});
 for(const hz of [30,60,120]){
  const a=buildSubModel(T,'spCrabTank',new T.MeshStandardMaterial()),b=buildSubModel(T,'spCrabTank',new T.MeshStandardMaterial());
  for(let frame=0;frame<hz*3;frame++){
   const speed=frame<hz||frame>=hz*2?0:7.2,inputs={dt:1/hz,speed};old(a,inputs);next(b,inputs);
   a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);
   assert.equal(b.state.stride,a.state.stride);assert.equal(b.state.t,a.state.t);
   for(const key of Object.keys(a.groups))assert.deepEqual(b.groups[key].matrixWorld.elements,a.groups[key].matrixWorld.elements,key+' '+hz);
  }
  for(const phase of [-0,Math.PI,4096,1e9,Infinity,NaN])for(const speed of [-1e9,0,3]){
   a.state.stride=b.state.stride=phase;old(a,{dt:0,speed});next(b,{dt:0,speed});for(const [l,r]of legs)for(const key of [l,r])assert.ok(Object.is(b.groups[key].rotation.y,a.groups[key].rotation.y));
  }
  delete a.groups.legL0;delete b.groups.legL0;old(a,{dt:.1,speed:3});next(b,{dt:.1,speed:3});assert.ok(Object.is(b.groups.legR0.rotation.y,a.groups.legR0.rotation.y));
  for(const m of a.materials.values())m.dispose();for(const m of b.materials.values())m.dispose();
 }
 assert.ok(optimizedCalls<originalCalls*.5);t.diagnostic(JSON.stringify({originalCalls,optimizedCalls,kind:'custom sine fallback: exact idle-phase reuse; moving poses retain both sine evaluations'}));
});
