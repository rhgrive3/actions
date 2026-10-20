import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {createRainmakerModel,createRainmakerPresentation} from '../runtime/ranked/rainmaker-model.mjs';
function subject() {
 const scene=new THREE.Scene(),root=new THREE.Group(),world=new THREE.Group(),hand=new THREE.Group();
 scene.add(root,world);root.add(hand);hand.position.set(.25,1.1,.4);
 const pivot=new THREE.Group();pivot.position.set(.0255,-.0525,0);hand.add(pivot);
 const actor={nid:'a',team:0,slot:0,alive:true,pos:new THREE.Vector3(),yaw:0,aimDir:new THREE.Vector3(0,0,1),character:{root,bones:{handR:hand},weapon:{pivot}}};
 const mesh=createRainmakerModel(THREE);world.add(mesh);const visual=createRainmakerPresentation(THREE,mesh);
 return {scene,root,world,hand,pivot,actor,mesh,visual};
}
function closeVec(a,b){assert.ok(a.distanceTo(b)<1e-6,JSON.stringify([a.toArray(),b.toArray()]));}
test('single-draw gold fish silhouette has finite low-budget geometry and an open dark mouth',()=>{
 const mesh=createRainmakerModel(THREE),g=mesh.geometry,p=g.getAttribute('position');let bytes=0;
 for(const a of Object.values(g.attributes)){bytes+=a.array.byteLength;assert.ok(Array.from(a.array).every(Number.isFinite));}
 bytes+=g.index.array.byteLength;const triangles=g.index.count/3;assert.equal(triangles,444);assert.equal(bytes,15948);
 assert.equal(mesh.isMesh,true);assert.equal(mesh.children.length,0);assert.ok(!Array.isArray(mesh.material));
 assert.ok(g.boundingBox.min.z<-.009&&g.boundingBox.max.z>.898&&g.boundingBox.max.y>.333);assert.equal(mesh.userData.rainmakerModel.revision,3);
 const c=g.getAttribute('color');let darkMouth=0;
 for(let i=0;i<p.count;i++)if(p.getZ(i)>.44&&c.getX(i)<.1&&c.getY(i)<.1)darkMouth++;
 assert.ok(darkMouth>=12);assert.equal(mesh.material.vertexColors,true);
 console.log(JSON.stringify({triangles,bytes,bounds:[g.boundingBox.min.toArray(),g.boundingBox.max.toArray()],draws:1,darkMouth}));g.dispose();mesh.material.dispose();
});
test('held model borrows the native fist position, aims forward and does not mutate gameplay or pose',()=>{
 const s=subject();s.root.position.set(3,.4,-2);s.root.rotation.y=.75;s.world.position.set(-1,0,2);s.world.rotation.y=-.3;
 s.actor.aimDir.set(.4,.3,1).normalize();const before=s.actor.pos.toArray();s.visual.update(s.actor,.5);s.scene.updateMatrixWorld(true);
 closeVec(s.mesh.getWorldPosition(new THREE.Vector3()),s.pivot.getWorldPosition(new THREE.Vector3()));assert.ok(s.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(s.hand.getWorldPosition(new THREE.Vector3()))>.05,'the wrist is not the native fist anchor');
 closeVec(new THREE.Vector3(0,0,1).applyQuaternion(s.mesh.getWorldQuaternion(new THREE.Quaternion())),s.actor.aimDir);
 assert.deepEqual(s.actor.pos.toArray(),before);assert.equal(s.pivot.visible,false);assert.equal(s.mesh.visible,true);s.visual.release();assert.equal(s.pivot.visible,true);
});
test('release restores each original visibility including hidden dual weapons',()=>{
 const s=subject(),left=new THREE.Group();s.hand.add(left);left.visible=false;s.actor.character.weapon.left={pivot:left};
 s.visual.update(s.actor,1);assert.equal(s.pivot.visible,false);assert.equal(left.visible,false);assert.ok(s.mesh.material.emissiveIntensity>0);
 s.visual.update(null,0);assert.equal(s.pivot.visible,true);assert.equal(left.visible,false);assert.deepEqual(s.mesh.position.toArray(),[0,1,0]);assert.equal(s.mesh.material.emissiveIntensity,0);s.visual.release();assert.equal(left.visible,false);
});
test('switching carrier or weapon while held restores old borrowed visibility',()=>{
 const s=subject(),old=s.pivot,next=new THREE.Group();s.hand.add(next);next.visible=false;
 s.visual.update(s.actor);s.actor.character.weapon={pivot:next};s.visual.update(s.actor);assert.equal(old.visible,true);assert.equal(next.visible,false);
 s.visual.update(null);assert.equal(next.visible,false);
});
test('hidden and unavailable character states do not leave an orphan held model',()=>{
 const s=subject();s.visual.update(s.actor);s.root.visible=false;s.visual.update(s.actor);assert.equal(s.mesh.visible,false);
 s.root.visible=true;s.actor.alive=false;s.visual.update(s.actor);assert.equal(s.pivot.visible,true);assert.deepEqual(s.mesh.position.toArray(),[0,1,0]);
});
test('objective resources have a single owner and presentation release is idempotent',()=>{
 const s=subject();let g=0,m=0;s.mesh.geometry.addEventListener('dispose',()=>g++);s.mesh.material.addEventListener('dispose',()=>m++);
 s.visual.update(s.actor);s.visual.release();s.visual.release();assert.equal(s.pivot.visible,true);assert.equal(g,0);assert.equal(m,0);
 s.mesh.geometry.dispose();s.mesh.material.dispose();assert.equal(g,1);assert.equal(m,1);
});

test('front centre sees the dark opening rather than a closed gold head',()=>{const m=createRainmakerModel(THREE);m.updateMatrixWorld();const hits=new THREE.Raycaster(new THREE.Vector3(0,-.056,2),new THREE.Vector3(0,0,-1)).intersectObject(m);assert.ok(hits.length);const c=m.geometry.getAttribute('color');assert.ok(c.getX(hits[0].face.a)<.1,'front mouth aperture must remain visible');console.log(JSON.stringify({point:hits[0].point.toArray(),color:[c.getX(hits[0].face.a),c.getY(hits[0].face.a),c.getZ(hits[0].face.a)]}));m.geometry.dispose();m.material.dispose();});
