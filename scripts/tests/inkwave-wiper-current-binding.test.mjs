import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {WIPER_SOURCE,WIPER_TREE,WIPER_BASELINE,WIPER_MODULES,assertWiperCurrentBinding} from '../lib/inkwave-wiper-current-binding.mjs';
import {verifyVisibilityPair} from '../check-inkwave-wiper-visibility-pair.mjs';import {hash} from '../lib/inkwave-runtime-evidence.mjs';
const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-wiper-rng-observation.yml',import.meta.url),'utf8');
const diagnosticBranch='diagnostic/wiper-rng-observation-20261021';
const jobExpression=workflow.match(/  capture:\n    if: \$\{\{ (.+) \}\}/)?.[1];
const fullExpressions=[...workflow.matchAll(/        if: \$\{\{ (.+) \}\}/g)].map(x=>x[1]);
// These predicates use only boolean operators, equality and context properties shared by JS/GitHub expressions.
function evaluatePredicate(expression,github,inputs={}){assert.ok(expression);return Function('github','inputs','return ('+expression+');')(github,inputs);}
function event(name,branch=diagnosticBranch,repo='rhgrive3/actions'){return {event_name:name,head_ref:branch,repository:'rhgrive3/actions',event:{pull_request:{head:{repo:{full_name:repo},sha:'head-sha'}}},sha:'event-sha'};}
test('workflow adds only the seven intended PR path filters and preserves exact push branch',()=>{
 const paths=workflow.match(/  pull_request:\n    paths:\n([\s\S]*?)  workflow_dispatch:/)?.[1].trim().split('\n').map(x=>x.trim().slice(2));
 assert.deepEqual(paths,['.github/workflows/inkwave-wiper-rng-observation.yml','scripts/check-inkwave-wiper-plane-native.mjs','scripts/lib/inkwave-wiper-flight-coverage.mjs','scripts/lib/inkwave-wiper-occlusion.mjs','scripts/tests/inkwave-wiper-current-binding.test.mjs','scripts/tests/inkwave-wiper-flight-coverage.test.mjs','scripts/tests/inkwave-wiper-occlusion.test.mjs']);
 assert.ok(workflow.includes('  push:\n    branches: ['+diagnosticBranch+']'));assert.ok(!workflow.includes('pull_request_target:'));
});
for(const [label,context,expected]of [['own diagnostic PR',event('pull_request'),true],['unrelated PR',event('pull_request','feature/other'),false],['same-name fork PR',event('pull_request',diagnosticBranch,'someone/actions'),false],['missing PR branch',event('pull_request',''),false],['push',event('push',''),true],['manual dispatch',event('workflow_dispatch',''),true]])test('capture admission '+label,()=>assert.equal(evaluatePredicate(jobExpression,context),expected));
test('bounded is the dispatch default and both long steps require explicit manual true',()=>{
 assert.match(workflow,/full_capture:\n\s+description:[^\n]+\n\s+type: boolean\n\s+default: false/);assert.equal(fullExpressions.length,2);
 for(const expression of fullExpressions){for(const name of ['pull_request','push','workflow_dispatch'])for(const value of [undefined,false,true])assert.equal(evaluatePredicate(expression,event(name),{full_capture:value}),name==='workflow_dispatch'&&value===true,`${name}/${value}`);}
});
test('PR checks out its exact QA head while push/dispatch use their event SHA',()=>{
 const expression=workflow.match(/ref: \$\{\{ (.+) \}\}/)?.[1];assert.equal(evaluatePredicate(expression,event('pull_request')),'head-sha');
 for(const name of ['push','workflow_dispatch']){const context=event(name);context.event.pull_request={head:{}};assert.equal(evaluatePredicate(expression,context),'event-sha');}
});
test('trigger amendment keeps pinned source, strict visibility and failure artifact preservation',()=>{
 for(const text of ['ref: '+WIPER_SOURCE,WIPER_TREE,WIPER_BASELINE,'timeout-minutes: 180','timeout 20m','--visibility-probe','check-inkwave-wiper-visibility-pair.mjs','if: always()','retention-days: 14','contents: read'])assert.ok(workflow.includes(text),text);
 assert.equal((workflow.match(/run: node scripts\/build-inkwave.mjs/g)||[]).length,1);assert.equal((workflow.match(/persist-credentials: false/g)||[]).length,2);
});
function fixture(){const manifest={contentHash:'a'.repeat(64),inputHash:'b'.repeat(64),build:{revision:'c'.repeat(64),esbuild:'0.28.2',optimization:'esbuild-minify'},artifacts:{}};const modules=Object.entries(WIPER_MODULES).map(([name,p])=>({name,rel:'patches/splatoon3/runtime/'+name,candidateSourceSha256:p.candidate,baselineSourceSha256:p.baseline,candidateEmittedSha256:'d'.repeat(64),baselineEmittedSha256:'e'.repeat(64)}));for(const m of modules)manifest.artifacts['_versions/'+manifest.build.revision+'/'+m.rel]=m.candidateEmittedSha256;const binding={schema:1,candidate:WIPER_SOURCE,sourceTree:WIPER_TREE,baseline:WIPER_BASELINE,contentHash:manifest.contentHash,inputHash:manifest.inputHash,revision:manifest.build.revision,compiler:'0.28.2',modules};return {manifest,binding};}
test('binds actual new production hash without inventing an artifact identity',()=>{const {manifest,binding}=fixture();assertWiperCurrentBinding(manifest,binding);});
for(const [label,mutate]of [
 ['old source',x=>x.binding.candidate='0430673b09a5009628fc87baa414b3560090fc1d'],['wrong tree',x=>x.binding.sourceTree='0'.repeat(40)],['already fixed before source',x=>x.binding.baseline=WIPER_SOURCE],['stale content hash',x=>x.binding.contentHash='f'.repeat(64)],['input mismatch',x=>x.binding.inputHash='f'.repeat(64)],['revision mismatch',x=>x.binding.revision='bad'],['wrong compiler',x=>x.binding.compiler='0.1'],['unminified site',x=>x.manifest.build.optimization='none-offline'],['extra overlay module',x=>x.binding.modules.push(x.binding.modules[0])],['changed baseline source',x=>x.binding.modules[0].baselineSourceSha256='f'.repeat(64)],['changed candidate source',x=>x.binding.modules[0].candidateSourceSha256='f'.repeat(64)],['emitted mismatch',x=>x.binding.modules[0].candidateEmittedSha256='f'.repeat(64)]
])test('rejects '+label,()=>{const x=fixture();mutate(x);assert.throws(()=>assertWiperCurrentBinding(x.manifest,x.binding));});
function pair(){const {manifest,binding}=fixture(),bytes=Buffer.alloc(1024);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(960,16);bytes.writeUInt32BE(720,20);
 const receipts=['A','B'].map(variant=>{const images=['front','top'].map(view=>({view,file:'charged-'+view+'-0001.png',pngSha256:hash(bytes),pixelHash:variant,camera:{fov:50,aspect:960/720,near:.05,far:250,zoom:1,filmOffset:0,view:null},fullFrame:{viewport:[0,0,960,720],size:[960,720],scissorTest:false},occlusion:{schema:1,method:'opaque-scene-triangle-rays-v1',samplesPerInstance:12,consideredMeshes:1,transparentMeshes:0,meshes:[{instances:0,samples:0},{instances:2,samples:24}],blocked:[]},flightCoverage:{slashH:{instances:0,vertices:0},slashV:{instances:2,vertices:696,minDepth:12,maxNdc:.6,margin:.9}}}));const frames=[0,1].map(tick=>({tick,state:{ambientState:{schema:1},rng:1},paintHash:'same',paintEvents:[],aimTrace:[],memory:{},census:{},nativeRender:{calls:1,triangles:1,points:0,lines:0},axes:{counts:{slashH:0,slashV:tick?2:0},main:tick?(variant==='A'?[0,1,0]:[1,0,0]):null,trailing:tick?[1,0,0]:null},images:tick?images:[]}));const served=binding.modules.map(m=>['_versions/'+binding.revision+'/'+m.rel,variant==='A'?m.baselineEmittedSha256:m.candidateEmittedSha256]);return {status:'visibility-diagnostic-only',variant,head:WIPER_SOURCE,baseline:WIPER_BASELINE,id:'s3-saber-heavy',action:'charged',contentHash:manifest.contentHash,inputHash:manifest.inputHash,binding,errors:[],responseErrors:[],loaded:served,consumed:served,result:{visibilityProbe:true,dt:1/60,frameCount:2,setup:{initial:{ambientState:{schema:1}},target:[0,0,0],palette:{}},frames}};});return {manifest,binding,a:receipts[0],b:receipts[1],read:()=>bytes};}
