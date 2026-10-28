// Synthetic comparator orchestration only. These are not rendered game images.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {PHASE_COMMIT,PHASE_INSERT,PHASE_PATH,sha256,phaseExecutionSources} from '../lib/inkwave-slosher-phase-control.mjs';
const ROOT=new URL('../../',import.meta.url).pathname;
function trace(old){
 const first=old?1:(.5+(.55-.5)*.5)*3.1,area=old?1:2,after={turf:area,special:area};
 return {schema:2,accountingProtocol:'native-cell-credit-ranges-v2',sourceActor:'WeaponSlosherWashtub',failures:[],initial:{turf:0,special:0,counts:[0,0]},nonScoringChanges:[],
  paintContext:{native:false,team:0,gridLength:100,deadCells:[],initialOwnedCells:[],scoringPredicate:'face.turf && !paint.dead[index]',nativeBodySkipPredicate:'level.native && paint.dead[index]',
   faces:[{id:0,block:0,grid:0,nu:10,nv:10,cu:1,cv:1,turf:true,normal:[0,1,0],origin:[0,0,0],u:[1,0,0],v:[0,0,1]}]},
  coverageArea:100,coverageFaces:[{grid:0,nu:10,nv:10,cu:1,cv:1,normalY:1,eligibleCells:100}],
  birth:{seed:.5,initialDistance:first,unit:0,index:0,spacing:3.1,count:7,width:1.344,depth:2,drawRadius:.1},
  steps:[{frame:1,dt:1/60,seed:.5,beforeTravel:0,travel:2,prev:[0,0,0],pos:[0,0,2],age:1/60,retired:false,dropCount:1,nextSplash:first+3.1}],
  releases:[{frame:1,step:0,position:[0,0,first],radius:1.344,drawRadius:.1,depth:2}],
  credits:[{frame:1,area,cellArea:area,before:{turf:0,special:0},after,cost:200,kind:'body',cellRange:[0,area],cellGroups:[{start:0,end:area,faceGrid:0}],guards:{specialActive:false,stormGaugeLock:0,s3TidalSlamGaugeFinish:false}}],
  cells:Array.from({length:area},(_,index)=>({frame:1,index,faceGrid:0,i:index,j:0,dead:false,turf:true,native:false,eligible:true,from:0,to:1,area:1,coverageOrder:index})),
  snapshots:[{label:'initial',frame:0,creditCount:0,cellCount:0,turf:0,special:0,counts:[0,0],turfTotal:100,ownedAreas:[0,0],coverage:[0,0]},
   ...['F15','impact','floor-contact-F25-capture-F33','end'].map(label=>({label,frame:label==='F15'?15:label==='impact'?25:33,creditCount:1,cellCount:area,...after,counts:[area,0],turfTotal:100,ownedAreas:[area,0],coverage:[area/100,0]}))]};
}
function setup(dir){
 const script="import importlib.util,json; p='scripts/tests/inkwave-projectile-captures.test.py'; s=importlib.util.spec_from_file_location('capture_unit',p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.completed_receipt()))";
 const proc=spawnSync('python3',['-c',script],{cwd:ROOT,encoding:'utf8'});assert.equal(proc.status,0,proc.stderr);
 const base=JSON.parse(proc.stdout),head='9'.repeat(40),hashes={original:'a'.repeat(64),control:'b'.repeat(64),target:'c'.repeat(64)};
 for(const role of ['original','control','target']){
  const doc=structuredClone(base),old=role==='original',execution=phaseExecutionSources(ROOT);doc.slosherPhase=trace(old);doc.build={contentHash:hashes[role]};doc.sourceIdentity={checkoutSha:head};doc.phaseRuntimeInputSha256='d'.repeat(64);doc.provenance.harnessSha256=execution['scripts/check-inkwave-projectile-visuals.mjs'];doc.provenance.slosherPhaseObserverSha256=execution['scripts/lib/inkwave-slosher-phase-observer.mjs'];
  const scenario=doc.visualScenarios.find(s=>s.name==='floor-washtub');scenario.impactFrame=25;scenario.captureFrame=33;scenario.impactState={paintCoverage:doc.slosherPhase.snapshots.find(s=>s.label==='impact').coverage};
  for(const [i,r] of doc.screenshots.entries()){
   if(r.scenario==='floor-washtub'&&r.phase.startsWith('floor-contact-'))r.phase='floor-contact-F25-capture-F33';
   r.runtime.roster.actors[0].state.special=r.scenario==='floor-washtub'&&(r.phase==='F15'||r.phase.startsWith('floor-contact-'))?(old?1:2):0;
   r.file='synthetic-unit-'+i+'.png';r.sha256=sha256('unit fixture bytes; not a rendered PNG');
  }
  const target=path.join(dir,role);fs.mkdirSync(target);
  for(const r of doc.screenshots)fs.writeFileSync(path.join(target,r.file),'unit fixture bytes; not a rendered PNG');
  fs.writeFileSync(path.join(target,'projectile-visuals-result.json'),JSON.stringify(doc));
 }
 const receipt={schema:2,accountingProtocol:'native-cell-credit-ranges-v2',kind:'source-backed-slosher-phase-control',correctionCommit:PHASE_COMMIT,patchSha256:sha256(PHASE_INSERT),changedPaths:[PHASE_PATH],builds:{original:hashes.original,control:hashes.control},baseSha:'8'.repeat(40),targetSha:head,targetPhaseSourceSha256:'d'.repeat(64),executionSources:phaseExecutionSources(ROOT)};
 fs.writeFileSync(path.join(dir,'source-control.json'),JSON.stringify(receipt));
}
function run(dir){return spawnSync(process.execPath,['scripts/verify-inkwave-slosher-phase-captures.mjs','--original',path.join(dir,'original'),'--control',path.join(dir,'control'),'--target',path.join(dir,'target'),'--receipt',path.join(dir,'source-control.json'),'--out',path.join(dir,'out')],{cwd:ROOT,encoding:'utf8'});}
test('unchanged comparator requires 52 full physical pairs, retains original failure, rejects drift and old fallback',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iw-phase-contract-'));
 try{
  setup(temp);const positive=run(temp);assert.equal(positive.status,0,positive.stdout+positive.stderr);
  const result=JSON.parse(fs.readFileSync(path.join(temp,'out/slosher-phase-contract.json')));assert.equal(result.oldFallbackNegativeControl,'failed as required');
  const original=JSON.parse(fs.readFileSync(result.originalMismatch));assert.equal(original.physicalVerification.status,'fail');
  const strict=JSON.parse(fs.readFileSync(result.strictComparison));assert.equal(strict.pairedCaptureVerification.matchedPairCount,52);assert.equal(strict.physicalVerification.status,'pass');
  const file=path.join(temp,'target/projectile-visuals-result.json'),raw=fs.readFileSync(file),doc=JSON.parse(raw);
  const mutations=[
   d=>d.visualScenarios.find(s=>s.name==='floor-washtub').impactState.paintCoverage[0]+=.001,
   d=>d.screenshots.find(s=>s.scenario==='floor-washtub'&&s.phase==='F15').runtime.roster.actors[0].state.special+=.001,
   d=>d.screenshots[0].runtime.projectiles[0].vel[0]=1,
   d=>d.slosherPhase.credits[0].cellArea+=1,
   d=>d.slosherPhase=trace(true),
   d=>d.phaseRuntimeInputSha256='e'.repeat(64),
  ];
  for(const mutate of mutations){const changed=structuredClone(doc);mutate(changed);fs.writeFileSync(file,JSON.stringify(changed));const failed=run(temp);assert.notEqual(failed.status,0,'unexplained coverage/SP/physics/source drift must fail');}
  fs.writeFileSync(file,raw);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
