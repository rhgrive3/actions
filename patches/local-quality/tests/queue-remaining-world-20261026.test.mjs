import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {Float32Staging} from '../../../inkwave-public/src/world/attribute-staging.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptRemainingWorld20261026,WORLD_REMAINING_PATHS,WORLD_DIRECT_PATHS} from '../queue-remaining-world-20261026-adapter.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {geometryFixture} from './geometry-build-fixture.mjs';
import {nonWailVfxTicks} from '../../splatoon3/runtime/nonwail-vfx-clock.mjs';
const utils=fs.readFileSync(new URL('../../../inkwave-public/vendor/three/jsm/utils/BufferGeometryUtils.js',import.meta.url),'utf8');
const mergeGeometries=new Function(...Object.keys(THREE),body(utils)+'\nreturn mergeGeometries;')(...Object.values(THREE));
const oracle=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-remaining-world-before.json',import.meta.url),'utf8'));
const pair=rel=>{const r=oracle.modules[rel];assert.ok(r,rel);assert.equal(createHash('sha256').update(r.source).digest('hex'),r.sha256);const candidate=WORLD_DIRECT_PATHS.includes(rel)?adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8')):adaptRemainingWorld20261026(rel,r.source);return[r.source,candidate];};
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const json=o=>JSON.parse(JSON.stringify(o));
function sameGeometry(a,b,label='geometry',omit=[]){
 const keys=Object.keys(a.attributes).filter(k=>!omit.includes(k)).sort();assert.deepEqual(Object.keys(b.attributes).filter(k=>!omit.includes(k)).sort(),keys,label);
 for(const k of keys){const x=a.attributes[k],y=b.attributes[k];assert.deepEqual([x.itemSize,x.normalized,x.count],[y.itemSize,y.normalized,y.count],label+'/'+k);assert.deepEqual(bytes(x.array),bytes(y.array),label+'/'+k);}
 assert.equal(!!a.index,!!b.index,label+'/index presence');if(a.index){assert.equal(a.index.array.constructor.name,b.index.array.constructor.name,label+'/index type');assert.deepEqual(bytes(a.index.array),bytes(b.index.array),label+'/index');}
 a.computeBoundingBox();b.computeBoundingBox();a.computeBoundingSphere();b.computeBoundingSphere();assert.deepEqual(json(a.boundingBox),json(b.boundingBox),label+'/box');assert.deepEqual(json(a.boundingSphere),json(b.boundingSphere),label+'/sphere');assert.deepEqual(json(a.groups),json(b.groups),label+'/groups');
}
function body(code){const edits=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.flatMap(n=>n.type==='ImportDeclaration'||n.type==='ExportAllDeclaration'?[[n.start,n.end]]:n.type==='ExportNamedDeclaration'?[[n.start,n.declaration?.start??n.end]]:[]);for(const[a,b]of edits.reverse())code=code.slice(0,a)+code.slice(b);return code.replaceAll('import.meta.url',JSON.stringify(import.meta.url));}
function leaf(code,names,scope={}){const s={THREE,Float32Staging,mergeGeometries,...scope};return new Function(...Object.keys(s),body(code)+'\nreturn {'+names+'};')(...Object.values(s));}
function find(code,predicate){let found;const walk=n=>{if(!n||typeof n!=='object'||found)return;if(predicate(n)){found=n;return;}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else walk(v);};walk(parse(code,{ecmaVersion:'latest',sourceType:'module'}));assert.ok(found,'source node');return code.slice(found.start,found.end);}
const method=(code,name)=>find(code,n=>n.type==='MethodDefinition'&&n.key.name===name);
const fn=(code,name)=>find(code,n=>n.type==='FunctionDeclaration'&&n.id?.name===name).replace(/^export /,'');
function methods(code,names,scope={}){const s={THREE,...scope};return new Function(...Object.keys(s),'return ({'+names.map(n=>method(code,n)).join(',')+'});')(...Object.values(s));}
const clamp=(x,a,b)=>x<a?a:x>b?b:x,lerp=(a,b,t)=>a+(b-a)*t,sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

test('every owned source adapter applies once to the authentic composed input and emits valid modules',()=>{
 for(const rel of WORLD_REMAINING_PATHS){const[a,b]=pair(rel);parse(b,{ecmaVersion:'latest',sourceType:'module'});if(WORLD_DIRECT_PATHS.includes(rel))assert.equal(adaptRemainingWorld20261026(rel,b),b,'authored direct owner remains untouched');else if(a!==b)assert.throws(()=>adaptRemainingWorld20261026(rel,b),/anchor/);}
});

test('dock rebuild reuses only live matching boats with exact geometry, phase and shader state, then releases on exit',()=>{
 const G={level:{layout:{}}},constructors=pair('src/world/environment.js').map(code=>leaf(code,'Environment',{G,PLAYER:{waterY:-1.6}}).Environment);
 const es=constructors.map(C=>Object.assign(Object.create(C.prototype),{root:new THREE.Group(),bounds:{minX:-5,maxX:5,minZ:-7,maxZ:7},footprint:[],U:{},_marina:false,buoys:[],_boundaryRuns:()=>[],_buildFoamField(shapes){this.foamCopy=JSON.stringify(shapes);}}));
 const assertDock=()=>{
  const[a,b]=es;assert.equal(b.root.children.length,a.root.children.length);assert.deepEqual(b.moored.map(m=>({spec:m.spec,phase:m.phase,roll:m.roll})),a.moored.map(m=>({spec:m.spec,phase:m.phase,roll:m.roll})));assert.equal(b.foamCopy,a.foamCopy);
  for(let i=0;i<a.root.children.length;i++){const x=a.root.children[i],y=b.root.children[i];sameGeometry(x.geometry,y.geometry,'dock '+i);assert.deepEqual(y.position.toArray(),x.position.toArray());assert.deepEqual(y.rotation.toArray(),x.rotation.toArray());assert.deepEqual(y.scale.toArray(),x.scale.toArray());assert.deepEqual([y.name,y.castShadow,y.receiveShadow,y.material.roughness,y.material.metalness,y.material.defines,y.material.customProgramCacheKey()],[x.name,x.castShadow,x.receiveShadow,x.material.roughness,x.material.metalness,x.material.defines,x.material.customProgramCacheKey()]);if(x.isInstancedMesh){assert.equal(y.count,x.count);assert.deepEqual(bytes(y.instanceMatrix.array),bytes(x.instanceMatrix.array));}}
 };
 es.forEach(e=>e._buildDock());assertDock();const saved=es[1].moored.map(m=>m.mesh),dispose=new Map(),oldMaterials=new Set(saved.map(m=>m.material));
 for(const m of saved){dispose.set(m.geometry,0);m.geometry.addEventListener('dispose',()=>dispose.set(m.geometry,dispose.get(m.geometry)+1));m.rotation.x=.12;m.rotation.z=-.15;}
 let retiredMaterials=0;for(const m of oldMaterials)m.addEventListener('dispose',()=>retiredMaterials++);
 for(const shift of [1.25,-3.75]){es.forEach(e=>{e.bounds={minX:-5+shift,maxX:6+shift,minZ:-8,maxZ:9};e._rebuildDock();});assertDock();assert.deepEqual(es[1].moored.map(m=>m.mesh),saved);assert.ok([...dispose.values()].every(n=>n===0));assert.equal(es[1]._reusableMoored,null);}
 assert.equal(retiredMaterials,1);
 es.forEach(e=>{e._marina=true;e._rebuildDock();});assertDock();assert.equal(es[1].moored.length,0);assert.ok([...dispose.values()].every(n=>n===1));
 es.forEach(e=>{e._marina=false;e._rebuildDock();});assertDock();assert.ok(es[1].moored.every((m,i)=>m.mesh!==saved[i]));
 G.level.layout.envBoats=false;const next=es[1].moored.map(m=>m.mesh);let retired=0;for(const m of next)m.geometry.addEventListener('dispose',()=>retired++);es.forEach(e=>e._rebuildDock());assertDock();assert.equal(retired,3);assert.equal(es[1].moored.length,0);
});

test('lobby cached integer fit bounds preserve camera output across layout refresh, resize and clock reset',()=>{
 let roundCalls=[0,0],domCalls=[0,0],layout=0;const src=pair('src/game/showcase.js');
 const cameras=src.map((code,i)=>{const math=Object.create(Math);math.round=(x)=>{roundCalls[i]++;return Math.round(x);};const m=methods(code,['_placeLook','_lobFrame','_measureLobby','_measureHub'],{Math:math,_v:new THREE.Vector3(),_d:new THREE.Vector3(),_s:new THREE.Vector3(),CHAR_H:1.6,PLATE_H:1.9,domBox(sel){domCalls[i]++;if(!layout)return null;return sel.includes('side')?{r:280.4}:sel.includes('body')?{r:480.8}:sel.includes('bar')||sel.includes('chips')?{t:625.2}:{b:75.7};}});
  const C={pos:new THREE.Vector3(0,3,8),target:new THREE.Vector3(0,1,0),fov:30};return Object.assign({ui:{},lob:{t:-.1,fits:{},cam:new THREE.PerspectiveCamera(),set:{camera:C,hubCamera:C,hubSpot:{pos:new THREE.Vector3(1,0,0)},spots:[-2,-1,0,1,2].map(x=>({pos:new THREE.Vector3(x,0,0)}))}}},m);
 });
 for(let i=0;i<240;i++){const t=i===0?-.1:i===1?0:i<110?i/60:i<150?(i-110)/60:(i-150)/30;layout=i>160?1:0;const W=i<100?1280:1440,H=i<200?720:900;for(const c of cameras)c.lob.t=t;for(const kind of ['lobby','hub']){const out=cameras.map(c=>c._lobFrame(kind,W,H,{pos:new THREE.Vector3(),tgt:new THREE.Vector3()}));assert.deepEqual(out[1],out[0]);assert.deepEqual(json(cameras[1].lob.fits),json(cameras[0].lob.fits));}}
 assert.equal(domCalls[1],domCalls[0]);assert.ok(roundCalls[1]<roundCalls[0]/10);
});

test('jumpout keeps exact 60 Hz random call order and uses a bounded reference clock at 30/120 Hz',()=>{
 const source=pair('src/game/showcase.js'),calls=source.map(code=>methods(code,['_lobIdle'],{G:{},nonWailVfxTicks,TAU:Math.PI*2,c01:x=>clamp(x,0,1),lerp})._lobIdle);
 const run=(candidate,hz,hitch=false)=>{let seed=3,random=0,drops=[];const c={root:{visible:true},trigger(){},setDance(){}},M={c,a:{form:'kid'},pos:new THREE.Vector3(1,0,2),act:{kind:'jumpout',t0:0,flag:1},q:[],gT:100,idleT:100},ctx={rand(){random++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;}};for(let i=0;i<(hitch?1:hz/2);i++)calls[candidate].call(ctx,M,.15+i/hz,hitch?10:1/hz,{drop(...v){drops.push(v);}});return{random,drops,carry:M.act?.nonWailCarry};};
 const base=run(0,60),candidate=run(1,60);assert.deepEqual(candidate.drops,base.drops);assert.equal(candidate.random,base.random);
 assert.equal(run(1,30).random,candidate.random);assert.equal(run(1,120).random,candidate.random);assert.ok(run(1,120).drops.length<run(0,120).drops.length);assert.ok(run(1,60,true).random<=12);
});

test('builder-local nav height scratch preserves node order and independent interleaved builds',()=>{
 const classes=pair('src/game/nav.js').map(code=>leaf(code,'NavGraph',{PLAYER:{radius:.3}}).NavGraph);
 const level=shift=>({bounds:{minX:-3,maxX:3,minZ:-2,maxZ:2},blocks:[0,.1,.75,2.1,4.2].map((y,i)=>({solid:true,center:new THREE.Vector3(0,y+shift,0),half:{y:.2},axes:[null,new THREE.Vector3(i===2?.1:0,1,0)]})),queryBlocks(_a,_b,_c,_d,out){out.length=0;out.push(0,1,2,3,4);},pointInBlock(b,p){return p.x<(b.center.y>2?0:4);}});
 const build=C=>[0,.15].map(shift=>{const g=new C(level(shift),{}, {deferBuild:true});g._clear=(x,y,z)=>!(x<0&&z<0&&y>1);return g;});
 const graphs=classes.map(build);for(const pair of graphs){const it=pair.map(g=>g._buildSteps());let done=false;while(!done){const a=it[0].next(),b=it[1].next();done=a.done&&b.done;}}
 const snap=g=>json({nodes:g.nodes,cells:g.cells,valid:[...g.valid],validIds:g.validIds});for(let i=0;i<2;i++)assert.deepEqual(snap(graphs[1][i]),snap(graphs[0][i]));
});

test('instance envelopes and transformed collider corners remain exact for rotation, shear and mirrored scale',()=>{
 const envelopes=pair('src/world/render-bounds.js').map(code=>leaf(code,'setPropInstanceEnvelope').setPropInstanceEnvelope),xf=pair('src/world/props-core.js').map(code=>methods(code,['_xfCols'],{HP:Math.PI/2})._xfCols);
 for(const scale of [-2,0,.3,2])for(const yaw of [-Math.PI,0,Math.PI/2,1.234,7]){
  const cols=[[-.25,0,-.6,.8,.7,.9,7],[-1.2,-.1,-2,3.2,1,4,1]];for(const obox of [false,true])assert.deepEqual(xf[1](cols,[1.2,-4,3.1],yaw,scale,obox),xf[0](cols,[1.2,-4,3.1],yaw,scale,obox));
  for(const cloth of [false,true]){const meshes=envelopes.map(()=>{const g=new THREE.BoxGeometry(1,2,3);g.setAttribute('flex',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(.3),1));g.setAttribute('wave',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(.2),3));const m=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial(),3);m.userData={cloth,recs:Array.from({length:3},(_,i)=>{const matrix=new THREE.Matrix4().compose(new THREE.Vector3(i,-i,i*2),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,yaw,0)),new THREE.Vector3(scale,1,.5));matrix.elements[4]+=.2;return{m:matrix};})};return m;});envelopes.forEach((f,i)=>f(meshes[i]));assert.deepEqual(json(meshes[1].boundingSphere),json(meshes[0].boundingSphere));meshes.forEach(m=>{m.geometry.dispose();m.material.dispose();m.dispose();});}
 }
});

