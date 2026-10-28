import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {markAttributeRange} from '../runtime/instance-color-upload.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueExtraWeaponsFx} from '../../local-quality/queue-extra-weapons-fx-adapter.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-extra-weapons-before.json',import.meta.url)));
const runtimeCache=new Map(),declCache=new Map();
const runtime=base=>runtimeCache.get(base)||runtimeCache.set(base,fs.readFileSync(new URL('../runtime/'+base+'.mjs',import.meta.url),'utf8')).get(base);
function decl(base,key){if(declCache.has(base+'.'+key))return declCache.get(base+'.'+key);const s=runtime(base);for(const n0 of parse(s,{ecmaVersion:'latest',sourceType:'module'}).body){const n=n0.declaration||n0;if(n.type==='FunctionDeclaration'&&n.id.name===key)return declCache.set(base+'.'+key,s.slice(n.start,n.end)).get(base+'.'+key);if(n.type==='ClassDeclaration')for(const m of n.body.body)if(m.key.name===key)return declCache.set(base+'.'+key,s.slice(m.start,m.end)).get(base+'.'+key);}throw Error(key);}
const compile=(s,bindings={})=>new Function(...Object.keys(bindings),'return ('+s+')')(...Object.values(bindings));
const compiled=(base,key,old,bindings={})=>compile(old?before.functions[base+'.'+key]:decl(base,key),bindings);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const random=()=>{let x=234;return()=>((x=Math.imul(x,1664525)+1013904223)>>>0)/4294967296;};

