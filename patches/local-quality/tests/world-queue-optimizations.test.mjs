import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {geometryFixture} from './geometry-build-fixture.mjs';
import {Float32Staging} from '../../../inkwave-public/src/world/attribute-staging.js';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/world-queue/baseline.json',import.meta.url),'utf8'));
const read=file=>fs.readFileSync(new URL('../../../inkwave-public/src/'+file,import.meta.url),'utf8');
function replaceDeclaration(source,klass,key,replacement){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 for(const item of ast.body){const n=item.declaration||item;
  if(klass&&n.type==='ClassDeclaration'&&n.id.name===klass){if(key===null)return source.slice(0,n.start)+replacement+source.slice(n.end);const m=n.body.body.find(m=>m.key.name===key);return source.slice(0,m.start)+replacement+source.slice(m.end);}
  if(!klass&&n.type==='FunctionDeclaration'&&n.id.name===key)return source.slice(0,n.start)+replacement+source.slice(n.end);
 }
 throw Error('missing declaration '+key);
}
const plain=s=>s.replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const values=a=>Array.from(a.array);
function same(a,b,except=[]){
 assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes));
 for(const name of Object.keys(a.attributes))if(!except.includes(name)){assert.equal(a.attributes[name].itemSize,b.attributes[name].itemSize,name);assert.deepEqual(values(a.attributes[name]),values(b.attributes[name]),name);}
 if(a.index)assert.deepEqual(values(a.index),values(b.index));else assert.equal(b.index,null);
 a.computeBoundingSphere();b.computeBoundingSphere();assert.deepEqual(JSON.stringify(a.boundingSphere),JSON.stringify(b.boundingSphere));
}

test('actual legacy geometry preserves every attribute and triangle after signed flag packing',async()=>{
 const old=await geometryFixture({transform(rel,s){return rel==='src/world/level.js'?replaceDeclaration(s,'Level','buildGeometry',baseline['world/level.js'].buildGeometry):s;}}),now=await geometryFixture();
 let saved=0;
 for(const id of ['tidewater','kelpline','halyard','cargo','range']){
  const levels=[new old.Level(old.MAP_LAYOUTS[id]),new now.Level(now.MAP_LAYOUTS[id])];
  for(const level of levels){level.lightSize=1024;for(const [i,f] of level.faces.entries()){f.atlas=i%3?{x:i%20,y:i%11,pad:2,ppm:3.7}:null;f.light={x:i%17,y:i%13,pad:1,ppm:2.3};}}
  for(const grate of [false,true]){
   const [a,b]=levels.map(l=>l.buildGeometry(2048,block=>block.grate===grate));same(a,b);
   const x=a.attributes.faceData,y=b.attributes.faceData;assert.equal(x.itemSize,4);assert.equal(y.itemSize,4);
   for(let i=0;i<x.count;i++)assert.deepEqual([x.getX(i),x.getY(i),x.getZ(i),x.getW(i)],[y.getX(i),y.getY(i),y.getZ(i),y.getW(i)]);
   assert.equal(b.attributes.faceFlags.array.constructor.name,'Int8Array');assert.equal(b.attributes.faceFlags.normalized,false);
   saved+=a.attributes.faceData.array.byteLength+a.attributes.faceFlags.array.byteLength-b.attributes.faceData.array.byteLength-b.attributes.faceFlags.array.byteLength;a.dispose();b.dispose();
  }
 }
 // Noninteger/out-of-range authoring must retain Float32 values, including NaN.
 for(const mural of [128,-129,.25,NaN]){const l=new now.Level(now.MAP_LAYOUTS.tidewater);l.faces[0].mural=mural;const g=l.buildGeometry(1024);assert.equal(g.attributes.faceFlags.array.constructor.name,'Float32Array');assert(values(g.attributes.faceFlags).some(v=>Object.is(v,Math.fround(mural))));g.dispose();}
 console.log('WORLD_PACKED_ATTRIBUTE_BYTES_SAVED '+saved);
});

