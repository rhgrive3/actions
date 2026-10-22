import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initMotionDiagnostics,motionDebug,manualMotionDebug,motionDebugScalar,motionDebugBody,motionDebugSquid} from '../motion-diagnostics.mjs';
import {adaptRuntimeFrameScratch} from '../runtime-frame-scratch-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
const rel='src/game/motion/source-controller.js',raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'),edits=[];
adaptRuntimeFrameScratch(rel,raw,(code,from,to,label)=>{if(label.includes('lazy detached motion diagnostics'))edits.push({from,to});return replaceOnce(code,from,to,label);});
function baseline(name,source){if(name!==rel)return source;for(const {from,to}of [...edits].reverse())source=replaceOnce(source,to,from,'pre-lazy-diagnostic control');return source;}
const json=value=>JSON.stringify(value);

test('unobserved diagnostics retain scalar records only; observed exports remain detached and writable',()=>{
 const c={status:'ready',variant:'Player00',currentClips:[],contact:[1,0]};c.fallbacks=initMotionDiagnostics(c);c.fallbacks.add('a');let previous=null;
 for(let tick=0;tick<1000;tick++){
  c.currentClips=[{name:'Wait',frame:tick,weight:1}];motionDebug(c,'idle','Nrml',1,2,3,4,.5);motionDebugScalar(c,'groundMode','plant');motionDebugBody(c,true,tick);motionDebugSquid(c,'Sqd_Wait',tick);
  assert.equal(c._iwDiagnostics.materialized,false);if(previous)assert.equal(c._iwDiagnostics.fallbackValues,previous,'unchanged fallback list has no per-frame copy');previous=c._iwDiagnostics.fallbackValues;
 }
 const snapshot=c.debug,serialized=json(snapshot);assert.equal(snapshot.clips,c.currentClips);assert.equal(c.debug,snapshot);c.contact[0]=0;c.fallbacks.clear();c.fallbacks.add('b');assert.equal(json(snapshot),serialized);
 motionDebug(c,'move','Nrml',4,5,6,7,.2);motionDebugBody(c,false,3);const next=c.debug;assert.notEqual(next,snapshot);assert.deepEqual(next.fallbacks,['b']);assert.equal(json(snapshot),serialized);
 motionDebugSquid(c,'Sqd_Jump',7);assert.deepEqual(next.squid,{name:'Sqd_Jump',frame:7},'an already observed current-frame export receives later annotations');
 c.currentClips=[{name:'manual',frame:2,weight:1}];manualMotionDebug(c);assert.deepEqual(Object.keys(c.debug),['status','state','variant','clips']);
 const external={custom:true};c.debug=external;motionDebugScalar(c,'fallback','native');assert.equal(c.debug,external);assert.equal(external.fallback,'native');
});

test('fully composed source actors preserve diagnostics, retained snapshots, motion and gameplay at all display rates',async()=>{
 const apis=await Promise.all([sourceLoadedActorFixture({sourceOnly:true,random:()=>.4,moduleTransform:baseline}),sourceLoadedActorFixture({sourceOnly:true,random:()=>.4})]);let compared=0,unobserved=0;
 try {for(const hz of [30,60,120]){
  const actors=await Promise.all(apis.map(api=>api.make())),retained=[];
  for(let tick=0;tick<65;tick++){
   actors.forEach((a,i)=>{a.intent.move.set(tick<8?0:1,0,tick%20<10?1:0);a.intent.squid=tick>=40&&tick<55;if(tick===20)a.character.sourceMotion.playClip('WaitHold_Nrml',{frame:2,rate:1});if(tick===30)a.character.sourceMotion.stopClip();apis[i].tick(a,1/hz);});
   const pair=actors.map(a=>a.character.sourceMotion);
   if(!pair[1]._iwDiagnostics.materialized)unobserved++;
   const state=a=>({pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,hp:a.hp,form:a.form,phase:a.character.sourceMotion.phase,bones:a.character.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()])});
   assert.equal(json(state(actors[1])),json(state(actors[0])));compared++;
   for(const old of retained)assert.equal(json(old[1]),json(old[0]),'historical export remains equivalent after later ticks');
   if(tick%5===0){const values=pair.map(c=>c.debug);assert.equal(json(values[1]),json(values[0]));assert.equal(values[1].clips,pair[1].currentClips);retained.push(values);}
  }
  apis.forEach(api=>api.reset());
 }}finally{apis.forEach(api=>api.reset());}
 assert.ok(unobserved>150,'ordinary unobserved animation ticks do not materialize export snapshots');console.log(JSON.stringify({compared,unobserved,rates:[30,60,120],scope:'three exported allocation sites removed; existing clip descriptors retained'}));
});
