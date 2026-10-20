import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { buildSpawnerGeometry, installSquidSpawnPresentation, SPAWNER_LOOK } from '../runtime/squid-spawn-presentation.mjs';

function runtime(count = 1) {
  class Actor { update() { return 'native'; } }
  const G={scene:new THREE.Scene(),actors:[],time:0,teamColors:[new THREE.Color('#c3d52b'),new THREE.Color('#7446de')],match:{state:'playing'}};
  installSquidSpawnPresentation({Actor,THREE,G,LANG:'en',TXT:{mode:'kbm'}});
  for(let i=0;i<count;i++){
    const a=new Actor();Object.assign(a,{team:i%2,alive:true,isLocal:i===0,pos:new THREE.Vector3(i*2,3,0),vel:new THREE.Vector3(0,0,0),form:'kid',s3:{squidSpawn:{phase:'aim',target:new THREE.Vector3(i*2,0,10)}}});G.actors.push(a);
  }
  G.local=G.actors[0];for(const a of G.actors)a.update(1/60);
  return {G,Actor,pods:()=>G.scene.getObjectByName('s3SquidSpawn').children.filter(o=>o.name==='s3Spawner')};
}

test('spawner geometry has five finite, bounded batches and no textures',()=>{
  const parts=buildSpawnerGeometry(THREE),bound=new THREE.Box3();let triangles=0,bytes=0;
  assert.deepEqual(Object.keys(parts),['chrome','dark','rails','gauge','tip']);
  for(const g of Object.values(parts)){
    assert.equal(g.index,null);assert.equal(g.groups.length,0);
    for(const name of ['position','normal','color']){const a=g.attributes[name];assert(a.array.every(Number.isFinite));assert.equal(a.count,g.attributes.position.count);bytes+=a.array.byteLength;}
    triangles+=g.attributes.position.count/3;bound.union(g.boundingBox);assert(g.boundingSphere.radius>0);
  }
  assert(triangles<=2800,`triangle ceiling: ${triangles}`);assert(bytes<300000,`shared attributes: ${bytes}`);
  assert(bound.min.y>-.78&&bound.max.y<.16,'full guard/skid envelope');
  assert(bound.min.x>-.53&&bound.max.x<.53,'guard width');
  assert(parts.chrome.boundingBox.max.y<.011,'unchanged top support height');
  assert(parts.rails.boundingBox.max.y>.12,'four guards above lid');
  assert(parts.rails.boundingBox.min.y<-.74,'low closed skids');
  for(const g of Object.values(parts))g.dispose();
  const r=runtime(),pod=r.pods()[0];assert.equal(pod.children.length,5);
  assert.equal(new Set(pod.children.map(o=>o.material)).size,5);
  for(const mesh of pod.children)for(const value of Object.values(mesh.material))assert(!value?.isTexture,'texture-free');
  assert(pod.children[0].material.metalness>pod.children[1].material.metalness);
  assert(pod.children[2].material.roughness<pod.children[1].material.roughness);
});

test('front well is genuinely recessed, rear casing closed, and head projects forward',()=>{
  const parts=buildSpawnerGeometry(THREE),group=new THREE.Group();
  for(const g of Object.values(parts))group.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));
  group.updateMatrixWorld(true);
  const front=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,2),new THREE.Vector3(0,0,-1)).intersectObject(group,true)[0]?.point.z;
  assert(front(.1,-.49)<.03,'open lower front well is not a filled second box');
  assert(front(.1,-.28)>.45,'cylindrical head projects beyond fascia');
  assert(front(.29,-.17)>.34,'broad upper fascia');
  const back=new THREE.Raycaster(new THREE.Vector3(0,-.3,-2),new THREE.Vector3(0,0,1)).intersectObject(group,true)[0]?.point.z;
  assert(back<-.34,'rear case closes the machine');
});

test('construction disposes indexed originals and expanded temporaries exactly once',()=>{
  const tracked=new Map(),register=g=>{tracked.set(g,0);g.addEventListener('dispose',()=>tracked.set(g,tracked.get(g)+1));return g;};
  const wrapped={...THREE};
  for(const name of ['BoxGeometry','CylinderGeometry','TorusGeometry','BufferGeometry'])wrapped[name]=class extends THREE[name]{constructor(...args){super(...args);register(this);}};
  const old=THREE.BufferGeometry.prototype.toNonIndexed;
  THREE.BufferGeometry.prototype.toNonIndexed=function(){const g=old.call(this);return g===this?g:register(g);};
  let parts;try{parts=buildSpawnerGeometry(wrapped);}finally{THREE.BufferGeometry.prototype.toNonIndexed=old;}
  const retained=new Set(Object.values(parts));assert.equal(retained.size,5);
  for(const [g,count]of tracked)assert.equal(count,retained.has(g)?0:1,'each temporary disposed once, cached output still alive');
  for(const g of retained)g.dispose();for(const count of tracked.values())assert.equal(count,1);
});

test('eight actors share five geometry batches without per-frame reconstruction',()=>{
  const r=runtime(8),first=r.pods()[0].children;
  for(const pod of r.pods())for(let i=0;i<5;i++)assert.equal(pod.children[i].geometry,first[i].geometry);
  for(let f=0;f<120;f++){r.G.time+=1/60;for(const a of r.G.actors)a.update(1/60);}
  assert.equal(r.pods().length,8);for(const pod of r.pods())for(let i=0;i<5;i++)assert.equal(pod.children[i].geometry,first[i].geometry);
  assert.equal(new Set(r.pods().map(p=>p.children[4].material)).size,2,'only one tip material per team');
});

for(const fps of [30,60,120])test(`model preserves wait, launch, vanish, re-entry and actor state at ${fps} Hz`,()=>{
  const r=runtime(),a=r.G.local,pod=r.pods()[0],state=JSON.stringify(a.s3),pos=a.pos.toArray();
  for(let f=0;f<fps;f++){r.G.time+=1/fps;assert.equal(a.update(1/fps),'native');}
  assert.equal(JSON.stringify(a.s3),state);assert.deepEqual(a.pos.toArray(),pos);assert(pod.visible);assert.equal(pod.position.y,3);
  a.s3.squidSpawn={phase:'flight',from:a.pos.clone(),to:new THREE.Vector3(0,0,10)};a.form='squid';a.pos.z=4;a.update(1/fps);
  const launch=r.G.time;assert.equal(pod.position.z,0,'pod stays at launch origin');
  r.G.time=launch+SPAWNER_LOOK.vanishAfter-.001;a.update(1/fps);assert.equal(pod.scale.x,1);
  r.G.time=launch+SPAWNER_LOOK.vanishAfter+SPAWNER_LOOK.vanishTime/2;a.update(1/fps);assert(Math.abs(pod.scale.x-.5)<1e-9);
  r.G.time=launch+SPAWNER_LOOK.vanishAfter+SPAWNER_LOOK.vanishTime+.001;a.update(1/fps);assert.equal(pod.visible,false);
  a.s3.squidSpawn={phase:'aim',target:new THREE.Vector3(0,0,10)};a.update(1/fps);assert(pod.visible);assert.equal(pod.scale.x,1);assert.equal(pod.position.z,4);
  a.s3.squidSpawn=null;a.update(1/fps);r.G.time+=SPAWNER_LOOK.vanishAfter+SPAWNER_LOOK.vanishTime+.01;a.update(1/fps);assert.equal(r.pods().length,0);
});
