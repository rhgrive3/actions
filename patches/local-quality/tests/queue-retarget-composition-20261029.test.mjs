import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptRemainingVisualQueue20261027} from '../queue-remaining-visual-20261027-adapter.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

const target='src/game/motion/retarget.js';
const shared='invRot=(c.kid.matrixWorld.decompose(this.ccdA,this.groundInvQ,this.ccdB),this.groundForwardQ.copy(this.groundInvQ),this.groundInvQ.invert());';
const previous='invRot=(c.kid.matrixWorld.decompose(this.ccdA,this.groundInvQ,this.ccdB),this.groundInvQ.invert());';
function before(rel,raw){
 let code=adaptBuildSource(rel,raw);
 if(rel===target){
  assert(code.includes(shared));
  code=code.replace(shared,previous).replace('q.copy(this.groundForwardQ).multiply(f.orientation);','q.copy(this.groundInvQ).invert().multiply(f.orientation);');
 }
 return code;
}
test('retarget sharing composes after contact FK and retains strict anchor rejection',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/'+target,import.meta.url),'utf8');
 const final=adaptBuildSource(target,raw);
 assert.equal(final.split(shared).length,2);
 assert(!final.includes('invRot=c.kid.getWorldQuaternion'));
 assert.throws(()=>adaptRemainingVisualQueue20261027(target,final),/expected 1 anchors/);
});
function snapshot(a){
 const c=a.character;
 c.root.updateMatrixWorld(true);c.skeleton.update();
 return JSON.parse(JSON.stringify({
  nodes:c.boneList.map(b=>[...b.quaternion.toArray(),...b.position.toArray(),...b.matrixWorld.elements]),
  contacts:c.sourceMotion.retarget.contacts.map(f=>[...f.anchor.toArray(),...f.actual.toArray(),f.slip,f.lastClearance]),
  muzzle:c.getMuzzle(new c.root.position.constructor()).toArray(),
 }));
}
test('production retarget preserves both feet, poses and muzzle at 30/60/120 Hz with scaled parents',async()=>{
 const apis=await Promise.all([sourceLoadedActorFixture({transform:before,random:()=>.4}),sourceLoadedActorFixture({random:()=>.4})]);
 try{
  for(const hz of [30,60,120]){
   const actors=await Promise.all(apis.map(api=>api.make()));
   actors.forEach((a,i)=>{
    const parent=new apis[i].THREE.Group();apis[i].G.scene.add(parent);parent.add(a.character.root);
    parent.position.set(.1,.2,-.1);parent.rotation.set(.02,.4,-.03);parent.scale.set(1.1,.9,1.05);
   });
   for(let frame=0;frame<48;frame++){
    actors.forEach((a,i)=>{
     const c=a.character;apis[i].G.time+=1/hz;c.root.position.z+=2/hz;c.root.rotation.y+=.01;
     c.update(1/hz,{form:'kid',grounded:true,speed:2,vy:0,firing:false,rolling:false,localMove:{x:0,z:1},ink:1,hp:1});
    });
    assert.deepEqual(snapshot(actors[1]),snapshot(actors[0]),hz+' Hz frame '+frame);
   }
   apis.forEach(api=>api.reset());
  }
 }finally{apis.forEach(api=>api.reset());}
});