test('actual face geometry and AO remain byte-identical across quality, LOD and packed-hash boundaries',()=>{
 const G={settings:{quality:'high'}},kernels=pair('src/game/character-face.js').map(code=>leaf(code,'buildFaceSkin,bakeAO',{G}));let vertices=0;
 for(const quality of ['low','medium','high','ultra'])for(const lod of ['hero','game','far']){
  G.settings.quality=quality;const a=kernels[0].buildFaceSkin(lod),b=kernels[1].buildFaceSkin(lod);sameGeometry(a.geo,b.geo,quality+'/'+lod);assert.deepEqual(bytes(a.ao),bytes(b.ao));vertices+=a.geo.attributes.position.count;a.geo.dispose();b.geo.dispose();
 }
 const P=[];for(const c of [-514,-512,-511,-510,0,510,511,512,514])for(let i=0;i<9;i++)P.push(new THREE.Vector3(c*.0035+i*.00001,c*.0035-i*.00002,c*.0035));
 const acc={P,part:P.map(()=>0),sub:P.map(()=>0),uv:P.map(()=>[0,0]),idx:[]},normal=new THREE.Float32BufferAttribute(P.flatMap((_,i)=>[i%2?1:-1,0,0]),3);
 assert.deepEqual(bytes(kernels[0].bakeAO(acc,normal)),bytes(kernels[1].bakeAO(acc,normal)));console.log(JSON.stringify({scope:'actual face generation/AO',variants:12,vertices}));
});