test('PropKit retains exact topology/attributes across radial strips, degenerate profiles and varying tube radii',async()=>{
 const {THREE}=await geometryFixture();const raw=read('world/props-core.js');
 const prefix=raw.slice(raw.indexOf('class GB {'),raw.indexOf('// Extrude a closed'));
 const old=Object.values(baseline['world/props-core.js']).join('\n');
 const make=s=>new Function('THREE','Float32Staging','TAU','HP',s+'\nreturn {GB,chamferBox,roundBox,latheGeo,tubeGeo};')(THREE,Float32Staging,Math.PI*2,Math.PI/2);
 const [a,b]=[make(old),make(prefix)];
 for(const seg of [3,8,16,31])for(const closed of [false,true]){
  const profile=[[0,-1],[1,-1],[1,0],null,[1,0],[.2,2],[0,2]];
  const x=a.latheGeo(profile,seg,closed),y=b.latheGeo(profile,seg,closed);same(x,y);x.dispose();y.dispose();
  const pts=[[0,0,0],[.1,1,.2],[1,2,0],[1.5,2,-.3]];
  for(const radius of [.1,t=>.1+t*.07]){const x=a.tubeGeo(pts,radius,seg,closed),y=b.tubeGeo(pts,radius,seg,closed);same(x,y);x.dispose();y.dispose();}
 }
 for(const dims of [[1,2,3,.1],[1e-5,.02,.03,.001],[10000,.001,2,.1]])for(const kind of ['chamferBox','roundBox']){const x=a[kind](...dims),y=b[kind](...dims);same(x,y);x.dispose();y.dispose();}
 const g=new b.GB();for(let i=0;i<1000;i++)g.v(i*.1,0,-i*.2,0,1,0,i/999,0,.4);assert.equal(g.geo().attributes.uv.count,1000);assert(g.p instanceof Array);assert(g.n instanceof Array,'CPU topology keeps doubles');
});

test('sea polar mesh keeps positions/index and exact constant normals while using signed bytes',async()=>{
 const old=await geometryFixture({transform(rel,s){return rel==='src/world/environment.js'?replaceDeclaration(s,'Environment','_buildSea',baseline['world/environment.js']._buildSea):s;}}),now=await geometryFixture();
 const owners=[old,now].map(f=>{const e=Object.create(f.Environment.prototype);e.U={uWaveTex:{value:null}};e.root=new f.THREE.Group();e._buildSea();return e;});
 same(owners[0].sea.geometry,owners[1].sea.geometry);assert.equal(owners[1].sea.geometry.attributes.normal.array.constructor.name,'Int8Array');assert.equal(owners[1].sea.geometry.attributes.normal.normalized,false);assert.equal(owners[1].sea.geometry.attributes.position.count,9345);
 for(const e of owners){e.sea.geometry.dispose();e.seaMat.dispose();e.U.uWaveTex.value.dispose();}
});

