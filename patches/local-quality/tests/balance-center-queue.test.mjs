import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
const snap=p=>structuredClone({p:p.p.map(v=>v.toArray()),q:p.q.map(v=>v.toArray()),world:p.world.map(m=>Array.from(m.elements)),wp:p.wp.map(v=>v.toArray()),wq:p.wq.map(v=>v.toArray())});
test('only cache-constructed single profile centers skip FK; mixed/custom centers retain exact fallback',async()=>{
 const f=await sourceLoadedActorFixture({sourceOnly:true,random:()=>.4,extraExports:"export {locomotionProfile,isPreparedGaitCenter} from './src/game/motion/locomotion-profile.js';export {SourcePose} from './src/game/motion/source-bank.js';"});
 try{const a=await f.make(),c=a.character.sourceMotion,bank=c.bank,B=c.bodyBalance.constructor,walk=f.locomotionProfile(bank,'WalkHold_Nrml'),run=f.locomotionProfile(bank,'RunHold_Nrml');
  assert.equal(f.isPreparedGaitCenter(walk.centerPose),true);const custom={...walk,centerPose:new f.SourcePose(bank)};assert.equal(f.isPreparedGaitCenter(custom.centerPose),false);
  const counts=[];for(const list of [[[walk,1]],[[walk,.6],[run,.4]],[[walk,.4],[walk,.6]],[[custom,1]]]){
   const pair=[new B(bank),new B(bank)],calls=[0,0];pair.forEach((b,k)=>{const old=b.center.fk;b.center.fk=function(...args){calls[k]++;return old.apply(this,args);};b.clear();for(const [p,w]of list)b.add(p,w);if(k===1)b._soleCenter=null;});
   const out=pair.map(b=>b.apply(c.pose,c.pose,{run:.3,pivot:.4,strafe:.2}));assert.deepEqual(snap(out[1]),snap(out[0]));assert.deepEqual(structuredClone(pair[1].targets.wp.map(v=>v?.toArray())),structuredClone(pair[0].targets.wp.map(v=>v?.toArray())));
   assert.deepEqual(calls,list.length===1&&list[0][0]===walk?[0,1]:[1,1]);counts.push(calls);pair[0].clear();assert.equal(pair[0]._soleCenter,null);
  }
  console.log(JSON.stringify({scope:'actual source bank/SourcePose single/mixed/custom center parity',centerFK:counts}));
 }finally{f.reset();}
});
