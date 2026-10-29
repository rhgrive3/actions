import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=process.env.CHUMP_SOURCE_ROOT || fileURLToPath(new URL('../../../',import.meta.url));
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
const {compactModuleStrings}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-source-compaction.mjs')));
const require=createRequire(import.meta.url);
const esbuild=process.env.ESBUILD_MODULE ? require(process.env.ESBUILD_MODULE) : require('esbuild');
const candidate=fs.readFileSync(process.env.CHUMP_VFX_SOURCE || new URL('../runtime/special-vfx.mjs',import.meta.url),'utf8');
const newLine='        this.muzzle(m, this.up, c, 1.6);';
const oldLine='        this.muzzle(m, this.aim(a, this.v[1]), c, 1.6);';
const comment='        // GameWith 362075, decoded f76–100: the launch spray exits upward, not along the landing aim.\n';
const kitRaw=fs.readFileSync(path.join(root,'patches/splatoon3/runtime/special-vfx-kit.mjs'),'utf8');
const THREE=await import(pathToFileURL(path.join(root,'inkwave-public/vendor/three/build/three.module.js')));
const kitCache=new Map();
async function kitFor(emitted){
 if(kitCache.has(emitted))return kitCache.get(emitted);
 const code=emitted?compactModuleStrings(esbuild.transformSync(kitRaw,{format:'esm',minify:true,charset:'utf8',legalComments:'inline'}).code).code:kitRaw;
 // Use the real pool helpers in both source and minified realms so their
 // GPU upload and bounds mutations remain observable in tests.
 const helpers=new Map();
 for(const file of ['instance-color-upload.mjs','shape-pool-bounds.mjs']){
  const raw=fs.readFileSync(path.join(root,'patches/splatoon3/runtime',file),'utf8');
  helpers.set('./'+file,emitted?compactModuleStrings(esbuild.transformSync(raw,{format:'esm',minify:true,charset:'utf8',legalComments:'inline'}).code).code:raw);
 }
 const context=vm.createContext({console});
 const module=new vm.SourceTextModule(code,{context});
 await module.link(spec=>{
  assert.ok(helpers.has(spec),'explicit real kit dependency: '+spec);
  return new vm.SourceTextModule(helpers.get(spec),{context});
 });
 await module.evaluate();kitCache.set(emitted,module.namespace);return module.namespace;
}
const original=process.env.CHUMP_VFX_BASELINE ? fs.readFileSync(process.env.CHUMP_VFX_BASELINE,'utf8') : candidate.replace(comment,'').replace(newLine,oldLine);
class Vec {
 constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){Object.assign(this,{x,y,z});return this;}
 copy(v){return this.set(v.x,v.y,v.z);}setY(y){this.y=y;return this;}
 lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}normalize(){const s=1/Math.sqrt(this.lengthSq());return this.set(this.x*s,this.y*s,this.z*s);}
}
const xyz=v=>[v.x,v.y,v.z];
async function load(raw,emitted){
 let source=raw+'\nexport {Director as TestDirector};';
 source=adaptBuildSource('patches/splatoon3/runtime/special-vfx.mjs',source);
 if(emitted)source=compactModuleStrings(esbuild.transformSync(source,{format:'esm',minify:true,charset:'utf8',legalComments:'inline'}).code).code;
 const context=vm.createContext({console}),imports=new Map(),kit=await kitFor(emitted);let draws=0;
 for(const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g))imports.set(match[2],match[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]));
 const module=new vm.SourceTextModule(source,{context});
 await module.link(spec=>new vm.SyntheticModule(imports.get(spec),function(){for(const name of imports.get(spec))this.setExport(name,name==='vfxRandom'?()=>{draws++;return .5;}:spec==='./special-vfx-kit.mjs'?kit[name]:()=>{});},{context}));
 await module.evaluate();const Director=module.namespace.TestDirector;Object.defineProperty(Director,'rngDraws',{get:()=>draws});return Director;
}
function fixture(Director,q=1){
 const d=Object.create(Director.prototype),out={discs:[],drops:[],stars:[],smoke:[],flash:[],aimReads:0,clears:0};
 Object.assign(d,{THREE:{Vector3:Vec},G:{time:5},time:5,errors:0,v:Array.from({length:8},()=>new Vec()),up:new Vec(0,1,0),
  kit:{q,clear(){out.clears++;}},rgb(){return [.7,.3,.1];},aim(a,v){out.aimReads++;return Director.prototype.aim.call(this,a,v);},
  flash(p,...args){out.flash.push({pos:xyz(p),args});},disc(add,life,style,p,dir,...args){out.discs.push({pos:xyz(p),normal:xyz(dir),life,args});return {};},
  drop(p,vx,vy,vz,...args){out.drops.push({pos:xyz(p),vel:[vx,vy,vz],args});},
  spark(kind,p,vx,vy,vz,...args){out.stars.push({pos:xyz(p),vel:[vx,vy,vz],args});},
  smoke(p,...args){out.smoke.push({pos:xyz(p),args});}});
 for(const key of ['tracks','rounds','objects','lasers','domes','coolers','fists','storms'])d[key]=new Map();
 const actor={alive:true,pos:new Vec(10,20,30),aimDir:new Vec(1,0,0),specialActive:{id:'superChump',t:3},_s3AllSpecialState:{id:'superChump',t:3},remote:false};
 const event=(index=0,extra={})=>({actor,id:'superChump',action:'balloon',activation:7,index,pos:[2,3,4],target:[32,0,-9],...extra});
 return {d,out,actor,event};
}
function isUp(out){assert.equal(out.discs.length,1);assert.deepEqual(out.discs[0].normal,[0,1,0]);assert.equal(out.aimReads,0);}
for(const emitted of [false,true]){
 const mode=emitted?'transformed/minified fixture':'source',Director=await load(candidate,emitted),Baseline=await load(original,emitted);
 test(`${mode}: accepted Chump nozzle is upward independent of actor aim and target`,()=>{
  for(const [index,aim] of [[1,0,0],[0,0,-1],[.4,-.7,.6],[0,1,0]].entries()){const f=fixture(Director);f.actor.aimDir.set(...aim);f.actor.yaw=index*Math.PI/2;f.actor.aimYaw=-index;f.d.camPos=new Vec(100-index*20,-90+index*40,index*70);f.d.event(f.event());isUp(f.out);assert.equal(Math.hypot(...f.out.discs[0].normal),1);assert.equal(f.d.errors,0);}
 });
 test(`${mode}: actual muzzle recipe emits its existing cone upward with unchanged origin and particle counts`,()=>{
  const f=fixture(Director);f.d.event(f.event());isUp(f.out);assert.deepEqual(f.out.discs[0].pos,[2,3.4,4]);
  assert.equal(f.out.drops.length,16);assert.ok(f.out.drops.every(p=>p.vel[0]===0&&p.vel[1]>0&&p.vel[2]===0));
  assert.equal(f.out.stars.length,26);assert.equal(f.out.smoke.length,1);assert.equal(f.out.smoke[0].args[0],6);
  assert.equal(f.out.discs[0].life,.12);assert.equal(f.d.tracks.size,0);assert.equal(f.d.objects.size,0);
 });
 test(`${mode}: twelve accepted balloon rows produce only the original index-zero burst`,()=>{
  const f=fixture(Director);for(let i=0;i<12;i++)f.d.event(f.event(i));isUp(f.out);assert.equal(f.out.drops.length,16);assert.equal(f.out.stars.length,26);
 });
 test(`${mode}: aiming, cancelled/end actions, other indices and invalid positions never launch`,()=>{
  const f=fixture(Director);for(const action of ['activate','aim','end','cancel'])f.d.event(f.event(0,{action}));
  for(const index of [1,11,-1,NaN])f.d.event(f.event(index));
  for(const pos of [null,[1,2],[1,NaN,3]])f.d.event(f.event(0,{pos}));
  assert.equal(f.out.discs.length,0);assert.equal(f.out.drops.length,0);assert.equal(f.out.stars.length,0);assert.equal(f.d.errors,0);
 });
 test(`${mode}: presentation does not change accepted rows, active control state, player position or aim`,()=>{
  const f=fixture(Director),e=f.event(),before=JSON.stringify(e),state=f.actor.specialActive,all=f.actor._s3AllSpecialState;
  f.d.event(e);assert.equal(JSON.stringify({...e,actor:{...f.actor,_s3SpecialMarks:undefined}}),before);
  assert.equal(f.actor.specialActive,state);assert.equal(f.actor._s3AllSpecialState,all);assert.equal(f.actor._s3SpecialMarks.balloon,5);
 });
 test(`${mode}: clear/cancel and subsequent actor reuse retain no launch controller and accept the next birth`,()=>{
  const f=fixture(Director);f.d.event(f.event(0,{action:'cancel'}));f.d.clear();f.d.clear();assert.equal(f.out.discs.length,0);
  f.actor.remote=true;f.d.event(f.event(0,{activation:8,pos:[7,8,9]}));assert.deepEqual(f.out.discs[0].pos,[7,8.4,9]);
  f.d.clear();f.actor.remote=false;f.actor.aimDir.set(0,-1,0);f.d.event(f.event(0,{activation:9,pos:[-2,4,8]}));
  assert.equal(f.out.discs.length,2);assert.deepEqual(f.out.discs[1].normal,[0,1,0]);assert.deepEqual(f.out.discs[1].pos,[-2,4.4,8]);
  for(const key of ['tracks','rounds','objects','lasers','domes','coolers','fists','storms'])assert.equal(f.d[key].size,0);assert.equal(f.d.errors,0);
 });
 test(`${mode}: quality scaling preserves existing birth counts without retained effects`,()=>{
  const f=fixture(Director,.5);f.d.event(f.event());assert.equal(f.out.drops.length,8);assert.equal(f.out.stars.length,13);isUp(f.out);
 });
 test(`${mode}: baseline/candidate preserve all non-direction primitive arguments and RNG draw count`,()=>{
  const before=Baseline.rngDraws,old=fixture(Baseline);old.actor.aimDir.set(4,0,0);old.d.event(old.event());const oldDraws=Baseline.rngDraws-before;
  const prior=Director.rngDraws,next=fixture(Director);next.actor.aimDir.set(4,0,0);next.d.event(next.event());assert.equal(Director.rngDraws-prior,oldDraws);
  assert.equal(Math.hypot(...old.out.discs[0].normal),1);assert.equal(Math.hypot(...next.out.discs[0].normal),1);
  const strip=o=>({discs:o.discs.map(({normal,...p})=>p),drops:o.drops.map(({vel,...p})=>p),stars:o.stars,smoke:o.smoke,flash:o.flash});
  assert.equal(JSON.stringify(strip(next.out)),JSON.stringify(strip(old.out)));
  assert.equal(Math.hypot(...old.out.drops[0].vel),Math.hypot(...next.out.drops[0].vel));
  old.actor.aimDir=null;old.actor.yaw=Math.PI/2;assert.ok(Math.abs(old.d.aim(old.actor,new Vec()).lengthSq()-1)<1e-12);
 });
 test(`${mode}: actual pooled consumers retain world-up normal and velocity across camera rotations`,()=>{
  const fx={root:new THREE.Group(),q:1},G={time:0,actors:[],teamColors:[new THREE.Color('#ff8800')]};
  const d=new Director({THREE,G},fx),actor={alive:true,team:0,aimDir:new THREE.Vector3(1,0,0),pos:new THREE.Vector3(),yaw:Math.PI/2};
  const caps=d.kit.pools.map(p=>p.cap),meshes=fx.root.children[0].children.length;
  d.event({actor,id:'superChump',action:'balloon',activation:1,index:0,pos:[2,3,4],target:[90,-3,20]});
  assert.equal(d.errors,0);assert.deepEqual(Array.from(d.kit.discs.recs[0].v.slice(4,7)),[0,1,0]);
  assert.equal(d.kit.puffs.n,22);assert.equal(d.kit.sparks.n,27);assert.equal(d.kit.shells.recs.length,1);assert.equal(d.kit.discs.recs.length,1);
  const S=d.kit.puffs.S,p=d.kit.puffs.p;for(let i=0;i<16;i++){assert.equal(p[i*S+3],0);assert.ok(p[i*S+4]>0);assert.equal(p[i*S+5],0);}
  const camera=new THREE.PerspectiveCamera();camera.position.set(-60,22,39);camera.rotation.set(.7,2.2,-.4);camera.updateMatrixWorld(true);d.kit.update(.01,camera);
  assert.deepEqual(Array.from(d.kit.discs.recs[0].v.slice(4,7)),[0,1,0]);assert.deepEqual(d.kit.pools.map(p=>p.cap),caps);assert.equal(fx.root.children[0].children.length,meshes);
  d.clear();d.clear();assert.equal(d.kit.puffs.n,0);assert.equal(d.kit.sparks.n,0);assert.equal(d.kit.discs.recs.length,0);
  d.event({actor,id:'superChump',action:'end',pos:[2,3,4]});assert.equal(d.kit.puffs.n,0);
  d.event({actor,id:'superChump',action:'balloon',activation:2,index:0,pos:[7,8,9]});assert.equal(d.kit.puffs.n,22);
  for(let i=0;i<120;i++)d.kit.update(1/60,camera);assert.equal(d.kit.puffs.n,0);assert.equal(d.kit.sparks.n,0);assert.equal(d.kit.discs.recs.length,0);d.kit.dispose();
 });
 test(`${mode}: negative control detects the old aim-directed cone`,()=>{
  const f=fixture(Baseline);f.d.event(f.event());assert.deepEqual(f.out.discs[0].normal,[1,0,0]);assert.equal(f.out.aimReads,1);assert.throws(()=>isUp(f.out));
 });
}
test('only the named Chump event direction and evidence comment differ from the preserved baseline',()=>{
 assert.equal(candidate.split(newLine).length,2);assert.equal(candidate.replace(comment,'').replace(newLine,oldLine),original);
});
