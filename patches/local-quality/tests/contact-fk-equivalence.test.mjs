import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptGroundContactFk} from '../motion-fk-hotpath-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';

// Reverse only the new contact specialization. Every earlier optimization,
// source bank, pose coefficient and all unrelated production adapters match.
const beforeContact = (rel, raw) => adaptGroundContactFk(rel,adaptBuildSource(rel,raw),
 (code,before,after,label)=>replaceOnce(code,after,before,'control '+label));
const snapshot = ch => JSON.parse(JSON.stringify({
 bones:ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),
 skin:Array.from(ch.skeleton.boneMatrices),
 feet:ch.sourceMotion.retarget.contacts.map(f=>({locked:f.locked,anchor:f.anchor.toArray(),actual:f.actual.toArray(),slip:f.slip})),
 muzzle:ch.getMuzzle(new ch.root.position.constructor()).toArray(),
},(_key,value)=>{if(typeof value==='number')assert(Number.isFinite(value));return value;}));

test('contact branch FK preserves real loaded motion and reduces world matrix calls',async()=>{
 const counts=[0,0],times=[0,0];let comparisons=0;
 for(const hz of [30,60,120]) {
  const apis=await Promise.all([sourceLoadedActorFixture({transform:beforeContact,sourceOnly:true,random:()=>.25}),
   sourceLoadedActorFixture({sourceOnly:true,random:()=>.25})]);
  const actors=await Promise.all(apis.map(api=>api.make())),chars=actors.map(a=>a.character);
  const restores=apis.map((api,k)=>{
   const proto=api.THREE.Object3D.prototype,original=proto.updateWorldMatrix;
   proto.updateWorldMatrix=function(...args){counts[k]++;return original.apply(this,args);};
   return ()=>{proto.updateWorldMatrix=original;};
  });
  try {
   for(const ch of chars){ch.onEvent=null;ch.setWeapon('shooter');}
   for(let frame=0;frame<36;frame++) {
    const phase=Math.floor(frame/6),dt=frame===7?0:frame===21?.05:1/hz;
    for(let k=0;k<2;k++){
     const ch=chars[k];ch.root.position.x+=phase===2?.04:0;ch.root.position.z+=phase===1?.05:0;
     if(phase===2)ch.root.rotation.y+=.08;
     const airborne=phase===3;
     if(frame===18)ch.trigger('jump');if(frame===24)ch.trigger('land');
     if(phase===4&&frame%2===0)ch.trigger('shoot');
     apis[k].G.time+=dt;
     const t=performance.now();
     ch.update(dt,{form:phase===5?'squid':'kid',grounded:!airborne,speed:phase===1?5.76:phase===2?1.2:0,
      localMove:{x:phase===2?1:0,z:1},firing:phase===4,charge:0,ink:1,hp:1,vy:airborne?2:0,aimPitch:.12});
     times[k]+=performance.now()-t;
     ch.root.updateMatrixWorld(true);ch.skeleton.update();
    }
    assert.deepEqual(snapshot(chars[1]),snapshot(chars[0]),`${hz} Hz frame ${frame}`);comparisons++;
   }
  } finally {restores.forEach(fn=>fn());apis.forEach(api=>api.reset());}
 }
 assert(counts[1]<counts[0]*.8,`expected fewer world updates: ${counts}`);
 console.log(JSON.stringify({fixture:'contact-only FK; real source banks; no GPU/device FPS',comparisons,hz:[30,60,120],
  worldMatrixCalls:{before:counts[0],after:counts[1],reduction:1-counts[1]/counts[0]},
  instrumentedCharacterUpdateMs:{before:times[0],after:times[1]},timingLimit:'instrumentation and shared-host load; call counts are deterministic'}));
});
