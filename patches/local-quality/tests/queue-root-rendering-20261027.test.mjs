import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {setTrackedInstanceColor,uploadTrackedInstanceColors,markAttributeRange} from '../../splatoon3/runtime/instance-color-upload.mjs';
import {waitForFontBudget,repaintAfterFonts} from '../../../inkwave-public/src/core/font-ready-budget.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
const rgb=(r,g,b)=>new THREE.Color().setRGB(r,g,b);
const ranges=a=>a.updateRanges.map(({start,count})=>({start,count}));
test('instance color dirty ranges survive unrendered frames, unchanged values and renderer consumption',()=>{
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),8);
 try {
  setTrackedInstanceColor(mesh,5,rgb(.1,.2,.3));assert(uploadTrackedInstanceColors(mesh));const attr=mesh.instanceColor,v=attr.version;
  assert.deepEqual(ranges(attr),[{start:15,count:3}]);
  setTrackedInstanceColor(mesh,5,rgb(.1,.2,.3));assert.equal(uploadTrackedInstanceColors(mesh),false);assert.equal(attr.version,v);assert.deepEqual(ranges(attr),[{start:15,count:3}]);
  setTrackedInstanceColor(mesh,1,rgb(.4,.5,.6));assert(uploadTrackedInstanceColors(mesh));assert.deepEqual(ranges(attr),[{start:3,count:15}],'new low range retains unrendered high slot');
  attr.clearUpdateRanges(); // Three.WebGLAttributes consumes ranges on GPU upload.
  const previous=attr.version;setTrackedInstanceColor(mesh,1,rgb(.4,.5,.6));assert(!uploadTrackedInstanceColors(mesh));assert.equal(attr.version,previous);assert.deepEqual(ranges(attr),[]);
  setTrackedInstanceColor(mesh,7,rgb(.7,.8,.9));uploadTrackedInstanceColors(mesh);assert.deepEqual(ranges(attr),[{start:21,count:3}]);
 } finally {mesh.geometry.dispose();mesh.material.dispose();}
});
test('generic static attribute range keeps pending spans and full-upload sentinel',()=>{
 const attr=new THREE.BufferAttribute(new Float32Array(48),4);
 markAttributeRange(attr,28,32);const v=attr.version;assert(!markAttributeRange(attr,Infinity,0));assert.equal(attr.version,v);assert.deepEqual(ranges(attr),[{start:28,count:4}]);
 markAttributeRange(attr,4,8);assert.deepEqual(ranges(attr),[{start:4,count:28}]);attr.addUpdateRange(0,-1);markAttributeRange(attr,12,16);assert.deepEqual(ranges(attr),[{start:0,count:48}]);
 attr.clearUpdateRanges();markAttributeRange(attr,20,24);assert.deepEqual(ranges(attr),[{start:20,count:4}]);
});
test('font budget returns on timeout then repaints exactly once when late fonts finish',async()=>{
 let finish;const load=new Promise(r=>finish=r);const result=await waitForFontBudget(()=>load,0);assert.equal(result.settled,false);
 const state={repaint(){calls++;assert.equal(state.repaint,null,'owner retired before callback');}};let calls=0;
 const task=repaintAfterFonts(result.ready,state);assert.equal(calls,0);finish();await task;assert.equal(calls,1);await repaintAfterFonts(result.ready,state);assert.equal(calls,1);
});
test('font success/failure and disposal keep optional repaint ownership bounded',async()=>{
 const fast=await waitForFontBudget(()=>Promise.resolve(),1000);assert(fast.settled);assert.equal(await fast.ready,true);
 const failed=await waitForFontBudget(()=>{throw Error('font load failure');},1000);assert(failed.settled);assert.equal(await failed.ready,false);
 let calls=0;const state={repaint(){calls++;}};await repaintAfterFonts(failed.ready,state);assert.equal(state.repaint,null);assert.equal(calls,0);
 let finish;const pending=await waitForFontBudget(()=>new Promise(r=>finish=r),0);const disposed={repaint(){calls++;}};const task=repaintAfterFonts(pending.ready,disposed);disposed.repaint=null;finish();await task;assert.equal(calls,0);
});
test('late font repaint exception resolves and warns once after retiring owner',async()=>{
 const warnings=[],warn=console.warn,state={repaint(){throw Error('x'.repeat(600));}};console.warn=(...args)=>warnings.push(args);
 try {await assert.doesNotReject(repaintAfterFonts(Promise.resolve(true),state));assert.equal(state.repaint,null);assert.equal(warnings.length,1);assert.equal(warnings[0][0],'[inkwave] late font repaint failed:');assert.equal(warnings[0][1].length,240);await repaintAfterFonts(Promise.resolve(true),state);assert.equal(warnings.length,1);}finally{console.warn=warn;}
});
function cargoGB(source){const begin=source.indexOf('  class GB {'),end=source.indexOf('  const TPL',begin);assert(begin>=0&&end>begin);return new Function('THREE',source.slice(begin,end)+'\nreturn GB;')(THREE);}
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
test('Cargo template geometry retains position/normal/index and lazy mixed-color prefix',()=>{
 const rel='src/world/stages/cargo/props.js',raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');const Old=cargoGB(raw),Now=cargoGB(adaptBuildSource(rel,raw));
 for(const mixed of [false,true]){
  const builders=[new Old(),new Now()];for(const b of builders){b.v(0,0,0,0,1,0);b.v(1,0,0,0,1,0);if(mixed)b.v(0,0,1,0,1,0,.4,.6,.8);else b.v(0,0,1,0,1,0);b.v(1,0,1,0,1,0);b.quad(0,1,3,2);}
  const [a,b]=builders.map(x=>x.geo());try{
   for(const key of ['position','normal'])assert.deepEqual(bytes(a.attributes[key].array),bytes(b.attributes[key].array));assert.deepEqual(bytes(a.index.array),bytes(b.index.array));assert.equal(b.attributes.uv,undefined);assert(a.attributes.uv.array.every(x=>x===0));
   if(mixed)assert.deepEqual(bytes(a.attributes.color.array),bytes(b.attributes.color.array));else{assert.equal(b.attributes.color,undefined);assert(a.attributes.color.array.every(x=>x===1));}
  }finally{a.dispose();b.dispose();}
 }
});
test('Cargo omitted template constants merge to identical final painted attributes, UV mappings and mirrored indices',()=>{
 const rel='src/world/stages/cargo/props.js',raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');const classes=[cargoGB(raw),cargoGB(adaptBuildSource(rel,raw))];
 const mergeRel='src/world/props-core.js',source=adaptBuildSource(mergeRel,fs.readFileSync(new URL('../../../inkwave-public/'+mergeRel,import.meta.url),'utf8'));const start=source.indexOf('function mergeParts('),end=source.indexOf('const triCountOf',start);assert(start>=0&&end>start);
 const merge=new Function('THREE','_v','WHITE_UV',source.slice(start,end)+'\nreturn mergeParts;')(THREE,new THREE.Vector3(),[.125,.875]);
 for(const mixed of [false,true])for(const mirror of [1,-1])for(const mapping of [{},{uv:[.1,.2,.7,.9]},{uvs:[2,3]}]){
  const templates=classes.map(C=>{const b=new C();b.v(0,0,0,0,1,0);b.v(1,0,0,0,1,0);if(mixed)b.v(0,0,1,0,1,0,.4,.6,.8);else b.v(0,0,1,0,1,0);b.tri(0,1,2);return b.geo();});
  const outputs=templates.map(g=>merge([{g,m:new THREE.Matrix4().compose(new THREE.Vector3(2,.15,-3),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.7),new THREE.Vector3(mirror,2,.4)),c:rgb(.34,.78,.23),ao:0,...mapping}]));
  try{const[a,b]=outputs;assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));for(const k of Object.keys(a.attributes))assert.deepEqual(bytes(a.attributes[k].array),bytes(b.attributes[k].array),k);assert.deepEqual(bytes(a.index.array),bytes(b.index.array));assert.deepEqual(a.boundingBox,b.boundingBox);assert.deepEqual(a.boundingSphere,b.boundingSphere);}finally{[...templates,...outputs].forEach(g=>g.dispose());}
 }
});

