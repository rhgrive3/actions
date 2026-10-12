import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptRetargetBranchUpdates } from '../retarget-branch-update-adapter.mjs';
const source = fs.readFileSync(new URL('../../../inkwave-public/src/game/motion/retarget.js',import.meta.url),'utf8');
const assets=new URL('../../../inkwave-public/assets/source-motion/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',assets)));
const inflate=parts=>gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(new URL(p,assets)))));
const catalog=JSON.parse(inflate(manifest.catalog.parts));
const extraExports=`
 import { SourceBank } from './inkwave-public/src/game/motion/source-bank.js';
 export { SourcePose } from './inkwave-public/src/game/motion/source-bank.js';
 export { HumanRetarget } from './inkwave-public/src/game/motion/retarget.js';
 export const makeBank=(meta,values)=>new SourceBank(meta,new Float32Array(values).buffer);
`;
test('four guarded edits only; malformed anchors fail closed; build-only transformer',()=>{
 const next=adaptRetargetBranchUpdates('src/game/motion/retarget.js',source);
 assert.equal((source.match(/c.kid.updateWorldMatrix\(true,true\)/g)||[]).length-(next.match(/c.kid.updateWorldMatrix\(true,true\)/g)||[]).length,4);
 assert.equal(adaptRetargetBranchUpdates('src/config.js',source),source);
 assert.throws(()=>adaptRetargetBranchUpdates('src/game/motion/retarget.js',source.replace('joint.quaternion.premultiply(this.ccdLocal).normalize();','unexpected();')),/anchor changed/);
});
async function realm(candidate){
 return fixture({includeCharacter:true,extraExports,adaptNative:(rel,code)=>rel==='src/game/motion/retarget.js'?(candidate?adaptRetargetBranchUpdates(rel,code):code):adaptBuildSource(rel,code),vmMathRandom:()=>.4});
}
function rig(api,variant){
 const data=inflate(manifest.variants[variant].parts);const values=Array.from(new Float32Array(data.buffer,data.byteOffset,data.length/4));
 const bank=api.makeBank(catalog.variants[variant],values),ch=new api.Character({weapon:'shooter',sourceMotion:false,style:{hair:variant==='Player00'?0:2,skin:2,outfit:0,eyes:0}});
 ch.sourceMotion.dispose();ch._sourceMotionDisposed=true;ch.root.position.set(.2,0,-.4);ch.root.rotation.y=.6;
 api.G.scene=new api.THREE.Scene();const parent=new api.THREE.Group();api.G.scene.add(parent);parent.add(ch.root);parent.position.set(1,.2,-2);parent.rotation.set(.03,-.2,.02);parent.scale.set(1.1,.95,1.05);
 // Deterministic plane/slope/contact fixture, not the gameplay collision engine.
 ch._ground=(x,z,n)=>{n?.set(-.05,1,-.025).normalize();return .05*x+.025*z;};
 const retarget=new api.HumanRetarget(ch,bank),pose=new api.SourcePose(bank);
 return {ch,bank,retarget,pose,parent};
}
function snapshot(rig){const nodes=[];rig.ch.root.traverse(o=>nodes.push([o.name,...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),...o.matrix.elements,...o.matrixWorld.elements]));return JSON.parse(JSON.stringify({nodes,contacts:rig.retarget.contacts.map(f=>({actual:f.actual.toArray(),clearance:f.lastClearance,slip:f.slip,reach:f.reachError,locked:f.locked,anchor:f.anchor.toArray()})),muzzle:rig.ch.getMuzzle(new rig.ch.root.position.constructor()).toArray()}));}
test('real source banks and native rig: exact transforms/contacts/muzzle at 30/60/120Hz, including forced CCD',async()=>{
 const apis=await Promise.all([realm(false),realm(true)]);let beforeCalls=0,afterCalls=0,ccd=0;
 for(const variant of ['Player00','Player01'])for(const hz of [30,60,120]){
  const rigs=apis.map(api=>rig(api,variant));
  const clips=['WaitHold_Nrml','WalkHold_Nrml','RunHold_Nrml','WaitShoot_Nrml'];
  for(let frame=0;frame<96;frame++){
   for(let side=0;side<2;side++){
    const r=rigs[side],api=apis[side],proto=api.THREE.Object3D.prototype,original=proto.updateWorldMatrix;let calls=0;
    proto.updateWorldMatrix=function(...args){calls++;return original.apply(this,args);};
    try{
     const clip=clips[Math.floor(frame/24)];r.bank.sample(clip,frame*60/hz,r.pose,true);r.ch.root.position.x+=.015;r.ch.root.position.y=.03*Math.sin(frame*.2);r.ch.root.rotation.y+=frame>=72?.04:0;r.parent.rotation.y+=.003;
     if(frame%24===0){r.ch.setWeapon(['shooter','dualies','roller','charger'][Math.floor(frame/24)]);r.ch.setLod(['hero','game','far','game'][Math.floor(frame/24)]);r.retarget.reset();}

     r.retarget.apply(r.pose,{aimPitch:.2,rootScale:frame%32<8?.2:1});r.retarget.ground(r.pose,1/hz,{grounded:true,enabled:true,contact:[.8,.9],speed:1.5,velocityX:.45,velocityZ:1.4});
     if(frame%8===0){const f=r.retarget.contacts[frame%2];r.ch._kidXform(f.limb.end,r.retarget.ccdA,f.endQ);r.retarget.liftFreeFoot(f,-.025);if(!side)ccd++;}
    }finally{proto.updateWorldMatrix=original;}
    if(side)afterCalls+=calls;else beforeCalls+=calls;
   }
   assert.deepEqual(snapshot(rigs[1]),snapshot(rigs[0]),`${variant} ${hz}Hz frame ${frame}`);
  }
 }
 assert.ok(ccd>=72);assert.ok(afterCalls<beforeCalls*.8,`branch pruning: ${beforeCalls} -> ${afterCalls}`);
 console.log(JSON.stringify({fixture:'native Character/source bank, matrix call counts (not device FPS)',beforeCalls,afterCalls,reduction:1-afterCalls/beforeCalls,forcedCCD:ccd}));
});
