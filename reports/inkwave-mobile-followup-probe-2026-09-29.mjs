// Run from repository root. Executes pinned-source method bodies with controlled fixtures.
// No WebGL context, browser rendering, network, real-device timing or power measurements.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';
import { SUB, effectiveQuality } from '../inkwave-public/src/config.js';
const read = p => fs.readFileSync('inkwave-public/src/'+p,'utf8');
const weapons=read('game/weapons.js'), minimap=read('game/minimap.js'), main=read('main.js');
function method(source,start,end,context={}) {
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'method boundary changed: '+start);
  const name=start.trim().split('(')[0];
  return vm.runInNewContext('({'+source.slice(a,b)+'})['+JSON.stringify(name)+']',context);
}
const G={time:0,physics:{segment(){return {hit:false};}}};
const common={THREE,SUB,G,SIM_DT:1/60,MAX_BLOBS:700,UP:new THREE.Vector3(0,1,0),ZAX:new THREE.Vector3(0,0,1),_v:new THREE.Vector3(),_v2:new THREE.Vector3(),_v3:new THREE.Vector3(),_dir:new THREE.Vector3(),_q:new THREE.Quaternion(),_m:new THREE.Matrix4(),_s:new THREE.Vector3(),_c:new THREE.Color(),_hit:{},emit(){}};
const clear=method(weapons,'  clear() {','\n  _new()',common);
const releaseBomb=method(weapons,'  _releaseBomb(b) {','\n\n  _releaseCloud(',common);
const releaseCloud=method(weapons,'  _releaseCloud(c, fade = 0) {','\n\n  _new()',common);
const throwBomb=method(weapons,'  throwBomb(a) {','\n  throwStorm(',common);
const scene=new THREE.Scene(), baseMat=new THREE.MeshPhysicalMaterial();
const p={scene,list:[],pool:[],bombs:[],clouds:[],beams:[],beamPool:[],sights:new Map(),blobs:{count:0},bombGeo:new THREE.SphereGeometry(.2,8,6),bombCapGeo:new THREE.CylinderGeometry(.07,.09,.12,6),_bombMat(){return baseMat;},throwVelocity(a,s,out){return out.set(0,5,-s);},_releaseBomb:releaseBomb,_releaseCloud:releaseCloud};
const actor={pos:new THREE.Vector3(),team:0,isLocal:false,_nearCamera(){return false;},alive:true,ink:100,color:new THREE.Color(1,0,0)};
let createdMaterials=0,disposedMaterials=0;
for(let i=0;i<20;i++){
  throwBomb.call(p,actor);
  p.bombs[0].mesh.traverse(o=>{if(o.material){createdMaterials++;o.material.addEventListener('dispose',()=>disposedMaterials++);}});
  clear.call(p);
}
let cloudStops=0,cloudMaterialDisposes=0;
const cloud=new THREE.Group();
const cm=new THREE.MeshStandardMaterial();cm.addEventListener('dispose',()=>cloudMaterialDisposes++);
cloud.add(new THREE.Mesh(p.bombGeo,cm));scene.add(cloud);
p.clouds.push({group:cloud,loop:{stop(){cloudStops++;}}});clear.call(p);
assert.equal(createdMaterials,40);assert.equal(disposedMaterials,40);assert.equal(cloudStops,1);assert.equal(cloudMaterialDisposes,1);

const draw=method(weapons,'  _draw() {','\n}',common);
const blobs=new THREE.InstancedMesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial(),700);
blobs.setColorAt(0,new THREE.Color());
const shape=new THREE.InstancedBufferAttribute(new Float32Array(700*4),4);
const d={list:[],blobs,blobShape:shape};
const attrs=[blobs.instanceMatrix,blobs.instanceColor,shape];
const versions=attrs.map(a=>a.version);
for(let i=0;i<600;i++)draw.call(d);
const emptyChanges=attrs.map((a,i)=>a.version-versions[i]);
assert.deepEqual(emptyChanges,[0,0,0]);assert.equal(blobs.count,0);
const noRanges=attrs.every(a=>a.updateRanges.length===0);
const bytes=attrs.reduce((n,a)=>n+a.array.byteLength,0);

