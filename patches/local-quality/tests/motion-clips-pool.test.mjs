import test from 'node:test';import assert from 'node:assert/strict';
import {initMotionDiagnostics,beginMotionClips,appendMotionClip,motionDebug} from '../motion-diagnostics.mjs';
const make=()=>{const c={currentClips:[],status:'ready',variant:'Player00',contact:[1,0]};c.fallbacks=initMotionDiagnostics(c);return c;};
const publish=c=>motionDebug(c,'move','Nrml',1,1,2,2,.5);
test('unobserved clip frames reuse bounded private rows without materializing public descriptors',()=>{
 const c=make();for(let frame=0;frame<1000;frame++){
  beginMotionClips(c);for(let i=0;i<17;i++)appendMotionClip(c,'clip'+i,frame+i,.25);
  publish(c);assert.equal(c._iwDiagnostics.clips.ready,false);assert.equal(c._iwDiagnostics.materialized,false);
 }
 assert.deepEqual(c._iwDiagnostics.clipFrames.map(f=>f.rows.length),[17,17]);
 const records=c._iwDiagnostics.clipFrames.map(f=>f.rows.slice());
 beginMotionClips(c);for(let i=0;i<17;i++)appendMotionClip(c,'final',i,1,i===16);
 for(let side=0;side<2;side++)for(let i=0;i<17;i++)assert.equal(c._iwDiagnostics.clipFrames[side].rows[i],records[side][i]);
 assert.equal(c.currentClips[0].upperOnly,false);assert.deepEqual(Object.keys(c.currentClips[0]),['name','frame','weight','upperOnly']);
});
test('retained public clips and debug snapshots remain stable while private pools rotate',()=>{
 const c=make(),retained=[];
 for(let frame=0;frame<25;frame++){
  beginMotionClips(c);appendMotionClip(c,'a',frame,.5);appendMotionClip(c,'action',frame,.5,false);publish(c);
  const clips=c.currentClips,debug=c.debug;assert.equal(debug.clips,clips);
  retained.push({clips,debug,text:JSON.stringify(debug)});
  for(const r of retained)assert.equal(JSON.stringify(r.debug),r.text);
 }
 assert.notEqual(retained[0].clips,retained[2].clips);assert.notEqual(retained[0].clips[0],retained[2].clips[0]);
});
test('mid-advance reads see the previous diagnostic frame and receive later current-frame appends',()=>{
 const c=make();beginMotionClips(c);appendMotionClip(c,'old',1,1);publish(c);
 beginMotionClips(c);appendMotionClip(c,'new',2,.5);
 assert.equal(c.debug.clips[0].name,'old');const current=c.currentClips;
 appendMotionClip(c,'action',3,.5,true);assert.equal(current.length,2);publish(c);
 assert.equal(c.debug.clips,current);assert.equal(current[1].upperOnly,true);
});
test('external currentClips assignment and edits preserve the diagnostic publication boundary',()=>{
 const c=make();beginMotionClips(c);appendMotionClip(c,'source',1,1);publish(c);
 const external=[{custom:true}];c.currentClips=external;
 assert.equal(c.currentClips,external);assert.equal(c.debug.clips[0].name,'source');
 publish(c);assert.equal(c.debug.clips,external);external.push({another:true});assert.equal(c.debug.clips.length,2);
 beginMotionClips(c);appendMotionClip(c,'next',2,1);assert.equal(external.length,2);
});
test('external arrays assigned mid-advance receive subsequent source appends',()=>{
 const c=make();beginMotionClips(c);appendMotionClip(c,'source',1,1);publish(c);
 const previous=c.debug.clips,external=[];c.currentClips=external;
 appendMotionClip(c,'replacement',2,.5);appendMotionClip(c,'action',3,.5,false);
 assert.equal(c.currentClips,external);assert.equal(c.debug.clips,previous);
 assert.deepEqual(external,[{name:'replacement',frame:2,weight:.5},{name:'action',frame:3,weight:.5,upperOnly:false}]);
 publish(c);assert.equal(c.debug.clips,external);
 beginMotionClips(c);appendMotionClip(c,'next',4,1);assert.equal(external.length,2);
});
