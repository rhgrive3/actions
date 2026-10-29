import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-presentation-20261029-before.json',import.meta.url),'utf8'));
const runtime=new URL('../../splatoon3/runtime/',import.meta.url);
async function load(name,old=false,extra=''){
 const source=(old?before[name]:fs.readFileSync(new URL(name+'.mjs',runtime),'utf8')).replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,runtime).href));
 return import('data:text/javascript;base64,'+Buffer.from(source+'\n'+extra).toString('base64'));
}
test('body endcap/ellipse dead arithmetic removal preserves every Float32 vertex normal/color',async()=>{
 const A=(await load('projectile-visuals',true)).ProjectileVisualRuntime,B=(await load('projectile-visuals')).ProjectileVisualRuntime;
 const a=new A({scene:new T.Scene(),list:[]},T),b=new B({scene:new T.Scene(),list:[]},T);
 try{for(const kind of ['shooter','roller-horizontal','roller-vertical','spiral','explosive'])for(let variant=0;variant<20;variant++){
  const c=new Float64Array(78),w=new Float64Array(13),t=new Float64Array(13);
  for(let i=0;i<13;i++){c.set([Math.sin(i*.3)*variant*.01,variant===0?0:i*.03,i*.2,0,0,1],i*6);w[i]=.1+Math.sin(i*.3)*.03;t[i]=variant%2?w[i]:w[i]*.7;}
  for(const r of [a,b]){r.bodies=0;r._writeBody(c,w,t,kind,.23,.57,.91,.37,.6,.4);}
  for(const key of ['position','normal','color'])assert.deepEqual(b[key].array,a[key].array,kind+' '+variant+' '+key);
 }}finally{a.dispose();b.dispose();}
});
test('empty projectile draw keeps transition reset and wakes for live/trailing history',async()=>{
 const A=(await load('projectile-visuals',true)).ProjectileVisualRuntime,B=(await load('projectile-visuals')).ProjectileVisualRuntime;
 const a=new A({scene:new T.Scene(),list:[]},T),b=new B({scene:new T.Scene(),list:[]},T);
 try{let writes=0;const set=b.geometry.setDrawRange;b.geometry.setDrawRange=function(...x){writes++;return set.apply(this,x);};
 for(let i=0;i<5;i++){a.draw(i/4);b.draw(i/4);assert.equal(b.mesh.visible,a.mesh.visible);assert.deepEqual(b.geometry.drawRange,a.geometry.drawRange);assert.deepEqual(b.stats,a.stats);}
 assert.equal(writes,1);
 const p={_iwVisualHistory:{count:0},delay:0};a.system.list.push(p);b.system.list.push(p);a.draw(1);b.draw(1);assert.deepEqual(b.stats,a.stats);
 a.system.list.length=b.system.list.length=0;a.draw(.5);b.draw(.5);assert.equal(writes,3);assert.deepEqual(b.stats,a.stats);
 }finally{a.dispose();b.dispose();}
});
test('zero/one-point ribbons age and retire without repeated dirty versions; second point resumes exact geometry',async()=>{
 const A=(await load('special-vfx-kit',true)).SpecialVfxKit,B=(await load('special-vfx-kit')).SpecialVfxKit;
 const a=new A(T,new T.Scene(),1),b=new B(T,new T.Scene(),1);try{
 const x=a.ribbons,y=b.ribbons,ra=x.start({seed:.5,life:.2}),rb=y.start({seed:.5,life:.2});
 const cam=new T.Vector3(0,5,4),attrs=['pos','col','rib','side','face'];
 x.update(0,cam);y.update(0,cam);const versions=attrs.map(k=>y[k].version);
 for(let i=1;i<5;i++){x.update(i/60,cam);y.update(i/60,cam);}
 assert.deepEqual(attrs.map(k=>y[k].version),versions);
 for(const [pool,r] of [[x,ra],[y,rb]])pool.push(r,0,0,0,.1);
 x.update(.1,cam);y.update(.1,cam);assert.deepEqual(attrs.map(k=>y[k].version),versions);
 for(const [pool,r] of [[x,ra],[y,rb]])pool.push(r,1,0,0,.11);
 x.update(.11,cam);y.update(.11,cam);for(const k of attrs)assert.deepEqual(y[k].array,x[k].array);
 x.update(.4,cam);y.update(.4,cam);for(const k of attrs)assert.deepEqual(y[k].array,x[k].array);
 const retired=attrs.map(k=>y[k].version);x.end(ra);y.end(rb);x.update(.5,cam);y.update(.5,cam);assert.equal(y.list.length,0);assert.deepEqual(attrs.map(k=>y[k].version),retired);
 }finally{a.dispose();b.dispose();}
});
test('storm visuals probe present cloud ground, preserve unchanged terrain particle args and fixed option values',async()=>{
 const a=await load('special-vfx',true,'export {KIT_FX};'),b=await load('special-vfx',false,'export {KIT_FX};');
 const make=()=>({v:Array.from({length:8},()=>new T.Vector3()),up:new T.Vector3(0,1,0),THREE:T,api:{},G:{level:{groundHeight:()=>3}},near:()=>true,puffs:[],discs:[],puff(...args){this.puffs.push(args.map(v=>v?.isVector3?v.toArray():v));},disc(...args){this.discs.push(args.map(v=>v?.isVector3?v.toArray():v));}});
 // Zero radius at formation retains deterministic positions despite private VFX RNG.
 const cloud={pos:new T.Vector3(0,10,0),t:0,dur:6,groundY:3};let x=make(),y=make();a.KIT_FX.cloud.frame.call(x,{color:[.2,.4,.6]},cloud,.1);b.KIT_FX.cloud.frame.call(y,{color:[.2,.4,.6]},cloud,.1);
 assert.deepEqual(y.puffs,x.puffs);assert.deepEqual(y.discs,x.discs);
 cloud.groundY=0;y=make();b.KIT_FX.cloud.frame.call(y,{color:[.2,.4,.6]},cloud,.1);assert.equal(y.discs[0][3][1],3.04);assert.equal(y.puffs[0][5],(10-.5-3)/18);
 assert.equal(cloud.groundY,0,'native simulation field is read only');
 assert.equal(y.puffs[0].at(-1),y.puffs[1].at(-1));assert.ok(Object.isFrozen(y.puffs[0].at(-1)));
});
test('ranked online triggers include both actual relay dependencies and keep README excluded',()=>{
 const text=fs.readFileSync(new URL('../../../.github/workflows/validate-inkwave-ranked.yml',import.meta.url),'utf8');
 for(const section of [text.split('  push:')[1].split('  pull_request:')[0],text.split('  pull_request:')[1].split('  workflow_dispatch:')[0]]){
  assert.match(section,/'server\/src\/\*\*'/);assert.match(section,/'scripts\/lib\/inkwave-local-relay-fixture\.mjs'/);assert.doesNotMatch(section,/'\*\*'|README/);
 }
 const fixture=fs.readFileSync(new URL('../../../scripts/lib/inkwave-local-relay-fixture.mjs',import.meta.url),'utf8');assert.match(fixture,/server\/src\/index\.js/);
});
test('muzzle occupancy gate preserves matrices/colors and revives after expiry, clear, overwritten ring and capacity zero',async()=>{
 const A=(await load('shooter-muzzle-droplets',true)).ShooterMuzzleDroplets,B=(await load('shooter-muzzle-droplets')).ShooterMuzzleDroplets;
 const a=new A(T),b=new B(T),owner={alive:true,weapon:{id:'shooter'},color:new T.Color(.2,.4,.7)};
 function append(p,time,cap){const rows=[],mesh={setMatrixAt(i,m){rows.push(['m',i,...m.elements]);},setColorAt(i,c){rows.push(['c',i,c.r,c.g,c.b]);}},sh=new Float32Array(300),look=new Float32Array(300),pet=new Float32Array(150);
 const n=p.append(time,mesh,sh,look,pet,0,cap,new T.Matrix4(),new T.Quaternion(),new T.Vector3(),new T.Vector3(),new T.Vector3(),new T.Vector3(0,0,1));return {n,rows,sh,look,pet,count:p.count,drawn:p.drawn};}
 for(const hz of [30,60,120]){a.clear();b.clear();for(let i=0;i<hz;i++){
  if(i===5||i===Math.floor(hz/2))for(let j=0;j<40;j++)for(const p of [a,b])p.observe({type:'shot',wid:'shooter',owner,start:new T.Vector3(j*.01,1,0),vel:new T.Vector3(0,0,10),age:0,seed:j*.03},i/hz);
  if(i===Math.floor(hz*.7)){a.clear();b.clear();}
  assert.deepEqual(append(b,i/hz,i%5?60:0),append(a,i/hz,i%5?60:0));
 }}
});
// Recreate the actual nested paint owner, including any scratch declaration
// immediately before it. A detached function alone is not its lexical scope.
function cataloguePaintClosure(source,G,ellipse){
 const start=source.indexOf('  function paint('),end=source.indexOf('  function floorPaint(',start);
 assert.ok(start>=0&&end>start,'actual catalogue paint/floorPaint boundary');
 assert.equal(source.indexOf('  function paint(',start+1),-1,'unique catalogue paint owner');
 const anchor='  const _paintTangent = new THREE.Vector3(), _paintCross = new THREE.Vector3(), _paintCentre = new THREE.Vector3(), _impactHorizDir = new THREE.Vector3();\n';
 const usesScratch=source.slice(start,end).includes('_paintTangent');
 const prelude=usesScratch?anchor:'';
 if(usesScratch)assert.equal(source.slice(start-anchor.length,start),anchor,'actual same-scope scratch declaration');
 else assert.equal(source.includes('_paintTangent'),false,'historical paint owns no scratch');
 return new Function('THREE','G','paintFallbackUp','EPS','SOURCE_SHOT_PAINT_KIND','catalogPaintEllipse',prelude+'return ('+source.slice(start,end)+')')(T,G,new T.Vector3(0,1,0),1e-9,3,ellipse);
}
test('catalogue inline ellipse retains actual paint packet scalars and vectors for boundary depths and footprints',async()=>{
 const ellipse=(await load('catalog-splash-paint')).catalogPaintEllipse;
 const old=before['main-weapon-catalog'],next=fs.readFileSync(new URL('main-weapon-catalog.mjs',runtime),'utf8');
 const broken=next.replace('  const _paintTangent = new THREE.Vector3(), _paintCross = new THREE.Vector3(), _paintCentre = new THREE.Vector3(), _impactHorizDir = new THREE.Vector3();\n','');
 assert.throws(()=>cataloguePaintClosure(broken,{},ellipse),/actual same-scope scratch declaration/,'missing production owner is rejected');
 function run(s,depth,footprint,normal){const rows=[],G={level:{faces:[{n:normal}]},paint:{splat(...args){rows.push(args.map(v=>v?.isVector3?v.toArray():v&&typeof v==='object'?{...v,claimOwner:null,stretch:v.stretch?.toArray()}:v));return 7;}}};let turf=0;const owner={remote:false,team:1,addTurf(v){turf+=v;}};
 const f=cataloguePaintClosure(s,G,ellipse);
 f(owner,new T.Vector3(2,1,4),.7,depth,new T.Vector3(.4,.2,.9),0,footprint,.37);return {rows,turf};}
 for(const d of [undefined,NaN,Infinity,-Infinity,-1,0,Number.MIN_VALUE,.2,.999999999,1,1.00000001,3])for(const fp of [null,'ink-contact','shot'])for(const n of [new T.Vector3(0,1,0),new T.Vector3(1,0,0)])assert.deepEqual(run(next,d,fp,n),run(old,d,fp,n));
});
test('landing sort workspace preserves actual stable paint/telemetry order at30/60/120, nested reentry and thrown paint',async()=>{
 const modules=[await load('blaster-flight-paint',true),await load('blaster-flight-paint')];
 function trace(api,hz,mode){const system={},rows=[],owners=[0,1].map(team=>({team,remote:false,addTurf(v){rows.push(['turf',team,v]);}}));let nested=false;
 const spec={gravity:3600,drag:0,depthScaleMax:2,depthScaleMin:1,dropHeightMax:5,dropHeightMin:0};
 const game={projectiles:system,physics:{segment(a,b,h){h.hit=b.y<=0;h.point.set(b.x,0,b.z);h.normal.set(0,1,0);return h;}},paint:{splat(p,r,team,o){rows.push([p.toArray(),r,team,o.stretchAmt,o.stretch?.toArray()]);if(mode==='nested'&&!nested){nested=true;birth(0,.1);api.advanceSplashDrops(system,1/60,game);}if(mode==='throw')throw Error('paint failure');return 1;}}};
 function birth(team,y){api.spawnSplashDrop(game,{owner:owners[team],team,seed:.25,from:new T.Vector3(team,y,0),direction:new T.Vector3(.3,0,.7),radius:.4,spec,depth:true});}
 for(let j=0;j<10;j++)birth(j%2,.1+j*.25);
 for(let i=0;i<hz;i++){try{api.advanceSplashDrops(system,1/hz,game);}catch(e){rows.push(e.message);break;}}
 return {rows,landings:system._s3SplashLandings,live:system._s3SplashDrops.map(d=>[d.pos.toArray(),d.frames]),pool:system._s3SplashDropPool?.length};}
 for(const hz of [30,60,120])for(const mode of ['normal','nested','throw'])assert.deepEqual(trace(modules[1],hz,mode),trace(modules[0],hz,mode));
});
test('Torpedo burst pool reuse keeps exact drop/instance bytes, scene changes, mutable tint and clear',async()=>{
 const modules=[await load('torpedo-splashes',true),await load('torpedo-splashes')];
 function trace(api,changing){const scenes=[new T.Scene(),new T.Scene()],system={},source={seed:7,team:0,owner:{color:0x12ab78},ghost:false,chasedTarget:true,spec:{splashDamage:35,splashAround:{count:8,pitchDegrees:65,velocityMin:.42,velocityMax:.48,paintRadius:.3}}},G={scene:scenes[0]};let clone=0;
 const pos=new T.Vector3(2,3,4);pos.clone=function(){if(changing){G.scene=scenes[(clone++)%2];source.owner.color=clone%2?0x123456:0xfedcba;}return new T.Vector3(this.x,this.y,this.z);};
 api.spawnTorpedoSplashes({THREE:T,G},system,source,pos);const rows=system._s3TorpedoSplashes.map(d=>[d.pos.toArray(),d.vel.toArray(),d.seed,d.visualColor.toArray(),scenes.indexOf(d.visual.scene)]),meshes=[...system._s3TorpedoVisuals.values()].map(p=>[p.users,p.mesh.count,Array.from(p.mesh.instanceMatrix.array),Array.from(p.mesh.instanceColor.array)]);api.clearTorpedoSplashes(system);return {rows,meshes,remaining:scenes.map(s=>s.children.length)};}
 for(const changing of [false,true])assert.deepEqual(trace(modules[1],changing),trace(modules[0],changing));
});
test('HDR scratch is confined to immediate spark scalar copy; ordinary returned colors remain independent',async()=>{
 const a=(await load('special-vfx',true,'export {Director};')).Director,b=(await load('special-vfx',false,'export {Director};')).Director;
 const make=C=>{const d=Object.create(C.prototype),rows=[];d.kit={sparks:{spawn(...args){rows.push(args);}}};return {d,rows};};const old=make(a),next=make(b),scratch=[0,0,0];
 for(const c of [[.2,.4,.7],[4,3,2],[-1,0,Infinity],[NaN,1e308,-1e308]])for(const k of [0,.7,2.4])for(const w of [0,.8,1.6]){
  old.d.spark(0,new T.Vector3(1,2,3),4,5,6,.3,.2,.1,old.d.hdr(c,k,w),1);next.d.spark(0,new T.Vector3(1,2,3),4,5,6,.3,.2,.1,next.d.hdr(c,k,w,scratch),1);
 }assert.deepEqual(next.rows,old.rows);const x=next.d.hdr([1,2,3],2),y=next.d.hdr([3,2,1],1);assert.notEqual(x,y);assert.deepEqual(x,[2,4,6]);
});
test('unchanged ownership contract observes a takeover between birth and draw probes',async()=>{
 const C=(await load('projectile-visuals')).ProjectileVisualRuntime;let calls=0;
 const p={_iwVisualHistory:{count:1},_iwVisualKind:'shooter'},r=new C({scene:new T.Scene(),list:[p]},T,{nativeShapeOwns:()=>++calls===2});
 let draws=0;r._drawRound=()=>draws++;try{r.draw(1);assert.equal(calls,2);assert.equal(draws,0,'cached first probe would submit a body now owned by the native renderer');}finally{r.dispose();}
});
test('Saber shape results retain independent mutable range and observe edited calibration without stale caching',async()=>{
 const {saberSlashShape}=await load('saber-melee');const shape={BoxHalfExtents:{X:1,Y:2,Z:3},BoxCenter:{X:0,Y:0,Z:0},HasCylinderShape:false},bullet={ShapeParam:shape},offset={X:0,Y:0,Z:0},record={parameters:{BulletSaberSlashHorizontalParam:bullet,spl__WeaponSaberParam:{SwingParam:{ShotSlashOffset_L:offset,ShotSlashOffset_R:offset}}}};
 const a=saberSlashShape(record,'horizontal'),b=saberSlashShape(record,'horizontal');assert.notEqual(a.range,b.range);a.range[0]=777;assert.equal(b.range[0],0);shape.BoxHalfExtents.X=10;const c=saberSlashShape(record,'horizontal');assert.notEqual(c.bound,b.bound);
});
test('default Three frustum sphere is not interchangeable with world-coordinate SpritePool shader under transformed parent',async()=>{
 const {SpecialVfxKit}=await load('special-vfx-kit');const scene=new T.Scene(),kit=new SpecialVfxKit(T,scene,1),camera=new T.PerspectiveCamera(60,1,.1,100);camera.position.set(0,0,4);camera.lookAt(0,0,0);camera.updateMatrixWorld();const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 try{kit.root.position.x=100;kit.root.updateMatrixWorld(true);const shaderWorldSphere=new T.Sphere(new T.Vector3(0,0,0),1),defaultTransformed=shaderWorldSphere.clone().applyMatrix4(kit.sparks.mesh.matrixWorld);assert.equal(frustum.intersectsSphere(shaderWorldSphere),true);assert.equal(frustum.intersectsSphere(defaultTransformed),false);assert.match(kit.sparks.mesh.material.vertexShader,/viewMatrix\s*\*\s*vec4\(iPos.xyz/);assert.equal(kit.sparks.mesh.frustumCulled,false);}finally{kit.dispose();}
});