test('visibility prefix passes only as diagnostic, not full capture',()=>{const p=pair();assert.equal(verifyVisibilityPair(p.a,p.b,p.manifest,p.binding,p.read).status,'visibility-prefix-gates-passed');});
for(const [label,mutate]of [['RNG divergence',p=>p.b.result.frames[0].state.rng=2],['paint divergence',p=>p.b.result.frames[1].paintHash='different'],['resource divergence',p=>p.b.result.frames[0].nativeRender.calls=2],['scissor crop',p=>p.b.result.frames[1].images[0].fullFrame.scissorTest=true],['near fade',p=>p.b.result.frames[1].images[0].flightCoverage.slashV.minDepth=1],['PNG tamper',p=>p.read=()=>Buffer.alloc(1024)],['old successful receipt',p=>p.a.status='passed'],['no visible change',p=>p.b.result.frames[1].images.forEach(x=>x.pixelHash='A')],['missing consumed module',p=>p.a.consumed=[]],['missing ambient schema',p=>delete p.a.result.setup.initial.ambientState.schema]])test('visibility rejects '+label,()=>{const p=pair();mutate(p);assert.throws(()=>verifyVisibilityPair(p.a,p.b,p.manifest,p.binding,p.read));});
test('full comparator retains tail, seed, paint, coverage and unchanged-control gates',()=>{const body=fs.readFileSync(new URL('../check-inkwave-wiper-plane-paired.mjs',import.meta.url),'utf8');for(const text of ['same(A.completion,B.completion)','paintHash','paintEvents','nativeRender','assertWiperCoverageImage','assert.equal(A.frameCount,161)',"assert.equal(r.status,'passed')","controlsOnly","same(p.pixelHash,q.pixelHash)"])assert.ok(body.includes(text),text);assert.ok(!body.includes('0430673'));});

