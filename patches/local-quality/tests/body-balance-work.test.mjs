import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {baselineBalanceSource,characterSnapshot,poseSnapshot,balanceRel} from './body-balance-work-fixture.mjs';

test('production-composed characters retain every final transform/muzzle at 30/60/120Hz',async()=>{
 const sourceOnly=!process.env.INKWAVE_BUILT_SITE;
 const emittedTransform=(rel,raw)=>rel===balanceRel?baselineBalanceSource(rel,raw):raw;
 const pair=await Promise.all([sourceLoadedActorFixture({sourceOnly,transform:baselineBalanceSource,emittedTransform,random:()=>.4}),sourceLoadedActorFixture({sourceOnly,random:()=>.4})]);
 let frames=0;
 try{for(const variant of ['Player00','Player01'])for(const hz of [30,60,120])for(const weapon of ['shooter','charger','roller']){
  const actors=await Promise.all(pair.map(api=>api.make()));
  for(const a of actors){a.setWeapon(weapon);a.character.onEvent=null;if(variant==='Player01')await a.character.sourceMotion.setVariant(variant);}
  const chars=actors.map(a=>a.character);
  const indices=chars[1].sourceMotion.bodyBalance.rotationWorldIndices;
  assert.ok(indices.length<chars[1].sourceMotion.bank.bones.length/2,'unused intermediate rotations removed');
  for(let i=0;i<hz;i++){
   const dt=1/hz,phase=Math.floor(i*6/hz),angle=i*.03;
   for(let k=0;k<2;k++){
    const ch=chars[k];pair[k].G.time+=dt;
    ch.root.position.set(Math.sin(angle)*.4,phase===4?.3:0,Math.cos(angle)*.4);ch.root.rotation.y=angle;
    if(i===Math.floor(hz/3))ch.trigger('shoot');if(i===Math.floor(hz*2/3))ch.trigger('jump');
    ch.update(dt,{form:phase===5?'squid':'kid',grounded:phase!==4,speed:phase===0?0:phase===1?.1:4,localMove:{x:Math.sin(angle),z:Math.cos(angle)},firing:phase===2,ink:1,hp:1,vy:phase===4?2:0,aimPitch:.12});
    ch.root.updateMatrixWorld(true);ch.skeleton.update();
   }
   assert.deepEqual(structuredClone(characterSnapshot(chars[1])),structuredClone(characterSnapshot(chars[0])),variant+' '+weapon+' '+hz+'Hz frame '+i);frames++;
  }
  pair.forEach(api=>api.reset());
 }}finally{pair.forEach(api=>api.reset());}
 console.log(JSON.stringify({comparedFrames:frames,scope:'full source-loaded transforms, skeleton, contact and muzzle; no device FPS claim'}));
});

test('ancestor closure keeps exact balance output and generic skeleton fallback',async()=>{
 const f=await sourceLoadedActorFixture({sourceOnly:!process.env.INKWAVE_BUILT_SITE,random:()=>.4,extraExports:"export {locomotionProfile} from './src/game/motion/locomotion-profile.js';"});
 try{
  const a=await f.make(),c=a.character.sourceMotion,bank=c.bank,B=c.bodyBalance.constructor;
  const optimized=new B(bank),fallback=new B({...bank,parentsFirst:false});
  const counts=[0,0];
  [optimized,fallback].forEach((b,k)=>b.world.forEach(q=>{const fn=q.premultiply;q.premultiply=function(...args){counts[k]++;return fn.apply(this,args);};}));
  const needed=new Set(optimized.rotationWorldIndices);
  for(const i of needed)if(bank.bones[i].parent>=0)assert.ok(needed.has(bank.bones[i].parent));
  assert.equal(fallback.rotationWorldIndices.length,bank.bones.length);
  for(const weight of [0,.2,1])for(const pivot of [0,.5,1])for(const strafe of [0,.5,1]){
   for(const b of [optimized,fallback]){b.clear();b.add(f.locomotionProfile(bank,'WalkHold_Nrml'),.6);b.add(f.locomotionProfile(bank,'RunHold_Nrml'),.4);b.apply(c.pose,c.pose,{run:.4,weight,pivot,strafe});}
   assert.deepEqual(poseSnapshot(optimized.pose),poseSnapshot(fallback.pose));
   assert.deepEqual(optimized.targets.wp.map(v=>v.toArray()),fallback.targets.wp.map(v=>v.toArray()));
  }
  assert.ok(counts[1]>0&&counts[0]<counts[1]/2,'actual intermediate quaternion work decreases');
  console.log(JSON.stringify({intermediateMultiplications:counts}));
 }finally{f.reset();}
});
