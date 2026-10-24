import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {geometryFixture} from './geometry-build-fixture.mjs';import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';import {parse} from '../../loading-cache/vendor/acorn.mjs';
const oracle=JSON.parse(fs.readFileSync(new URL('./fixtures/world-build-queue-before.json',import.meta.url)));
for(const[name,row]of Object.entries(oracle.rows))test('frozen world baseline digest '+name,()=>assert.equal(crypto.createHash('sha256').update(row.source).digest('hex'),row.sha256));
const json=x=>JSON.parse(JSON.stringify(x)),bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
test('every legacy layout keeps exact render values and collision data while hidden geometry filters are skipped',async()=>{
 const a=await geometryFixture({transform:(rel,s)=>rel==='src/world/level.js'?oracle.rows.level.source:s}),b=await geometryFixture();
 for(const id of ['tidewater','kelpline','cargo','halyard','range']){
  const extras=[{min:[-1,0,-1],max:[1,1,1],rail:true},{min:[4,0,4],max:[6,3,6]}],x=new a.Level(a.MAP_LAYOUTS[id],extras),y=new b.Level(b.MAP_LAYOUTS[id],extras);assert.equal(hash(JSON.stringify(x.blocks)),hash(JSON.stringify(y.blocks)),id+' collision records');assert.equal(hash(JSON.stringify(x.faces)),hash(JSON.stringify(y.faces)),id+' paint faces');
  for(const kind of ['solid','grate','all']){const calls=[0,0],build=(level,k)=>level.buildGeometry(2048,block=>{if(block.hidden)calls[k]++;return kind==='all'||(kind==='grate'?block.grate:!block.grate);});const gx=build(x,0),gy=build(y,1);assert.ok(calls[0]>0);assert.equal(calls[1],0);for(const key of Object.keys(gx.attributes)){const current=gy.attributes[key],frozen=gx.attributes[key];assert.equal(current.itemSize,frozen.itemSize,id+' '+key+' item size');assert.equal(current.normalized,frozen.normalized,id+' '+key+' normalization');assert.equal(current.count,frozen.count,id+' '+key+' vertex count');if(key==='faceFlags'){
   // The integrated world owner losslessly packs these signed integer flags.
   for(let i=0;i<frozen.array.length;i++)assert.ok(Object.is(current.array[i],frozen.array[i]),id+' '+key+' decoded value '+i);
  }else assert.equal(hash(bytes(current.array)),hash(bytes(frozen.array)),id+' '+key+' bytes');}assert.equal(hash(bytes(gy.index.array)),hash(bytes(gx.index.array)),id+' index bytes');gx.dispose();gy.dispose();}
 }
});
function method(source,klass,name){const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),c=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name===klass),n=c.body.body.find(n=>n.key.name===name);return source.slice(n.start,n.end);}
const main=adaptBuildSource('src/main.js',fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8'));
test('empty-grate main path omits allocation; Cargo visible-grate path retains original geometry and material',async()=>{
 const api=await geometryFixture(),world=method(main,'Game','_buildWorld'),start=world.indexOf('    this.grateMesh = this.grateMat = null;'),end=world.indexOf('\n    this.levelMesh.receiveShadow',start);assert.ok(start>0); // locate the exact authored branch by AST rather than a duplicate model
 const tree=parse('class Probe{'+world+'}',{ecmaVersion:'latest'});let block;const visit=n=>{if(!n||typeof n!=='object')return;if(n.type==='IfStatement'&&('class Probe{'+world+'}').slice(n.test.start,n.test.end).includes('level.faces.some'))block=('class Probe{'+world+'}').slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);};visit(tree);assert.ok(block);
 for(const id of ['tidewater','kelpline','halyard','cargo','range']){const level=new api.Level(api.MAP_LAYOUTS[id],[{min:[0,0,0],max:[1,1,1],rail:true}]);let allocations=0,adds=0,builds=0;const build=level.buildGeometry.bind(level);level.buildGeometry=(...args)=>{builds++;return build(...args);};const h={murals:null,texlib:null};const fn=new Function('level','G','THREE','createLevelMaterial','lightmap','scene',block);fn.call(h,level,{paint:{texture:null,size:2048}},api.THREE,()=>{allocations++;return new api.THREE.MeshBasicMaterial();},null,{add(){adds++;}});const visible=level.faces.some(f=>level.blocks[f.block].grate);assert.deepEqual([allocations,builds,adds],visible?[1,1,1]:[0,0,0]);if(h.grateMesh){assert.ok(h.grateMesh.geometry.index.count);h.grateMesh.geometry.dispose();h.grateMat.dispose();}}
});
function env(api){const {THREE,Environment}=api,e=Object.create(Environment.prototype);e.footprint=[];e.bounds={minX:-2,maxX:2,minZ:-3,maxZ:3};e._initUniforms();e.scene=new THREE.Scene();e.scene.fog=new THREE.Fog(0,1,2);e.renderer={getClearColor:c=>c.set(0),getClearAlpha:()=>1,setClearColor(){}};e.sun=new THREE.DirectionalLight();e.sun.shadow.map={};e.hemi=new THREE.HemisphereLight();e.skyMat={defines:{}};e.lhBeam={};e.fogColor=new THREE.Color();e.calls=[];e.marina=false;e._stageMarina=()=>e.marina;e._rebuildDock=()=>e.calls.push('dock');e._applyMarina=()=>e.calls.push('marina');e._fitShadow=()=>e.calls.push('shadow');e._bakeFarReflection=()=>e.calls.push('cube');e._bakeClouds=()=>{};e._rebuildEnvMap=()=>{};e.setTheme('day');return e;}
const envState=e=>json({theme:e.theme,U:e.U,grade:e.grade,sun:e.sun.color.toArray(),intensity:e.sun.intensity,hemi:e.hemi.color.toArray(),ground:e.hemi.groundColor.toArray(),bounds:e.bounds,footprint:e.footprint,fog:e.scene.fog});
test('combined stage/theme transition bakes once with final level and identical final lighting',async()=>{
 const old=await geometryFixture({transform:(rel,s)=>{if(rel!=='src/world/environment.js')return s;const now=method(s,'Environment','rebuildForArena');return s.replace(now,oracle.rows.rebuildForArena.source);}}),now=await geometryFixture();const a=env(old),b=env(now);
 for(const[marina,theme]of [[true,'golden'],[true,'sunset'],[false,'day'],[true,'golden'],[true,'golden'],[false,'sunset']]){for(const e of[a,b]){e.marina=marina;e.calls=[];}const bounds={minX:-30,maxX:30,minZ:-40,maxZ:40};a.rebuildForArena(bounds,[]);if(a.theme!==theme)a.setTheme(theme);b.rebuildForArena(bounds,[],theme);assert.deepEqual(envState(b),envState(a));for(const name of ['dock','marina','shadow','cube'])assert.equal(b.calls.filter(x=>x===name).length,1,name+' generated once');}
 assert.ok(main.includes('_buildWorld(map, flow, mapTheme(map, opts.time))'));assert.ok(main.includes('_buildWorld(map, flow, mapTheme(map, cfg.time))'));
});