test('sweep angle cache and squid normal scratch preserve exact output for repeated and unusual tessellations',()=>{
 const source=pair('src/game/character-geo.js'),kernels=source.map((code,i)=>new Function('THREE','V3','clamp',(i?body(code.slice(0,code.indexOf('// INKWAVE'))):'')+fn(code,'sweep')+'\nreturn sweep;')(THREE,THREE.Vector3,clamp));
 for(const radial of [3,6,11,24,96,128,129,3.5])for(const twist of [false,true])for(const section of [false,true]){
  const opts={seg:7,radial,capStart:true,capEnd:true,transport:twist,radius:t=>.08*(1-t*.7),flat:t=>.6+t*.2,twist:twist?t=>t*.7:null,section:section?(c,s,t)=>[c*(1+t*.2),s*.75]:null};
  const r=kernels.map(k=>k([[0,0,0],[.05,.2,.03],[.1,.5,-.02],[-.03,.8,.07]],opts));sameGeometry(r[0].geo,r[1].geo);for(const k of ['t','cs','sn'])assert.deepEqual(bytes(r[0][k]),bytes(r[1][k]));r.forEach(x=>x.geo.dispose());
 }
 const surfaces=source.map(code=>new Function('V3','clamp','lerp','sstep',fn(code,'interpTable')+'\n'+code.slice(code.indexOf('const SQ_PROF'),code.indexOf('const _squid'))+'\nreturn sqSurfN;')(THREE.Vector3,clamp,lerp,sstep));
 for(let i=0;i<2000;i++){const th=(i%79-39)*.2,y=(i%61)*.008,off=(i%5)*.001;assert.deepEqual(surfaces[0](th,y,off,new THREE.Vector3()).toArray(),surfaces[1](th,y,off,new THREE.Vector3()).toArray());}
});