let segmentQueries=0;G.physics.segment=()=>{segmentQueries++;return {hit:false};};
const arc=method(weapons,'  updateArc(a, show) {','\n  // Every projectile',common);
const arcGeo=new THREE.BufferGeometry();arcGeo.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(64*3),3));
const arcLine=new THREE.Line(arcGeo,new THREE.LineDashedMaterial());
const arcRing=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());
const ar={arcN:64,arcGeo,arcLine,arcRing,throwVelocity(a,s,out){return out.set(0,8,-s);}};
const lineAttributes=new Set();
for(let i=0;i<60;i++){arc.call(ar,actor,true);lineAttributes.add(arcGeo.attributes.lineDistance);}
assert.equal(segmentQueries,126);assert.equal(lineAttributes.size,1);

const mg={teamHex:['#ff0000','#0000ff'],game:{theme:'day'},projectiles:{bombs:[],clouds:[]}};
const mu=method(minimap,'  update(dt, force = false) {','\n  _compose(dt)',{G:mg,fxList:[]});
function mapFixture(flashT=9){return {_built:true,time:0,timer:1,_teamKey:'#ff0000#0000ff',_theme:'day',_band:0,version:1,paint:{version:1},flashT,_composeAcc:0,_composeDirty:false,_drawInk(){},_compose(){this.calls++;this.lastBombs=mg.projectiles.bombs.length;this.lastFlash=this.flashT<.45;},calls:0};}
const bombMap=mapFixture();mg.projectiles.bombs=[{}];mu.call(bombMap,1/30);mg.projectiles.bombs=[];
for(let i=0;i<60;i++)mu.call(bombMap,1/60);
assert.equal(bombMap.calls,2);assert.equal(bombMap.lastBombs,0);
const flashMap=mapFixture(.4);mu.call(flashMap,1/30);
for(let i=0;i<60;i++)mu.call(flashMap,1/60);
assert.equal(flashMap.calls,2);assert.equal(flashMap.lastFlash,false);

let rendererUpdates=0;
const qualityG={env:{shadowSize:2048,bounds:{minX:-25,maxX:25,minZ:-44,maxZ:44},scene:new THREE.Scene()},fx:{q:.7,maxChecks:770}};
const lights=method(read('world/environment.js'),'  _buildLights() {','\n  // Fit the orthographic', {THREE});
lights.call(qualityG.env);
const setSettings=method(main,'  _setSettings(partial) {','\n  _applyAudioVolumes()', {saveJSON(){},G:qualityG});
const qfixture={settings:{quality:'high'},R:{applySettings(){rendererUpdates++;}}};
setSettings.call(qfixture,{quality:'low'});
assert.equal(rendererUpdates,1);assert.equal(qualityG.env.sun.shadow.mapSize.x,2048);

const files=['main.js','config.js','game/weapons.js','game/minimap.js','world/environment.js','fx/fx.js','audio/audio.js'];
console.log(JSON.stringify({
  basis:'b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd',
  scope:'Method-body fixtures; no real GPU allocation, FPS or audible/pixel output measurement',
  sourceSha256:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(read(f)).digest('hex')])),
  projectileLifetime:{bombsThrownAndCleared:20,createdMaterials,disposedMaterials,cloudStopsOnClear:cloudStops,cloudMaterialDisposes,remainingSceneChildren:scene.children.length},
  emptyProjectileDraw:{calls:600,count:blobs.count,attributeVersionIncreases:emptyChanges,noUpdateRanges:noRanges,fullAttributeBytes:bytes,theoreticalBytesPerSecondAt60Hz:bytes*60},
  fixedAimArc:{frames:60,fixture:'constant actor and launch velocity; no collisions',segmentQueries,uniqueLineDistanceAttributes:lineAttributes.size},
  minimapFinalInvalidation:{bombRemoved:{composeCalls:bombMap.calls,lastComposedBombCount:bombMap.lastBombs,actualBombs:mg.projectiles.bombs.length},flashExpired:{composeCalls:flashMap.calls,lastComposedHadFlash:flashMap.lastFlash,actualFlashActive:flashMap.flashT<.45}},
  qualityChangeRouting:{rendererUpdates,unchangedExistingShadowSize:qualityG.env.sun.shadow.mapSize.x,unchangedExistingFxMultiplier:qualityG.fx.q,expectedLowTouchShadowSize:effectiveQuality({quality:'low'},{touch:true,ios:false}).shadowSize,note:'actual _buildLights and _setSettings bodies with controlled Environment/FX state; not a full game boot'}
},null,2));
