import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';import {CLIP,inputAt,driveInput} from './timeline.mjs';
const root=process.env.SQUID_QA_SOURCE_ROOT||fileURLToPath(new URL('../../',import.meta.url));
const {sourceLoadedActorFixture}=await import(pathToFileURL(root+'/patches/splatoon3/tests/source-loaded-actor-fixture.mjs'));
test('continuous clip uses the actual Actor at60Hz and covers the full sequence at1x simulation time',async()=>{
 const f=await sourceLoadedActorFixture({sourceOnly:true,random:()=>.4});const sequences=[];
 for(let repeat=0;repeat<2;repeat++){
  f.G.time=0;const a=await f.make(),ch=a.character;ch.onEvent=null;const dt=1/CLIP.simulationHz;
  for(let i=0;i<60;i++){f.G.time+=dt;a._finishFrame(dt);}a.form='squid';a.submerged=false;for(let i=0;i<60;i++){f.G.time+=dt;a._finishFrame(dt);}
  const state={a,previous:'dry',jumpVelocity:0},frames=[];let airborne=false,landed=false;
  for(let i=0;i<CLIP.duration*CLIP.simulationHz;i++){
   driveInput(state,i*dt,dt);f.G.time+=dt;a._finishFrame(dt);
   if(state.previous==='jump'&&!a.grounded){airborne=true;assert.equal(ch.sourceMotion.debug.squid.name,'Sqd_Jump');}
   if(state.previous==='land'){landed=true;assert(a.grounded);assert.equal(a.pos.y,0);}
   if(i%2===1)frames.push({tick:i+1,state:state.previous,form:ch.form,grounded:a.grounded,position:a.pos.toArray(),debug:{...ch.sourceMotion.debug.squid}});
  }
  assert(airborne&&landed);assert.equal(ch.form,'kid');assert.equal(frames.length,CLIP.duration*CLIP.fps);assert.equal(frames.at(-1).tick/CLIP.simulationHz,10);
  assert.deepEqual([...new Set(frames.map(f=>f.state))],['dry','jump','land','swim','turn90','turn180','stop','emerge','dive','return-settle','dive-reverse-start','dive-reverse','dive-double-reverse','return-final']);sequences.push(frames);f.reset();
 }
 assert.deepEqual(sequences[0],sequences[1],'post-recording coverage replay preserves actual source state');
 assert.equal(inputAt(0).state,'dry');assert.equal(inputAt(7.99).state,'emerge');
 console.log('CONTINUOUS_TIMELINE '+JSON.stringify({seconds:CLIP.duration,simulationHz:CLIP.simulationHz,framesAt30Hz:sequences[0].length,replays:2}));
});