test('missing shadow map keeps the old first-bake lighting before final theme and rebuilds the final reflection',async()=>{
 const old=await geometryFixture({transform:(rel,s)=>rel==='src/world/environment.js'?s.replace(method(s,'Environment','rebuildForArena'),oracle.rows.rebuildForArena.source):s}),now=await geometryFixture();
 for(const initial of [null,{}]){
  const a=env(old),b=env(now),snapshots=[[],[]];
  for(const [index,e]of[a,b].entries()){e.sun.shadow.map=initial;e.marina=true;e.calls=[];e._bakeFarReflection=()=>{e.calls.push('cube');snapshots[index].push({theme:e.theme,direction:e.U.uSunDir.value.toArray(),colour:e.sun.color.toArray(),missing:!e.sun.shadow.map});e.sun.shadow.map||={initializedUnder:e.theme};};}
  const bounds={minX:-30,maxX:30,minZ:-40,maxZ:40};a.rebuildForArena(bounds,[]);a.setTheme('golden');b.rebuildForArena(bounds,[],'golden');assert.deepEqual(envState(b),envState(a));
  if(initial===null){assert.deepEqual(json(snapshots[1]),json(snapshots[0]));assert.deepEqual(b.calls,a.calls);assert.equal(b.sun.shadow.map.initializedUnder,'day');}
  else{assert.equal(snapshots[1].length,1);assert.deepEqual(json(snapshots[1][0]),json(snapshots[0].at(-1)));}
 }
});