test('LOD normal scratch and attribute fast paths preserve dense, normalized and interleaved source output',()=>{
 const kernels=pair('src/game/character-lod.js').map(code=>leaf(code,'clusterDecimate'));
 for(const count of [30,1500,9,850,30])for(const format of ['dense','normalized','interleaved']){
  const g=new THREE.BufferGeometry(),p=[],n=[],c=[],m=[];for(let i=0;i<count;i++){p.push(Math.sin(i)*.3,Math.floor(i/15)*.005,Math.cos(i)*.3);n.push(Math.sin(i),.2,Math.cos(i));c.push((i%3)/2,(i%7)/6,(i%5)/4);m.push(i%4);}
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('aMat',new THREE.Float32BufferAttribute(m,1));
  if(format==='normalized')g.setAttribute('color',new THREE.Uint8BufferAttribute(c.map(v=>Math.round(v*255)),3,true));
  else if(format==='interleaved'){const a=new Float32Array(count*4);for(let i=0;i<count;i++)a.set(c.slice(i*3,i*3+3),i*4);g.setAttribute('color',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(a,4),3,0));}
  else g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
  const out=kernels.map(k=>k.clusterDecimate(g,.06));sameGeometry(out[0],out[1],count+'/'+format);out.forEach(x=>x.dispose());g.dispose();
 }
});