test('far containers preserve seeded transforms, colors, instance shader and reflection ownership',async()=>{
 const authored=[];
 const old=await geometryFixture({globals:{__authoredContainers:authored},transform(rel,s){if(rel!=='src/world/environment.js')return s;s=replaceDeclaration(s,'Environment','_buildScenery',baseline['world/environment.js']._buildScenery);return s.replace("const box = (w, h, d, hex, glow) => prep(new THREE.BoxGeometry(w, h, d), hex, glow);","const box = (w, h, d, hex, glow) => { const g = prep(new THREE.BoxGeometry(w, h, d), hex, glow); if (w === 12.2 && h === 2.6 && d === 2.45) globalThis.__authoredContainers.push(g); return g; };");}}),now=await geometryFixture();
 const owners=[old,now].map(f=>{const e=Object.create(f.Environment.prototype);e.U={uNight:{value:0}};e.root=new f.THREE.Group();e._buildScenery();return e;});
 const [a,b]=owners,mesh=b.staticScenery.children.find(m=>m.name==='FarScenery:containers');assert(mesh?.isInstancedMesh);assert.equal(mesh.count,145);assert.equal(mesh.parent,b.staticScenery);assert.equal(mesh.frustumCulled,false);assert.equal(mesh.material,b.staticScenery.material);
 assert.equal(authored.length,145);
 const matrix=new now.THREE.Matrix4(),point=new now.THREE.Vector3(),color=new now.THREE.Color();let maxPositionDifference=0;
 for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);mesh.getColorAt(i,color);const expected=authored[i].attributes,actual=mesh.geometry.attributes;for(let j=0;j<actual.position.count;j++){point.fromBufferAttribute(actual.position,j).applyMatrix4(matrix);for(const [k,v] of ['x','y','z'].map((axis,k)=>[k,point[axis]])){const delta=Math.abs(v-expected.position.array[j*3+k]);maxPositionDifference=Math.max(maxPositionDifference,delta);assert(delta<0.0001);}}assert.deepEqual([color.r,color.g,color.b],Array.from(expected.color.array.subarray(0,3)));}
 console.log('FAR_CONTAINER_MAX_POSITION_DIFFERENCE '+maxPositionDifference);
 for(const name of ['terrain','city','trees']){same(a[name].geometry,b[name].geometry);if(a[name].instanceMatrix)assert.deepEqual(values(a[name].instanceMatrix),values(b[name].instanceMatrix));if(a[name].instanceColor)assert.deepEqual(values(a[name].instanceColor),values(b[name].instanceColor));}
 // The merged backdrop loses exactly 36 corners for each original box.
 assert.equal(a.staticScenery.geometry.attributes.position.count-b.staticScenery.geometry.attributes.position.count,145*36);
 const shader={uniforms:{},vertexShader:now.THREE.ShaderLib.standard.vertexShader,fragmentShader:now.THREE.ShaderLib.standard.fragmentShader};mesh.material.onBeforeCompile(shader);assert.match(shader.vertexShader,/instanceMatrix \* hzW/);assert.match(shader.vertexShader,/#include <color_vertex>/);
 a.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});b.root.traverse(o=>{o.dispose?.();o.geometry?.dispose();o.material?.dispose();});
});

test('legacy navigation retains exact nodes, edge costs, tie order and paths for multiple grid steps',async()=>{
 const {THREE,Level}=await geometryFixture();const raw=read('game/nav.js');
 const current=new Function('THREE','PLAYER','buildNativeNav',plain(raw)+'\nreturn NavGraph;')(THREE,{radius:.3},()=>{});
 const oldSource=replaceDeclaration(raw,'NavGraph',null,baseline['game/nav.js'].NavGraph);
 const old=new Function('THREE','PLAYER','buildNativeNav',plain(oldSource)+'\nreturn NavGraph;')(THREE,{radius:.3},()=>{});
 const layouts=[{single:[{kind:'box',min:[-4,-1,-4],max:[4,0,4]}]},{single:[{kind:'box',min:[-4,-1,-4],max:[4,0,4]},{kind:'box',min:[0,0,0],max:[3,1,3]}]},{single:[{kind:'box',min:[-4,-1,-4],max:[4,0,4]},{kind:'obox',center:[0,1,0],size:[1,2,5],rotY:37}]}];
 for(const layout of layouts)for(const step of [.7,1,1.3]){
  const level=new Level({...layout,id:'fixture',half:[],bounds:{minX:-4,maxX:4,minZ:-4,maxZ:4},spawnPads:[[-3,0,-3],[3,0,3]],spawnBarrier:0,decor:{lamps:[],palms:[],flags:[]}}),graphs=[old,current].map(C=>{const n=new C(level,{}, {deferBuild:true});n.step=step;n._build();return n;});
  const snapshot=n=>JSON.stringify({nodes:n.nodes,cells:n.cells,valid:[...n.valid],validIds:n.validIds});assert.equal(snapshot(graphs[0]),snapshot(graphs[1]));
  for(let i=0;i<graphs[0].nodes.length;i+=Math.max(1,Math.floor(graphs[0].nodes.length/10))){const end=graphs[0].nodes.length-1-i;assert.equal(JSON.stringify(graphs[0].path(i,end)),JSON.stringify(graphs[1].path(i,end)));}
 }
});

