import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import vm from'node:vm';import{fileURLToPath,pathToFileURL}from'node:url';import{verifyThreeReferences}from'./three-contract.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),here=path.dirname(fileURLToPath(import.meta.url)),site=process.env.INKWAVE_BUILT_SITE?path.resolve(process.env.INKWAVE_BUILT_SITE):path.join(ROOT,'inkwave-public');const THREE=await import(pathToFileURL(path.join(site,'vendor/three/build/three.module.js')).href);const browser=fs.readFileSync(path.join(here,'browser.mjs'),'utf8');
const sources=['browser.mjs','probe.mjs','axes.mjs'].map(name=>({name,source:fs.readFileSync(path.join(here,name),'utf8')}));sources.push({name:'lighting.mjs',source:fs.readFileSync(path.join(here,'../squid-production-qa/lighting.mjs'),'utf8')});
async function guides(){const context=vm.createContext({}),m=new vm.SourceTextModule(browser,{context});await m.link(spec=>{const values=spec==='three'?THREE:spec.endsWith('lighting.mjs')?{createProductionLighting(){throw Error('not rendered');},PRODUCTION_LIGHTING_CONFIG:{}}:spec==='./probe.mjs'?{collectHeadingFrames(){throw Error('not sampled');}}:null;assert(values,'unknown browser dependency '+spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();return m.namespace.createHeadingGuides();}
test('all browser, probe, axes and lighting references exist in the selected Three artifact',()=>{assert.equal(verifyThreeReferences(THREE,sources).status,'passed');assert.doesNotMatch(browser,/new THREE\.(GridHelper|ArrowHelper)/);});
test('missing export and nonconstructible export fail before browser startup',()=>{assert.throws(()=>verifyThreeReferences({},[{name:'old',source:'new THREE.GridHelper()'}]),/missing production/);assert.throws(()=>verifyThreeReferences({Scene:()=>{}},[{name:'bad',source:'new THREE.Scene()'}]),/not constructible/);const reduced={...THREE};delete reduced.LineSegments;assert.throws(()=>verifyThreeReferences(reduced,sources),/LineSegments/);});
test('guide grid retains exact 4WU/16 subdivisions, center colors and original plane',async()=>{const{grid,travel}=await guides();try{const p=grid.geometry.attributes.position,c=grid.geometry.attributes.color;assert.equal(p.count,68);assert.equal(c.count,68);for(let i=0;i<=16;i++){const k=-2+i*.25;assert.deepEqual(Array.from(p.array.slice(i*12,i*12+12)),[-2,0,k,2,0,k,k,0,-2,k,0,2]);const color=new THREE.Color(i===8?0x52617a:0x8793a4);for(let j=0;j<4;j++)for(let a=0;a<3;a++)assert(Math.abs(c.array[i*12+j*3+a]-color.toArray()[a])<1e-7);}assert.equal(grid.material.toneMapped,false);assert.equal(grid.material.vertexColors,true);}finally{for(const o of[grid,travel.line,travel.cone]){o.geometry.dispose();o.material.dispose();}}});
test('travel guide retains +X, .9 tip, .15 head, .08 width and diagnostic material',async()=>{const{grid,travel}=await guides();try{travel.updateMatrixWorld(true);const tip=new THREE.Vector3(0,0,0).applyMatrix4(travel.cone.matrixWorld),end=new THREE.Vector3(0,1,0).applyMatrix4(travel.line.matrixWorld);assert(tip.distanceTo(new THREE.Vector3(.9,0,0))<1e-12);assert(end.distanceTo(new THREE.Vector3(.75,0,0))<1e-12);assert.deepEqual(travel.cone.scale.toArray(),[.08,.15,.08]);for(const o of[travel.line,travel.cone]){assert.equal(o.material.toneMapped,false);assert.equal(o.material.color.getHex(),0x2266ff);}assert.match(browser,/grid.position.y=-\.004/);assert.match(browser,/new THREE.Vector3\(0,\.025,0\)/);}finally{for(const o of[grid,travel.line,travel.cone]){o.geometry.dispose();o.material.dispose();}}});

test('namespace aliases, named imports and literal/dynamic member access cannot bypass the export gate',()=>{
 for(const source of ["import * as T from 'three';new T.GridHelper();","import {GridHelper as G} from 'three';new G();","THREE['GridHelper']"])assert.throws(()=>verifyThreeReferences({},[{name:'negative',source}]),/missing production/);
 assert.throws(()=>verifyThreeReferences(THREE,[{name:'dynamic',source:'THREE[name]'}]),/dynamic Three/);
 assert.throws(()=>verifyThreeReferences({Scene:()=>{}},[{name:'alias',source:"import {Scene as C} from 'three';new C()"}]),/not constructible/);
});

test('replacement guides preserve authored helper buffers, transforms and materials without shipping helpers',async()=>{
 const Full=await import(pathToFileURL(path.join(ROOT,'inkwave-public/vendor/three/build/three.module.js')).href);
 const oldGrid=new Full.GridHelper(4,16,0x52617a,0x8793a4),oldTravel=new Full.ArrowHelper(new Full.Vector3(1,0,0),new Full.Vector3(),.9,0x2266ff,.15,.08),{grid,travel}=await guides();
 try{
  for(const[a,b]of[[grid,oldGrid],[travel.line,oldTravel.line],[travel.cone,oldTravel.cone]]){
   assert.deepEqual(Object.keys(a.geometry.attributes).sort(),Object.keys(b.geometry.attributes).sort());
   for(const key of Object.keys(a.geometry.attributes)){const x=a.geometry.attributes[key],y=b.geometry.attributes[key];assert.equal(x.itemSize,y.itemSize);assert.deepEqual(Array.from(x.array),Array.from(y.array));}
   assert.deepEqual(a.geometry.index?Array.from(a.geometry.index.array):null,b.geometry.index?Array.from(b.geometry.index.array):null);
   for(let i=0;i<16;i++)assert(Math.abs(a.matrix.elements[i]-b.matrix.elements[i])<1e-12);
   for(const key of['toneMapped','vertexColors','opacity','transparent','depthTest','depthWrite'])assert.equal(a.material[key],b.material[key]);
   assert.equal(a.material.color.getHex(),b.material.color.getHex());
  }
  for(let i=0;i<4;i++)assert(Math.abs(travel.quaternion.toArray()[i]-oldTravel.quaternion.toArray()[i])<1e-12);
  const reduced={...THREE};delete reduced.GridHelper;delete reduced.ArrowHelper;
  for(const helper of['GridHelper','ArrowHelper'])assert.throws(()=>verifyThreeReferences(reduced,[{name:'original helper negative',source:'new THREE.'+helper+'()'}]),/missing production/);
 }finally{for(const o of[grid,travel.line,travel.cone,oldGrid,oldTravel.line,oldTravel.cone]){o.geometry.dispose();o.material.dispose();}}
});

test('all QA modules including the native launcher parse before CI invokes them',()=>{for(const name of fs.readdirSync(here).filter(name=>name.endsWith('.mjs')))assert.doesNotThrow(()=>new vm.SourceTextModule(fs.readFileSync(path.join(here,name),'utf8')),'parse '+name);});