test('packed profile tracks retain exact contact/strike/stride on both sides and missing-bone fallbacks',()=>{
 const SourcePose=class{constructor(bank){this.wp=bank.rest.wp.map(p=>p.clone());}},profiles=pair('src/game/motion/source-bank.js').map(code=>methods(code,['profile'],{SourcePose}).profile);
 for(const name of ['Walk','WalkBack','WalkLeft','WalkRight'])for(const missing of ['none','toe','foot'])for(const frames of [1,6.25,12]){
  const make=()=>({profiles:new Map(),clips:new Map([[name,{name,frames}]]),index:{foot_L:0,toe_L:1,foot_R:missing==='foot'?undefined:2,toe_R:missing==='toe'?undefined:3},rest:{wp:Array.from({length:4},(_,i)=>new THREE.Vector3(i*.05,.1,0))},sample(_c,t,pose){for(let i=0;i<4;i++)pose.wp[i].set(Math.sin(t*.4+i)*.5,Math.max(0,Math.sin(t+i))*.1+.1,Math.cos(t*.4+i)*.3);}});
  const banks=[make(),make()],a=profiles[0].call(banks[0],name),b=profiles[1].call(banks[1],name);assert.deepEqual(b,a,name+'/'+missing+'/'+frames);assert.equal(profiles[1].call(banks[1],name),b);
 }
});

test('warmAll failure restores visibility and clears only the rejected promise so retry can succeed',async()=>{
 const code=pair('src/game/character.js')[1];for(const mode of ['sync','async','tier']){
  let fail=true;const G={settings:{quality:'high'}},scope={THREE,G,warmHeadgear(){},farGeometry(){},IDENT:new THREE.Matrix4()};
  const warm=new Function(...Object.keys(scope),'let _warmRT=null;return ({'+method(code,'warmAll')+'}).warmAll;')(...Object.values(scope));
  const root=new THREE.Group(),kid=new THREE.Group(),hidden=new THREE.Object3D();root.add(kid);kid.add(hidden);hidden.visible=false;root.visible=false;
  const actor={root,kid,weapons:{},_tierSet(){if(mode==='tier'&&fail)throw Error('tier');return{list:[]};}};
  const renderer={target:{},shadowMap:{enabled:false},getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},compileAsync(){if(fail){if(mode==='sync')throw Error('compile');return Promise.reject(Error('compile'));}return Promise.resolve();}},previous=renderer.target;
  await assert.rejects(warm.call(actor,renderer,{},new THREE.Scene()));assert.equal(actor._warmed,null);assert.equal(renderer.target,previous);assert.equal(root.visible,false);assert.equal(hidden.visible,false);assert.equal(kid.children.length,1);
  fail=false;assert.equal(await warm.call(actor,renderer,{},new THREE.Scene()),'high');assert.equal(root.visible,false);assert.equal(hidden.visible,false);assert.equal(kid.children.length,1);
 }
});