// QA-only reporting must never admit a mismatching pair or alter successful output.
import {assertVisibilityPairField} from '../check-inkwave-wiper-visibility-pair.mjs';
test('successful visibility pair emits nothing and keeps exact result and input receipts',()=>{
 const p=pair(),before=structuredClone([p.a,p.b]),lines=[];
 const result=verifyVisibilityPair(p.a,p.b,p.manifest,p.binding,p.read,line=>lines.push(line));
 assert.deepEqual(lines,[]);assert.deepEqual([p.a,p.b],before);
 assert.deepEqual(result,{status:'visibility-prefix-gates-passed',source:WIPER_SOURCE,frames:2,scope:'First live full-frame views only; retirement, tail, unchanged controls, visual review and performance remain unaccepted'});
});
for(const [field,mutate] of [
 ['state',r=>r.state.rng++],['paintHash',r=>r.paintHash='different'],['paintEvents',r=>r.paintEvents.push({tick:1})],['aimTrace',r=>r.aimTrace.push({tick:1})],
 ['memory',r=>r.memory={geometries:283,textures:48}],['census',r=>r.census={different:true}],
 ...['calls','triangles','points','lines'].map(k=>['nativeRender.'+k,r=>r.nativeRender[k]++]),['axes.counts',r=>r.axes.counts.slashV++]
])test('first divergence reports exact tick and '+field+' without weakening its assertion',()=>{
 const p=pair(),lines=[],a=p.a.result.frames[1],b=p.b.result.frames[1];a.memory={geometries:297,textures:47};b.memory={...a.memory};mutate(b);
 const before=structuredClone([p.a,p.b]);let error;
 try{verifyVisibilityPair(p.a,p.b,p.manifest,p.binding,p.read,line=>lines.push(line));}catch(e){error=e;}
 assert.equal(error?.code,'ERR_ASSERTION');assert.equal(lines.length,1);
 const report=JSON.parse(lines[0]);assert.equal(report.tick,1);assert.equal(report.field,field);assert.equal(report.status,'visibility-first-divergence');
 for(const [key,row]of [['A',a],['B',b]])assert.deepEqual(report[key],{tick:1,memory:row.memory,census:row.census,nativeRender:row.nativeRender});
 assert.deepEqual([p.a,p.b],before);
});
test('diagnostic precedes rethrow of the identical original assertion object',()=>{
 const row={tick:103,memory:{},census:{},nativeRender:{}},events=[];let primary;
 try{assert.deepEqual(297,283,'memory');}catch(e){primary=e;}
 try{assertVisibilityPairField(103,'memory',row,row,()=>{throw primary;},line=>events.push(JSON.parse(line)));}catch(e){assert.strictEqual(e,primary);events.push('caught');}
 assert.equal(events[0].tick,103);assert.equal(events[0].field,'memory');assert.equal(events[1],'caught');
 assert.equal(primary.message.includes('memory'),true);assert.equal(primary.actual,297);assert.equal(primary.expected,283);assert.equal(primary.operator,'deepStrictEqual');
});
for(const reason of ['cyclic','bigint','throwing-toJSON','throwing-sink'])test('diagnostic '+reason+' cannot hide original failure',()=>{
 const row={tick:0,memory:{},census:{},nativeRender:{}},primary=new assert.AssertionError({message:'memory',actual:297,expected:283,operator:'deepStrictEqual'});
 if(reason==='cyclic')row.census.self=row.census;
 if(reason==='bigint')row.memory.bytes=1n;
 if(reason==='throwing-toJSON')row.census.toJSON=()=>{throw Error('serialization');};
 let caught;try{assertVisibilityPairField(0,'memory',row,row,()=>{throw primary;},()=>{if(reason==='throwing-sink')throw Error('write failed');});}catch(e){caught=e;}
 assert.strictEqual(caught,primary);
});
test('actual pair mismatch still rejects when diagnostic delivery fails',()=>{
 const p=pair();p.b.result.frames[0].memory={geometries:1};let caught;
 try{verifyVisibilityPair(p.a,p.b,p.manifest,p.binding,p.read,()=>{throw Error('diagnostic unavailable');});}catch(e){caught=e;}
 assert.equal(caught?.code,'ERR_ASSERTION');assert.equal(caught.operator,'deepStrictEqual');assert.match(caught.message,/memory/);assert.deepEqual(caught.actual,{});assert.deepEqual(caught.expected,{geometries:1});
});

