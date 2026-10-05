#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {persistentDirectory,sampleStats} from './lib/inkwave-runtime-evidence.mjs';
const option=name=>process.argv[process.argv.indexOf(name)+1];
const before=JSON.parse(fs.readFileSync(option('--before'))),after=JSON.parse(fs.readFileSync(option('--after')));
const errors=[];
for(const [label,r]of [['before',before],['after',after]]){
 if(r.status!=='passed')errors.push(label+' failed');
 if(!/^[a-f0-9]{40}$/.test(r.sourceSha||'')||!r.verifiedRuntimeFiles.includes('src/core/renderer.js'))errors.push(label+' missing active source receipt');
}
if(before.environment.seedMode!=='reset-each-fixed-step'||after.environment.seedMode!=='reset-each-fixed-step')errors.push('Uncontrolled window RNG');
if(before.audioRngFixtureEnabled!==true||after.audioRngFixtureEnabled!==true)errors.push('Missing real audio RNG fixture');
if(before.environment.audioRngMode!=='independent-seeded-audio'||after.environment.audioRngMode!=='independent-seeded-audio')errors.push('Uncontrolled audio RNG');
if(before.environment.fixtureClockMode!=='canonical-battle-zero-phase'||after.environment.fixtureClockMode!=='canonical-battle-zero-phase')errors.push('Uncontrolled battle clock phase');
for(const k of ['cpu','cores','platform','quality','viewport','webgl','repetitions','browser','seed','seedMode'])if(JSON.stringify(before.environment[k])!==JSON.stringify(after.environment[k]))errors.push('Different environment: '+k);
for(const [label,r]of [['before',before],['after',after]])if(JSON.stringify(r.scenarios.map(x=>x.scenario))!==JSON.stringify(['title','settings','battle']))errors.push(label+' incomplete scenario set');
if(after.inputStatus!=='synchronous'||after.input.length!==36||after.input.some(r=>r.state!==true||r.targetOwnerCorrect!==true||!Number.isFinite(r.targetError)||r.targetError>.5)||['kbm','pad','touch'].some(mode=>after.input.filter(r=>r.mode===mode).length!==12))errors.push('Candidate input target regression');
if(JSON.stringify(after.modeSwitchInput?.map(r=>[r.from,r.to]))!==JSON.stringify([['pad','kbm'],['kbm','pad'],['touch','kbm'],['touch','pad']])||after.modeSwitchInput.some(r=>r.primedPaint!==true||!Array.isArray(r.primedOpacity)||r.primedOpacity.length!==2||r.primedOpacity.some(v=>!Number.isFinite(v)||v<.9)||r.state!==true||r.targetOwnerCorrect!==true||!Number.isFinite(r.targetError)||r.targetError>.5||typeof r.beforeOn!=='boolean'||r.ringOn!==true||r.ringVisibility==='hidden'||r.beforeOn&&r.visualStarted!==true||!r.beforeOn&&(!Number.isFinite(r.firstAppearanceError)||r.firstAppearanceError>.5)))errors.push('Mode-switch navigation outline regression');
if(after.input.some(r=>typeof r.ringOn!=='boolean'||typeof r.ringVisibility!=='string'||!r.ringOn&&r.ringVisibility!=='hidden'||r.ringOn&&r.ringVisibility==='hidden'))errors.push('Retired ring still visible');
if(after.ringRetirement?.length!==3||after.ringRetirement.some(r=>!Number.isFinite(r.beforeOpacity)||r.beforeOpacity<.9||r.stateChanged!==true||typeof r.ringOn!=='boolean'||r.ringOn||typeof r.ghost!=='boolean'||r.ghost||r.visibility!=='hidden'))errors.push('Unverified ring retirement paint eligibility');
if(!/^[a-f0-9]{64}$/.test(before.rendererArtifactHash||'')||before.rendererArtifactHash!==after.rendererArtifactHash)errors.push('Renderer byte identity changed: unverified render optimization');
if(before.sourceSha!=='5e28dbd16f7829aebd88052ff5f7fdf71f39fdad'||before.sourceSha===after.sourceSha)errors.push('Baseline SHA mismatch');
if(after.menuLifecycle?.hidden.length!==3||after.menuLifecycle.hidden.some(r=>r.ticks||r.raf)||after.menuLifecycle.resumedTicks!==1)errors.push('Real menu lifecycle regression');
if(after.menuLifecycle?.hiddenDocument?.length!==3||after.menuLifecycle.hiddenDocument.some(r=>r.ticks||r.raf)||after.menuLifecycle.documentResumedTicks!==1)errors.push('Hidden document menu owner regression');
if(after.menuLifetime?.length!==3||after.menuLifetime.some(r=>r.fontListeners||r.observedOwners))errors.push('Real menu lifetime regression');
const scenarios=before.scenarios.map(b=>{
 const a=after.scenarios.find(x=>x.scenario===b.scenario);if(!a||a.runs.length!==3||b.runs.length!==3){errors.push('Missing repeated scenario '+b.scenario);return {scenario:b.scenario};}
 for(const s of [b,a])if(s.warmup?.simulationOnlySteps!==(s.scenario==='battle'?270:30)||s.warmup?.renderedSteps!==30||!Number.isFinite(s.warmup?.drainMs)||s.warmup.drainMs<0)errors.push('Missing rendered warmup: '+s.scenario);
 if(b.scenario==='battle'&&(![b,a].every(s=>s.fixtureStart?.gameTime===0&&s.fixtureStart?.cameraTime===0&&Number.isFinite(s.fixtureStart?.shakeSeed))||JSON.stringify(b.fixtureStart)!==JSON.stringify(a.fixtureStart)))errors.push('Different initial battle clock phase');
 const normalize=r=>({frame:r.timings.frame,sceneMatrices:r.timings.sceneMatrices,count:r.counts.sceneMatrices,updates:r.counts.match,cursorTicks:r.counts.cursor||0,menuTicks:r.counts.menuTick||0,menuTick:r.timings.menuTick,quality:r.quality,scale:r.scale,renderCalls:r.renderInfo?.calls,triangles:r.renderInfo?.triangles,geometries:r.renderInfo?.geometries,textures:r.renderInfo?.textures,programs:r.renderInfo?.programs,heap:r.heap});
 if(b.runs.some((r,i)=>r.fixedSteps!==a.runs[i].fixedSteps||r.counts.match!==a.runs[i].counts.match))errors.push('Different simulation work: '+b.scenario);
 if([...b.runs,...a.runs].some(r=>r.fixedSteps!==30||r.counts.frame!==30||!r.timings.frame?.n||r.quality!==before.environment.quality||r.scale!==1))errors.push('Invalid fixed-step/quality window: '+b.scenario);
 if(b.scenario==='battle'&&[...b.runs,...a.runs].some(r=>!['menuTick','cursor','match','character','projectiles','paint','render'].every(k=>r.probedOwners?.includes(k))||r.counts.character!==240||r.counts.projectiles!==30||r.counts.paint!==30||r.counts.render!==30))errors.push('Missing actual battle owner probes');
 if(b.scenario==='battle'&&[...b.runs,...a.runs].some(r=>r.matchState!=='playing'))errors.push('Battle was not playing');
 if(b.scenario==='battle'&&[...b.runs,...a.runs].some(r=>!r.gameplay||!Array.isArray(r.gameplay.actors)||r.gameplay.actors.length!==8||!Array.isArray(r.gameplay.coverage)))errors.push('Missing gameplay snapshots');
 if(b.scenario==='battle'&&a.runs.some((r,i)=>JSON.stringify(r.gameplay)!==JSON.stringify(b.runs[i].gameplay)))errors.push('Gameplay outcomes changed');
 if(a.runs.some((r,i)=>r.counts.sceneMatrices!==b.runs[i].counts.sceneMatrices))errors.push('Renderer traversal work changed');
 if(b.scenario==='battle'&&a.runs.some((r,i)=>!(b.runs[i].counts.menuTick===30&&r.counts.menuTick===0&&b.runs[i].counts.cursor===30&&!r.counts.cursor)))errors.push('No repeated hidden battle menu work reduction');
 for(const owner of ['match','character','projectiles','rig','screenfx','paint','fx','env','decor','props','render','showcase','hud','minimap'])if(a.runs.some((r,i)=>(r.counts[owner]||0)!==(b.runs[i].counts[owner]||0)))errors.push('Runtime owner work changed: '+b.scenario+' '+owner);
 return{scenario:b.scenario,warmup:{before:b.warmup,after:a.warmup},before:b.runs.map(normalize),after:a.runs.map(normalize),frameRunMedians:{before:sampleStats(b.runs.map(r=>r.timings.frame?.median).filter(Number.isFinite)),after:sampleStats(a.runs.map(r=>r.timings.frame?.median).filter(Number.isFinite))}};
});
const result={status:errors.length?'failed':'passed',baselineSha:before.sourceSha,sourceSha:after.sourceSha,contentHash:after.contentHash,errors,scenarios,menuLifecycle:{before:before.menuLifecycle,after:after.menuLifecycle},menuLifetime:{before:before.menuLifetime,after:after.menuLifetime},rendererArtifactHash:after.rendererArtifactHash,input:{beforeStale:before.input.filter(r=>r.targetError>.5).length,afterStale:after.inputErrors.length},limitations:['Fixed-step CPU/render transaction profile; no live FPS or photon-latency claim','SwiftShader CPU-render time is not hardware GPU time','Timing differences require variance review; hidden menu owner counts are the acceptance metric']};
const out=path.resolve(option('--out'));persistentDirectory(path.dirname(out));fs.writeFileSync(out+'.pending',JSON.stringify(result,null,2));fs.renameSync(out+'.pending',out);console.log(JSON.stringify({status:result.status,errors,input:result.input}));if(errors.length)process.exitCode=1;