test('actual camera follow remains exactly equal at 30/60/120Hz and avoids nonswim speed hypot calls',()=>{
 const source=pair('src/game/cameraRig.js');for(const hz of [30,60,120]){
  const G={level:{groundHeight:()=>0},physics:{level:{blocks:[]},cameraProbe(_p,_d,len,_r,out){Object.assign(out,{hard:len,soft:len,floor:false});},raycast(){return{hit:false};}}},counts=[0,0];
  const rigs=source.map((code,k)=>{const math=Object.create(Math);math.hypot=(...args)=>{counts[k]++;return Math.hypot(...args);};const scope={G,Math:math,Hit:class{},clamp,lerp,damp:(a,b,r,dt)=>a+(b-a)*(1-Math.exp(-r*dt)),dampAngle:(a,b,r,dt)=>a+(b-a)*(1-Math.exp(-r*dt)),updateScopeZoom:()=>0,chargerScopeFactor:()=>0,chargerScopeFov:()=>70,enforceBoomClearance:(boom,hard)=>{if(boom.x>hard+1.2)boom.x=hard+1.2;}};const{CameraRig}=leaf(code,'CameraRig',scope);return new CameraRig(new THREE.PerspectiveCamera());});
  let nonswim=0;for(let i=0;i<hz*2;i++){
   const form=['kid','swim','squid','climb'][Math.floor(i/(hz/2))%4],actor={anim:{form},form:form==='kid'?'kid':'squid',pos:new THREE.Vector3(Math.sin(i/hz),.2,Math.cos(i/hz)),vel:new THREE.Vector3(7*Math.sin(i/hz),0,5*Math.cos(i/hz)),grounded:true,weapon:{}};if(form!=='swim'&&form!=='climb')nonswim++;
   for(const rig of rigs){rig.target=actor;rig._follow(i%53===0?0:1/hz);}
   const snap=r=>({position:r.camera.position.toArray(),q:r.camera.quaternion.toArray(),pivot:r.pivot.toArray(),fov:r.fovKick,dist:r.curDist,h:r.hgt.x,side:r.side.x});assert.deepEqual(snap(rigs[1]),snap(rigs[0]));
  }assert.equal(counts[0]-counts[1],nonswim);
 }
});

test('sea mesh and foam field preserve bytes and unchanged shader/material parameters',()=>{
 const source=pair('src/world/environment.js');for(const marina of [false,true]){
  const methodsPair=source.map(code=>methods(code,['_buildSea','_buildFoamField'],{makeWaveTexture:()=>new THREE.Texture(),WATER_Y:-1.6,SEA_VERT:'void main(){}',SEA_FRAG:'void main(){}'}));
  const es=methodsPair.map(m=>Object.assign({root:new THREE.Group(),_marina:marina,bounds:{minX:-2,minZ:-2,maxX:2,maxZ:2},U:{uWaveTex:{value:null},uFoamTex:{value:null},uFoamRect:{value:new THREE.Vector4()},uMarinaK:{value:new THREE.Vector4()}}},m));
  const shapes=Array.from({length:30},(_,i)=>({ax:(i%5)*.2,az:0,bx:2,bz:2,r:i%4*.2,reach:3}));
  for(const e of es){e._buildSea();e._buildFoamField(shapes);}sameGeometry(es[0].sea.geometry,es[1].sea.geometry,'sea');assert.deepEqual(bytes(es[0].U.uFoamTex.value.image.data),bytes(es[1].U.uFoamTex.value.image.data));assert.deepEqual(es[0].U.uFoamRect.value.toArray(),es[1].U.uFoamRect.value.toArray());
 }
});