const firstDivergenceBranch='diagnostic/wiper-first-divergence-20261022';
test('fresh first-divergence branch is PR-only, avoiding duplicate push capture',()=>{
 const pushBranches=workflow.match(/  push:\n    branches: \[([^\]]+)\]/)?.[1].split(',').map(x=>x.trim());
 assert.deepEqual(pushBranches,[diagnosticBranch]);assert.equal(pushBranches.includes(firstDivergenceBranch),false);
 assert.equal(evaluatePredicate(jobExpression,event('pull_request',firstDivergenceBranch)),true);
 for(const [branch,repo]of [[firstDivergenceBranch,'other/actions'],[firstDivergenceBranch+'-other','rhgrive3/actions'],['feature/other','rhgrive3/actions']])assert.equal(evaluatePredicate(jobExpression,event('pull_request',branch,repo)),false);
 // The existing changed test path admits the PR; no broad path or push filter is added.
 assert.ok(workflow.includes('      - scripts/tests/inkwave-wiper-current-binding.test.mjs'));
 for(const expression of fullExpressions)for(const full_capture of [undefined,false,true])assert.equal(evaluatePredicate(expression,event('pull_request',firstDivergenceBranch),{full_capture}),false);
 const checkout=workflow.match(/ref: \$\{\{ (.+) \}\}/)?.[1];assert.equal(evaluatePredicate(checkout,event('pull_request',firstDivergenceBranch)),'head-sha');
});
