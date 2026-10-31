import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {loadNative} from './prop-retention-fixture.mjs';import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const {THREE,G,SRC}=await loadNative(true),{mergeGeometries}=await import('three/addons/utils/BufferGeometryUtils.js');
const {MAP_LAYOUTS}=await import(pathToFileURL(SRC+'src/world/maps.js')),{Level}=await import(pathToFileURL(SRC+'src/world/level.js'));
const previous=fs.readFileSync(new URL('./fixtures/added-assets/decor-before.mjs.txt',import.meta.url),'utf8'),current=fs.readFileSync(new URL('../../../inkwave-public/src/world/decor.js',import.meta.url),'utf8');
function documentRecorder(){const canvases=[];return{canvases,createElement(tag){assert.equal(tag,'canvas');const cv={width:0,height:0,ops:[]};cv.getContext=()=>new Proxy({}, {set(_t,k,v){cv.ops.push(['set:'+k,v]);return true;},get(_t,k){return(...args)=>{cv.ops.push([k,...args.map(a=>a?.ops?{canvasOps:a.ops.map(x=>structuredClone(x))}:a)]);};}});canvases.push(cv);return cv;}};}
function boot(source,{failAt=0}={}){const document=documentRecorder(),counts={},templates=[],namespace={...THREE};let constructors=0;const failure=Error('lamp template construction failed');for(const key of ['LatheGeometry','TorusGeometry','TubeGeometry','SphereGeometry','CylinderGeometry']){namespace[key]=class extends THREE[key]{constructor(...args){super(...args);counts[key]=(counts[key]||0)+1;if(++constructors===failAt)throw failure;this._testDisposals=0;this.addEventListener('dispose',()=>this._testDisposals++);templates.push(this);}};}
 const {Decor,emblemCanvas}=new Function('THREE','mergeGeometries','G','document',(source===previous?source:adaptBuildSource('src/world/decor.js',source)).replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return {Decor,emblemCanvas};')(namespace,mergeGeometries,G,document);
 return{Decor,emblemCanvas,document,counts,templates,failure};}
// Compare the ordered rendered triangle stream, not the storage strategy
// (the typed-index builder may legitimately select a different index width).
// Hashing expanded typed bytes keeps failures bounded instead of printing MBs.
function snapshot(group){return group.children.map(o=>{
 const g=o.geometry;g.computeBoundingBox();g.computeBoundingSphere();
 const idx=g.index?.array,count=idx?idx.length:g.attributes.position.count;
 const attr=Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>{
  const out=new a.array.constructor(count*a.itemSize);
  for(let i=0;i<count;i++)for(let j=0;j<a.itemSize;j++)out[i*a.itemSize+j]=a.array[(idx?idx[i]:i)*a.itemSize+j];
  return[name,{type:a.array.constructor.name,itemSize:a.itemSize,normalized:a.normalized,count,sha256:createHash('sha256').update(Buffer.from(out.buffer)).digest('hex')}];
 }));
 const m=o.material,solid=['MeshBasicMaterial','MeshStandardMaterial','MeshPhysicalMaterial'].includes(m.type)&&m.onBeforeCompile===THREE.Material.prototype.onBeforeCompile&&!Object.values(m).some(v=>v?.isTexture)&&!o.customDepthMaterial&&!o.customDistanceMaterial;
 const state={};for(const [key,value] of Object.entries(m)){if(['id','uuid','version'].includes(key))continue;if(value===null||['number','string','boolean'].includes(typeof value))state[key]=value;else if(value?.isColor||value?.isVector2||value?.isVector3||value?.isVector4)state[key]=value.toArray();else if(value?.isTexture)state[key]=Object.fromEntries(['type','format','colorSpace','channel','wrapS','wrapT','magFilter','minFilter','flipY','premultiplyAlpha','generateMipmaps','anisotropy'].map(k=>[k,value[k]]));}
 return{name:o.name,shadow:[o.castShadow,o.receiveShadow],order:o.renderOrder,drawRange:{...g.drawRange},groups:g.groups.map(x=>({...x})),material:{type:m.type,solid,state,shader:m.onBeforeCompile.toString(),program:m.customProgramCacheKey()},attributes:attr,box:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()],sphere:[g.boundingSphere.center.toArray(),g.boundingSphere.radius]};
});}
function sameTriangles(actual,expected,label){
 const a=Array.isArray(actual)?actual:snapshot(actual),b=Array.isArray(expected)?expected:snapshot(expected);assert.equal(a.length,b.length,label+' mesh count');
 for(let i=0;i<a.length;i++){
  // A UV difference can be irrelevant only when *both* owners are plain,
  // untextured built-in materials; mapped/custom buckets remain exact.
  if(a[i].material.solid&&b[i].material.solid){delete a[i].attributes.uv;delete b[i].attributes.uv;}
  assert.deepEqual(a[i],b[i],label+' '+a[i].name);
 }
}

