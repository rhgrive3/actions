import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {loadNative} from './prop-retention-fixture.mjs';import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const {THREE,G,SRC}=await loadNative(true),{mergeGeometries}=await import('three/addons/utils/BufferGeometryUtils.js');
const {MAP_LAYOUTS}=await import(pathToFileURL(SRC+'src/world/maps.js')),{Level}=await import(pathToFileURL(SRC+'src/world/level.js'));
const previous=fs.readFileSync(new URL('./fixtures/added-assets/decor-before.mjs.txt',import.meta.url),'utf8'),current=fs.readFileSync(new URL('../../../inkwave-public/src/world/decor.js',import.meta.url),'utf8');
function documentRecorder(){const canvases=[];return{canvases,createElement(tag){assert.equal(tag,'canvas');const cv={width:0,height:0,ops:[]};cv.getContext=()=>new Proxy({}, {set(_t,k,v){cv.ops.push(['set:'+k,v]);return true;},get(_t,k){return(...args)=>{cv.ops.push([k,...args.map(a=>a?.ops?{canvasOps:a.ops.map(x=>structuredClone(x))}:a)]);};}});canvases.push(cv);return cv;}};}
function boot(source,{failAt=0}={}){const document=documentRecorder(),counts={},templates=[],namespace={...THREE};let constructors=0;const failure=Error('lamp template construction failed');for(const key of ['LatheGeometry','TorusGeometry','TubeGeometry','SphereGeometry','CylinderGeometry']){namespace[key]=class extends THREE[key]{constructor(...args){super(...args);counts[key]=(counts[key]||0)+1;if(++constructors===failAt)throw failure;this._testDisposals=0;this.addEventListener('dispose',()=>this._testDisposals++);templates.push(this);}};}
 const {Decor,emblemCanvas}=new Function('THREE','mergeGeometries','G','document',adaptBuildSource('src/world/decor.js',source).replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return {Decor,emblemCanvas};')(namespace,mergeGeometries,G,document);
 return{Decor,emblemCanvas,document,counts,templates,failure};}
const snapshot=group=>group.children.map(o=>{o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();return{name:o.name,shadow:[o.castShadow,o.receiveShadow],order:o.renderOrder,index:o.geometry.index?Buffer.from(o.geometry.index.array.buffer):null,attributes:Object.fromEntries(Object.entries(o.geometry.attributes).filter(([k])=>k!=='uv'||o.name==='flags:cloth').map(([k,v])=>[k,{type:v.array.constructor.name,bytes:Buffer.from(v.array.buffer)}])),box:[o.geometry.boundingBox.min.toArray(),o.geometry.boundingBox.max.toArray()],sphere:[o.geometry.boundingSphere.center.toArray(),o.geometry.boundingSphere.radius]};});
function owner(api,layout){const level=new Level(layout),o=Object.create(api.Decor.prototype);Object.assign(o,{level,scene:new THREE.Scene(),group:new THREE.Group(),uTime:{value:0},pads:[],flags:[],barriers:[]});o.scene.add(o.group);return o;}
test('actual composed lamps and fronds retain every final byte, winding, bounds, shader and shadow across all authored layouts',()=>{
 const metrics=[];
 for(const [id,layout] of Object.entries(MAP_LAYOUTS)){
  const a=boot(previous),b=boot(current),old=owner(a,layout),fresh=owner(b,layout);
  old._buildLamps();fresh._buildLamps();assert.deepEqual(snapshot(fresh.group),snapshot(old.group),id+' lamps');
  const before=Object.values(a.counts).reduce((x,y)=>x+y,0),after=Object.values(b.counts).reduce((x,y)=>x+y,0);if(layout.decor.lamps.length>2)assert(after<before,id+' tessellation');
  assert(b.templates.every(g=>g._testDisposals===1),id+' cached lamp templates retire before publication');
  old._buildPalms();fresh._buildPalms();assert.deepEqual(snapshot(fresh.group),snapshot(old.group),id+' palms');
  const palms=fresh.group.children.find(o=>o.name==='palms:fronds');if(palms){const v={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}},w={...v,uniforms:{}};palms.material.onBeforeCompile(v);old.group.children.find(o=>o.name==='palms:fronds').material.onBeforeCompile(w);assert.equal(v.vertexShader,w.vertexShader);assert.equal(palms.geometry.attributes.position.count,1992*layout.decor.palms.length*2);}
  metrics.push({id,lamps:layout.decor.lamps.length*2,primitiveConstructorsBefore:before,primitiveConstructorsAfter:after});old.dispose();fresh.dispose();old.dispose();fresh.dispose();assert.equal(old.group.children.length,0);assert.equal(fresh.group.children.length,0);
 }
 console.log('DECOR_TEMPLATE_METRICS '+JSON.stringify(metrics));
});
test('flag reuses the exact emblem Canvas drawing while texture owners remain distinct and disposal is once',()=>{
 const runs=[previous,current].map(s=>{const api=boot(s),o=owner(api,MAP_LAYOUTS.tidewater);o.emblem=new THREE.CanvasTexture(api.emblemCanvas(256,true));o._buildFlags();let emblem=0,flag=0;o.emblem.addEventListener('dispose',()=>emblem++);o.flagTex.addEventListener('dispose',()=>flag++);assert.notEqual(o.flagTex,o.emblem);const output={canvasCount:api.document.canvases.length,emblem:o.emblem.image.ops,flag:o.flagTex.image.ops,geometry:snapshot(o.group)};o.dispose();o.dispose();assert.equal(emblem,1);assert.equal(flag,1);return output;});
 assert.equal(runs[0].canvasCount,3);assert.equal(runs[1].canvasCount,2);assert.deepEqual(runs[1].emblem,runs[0].emblem);assert.deepEqual(runs[1].flag,runs[0].flag);assert.deepEqual(runs[1].geometry,runs[0].geometry);
});

test('failed lamp template construction retires all previous private templates without publishing a partial mesh',()=>{
 const api=boot(current,{failAt:7}),o=owner(api,MAP_LAYOUTS.tidewater);assert.throws(()=>o._buildLamps(),error=>error===api.failure);assert(api.templates.length>0);assert(api.templates.every(g=>g._testDisposals===1));assert.equal(o.group.children.length,0);o.dispose();assert(api.templates.every(g=>g._testDisposals===1));
});
