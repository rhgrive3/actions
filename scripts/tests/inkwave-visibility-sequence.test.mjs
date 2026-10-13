import test from 'node:test';
import assert from 'node:assert/strict';
import {collectVisibilityEvidence,requireProjectileEvidence,visibilityVerdict} from '../lib/inkwave-visibility-sequence.mjs';
test('first projectile failure cannot truncate any stage condition or later quality',async()=>{
 const browser={images:[],projectileAttempts:[]},saved=[],failures=[];
 const result=await collectVisibilityEvidence({
  renderStage:async(q,t)=>{browser.images.push(`${q}/${t}`);},
  probeProjectiles:async q=>{assert.equal(browser.images.length,4);browser.projectileAttempts.push(q);if(q==='low')throw Error('first weapon clearance failure');},
  onFailure:f=>failures.push(f),save:()=>saved.push(JSON.parse(JSON.stringify(browser))),
 });
 assert.deepEqual(browser.images,['low/day','low/dusk','high/day','high/dusk']);
 assert.deepEqual(browser.projectileAttempts,['low','high']);assert.equal(saved.length,6);
 assert.deepEqual(saved[3].images,browser.images);assert.deepEqual(saved[3].projectileAttempts,[]);
 assert.equal(result.length,1);assert.equal(result[0].phase,'projectile');assert.match(result[0].error,/first weapon clearance failure/);
 assert.deepEqual(result,failures);assert.notEqual(result.length,0,'caller must finish failed, not green');
});
test('stage failure remains explicit while independent stage evidence still saves',async()=>{
 const stages=[],failures=[];let saves=0;
 const result=await collectVisibilityEvidence({renderStage:async(q,t)=>{stages.push(`${q}/${t}`);if(q==='low'&&t==='day')throw Error('GPU error');},probeProjectiles:async()=>{},onFailure:f=>failures.push(f),save:()=>saves++});
 assert.equal(stages.length,4);assert.equal(saves,6);assert.equal(result.length,1);assert.equal(failures[0].phase,'stage');
});

test('returned case failures persist and fail overall without suppressing later quality',async()=>{
 const stages=[],reports=[],failures=[];
 const result=await collectVisibilityEvidence({renderStage:async(q,t)=>stages.push(`${q}/${t}`),probeProjectiles:async q=>{
  const report=q==='low'?{failures:[{weapon:'shooter',error:'no clear lane'}],visibilityEstablished:false,cases:[]}:validReport();
  reports.push({quality:q,...report});requireProjectileEvidence(report);
 },save:()=>{},onFailure:f=>failures.push(f)});
 assert.equal(stages.length,4);assert.deepEqual(reports.map(r=>r.quality),['low','high']);assert.equal(reports[0].failures.length,1);
 assert.equal(result.length,1);assert.match(result[0].error,/no clear lane/);assert.equal(failures[0].quality,'low');
});
test('inconclusive visibility and returned GL errors cannot produce acceptance',()=>{
 assert.throws(()=>requireProjectileEvidence({failures:[],visibilityEstablished:false,cases:[]}),/not established/);
 assert.throws(()=>requireProjectileEvidence({failures:[],visibilityEstablished:true,cases:[{views:[{glError:1282}]}]}),/GPU error/);
});

function validReport(){return {failures:[],visibilityEstablished:true,cases:Array.from({length:6},()=>({traceComplete:true,views:[{glError:0,sampledProjectileFieldsUnchanged:true}]}))};}
test('returned trace or field-invariant failures save all stages and both qualities before failing',async()=>{
 for(const fault of ['trace','field','visibility']){
  const stages=[],reports=[];const result=await collectVisibilityEvidence({renderStage:async(q,t)=>stages.push(`${q}/${t}`),probeProjectiles:async q=>{
   const report=validReport();if(q==='low'){if(fault==='trace')report.cases[0].traceComplete=false;if(fault==='field')report.cases[0].views[0].sampledProjectileFieldsUnchanged=false;if(fault==='visibility')report.visibilityEstablished=false;}
   reports.push({quality:q,...report});requireProjectileEvidence(report);
  },save:()=>{},onFailure:()=>{}});
  assert.equal(stages.length,4);assert.deepEqual(reports.map(r=>r.quality),['low','high']);assert.equal(result.length,1,fault);assert.equal(result[0].quality,'low');assert.equal(visibilityVerdict({failures:result,errors:[]}), 'failed');
 }
});

test('late browser and collected failures remain failure in terminal verdict',()=>{
 assert.equal(visibilityVerdict({errors:[],failures:[]}), 'passed');
 for(const result of [{errors:['late pageerror']},{failures:[{error:'case failed'}]},{error:'GPU mismatch'}])assert.equal(visibilityVerdict(result),'failed');
});

test('restoration-only GL failure is retained and fails final verdict after remaining stages',async()=>{
 const rows=[],failures=[];await collectVisibilityEvidence({renderStage:async(q,t)=>{const row={quality:q,time:t,restoredComposer:{glError:q==='low'&&t==='day'?1282:0}};rows.push(row);if(row.restoredComposer.glError)throw Error('Restored stage composer GPU error');},probeProjectiles:async()=>{},save:()=>{},onFailure:f=>failures.push(f)});
 assert.equal(rows.length,4);assert.equal(rows[0].restoredComposer.glError,1282);assert.equal(visibilityVerdict({failures,errors:[]}),'failed');
});
