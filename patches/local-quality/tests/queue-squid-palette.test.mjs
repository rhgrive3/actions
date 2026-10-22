import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

// Invoke the vendored renderer's real skeleton scheduling code. Geometry and
// attribute GPU uploads are stubs; this is matrix-palette/lifetime evidence.
const source=fs.readFileSync(new URL('../../../inkwave-public/vendor/three/build/three.module.js',import.meta.url),'utf8');
const start=source.indexOf('function WebGLObjects('),end=source.indexOf('\n}\n',start)+2;
assert.ok(start>0&&end>start);
const WebGLObjects=new Function(source.slice(start,end)+'\nreturn WebGLObjects;')();

test('source squid render owns the final palette once per shared skeleton, including hidden return and context reset',async()=>{
  const f=await sourceLoadedActorFixture({sourceOnly:true,random:()=>.4,extraExports:"export {SourcePose} from './src/game/motion/source-bank.js';"}),a=await f.make(),ch=a.character,rig=ch.sourceMotion.squidRig;
  const skeleton=rig.skeleton,nativeUpdate=skeleton.update;let updates=0;
  skeleton.computeBoneTexture();skeleton.update=function(){updates++;return nativeUpdate.call(this);};
  const info={render:{frame:0}},objects=WebGLObjects({}, {get:(_o,g)=>g,update(){}},{},{},info),pose=new f.SourcePose(rig.bank),matrix=new f.THREE.Matrix4();let frames=0,applications=0;
  const expected=()=>{const out=new Float32Array(skeleton.bones.length*16);for(let i=0;i<skeleton.bones.length;i++)matrix.multiplyMatrices(skeleton.bones[i].matrixWorld,skeleton.boneInverses[i]).toArray(out,i*16);return Buffer.from(out.buffer);};
  try {for(const hz of [30,60,120])for(let frame=0;frame<36;frame++){
    const form=['squid','swim','climb'][frame%3];ch.form=form;ch.grounded=frame%4!==0;ch.isLocal=frame%5!==0;
    if(frame%11===0)ch.setLod(frame%22===0?'game':'hero');
    const before=updates;
    for(let tick=0;tick<1+frame%3;tick++){
      rig.bank.sample('Sqd_Wait',(frame+tick)/hz*60,pose,true);
      rig.apply(pose,{form,wallNormal:new f.THREE.Vector3(0,0,-1),velocityY:.4,speed:4,localX:.2,localZ:.9,yaw:frame*.02});applications++;
    }
    assert.equal(updates,before,'simulation apply never uploads a palette');
    if(frame%7===0)continue; // a completely unrendered frame needs no palette
    info.render.frame++;const wanted=expected(),version=skeleton.boneTexture.version;
    for(const name of ['body','ghost','dark']){assert.equal(ch.squid[name].skeleton,skeleton);objects.update(ch.squid[name]);}
    assert.equal(updates,before+1,'three bound meshes share one renderer update');
    assert.equal(skeleton.boneTexture.version,version+1);assert.deepEqual(Buffer.from(skeleton.boneMatrices.buffer,0,skeleton.bones.length*16*4),wanted,'draw sees the final sampled pose');frames++;
    objects.update(ch.squid.body);assert.equal(updates,before+1,'same pass does not update twice');
    if(frame%13===0){objects.dispose();objects.update(ch.squid.ghost);assert.equal(updates,before+2,'context scheduling reset uploads before first restored draw');}
  }
  const before=updates;rig.resetDeformation();assert.equal(updates,before+1,'explicit CPU reset retains immediate palette update');
  console.log(JSON.stringify({scope:'actual source bank and vendored WebGLObjects CPU palette, GPU pixel acceptance separate',frames,applications,rates:[30,60,120]}));
  } finally{f.reset();}
});