function owner(api,layout){const level=new Level(layout),o=Object.create(api.Decor.prototype);Object.assign(o,{level,scene:new THREE.Scene(),group:new THREE.Group(),uTime:{value:0},pads:[],flags:[],barriers:[]});o.scene.add(o.group);return o;}
test('actual composed lamps and fronds retain ordered triangle attributes, winding, bounds, shader and shadow across all authored layouts',()=>{
 const metrics=[];
 for(const [id,layout] of Object.entries(MAP_LAYOUTS)){
  const a=boot(previous),b=boot(current),old=owner(a,layout),fresh=owner(b,layout);
  old._buildLamps();fresh._buildLamps();sameTriangles(fresh.group,old.group,id+' lamps');
  const before=Object.values(a.counts).reduce((x,y)=>x+y,0),after=Object.values(b.counts).reduce((x,y)=>x+y,0);if(layout.decor.lamps.length>2)assert(after<before,id+' tessellation');
  assert(b.templates.every(g=>g._testDisposals===1),id+' cached lamp templates retire before publication');
  old._buildPalms();fresh._buildPalms();sameTriangles(fresh.group,old.group,id+' palms');
  const palms=fresh.group.children.find(o=>o.name==='palms:fronds');if(palms){const v={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}},w={...v,uniforms:{}};palms.material.onBeforeCompile(v);old.group.children.find(o=>o.name==='palms:fronds').material.onBeforeCompile(w);assert.equal(v.vertexShader,w.vertexShader);assert.equal(palms.geometry.attributes.position.count,1992*layout.decor.palms.length*2);}
  metrics.push({id,lamps:layout.decor.lamps.length*2,primitiveConstructorsBefore:before,primitiveConstructorsAfter:after});old.dispose();fresh.dispose();old.dispose();fresh.dispose();assert.equal(old.group.children.length,0);assert.equal(fresh.group.children.length,0);
 }
 console.log('DECOR_TEMPLATE_METRICS '+JSON.stringify(metrics));
});
test('flag reuses the exact emblem Canvas drawing while texture owners remain distinct and disposal is once',()=>{
 const runs=[previous,current].map(s=>{const api=boot(s),o=owner(api,MAP_LAYOUTS.halyard);o.emblem=new THREE.CanvasTexture(api.emblemCanvas(256,true));o._buildFlags();let emblem=0,flag=0;o.emblem.addEventListener('dispose',()=>emblem++);o.flagTex.addEventListener('dispose',()=>flag++);assert.notEqual(o.flagTex,o.emblem);const output={canvasCount:api.document.canvases.length,emblem:o.emblem.image.ops,flag:o.flagTex.image.ops,geometry:snapshot(o.group)};o.dispose();o.dispose();assert.equal(emblem,1);assert.equal(flag,1);return output;});
 assert.equal(runs[0].canvasCount,3);assert.equal(runs[1].canvasCount,2);assert.deepEqual(runs[1].emblem,runs[0].emblem);assert.deepEqual(runs[1].flag,runs[0].flag);sameTriangles(runs[1].geometry,runs[0].geometry,'flags');
});

test('failed lamp template construction retires all previous private templates without publishing a partial mesh',()=>{
 const api=boot(current,{failAt:7}),o=owner(api,MAP_LAYOUTS.halyard);assert.throws(()=>o._buildLamps(),error=>error===api.failure);assert(api.templates.length>0);assert(api.templates.every(g=>g._testDisposals===1));assert.equal(o.group.children.length,0);o.dispose();assert(api.templates.every(g=>g._testDisposals===1));
});

test('triangle comparison detects position, winding, normal and mapped/custom UV changes, but permits unused solid UV',()=>{
 function make(kind='mapped'){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));g.setIndex([0,1,2]);const group=new THREE.Group(),m=new THREE.MeshBasicMaterial(kind==='mapped'?{map:new THREE.Texture()}:{});if(kind==='custom')m.onBeforeCompile=()=>{};group.add(new THREE.Mesh(g,m));return group;}
 const original=make();for(const mutate of [g=>g.index.array.set([0,2,1]),g=>{g.attributes.position.array[0]=.5;},g=>{g.attributes.normal.array[2]=-1;},g=>{g.attributes.uv.array[0]=.5;}]){const altered=make();mutate(altered.children[0].geometry);assert.throws(()=>sameTriangles(altered,original,'negative'));}
 const custom=make('custom'),customChanged=make('custom');customChanged.children[0].geometry.attributes.uv.array[0]=.5;assert.throws(()=>sameTriangles(customChanged,custom,'custom UV'));
 const solid=make('solid'),solidChanged=make('solid');solidChanged.children[0].geometry.attributes.uv.array[0]=.5;assert.doesNotThrow(()=>sameTriangles(solidChanged,solid,'unused solid UV'));
});