test('additional FX adapter composes exactly once and rejects moved anchors',()=>{
 for(const file of ['src/fx/fx.js','src/fx/screenfx.js']){
  const raw=fs.readFileSync(new URL('../../../inkwave-public/'+file,import.meta.url),'utf8'),s=adaptBuildSource(file,raw);
  parse(s,{ecmaVersion:'latest',sourceType:'module'});assert.equal(adaptQueueExtraWeaponsFx(file,s),s);
 }
 assert.throws(()=>adaptQueueExtraWeaponsFx('src/fx/fx.js','class FX {}'),/expected 1, got 0/);
});
test('fixed-step sub drag retains every velocity bit and the variable-dt fallback',()=>{
 const rnd=random();for(const dt of [1/60,1/30,1/120,0,-1/60,NaN,Infinity,.019])for(let i=0;i<3000;i++){
  const resist=i<8?[0,.05866,.018,1,1.2,Infinity,NaN,-1][i]:rnd()*1.2;
  const x=new THREE.Vector3((rnd()-.5)*100,(rnd()-.5)*100,(rnd()-.5)*100),y=x.clone();
  for(const [o,old]of [[x,true],[y,false]])compiled('all-subs','applyFlightPositionAirResist',old,{STEP:1/60})({spec:{flyPositionAirResist:resist},vel:o},dt);
  for(const k of ['x','y','z'])assert.ok(Object.is(x[k],y[k]),`${dt}/${resist}/${k}`);
 }
 let calls=0;const math=Object.create(Math);math.pow=(...x)=>{calls++;return Math.pow(...x);};
 compiled('all-subs','applyFlightPositionAirResist',false,{STEP:1/60,Math:math})({spec:{flyPositionAirResist:.05866},vel:new THREE.Vector3(1,2,3)},1/60);assert.equal(calls,0);
});
test('Autobomb pose shares speed without changing rotation or model arguments',()=>{
 for(const hz of [30,60,120])for(const grounded of [false,true])for(const phase of ['flight','deployed','wallPending'])for(const vx of [0,-0,.05,-.05,2,NaN,Infinity]){
  function run(old){let pose;const mesh={position:new THREE.Vector3(),rotation:new THREE.Euler()};const o={subId:'autobomb',phase,grounded,vel:new THREE.Vector3(vx,1,-vx),mesh,pos:new THREE.Vector3(),s3Model:{},yaw:.2};compiled('all-subs','poseVisual',old,{TUMBLE:new Set(),SPLASH_WALL_UNFOLD_SECONDS:.2,poseSubModel:(_m,p)=>{pose={...p};}})({G:{time:2}},o,1/hz);return{pose,rotation:mesh.rotation.toArray(),position:mesh.position.toArray()};}
  assert.deepEqual(run(false),run(true));
 }
});
test('sub disposal retains shared geometry, deduplicates materials and releases scalar/array nodes',()=>{
 for(const old of [true,false]){const removed=[],released=[],geo={dispose(){released.push('geo');}},shared={dispose(){throw Error('shared');}},a={dispose(){released.push('a');}},b={dispose(){released.push('b');}};
  const object={mesh:{traverse(fn){for(const node of [{geometry:geo,material:a},{geometry:geo,material:[a,null,b]},{geometry:shared,material:undefined}])fn(node);}},s3Model:{}};
  compiled('all-subs','disposeVisual',old,{sceneFor:()=>({remove:m=>removed.push(m)}),isSharedGeometry:g=>g===shared})({},object,{});assert.deepEqual(released,['geo','a','b']);assert.equal(removed.length,1);assert.equal(object.mesh,null);assert.equal(object.s3Model,null);
 }
});
test('Wave Breaker pruning preserves damage/reveal/object order at boundaries and non-finite values',()=>{
 for(const hz of [30,60,120])for(let seed=0;seed<300;seed++){
  function run(old){const rnd=random(),rows=[];const actors=Array.from({length:8},(_,i)=>({alive:true,team:i%2,pos:new THREE.Vector3((rnd()-.5)*80,0,(rnd()-.5)*80)}));actors[1].pos.set(4.75,0,0);actors[3].pos.set(4.75+Number.EPSILON*4,0,0);const owner={team:0};const objects=[...actors.slice(1,5).map((a,i)=>({hp:10,owner:{team:1},pos:a.pos.clone(),collisionRadius:[.72,-1,NaN,Infinity][i]}))];
   const rt={api:{G:{actors,time:seed/hz,level:{groundHeight:()=>0},physics:{los:()=>true},projectiles:{applyHit:(_a,v,d,k)=>rows.push(['actor',actors.indexOf(v),d,k])}}},system:{_s3AllSpecialObjects:objects,s3DamageSubObjects(_a,_c,_r,fn){rows.push(['sub',fn(4,objects[0])]);}}};const o={maxRadius:8,age:.5,maxWaveFrame:1,last:3,pos:new THREE.Vector3(),owner,team:0,seen:new Set(),dur:2};
   compiled('all-specials','updateWaveFront',old,{FPS:60,clamp,finite:Number.isFinite,specialObjectDamage:(_rt,_a,obj,d,k)=>rows.push(['object',objects.indexOf(obj),d,k]),removeWorld(){throw Error('unexpected expire');}})(rt,o);return{rows,last:o.last,seen:[...o.seen].map(a=>actors.indexOf(a)),objectSeen:[...o.objectSeen].map(a=>objects.indexOf(a)),reveal:actors.map(a=>a.s3)};}
  assert.deepEqual(run(false),run(true));
 }
});
test('Booyah unused result removal retains actor hit/LOS/once/object callback sequence',()=>{
 for(const old of [true,false]){const rows=[],actor={team:0,remote:false},victims=[1,4,9].map(x=>({team:1,alive:true,pos:new THREE.Vector3(x,0,0)})),once=new Set();const rt={v6:new THREE.Vector3(),api:{G:{actors:victims,physics:{los:(_a,b)=>{rows.push(['los',...b.toArray()]);return true;}},projectiles:{applyHit:(_a,v,d,s)=>rows.push(['hit',victims.indexOf(v),d,s])}}}};compiled('all-specials','damageRadius',old,{clamp,specialObjectRadius:(_r,_a,_c,_rad,fn,cause)=>rows.push(['objects',fn(2),cause])})(rt,actor,'booyahBomb',new THREE.Vector3(),3.3,3.3,8,'booyahBomb',once);assert.deepEqual([...once].map(x=>victims.indexOf(x)),[0,1]);if(old)globalThis.expectedBooyah=rows;else assert.deepEqual(rows,globalThis.expectedBooyah);}delete globalThis.expectedBooyah;
});
test('camera direction elision preserves actual vendored parent/world/inverse matrices at every Hz',()=>{
 const a=new THREE.PerspectiveCamera(75,1.5,.1,500),b=a.clone(),pa=new THREE.Group(),pb=new THREE.Group();pa.add(a);pb.add(b);const direction=new THREE.Vector3();for(const hz of [30,60,120])for(let i=0;i<hz*2;i++){for(const [cam,parent]of [[a,pa],[b,pb]]){parent.position.set(Math.sin(i*.3),i/hz,Math.cos(i*.2));parent.rotation.set(i*.001,i*.003,i*.002);cam.position.set(i*.01,i*.02,-i*.03);cam.rotation.set(i*.002,i*.004,i*.006);}a.getWorldDirection(direction);b.updateWorldMatrix(true,false);assert.deepEqual(b.matrixWorld.elements,a.matrixWorld.elements);assert.deepEqual(b.matrixWorldInverse.elements,a.matrixWorldInverse.elements);}
});