test('far material splits allocate exactly one final index and preserve corner attributes',async()=>{
 const {THREE}=await geometryFixture();const source=read('game/character-lod.js');
 const before=replaceDeclaration(source,null,'clusterDecimate',baseline['game/character-lod.js'].clusterDecimate);
 const make=s=>new Function('THREE',plain(s)+'\nreturn {clusterDecimate};')(THREE);
 const [a,b]=[make(before),make(source)];
 for(const weapon of [false,true])for(const distinct of [false,true]){
  const geo=new THREE.BufferGeometry(),p=[],n=[],color=[],mat=[];
  for(let i=0;i<300;i++){const t=i%3;p.push((i%30)*.001+Math.floor(i/30),t===2?.2:0,t===1?.2:0);n.push(0,1,0);mat.push(distinct?i%5:0);color.push(distinct?i%7/7:.5,.2,.8);}
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));if(weapon){geo.setAttribute('color',new THREE.Float32BufferAttribute(color,3));geo.setAttribute('aMat',new THREE.Float32BufferAttribute(mat,1));}
  const originalSetIndex=THREE.BufferGeometry.prototype.setIndex;let allocations=0;THREE.BufferGeometry.prototype.setIndex=function(index){allocations++;return originalSetIndex.call(this,index);};let x,y;try{x=a.clusterDecimate(geo,.1);allocations=0;y=b.clusterDecimate(geo,.1);assert.equal(allocations,1);}finally{THREE.BufferGeometry.prototype.setIndex=originalSetIndex;}same(x,y);assert.equal(x.index.array.constructor.name,y.index.array.constructor.name);x.dispose();y.dispose();geo.dispose();
 }
});

test('Decor transfers sole texture ownership across committed stages and releases unused/final textures once',async()=>{
 const {loadNative}=await import('./prop-retention-fixture.mjs');const {THREE,G,SRC}=await loadNative(true);const {mergeGeometries}=await import('three/addons/utils/BufferGeometryUtils.js');const {adaptBuildSource}=await import('../../../scripts/inkwave-source-composition.mjs');const {Level}=await import(new URL('src/world/level.js', 'file://'+SRC));const {MAP_LAYOUTS}=await import(new URL('src/world/maps.js','file://'+SRC));
 const Decor=new Function('THREE','mergeGeometries','G','document',plain(adaptBuildSource('src/world/decor.js',read('world/decor.js')))+'\nreturn Decor;')(THREE,mergeGeometries,G,document);
 const scene=new THREE.Scene(),first=new Decor(scene,new Level(MAP_LAYOUTS.halyard));const emblem=first.emblem,flag=first.flagTex;let emblemDisposed=0,flagDisposed=0;emblem.addEventListener('dispose',()=>emblemDisposed++);flag.addEventListener('dispose',()=>flagDisposed++);
 const transferred=first.takeStaticTextures();first.dispose();first.dispose();assert.equal(emblemDisposed,0);assert.equal(flagDisposed,0);assert.equal(first.takeStaticTextures(),null);
 const second=new Decor(scene,new Level(MAP_LAYOUTS.cargo),transferred);assert.equal(second.emblem,emblem);assert.equal(second.flagTex,flag);assert.equal(second.pads[0].padMat.uniforms.uEmblem.value,emblem);
 const noFlags={...MAP_LAYOUTS.halyard,decor:{...MAP_LAYOUTS.halyard.decor,flags:[]}},next=second.takeStaticTextures();second.dispose();const third=new Decor(scene,new Level(noFlags),next);assert.equal(third.emblem,emblem);assert.equal(third.flagTex,null);assert.equal(flagDisposed,1);third.dispose();third.dispose();assert.equal(emblemDisposed,1);assert.equal(flagDisposed,1);
});

