import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateIdleResult } from '../check-inkwave-idle-resources.mjs';
const sample=()=>({
  coldBoot:{quality:'high',touch:true,gamePublishedAtAllocation:false,marina:true,cloud:[1024,320],farSize:256,sameTargetsAfterBoot:true},
  clouds:['day','sunset','golden'].map(theme=>({theme,highBytes:10485760,lowBytes:2621440,meanByteError:1,largeErrorFraction:.001,highRepeatChanged:0,nonzero:1000})),
  far:Array.from({length:4},()=>({size:256,disposes:1,deleted:true,cleared:true,sameEnvironment:true})),
  pause:{renders:1,environment:0,paint:0,shadowMarks:0,menuTicks:120,matchUnchanged:true,resizeRenders:1,resumedRenders:1,onlineRenders:3},
  audio:{running:true,initialPlayers:0,initialScheduler:false,mutedTicks:0,mutedNodes:0,mutedPlayers:0,mutedScheduler:false,sfxPlayed:true,resumedTrack:'battle',toggleMaxPlayers:1},
  errors:[],gpu:{webgl:'WebGL 2.0 fixture',renderer:'schema-only'}
});
test('acceptance schema can represent all required observations, not a GPU claim',()=>assert.equal(validateIdleResult(sample()).farTransitions,4));
for(const [name,mutate] of [
 ['late mobile budget',r=>r.coldBoot.gamePublishedAtAllocation=true],['oversized cold cloud',r=>r.coldBoot.cloud=[2048,640]],['oversized cold cube',r=>r.coldBoot.farSize=512],['late replacement hides cold budget',r=>r.coldBoot.sameTargetsAfterBoot=false],
 ['missing cloud theme',r=>r.clouds.pop()],['NaN appearance',r=>r.clouds[0].meanByteError=NaN],['banding outlier',r=>r.clouds[1].largeErrorFraction=.2],['blank clouds',r=>r.clouds[0].nonzero=0],
 ['unallocated cube',r=>r.far[0].deleted=false],['stale sampler',r=>r.far[2].cleared=false],['duplicate dispose',r=>r.far[1].disposes=2],
 ['paused CPU work',r=>r.pause.environment=1],['paused rendering',r=>r.pause.renders=120],['frozen online',r=>r.pause.onlineRenders=0],['music wakeup',r=>r.audio.mutedTicks=1],['muted voices',r=>r.audio.mutedNodes=1],['silent SFX',r=>r.audio.sfxPlayed=false]
])test('rejects '+name,()=>{const r=sample();mutate(r);assert.throws(()=>validateIdleResult(r));});
test('active suite invokes exact-source probe and binds its successful evidence, preserving other families',()=>{
 const w=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
 assert.match(w,/node scripts\/check-inkwave-idle-resources\.mjs[^\n]+--exact-source/);
 assert.match(w,/'active':\[[^\n]+'idle-resources\/idle-resources-result.json'/);
 for(const name of ['motion-detail','wall','flow','responsive','identity-touch'])assert.ok(w.includes(name));
});