test('Ribbon chronological dirty view preserves all geometry bytes through coalesce/wrap/expiry/clear',()=>{
 const source=runtime('special-vfx-kit'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),node=ast.body.find(n=>n.type==='ClassDeclaration'&&n.id.name==='RibbonPool');assert.ok(node);
 const build=s=>new Function('THREE','RIBBON_VERT','RIBBON_FRAG','vfxRandom','markAttributeRange',s+';return RibbonPool;')(THREE,'','',()=>.25,markAttributeRange),A=build(before.functions.RibbonPool),B=build(source.slice(node.start,node.end));
 for(const hz of [30,60,120]){const a=new A(THREE,3,8,false,{value:0}),b=new B(THREE,3,8,false,{value:0}),pairs=[];
  for(let frame=0;frame<hz*2;frame++){const t=frame/hz;
   if(frame%5===0){pairs.push([a.start({life:.3,spacing:.15}),b.start({life:.3,spacing:.15})]);}
   for(let i=0;i<pairs.length;i++)for(const [pool,r]of [[a,pairs[i][0]],[b,pairs[i][1]]]){
    if(frame%13===0)pool.end(r);else if(frame%3)pool.push(r,Math.sin(t+i),Math.cos(t-i),i*.1,t);
   }
   if(frame===hz){a.clear();b.clear();}
   const cam=new THREE.Vector3(Math.sin(t)*3,4,6);a.update(t,cam);b.update(t,cam);
   assert.deepEqual(b.list.map(r=>r.pts),a.list.map(r=>r.pts));assert.deepEqual(b.mesh.geometry.drawRange,a.mesh.geometry.drawRange);
   for(const key of ['pos','col','rib','side','face'])assert.deepEqual(b[key].array,a[key].array);
  }
  a.mesh.geometry.dispose();b.mesh.geometry.dispose();a.mesh.material.dispose();b.mesh.material.dispose();
 }
});
test('non-Sprinkler current envelopes omit Set work while Sprinkler and unknown formats preserve birth identity',()=>{
 const s=runtime('native-sprinkler-damage'),start=s.indexOf('NetMatch.prototype._play=function')+'NetMatch.prototype._play='.length,end=s.indexOf('\n const candidate=',start),after=s.slice(start,end).trim().replace(/;$/,'');
 for(const shape of ['current-other','current-sprinkler','legacy','not-bomb']){
  function run(old){let sets=0,reads=0;const b0={owner:null},bombs=[b0],born=[],actor={remote:true,owner:'peer'};b0.owner=actor;const G={projectiles:{get bombs(){reads++;return bombs;}}};
   const event=Array(shape==='legacy'?14:16).fill(null);Object.assign(event,{1:shape==='not-bomb'?'p':'b',2:3,3:'bomb',11:shape==='current-sprinkler'||shape==='legacy'?'sprinkler':'suction',_netSeq:7});
   const nm={byNid:new Map([[3,actor]])};const added={owner:actor,ghost:true,id:event[11]};
   const fn=compile(old?before.functions.nativeSprinklerPlay:after,{G,play(){bombs.shift();bombs.push(added);return 42;},birth:(b,_n,seq)=>born.push([b.id,seq]),sprinkler:b=>b.id==='sprinkler',Set:class extends Set{constructor(v){super(v);sets++;}}});
   const result=fn.call(nm,'peer',event);return{result,born,ids:bombs.map(x=>x.id),sets,reads};
  }
  const a=run(true),b=run(false);assert.deepEqual({result:b.result,born:b.born,ids:b.ids},{result:a.result,born:a.born,ids:a.ids});if(shape==='current-other'){assert.equal(b.sets,0);assert.equal(b.reads,0);assert.equal(a.sets,1);}else assert.equal(b.sets,a.sets);
 }
});
test('ScreenFX lazy speed preserves seeded dry/swim/exit/enemy/jump outputs at all render cadences',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/fx/screenfx.js',import.meta.url),'utf8'),optimized=adaptQueueExtraWeaponsFx('src/fx/screenfx.js',raw),start=optimized.indexOf('    const G = this.G, s = this.s;',optimized.indexOf('  _sim(')),end=optimized.indexOf('    // --- storm rain',start);
 for(const hz of [30,60,120])for(const form of ['kid','swim','climb'])for(const lastForm of ['kid','swim'])for(const onEnemy of [false,true,undefined])for(const phase of ['flight','charge',null]){
  function run(old){let hypot=0,draws=0;const rnd0=random(),rows=[],math=Object.create(Math);math.hypot=(...a)=>{hypot++;return Math.hypot(...a);};math.random=()=>{draws++;return rnd0();};const rnd=(a,b)=>a+(b-a)*math.random();const s={dmgT:0,lastForm,emergeT:0,stepT:0,speed:.1,stretch:.1,wasJump:false,jumpCharge:.1,swim:.2,edgeInk:.1};const self={G:{},s,lens:{droplet:(...x)=>rows.push(x)},_land:()=>rows.push('land')},actor={alive:true,anim:{form},vel:{x:8,y:5,z:4},onEnemy,grounded:true,groundTeam:2,submerged:false,superJumpState:phase?{phase,t:.4,dur:1.2}:null};
   const fn=new Function('Math','clamp','damp','rnd','CH_OWN','CH_ENEMY','return function(dt,m,a){'+(old?before.functions.screenPrefix:optimized.slice(start,end))+'}')(math,clamp,(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt)),rnd,1,2);fn.call(self,1/hz,{state:'playing'},actor);return{s,rows,draws,hypot};
  }
  const a=run(true),b=run(false);assert.deepEqual(b.s,a.s);assert.deepEqual(b.rows,a.rows);assert.equal(b.draws,a.draws);assert.ok(b.hypot<=a.hypot);if(form==='kid'&&lastForm==='kid'&&onEnemy===false)assert.equal(b.hypot,0);
 }
});