test('bounded face-candidate caching preserves all authored faces and reduces exact hash queries',async()=>{
 const runs=[];
 for(const old of [true,false]){
  let calls=0;const f=await geometryFixture({globals:{__queryCount:()=>calls++},transform(rel,s){if(rel!=='src/world/level.js')return s;if(old)s=replaceDeclaration(s,'Level','_faceHidden',baseline['world/level.js']._faceHidden);return s.replace('  _nextQueryStamp() {','  _nextQueryStamp() { globalThis.__queryCount();');}});
  const levels=[];for(const id of ['tidewater','kelpline','halyard','cargo','range'])levels.push(new f.Level(f.MAP_LAYOUTS[id]));
  runs.push({calls,faces:levels.map(l=>JSON.stringify(l.faces)),blocks:levels.map(l=>JSON.stringify(l.blocks))});
 }
 assert.deepEqual(runs[0].faces,runs[1].faces);assert.deepEqual(runs[0].blocks,runs[1].blocks);assert(runs[1].calls<runs[0].calls);console.log('FACE_QUERY_COUNTS '+JSON.stringify(runs.map(r=>r.calls)));
});

function canvasDocument(){return{createElement(){const canvas={width:0,height:0};const context=new Proxy({createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}},putImageData(image){canvas.pixels=new Uint8ClampedArray(image.data);}}, {get(t,k){return k in t?t[k]:(()=>{});},set(t,k,v){t[k]=v;return true;}});canvas.getContext=()=>context;return canvas;}};}

test('legacy minimap base and ink pixel buffers are identical with block-derived normals and narrow IDs',async()=>{
 const f=await geometryFixture(),raw=read('game/minimap.js');let prior=raw;for(const key of ['_build','_drawBase','_drawInk'])prior=replaceDeclaration(prior,'Minimap',key,baseline['game/minimap.js'][key]);
 const G={settings:{minimap:false},game:{theme:'day'},teamColors:[new f.THREE.Color('#ff8800'),new f.THREE.Color('#2255ff')]};
 const make=source=>new Function('G','on','SPECIALS','SUB','document',plain(source)+'\nreturn Minimap;')(G,()=>{},{},{},canvasDocument());const classes=[make(prior),make(raw)];
 let savings=0;
 for(const id of ['tidewater','kelpline','halyard','cargo','range']){
  const level=new f.Level(f.MAP_LAYOUTS[id]),paint={paintFaces:[],dead:new Uint8Array(),grid:new Uint8Array()};const maps=classes.map(C=>new C(level,paint,1,{deferActivation:true}));
  for(const flip of [false,true])for(const theme of ['day','sunset']){G.game.theme=theme;for(const m of maps){m.flip=flip;m._build();}assert.deepEqual(maps[0].base.pixels,maps[1].base.pixels,id+'/'+flip+'/'+theme);assert.deepEqual(Array.from(maps[0].hgt),Array.from(maps[1].hgt));assert.deepEqual(Array.from(maps[0].topBlock),Array.from(maps[1].topBlock));assert.equal(maps[1].nrm,null);assert.equal(maps[1].topBlock.constructor,Int16Array);}
  savings+=maps[0].nrm.byteLength+maps[0].topBlock.byteLength-maps[1].topBlock.byteLength;
  const N=maps[0].w*maps[0].h;for(const map of maps){map.paint.grid=Uint8Array.from({length:37},(_,i)=>i%3);map.pixCell=Int32Array.from({length:N},(_,i)=>i%9===0?-1:i%37);map.pixFx=new Uint8Array(N);map.pixFy=new Uint8Array(N);map.pixSx=new Int8Array(N);map.pixSy=new Int32Array(N);}
  // Native path formerly used four zero-filled interpolation arrays.
  maps[1].level={native:true};maps[1].pixFx=maps[1].pixFy=maps[1].pixSx=maps[1].pixSy=null;
  for(const band of [[0,maps[0].h],[1,Math.max(1,maps[0].h-1)]]){for(const map of maps)map._drawInk(...band);assert.deepEqual(maps[0].inkImg.data,maps[1].inkImg.data);assert.deepEqual(maps[0].flashImg.data,maps[1].flashImg.data);assert.deepEqual(maps[0].owner,maps[1].owner);}
 }
 console.log('MINIMAP_NORMAL_AND_ID_BYTES_SAVED_AT_1PX_PER_M '+savings);
 // Signed ID overflow/custom IDs retain the original Int32 storage.
 const level=new f.Level(f.MAP_LAYOUTS.tidewater);level.blocks[0].id=32768;const m=new classes[1](level,{paintFaces:[],dead:[]},1,{deferActivation:true});m._drawBase=()=>{};m._build();assert.equal(m.topBlock.constructor,Int32Array);
});