// Execute the composed ring owner itself. Main publishes both static streams
// when dirty; the transfer optimization publishes only dirty ranges. Both
// must keep steady rings quiet and publish new values for each stream.
function assertRingStaticContract(code) {
  const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
  const functions=new Set(['makeQuadGeo','markUpdated','markFxStaticRange','clearFxUploadRanges']);
  const constants=new Set(['UP','easeOut','R_WAVE','GLSL_HASH','OUT_CHUNKS','RING_VERT','RING_FRAG']);
  const methods=new Set(['_initRings','_ringRaw','mark','_updateRings']);
  let prefix='',body='';
  for(let node of ast.body){node=node.declaration||node;
    if(node.type==='FunctionDeclaration'&&functions.has(node.id.name))prefix+=code.slice(node.start,node.end)+'\n';
    if(node.type==='VariableDeclaration'&&node.declarations.some(d=>constants.has(d.id.name)))prefix+=code.slice(node.start,node.end)+'\n';
    if(node.type==='ClassDeclaration'&&node.id.name==='FX')for(const method of node.body.body)if(methods.has(method.key.name))body+=code.slice(method.start,method.end)+'\n';
  }
  const {Ring,markUpdated}=new Function('THREE','rand',prefix+`\nreturn {markUpdated,Ring:class {
    constructor(){this.root=new THREE.Group();this._colB=new THREE.Color();this._initRings(8);}
    _color(c){return c;}
    ${body}
  }};`)(THREE,()=>.5);
  const probe=new THREE.BufferGeometry(),a=new THREE.BufferAttribute(new Float32Array(4),4),b=new THREE.BufferAttribute(new Float32Array(4),4),dynamic=new THREE.BufferAttribute(new Float32Array(4),4);
  probe.userData.dyn=[a,b,dynamic];markUpdated(probe,1,a,b);
  assert.equal(a.version,0,'first explicit static slot must be skipped');assert.equal(b.version,0,'second explicit static slot must be skipped');assert.equal(dynamic.version,1);
  const fx=new Ring(),attrs=fx.rings.geo.attributes;
  const consume=()=>{for(const attr of Object.values(attrs)){attr.clearUpdateRanges();attr.onUploadCallback();}};
  const versions=()=>[attrs.aColA.version,attrs.aMisc.version];
  const birth=(color,style)=>fx._ringRaw(new THREE.Vector3(1,2,3),new THREE.Vector3(0,1,0),color,1,10,style,.7,.8,.1,0,.2);
  const changed=(before,after)=>{assert(after[0]>before[0],'color birth must upload');assert(after[1]>before[1],'style birth must upload');};
  birth(new THREE.Color(.2,.4,.7),1);let before=versions();fx._updateRings(0);changed(before,versions());
  assert.deepEqual(Array.from(attrs.aColA.array.slice(0,3)),Array.from(fx.rings.C.slice(0,3)));
  assert.equal(attrs.aMisc.array[0],fx.rings.X[6]);consume();before=versions();fx._updateRings(1/60);assert.deepEqual(versions(),before,'steady rings must not upload either static stream');
  birth(new THREE.Color(.8,.3,.1),2);before=versions();fx._updateRings(0);changed(before,versions());
  assert.deepEqual(Array.from(attrs.aColA.array.slice(4,7)),Array.from(fx.rings.C.slice(3,6)));assert.equal(attrs.aMisc.array[4],fx.rings.X[14]);
  fx.rings.geo.dispose();fx.rings.mesh.material.dispose();probe.dispose();
}