test('Explosher appended blobs keep all transform/color/shape bytes with capacity and delay boundaries',()=>{
 const rnd=random();for(const capacity of [0,1,3,20])for(let scenario=0;scenario<30;scenario++){
  function run(old){const rows=[],list=Array.from({length:10},(_,i)=>({s3Shape:i%3?'explosher':'other',owner:{color:new THREE.Color(.2,.4,.6)},delay:i%4===0?.1:0,seed:i*.31,age:scenario*.017,pos:new THREE.Vector3(i,scenario*.2,i*.3),vel:new THREE.Vector3(1,2,i)})),shp=new Float32Array(80),look=new Float32Array(80),petals=new Float32Array(40);const count=compiled('s3-projectile-shapes','appendS3ShapeBlobs',old,{clamp,S3_SHAPE:{explosher:{radius:.4}},direction:(p,out)=>{out.copy(p.vel).normalize();return p.vel.length();}})({list},{setMatrixAt:(i,m)=>rows.push(['m',i,...m.elements]),setColorAt:(i,c)=>rows.push(['c',i,...c.toArray()])},shp,look,petals,0,capacity,new THREE.Matrix4(),new THREE.Quaternion(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(0,1,0));return{rows,count,shp,look,petals};}
  assert.deepEqual(run(false),run(true));
 }
});
test('Torpedo/Fizzy dirty colors preserve slot bytes through births, reorder and removals',()=>{
 for(const hz of [30,60,120]){const build=old=>{let writes=0;const pool={users:1,dirty:true,matrix:new THREE.Matrix4(),matrixRange:{start:0,count:0},colorRange:{start:0,count:0},mesh:{count:0,visible:false,instanceMatrix:new THREE.InstancedBufferAttribute(new Float32Array(768*16),16),instanceColor:new THREE.InstancedBufferAttribute(new Float32Array(768*3),3),colors:[],matrices:[],setMatrixAt(i,m){this.matrices[i]=m.elements.slice();},setColorAt(i,c){writes++;this.colors[i]=c.toArray();}}};const fn=compiled('torpedo-splashes','syncVisuals',old),ps={_s3TorpedoVisuals:new Map([[1,pool]]),_s3TorpedoSplashes:[]};return{pool,ps,fn,get writes(){return writes;}};},a=build(true),b=build(false);
  for(let frame=0;frame<hz;frame++){for(const w of [a,b]){if(frame%11===0){w.ps._s3TorpedoSplashes.push({visual:w.pool,pos:new THREE.Vector3(frame,1,2),visualColor:new THREE.Color(frame%2,.3,.4)});w.pool.dirty=true;}if(frame%13===0&&w.ps._s3TorpedoSplashes.length){w.ps._s3TorpedoSplashes.shift();w.pool.dirty=true;}for(const d of w.ps._s3TorpedoSplashes)d.pos.x+=1/hz;w.dirtyBefore=w.pool.dirty;w.fn(w.ps);}assert.equal(b.pool.mesh.count,a.pool.mesh.count);assert.equal(b.pool.mesh.visible,a.pool.mesh.visible);const count=a.pool.mesh.count;assert.deepEqual(b.pool.mesh.colors.slice(0,count),a.pool.mesh.colors.slice(0,count));assert.deepEqual(b.pool.mesh.matrices.slice(0,count),a.pool.mesh.matrices.slice(0,count));if(count){assert.deepEqual(b.pool.mesh.instanceMatrix.updateRanges,[{start:0,count:count*16}]);if(b.dirtyBefore)assert.deepEqual(b.pool.mesh.instanceColor.updateRanges,[{start:0,count:count*3}]);}}
  assert.ok(b.writes<a.writes);
 }
});

test('legacy sweep extrema retain epsilon-free broadphase limits and no-hit outputs bit-for-bit',()=>{
 const rnd=random(),values=[0,-0,1,-1,1e-9,1e20,NaN,Infinity,-Infinity];let beforeCalls=0,afterCalls=0;
 for(let i=0;i<6000;i++){const from=new THREE.Vector3(i<values.length?values[i]:(rnd()-.5)*100,(rnd()-.5)*10,(rnd()-.5)*50),to=new THREE.Vector3((rnd()-.5)*100,(rnd()-.5)*10,(rnd()-.5)*50),r=i<values.length?values[i]:rnd()*2;
  function run(old){const queries=[],math=Object.create(Math);for(const key of ['min','max'])math[key]=(...a)=>{if(old)beforeCalls++;else afterCalls++;return Math[key](...a);};const out={point:new THREE.Vector3(),normal:new THREE.Vector3()},physics={level:{blocks:[],queryBlocks(...args){queries.push(args.slice(0,4));return[];}}};compiled('weapons-collision','sweptWorldHit',old,{Math:math})(physics,from,to,r,r,out);return{queries,hit:out.hit,dist:out.dist,block:out.block,face:out.face};}
  assert.deepEqual(run(false),run(true));
 }
 assert.equal(beforeCalls-afterCalls,6000*4);
});