test('pack resources survive overlapping kits and retire after the final owner/registration rollback',async()=>{
 const {loadNative}=await import('./prop-retention-fixture.mjs');const {SRC,PropKit}=await loadNative(true);const core=await import(new URL('src/world/props-core.js?patched=true&practice=false','file://'+SRC));let releases=0;
 core.registerPropPack('world-queue-test',(D)=>{D.__world_queue_type={desc:'fixture',build(){}};return()=>releases++;});
 const a=new PropKit(null,{headless:true}),b=new PropKit(null,{headless:true});a.add('__world_queue_type',{});a.add('__world_queue_type',{});b.add('__world_queue_type',{});a.clear();assert.equal(releases,0);b.clear();assert.equal(releases,1);b.clear();assert.equal(releases,1);a.add('__world_queue_type',{});a.dispose();a.dispose();assert.equal(releases,2);b.dispose();
 let rollback=0;assert.throws(()=>core.registerPropPacks([['world-queue-rollback',D=>{D.__rollback_type={desc:'fixture',build(){}};return()=>rollback++;}],['world-queue-failed',()=>{throw Error('injected');}]]),/injected/);assert.equal(rollback,1);assert(!core.PROP_TYPES.some(t=>t.type==='__rollback_type'));
});

test('Cargo template retirement covers plain geometry and glyph geometry wrappers once',async()=>{
 const {THREE}=await geometryFixture();const source=read('world/stages/cargo/props.js').replace('  const TPL = new Map();','  const TPL = new Map(); capture(TPL);').replace(/^export \{ PLACEMENTS \}.*$/gm,'');let templates;
 const register=new Function('capture',plain(source)+'\nreturn register;')(value=>templates=value),release=register({}, {THREE,PI:Math.PI,TAU:Math.PI*2,HP:Math.PI/2});let calls=0;const a={isBufferGeometry:true,dispose(){calls++}},b={isBufferGeometry:true,dispose(){calls++}};templates.set('shape',a);templates.set('glyph',{geo:b,adv:.5});templates.set('alias',{geo:a});templates.set('space',{geo:null});release();assert.equal(calls,2);assert.equal(templates.size,0);release();assert.equal(calls,2);
});

test('normalized water rectangles retain exact original boundary arithmetic at all sampled times',async()=>{
 const f=await geometryFixture();const original=new Function('Math','WATER_Y','smooth','return function '+baseline['world/environment.js'].waterHeightAt)(Math,-1.6,(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);});
 const e=Object.create(f.Environment.prototype);e.footprint=[];e._initUniforms();e.bounds={minX:-30,maxX:30,minZ:-50,maxZ:50};const rects=[{minX:-20.1,maxX:13.7,minZ:-33.3,maxZ:41.2},{cx:1e-10,cz:20.25,hx:7.3,hz:13.7,ax:0,az:1},{cx:10.2,cz:-13.9,hx:6.7,hz:12.4,ax:Math.cos(.73),az:Math.sin(.73)}];e.setFootprint(rects);
 for(const marina of [false,true]){e._marinaData=marina?{decks:e.footprint,wet:e.footprint.slice(1)}:null;for(let i=0;i<10000;i++){const x=Math.sin(i*1.34)*100,z=Math.cos(i*.733)*100,t=i/120;assert(Object.is(e.waterHeightAt(x,z,t),original.call(e,x,z,t)));}}
});