test('lamp output streams preserve all actual Three.js geometry bytes and source templates across both directions',()=>{
 const kernels=pair('src/world/decor.js').map(code=>leaf(code,'Decor',{G:{actors:[]}}));
 for(const lamps of [[],[[0,0]],[[3,4],[-8,-2],[1.3,1.7]]]){
  const level={layout:{decor:{lamps}},groundHeight:(x,z)=>Math.sin(x)*.1+Math.cos(z)*.2},ds=kernels.map(k=>Object.assign(Object.create(k.Decor.prototype),{level,group:new THREE.Group()}));
  for(const d of ds)d._buildLamps();assert.equal(ds[0].group.children.length,ds[1].group.children.length);
  for(let i=0;i<ds[0].group.children.length;i++){const a=ds[0].group.children[i],b=ds[1].group.children[i];sameGeometry(a.geometry,b.geometry,'lamps '+i);assert.deepEqual([a.name,a.castShadow,a.receiveShadow,a.material.roughness,a.material.opacity],[b.name,b.castShadow,b.receiveShadow,b.material.roughness,b.material.opacity]);}
 }
});

test('marina builders preserve full-precision triangle decisions, dense buffers and the vendor index threshold',()=>{
 for(const rel of ['src/world/props-marina-vessels.js','src/world/props-marina-dock.js']){
  const name=rel.includes('vessels')?'MB':'GB',source=pair(rel),classes=source.map((code,i)=>new Function('THREE',(i?code.slice(0,code.indexOf('// Halyard')):'')+find(code,n=>n.type==='ClassDeclaration'&&n.id.name===name)+'\nreturn '+name+';')(THREE));
  for(const count of [0,9,400,65537]){
   const builders=classes.map(C=>new C());for(let i=0;i<count;i++){const values=[1e8+(i%7)*.0001,(i%9)*.1,Math.floor(i/3)*.01,Math.sin(i),Math.cos(i),.1];for(const b of builders)name==='MB'?b.v(...values,new THREE.Color(.2,.3,.4)):b.v(...values,.2,.3,.4);}
   for(let i=0;i+2<count;i+=3)builders.forEach(b=>b.tri(i,i+1,i+2));if(count>65535)builders.forEach(b=>b._triangle?b._triangle(0,65535,1):b[name==='MB'?'i':'idx'].push(0,65535,1));
   const geos=builders.map(b=>b.geo());sameGeometry(geos[0],geos[1],rel+'/'+count);geos.forEach(g=>g.dispose());
  }
 }
});

test('solid prop buckets omit only unread UVs; mapped/customized material gates and geometry stay intact',()=>{
 const kernels=pair('src/world/props-core.js').map((code,i)=>leaf(code,'mergePartSteps'+(i?',iwPropNeedsUV':'')));
 const parts=[{g:new THREE.BoxGeometry(),m:new THREE.Matrix4().makeTranslation(1.2,-.3,4.5),c:new THREE.Color(.2,.3,.4),uv:[0,0,1,1]}];
 const run=(k,uv)=>{const it=k.mergePartSteps(parts,uv);let n;do{n=it.next();}while(!n.done);return n.value;};
 const a=run(kernels[0],true),b=run(kernels[1],true),c=run(kernels[1],false);sameGeometry(a,b);sameGeometry(a,c,'solid',['uv']);assert.equal(c.attributes.uv,undefined);
 const material=new THREE.MeshStandardMaterial();assert.equal(kernels[1].iwPropNeedsUV(material),false);material.map=new THREE.Texture();assert.equal(kernels[1].iwPropNeedsUV(material),true);material.map=null;material.onBeforeCompile=()=>{};assert.equal(kernels[1].iwPropNeedsUV(material),true);
 for(const unknown of [new THREE.ShaderMaterial(),new THREE.RawShaderMaterial(),new THREE.MeshLambertMaterial(),new THREE.MeshDepthMaterial()]){assert.equal(kernels[1].iwPropNeedsUV(unknown),true,'unreviewed shader retains UVs');unknown.dispose();}
});

test('all five legacy stage geometries retain bytes after twelve-slot bevel memoization',async()=>{
 const fixtures=[];for(const index of [0,1])fixtures.push(await geometryFixture({transform:(rel,code)=>oracle.modules[rel]?pair(rel)[index]:code}));
 for(const id of ['tidewater','kelpline','halyard','cargo','range']){
  const levels=fixtures.map(f=>new f.Level(f.MAP_LAYOUTS[id]));const geos=levels.map(l=>l.buildGeometry(2048));sameGeometry(geos[0],geos[1],id);geos.forEach(g=>g.dispose());
 }
});