test('GPU-22 retains the two ring static slots and shell-only dirty uploads in composed FX', () => {
  const rel = 'src/fx/fx.js';
  const source = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
  const output = adaptBuildSource(rel, source);
  assert.match(output, /function markUpdated\(geo, count, staticAttribute = null, staticAttribute2 = null\)/);
  assert.match(output, /if \(a === staticAttribute \|\| a === staticAttribute2 \|\| a\._fxStatic\) continue;/);
  assertRingStaticContract(output);
  assert.match(output, /geo\.attributes\.aColA\._fxStatic = true; geo\.attributes\.aAxis\._fxStatic = true;/);
  assert.match(output, /const sStart = S\.dirtyStart, sEnd = Math\.min\(S\.dirtyEnd, S\.n\);/);
  assert.doesNotMatch(output, /S\.axisDirty/);
});

test('GPU-22 behavioral guard rejects missing dirty publication and a lost second static slot',()=>{
  const rel='src/fx/fx.js',raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'),output=adaptBuildSource(rel,raw);
  const skip='if (a === staticAttribute || a === staticAttribute2 || a._fxStatic) continue;';
  assert.equal(output.split(skip).length,2);assert.throws(()=>assertRingStaticContract(output.replace(skip,'if (a === staticAttribute || a._fxStatic) continue;')),/second explicit static slot/);
  const optimized=output.includes('markFxStaticRange(R.geo.attributes.aColA,');
  for(const [name,label] of [['aColA','color'],['aMisc','style']]){
    const anchor=optimized?`    markFxStaticRange(R.geo.attributes.${name}, first * 4, last * 4, n * 4);`:`R.staticDirty ? null : R.geo.attributes.${name}`;
    assert.equal(output.split(anchor).length,2,'known '+name+' publication owner');
    const broken=output.replace(anchor,optimized?'    /* deliberately drop publication */':`R.geo.attributes.${name}`);
    assert.throws(()=>assertRingStaticContract(broken),new RegExp(label+' birth must upload'));
  }
  const dirty=optimized?'i >= R.dirtyStart && i < R.dirtyEnd':'R.staticDirty = true;\n    let i;';
  assert.equal(output.split(dirty).length,2,'known birth dirty owner');
  assert.throws(()=>assertRingStaticContract(output.replace(dirty,optimized?'false':'R.staticDirty = false;\n    let i;')),optimized?/Expected values to be strictly deep-equal/:/color birth must upload/);
});

test('GPU-08b composes one wake-point pool with the active wake slot uniform', () => {
  const rel = 'src/fx/swimWake.js';
  const source = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
  const output = adaptBuildSource(rel, source);
  assert.match(output, /function recycleWakePoints\(slot\)/);
  assert.match(output, /actor: null, pts: \[\], pool: \[\], k: 0/);
  assert.match(output, /function pushWakePoint\(slot, x, y, z, t\)/);
  assert.match(output, /U\.uWakeCount\.value = activeWakeSlots;/);
  assert.doesNotMatch(output, /actor: null, pts: \[\], free: \[\]/);
});