test('AO metadata starts before synchronous prop preparation and PNG waits for exact layout validation',async()=>{
 const {adaptBuildSource}=await import('../../../scripts/inkwave-source-composition.mjs');const source=adaptBuildSource('src/main.js',fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8'));const klass=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name==='Game');const methods=klass.body.body.filter(n=>['_prefetchLightmapMetadata','_loadLightmap'].includes(n.key.name)).map(n=>source.slice(n.start,n.end)).join('\n');
 const events=[];let resolve;const response=new Promise(r=>resolve=r),THREE={NoColorSpace:0,LinearMipmapLinearFilter:1,LinearFilter:2,TextureLoader:class{async loadAsync(url){events.push('png:'+url);return{};}}};const Game=new Function('THREE','fetch','console','LIGHTMAP_LAYOUTS','return class {'+methods+'}')(THREE,url=>{events.push('json:'+url);return response;},{warn(){}},['cargo']);const game=new Game(),level={faces:[{light:1}],layoutLightmap(ppm,size){events.push('validate');this.layoutHash='current';}};
 const pending=game._prefetchLightmapMetadata('cargo');events.push('props:begin');events.push('props:end');const completed=game._loadLightmap(level,'cargo',pending);assert.deepEqual(events,['json:assets/lightmaps/cargo.json','props:begin','props:end']);resolve({json:async()=>({hash:'current',ppm:4,size:1024})});assert(await completed);assert.equal(events[3],'validate');assert.match(events[4],/^png:/);assert.equal(events.filter(e=>e.startsWith('json:')).length,1);
 const absent={faces:[{light:1}],layoutLightmap(){throw Error('absent layout should not be touched');}};assert.equal(await game._loadLightmap(absent,'range',game._prefetchLightmapMetadata('range')),null);assert.equal(absent.faces[0].light,null);assert.equal(events.filter(e=>e.startsWith('json:')).length,1);
 const bad={faces:[{light:1}],layoutLightmap(){this.layoutHash='wrong';}};assert.equal(await game._loadLightmap(bad,'cargo',Promise.resolve({meta:{hash:'wrong-source',ppm:4,size:1024}})),null);assert.equal(bad.faces[0].light,null);assert.equal(events.filter(e=>e.startsWith('png:')).length,1);
});

test('union-find pruning preserves first-component ties, one-way edges, duplicates, loops and empty graphs',async()=>{
 const {THREE}=await geometryFixture(),raw=read('game/nav.js'),oldSource=replaceDeclaration(raw,'NavGraph',null,baseline['game/nav.js'].NavGraph);const make=s=>new Function('THREE','PLAYER','buildNativeNav',plain(s)+'\nreturn NavGraph;')(THREE,{radius:.3},()=>{});const classes=[make(oldSource),make(raw)];let seed=7349;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 for(let run=0;run<300;run++){const N=run<3?run:Math.floor(rnd()*250),nodes=Array.from({length:N},(_,id)=>({id,nb:[]}));for(const node of nodes)for(let i=0;i<4;i++){if(rnd()<.5)node.nb.push({to:Math.floor(rnd()*N)});}if(run%3===0)for(const n of nodes)n.nb=n.nb.filter(e=>(n.id<N/2)===(e.to<N/2));const results=classes.map(C=>{const g=Object.create(C.prototype);g.nodes=structuredClone(nodes);g._prune();return{valid:Array.from(g.valid),validIds:Array.from(g.validIds)};});assert.deepEqual(results[0],results[1]);}
});
