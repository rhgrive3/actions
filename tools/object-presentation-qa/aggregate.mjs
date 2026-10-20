import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {assertArtifactBudget,ARTIFACT_LIMIT} from './artifact-budget.mjs';
import {verifyFrameComparisons,verifyContactSheetPlan} from './frame-contract.mjs';
import {SUITES,suiteBase} from './config.mjs';
export const EXPECTED={spawner:24,rainmaker:128,clam:80,'rainmaker-air':20,'rainmaker-form':20};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const relativeOut=s=>s==='rainmaker-air'?'rainmaker/air':s==='rainmaker-form'?'rainmaker/form':s;
function copyTree(from,to){
 if(!fs.existsSync(from))return;
 const stat=fs.lstatSync(from);assert(!stat.isSymbolicLink(),'no transported symlink');
 if(stat.isDirectory()){fs.mkdirSync(to,{recursive:true});for(const n of fs.readdirSync(from))copyTree(path.join(from,n),path.join(to,n));}
 else{assert(stat.isFile(),'ordinary evidence');assert(!fs.existsSync(to),'no evidence overwrite');fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
}
function verifyPng(root,row){
 assert(typeof row.file==='string'&&/^[a-z0-9-]+\.png$/.test(row.file),'flat PNG path');
 const f=path.join(root,row.file);assert(fs.lstatSync(f).isFile()&&!fs.lstatSync(f).isSymbolicLink(),'ordinary PNG');
 const b=fs.readFileSync(f);assert.equal(sha(b),row.sha256,'PNG hash');assert.equal(b.length,row.bytes,'PNG byte length');
 assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG signature');
 assert.equal(b.readUInt32BE(16),row.width,'PNG width');assert.equal(b.readUInt32BE(20),row.height,'PNG height');
}
export function verifySuite(root,suite,identity){
 const r=JSON.parse(fs.readFileSync(path.join(root,'result.json')));
 for(const k of ['sourceSha','contentHash','inputHash','buildRevision'])assert.equal(r[k],identity[k],k+' same immutable build');
 assert.equal(r.suite,suite);assert.equal(r.beforeBase,suiteBase(suite),'unchanged historical baseline');
 assert.equal(r.status,'passed');assert.equal(r.browserRun,true);assert.equal(r.sourceAndEmittedVerified,true);
 assert.equal(r.expectedFrames,EXPECTED[suite]);assert.equal(r.frames,EXPECTED[suite]);assert.equal(r.screenshots.length,EXPECTED[suite]);
 for(const key of ['errors','blocked'])assert.deepEqual(r[key],[],key+' empty');
 assert.deepEqual(Object.keys(r.beforeFiles).sort(),SUITES[suite].before.slice().sort(),'all historical modules');
 for(const file of SUITES[suite].before){assert.equal(r.beforeFiles[file].sourceSha,suiteBase(suite));assert(r.beforeLoaded.includes(file),'historical module really loaded');}
 for(const suffix of ['src/world/environment.js','src/core/renderer.js','patches/splatoon3/runtime/install.mjs'])assert(r.loaded.some(p=>p.endsWith('/'+suffix)),'production loaded '+suffix);
 for(const s of r.screenshots){assert.equal(s.width,900);assert.equal(s.height,900);verifyPng(root,s);}
 verifyFrameComparisons(r.rows,r.screenshots);
 assert.equal(r.contactSheets.length,suite==='clam'?2:0,'all original contact sheets');
 const plans=verifyContactSheetPlan(r.rows,r.screenshots,r.contactSheets);
 for(let i=0;i<plans.length;i++){const s=r.contactSheets[i];assert.equal(s.width,plans[i].width);assert.equal(s.height,plans[i].height);verifyPng(root,s);}
 return r;
}
export function aggregate({inputs,out,diagnostics,identity,runId,attempt,prepareResult,captureResult,outputFile,budgetLimit=ARTIFACT_LIMIT}){
 const failures=[],accepted=[];fs.mkdirSync(out,{recursive:true});
 try{assert(fs.existsSync(diagnostics),'source QA diagnostics required');copyTree(diagnostics,path.join(out,'rainmaker'));if(prepareResult==='success')for(const name of ['emitted-source-face.log','emitted-aim-native.log','emitted-aim-source.log'])assert(fs.statSync(path.join(diagnostics,name)).isFile(),'all source QA logs retained');}catch(e){failures.push('source QA diagnostics: '+e.message);}
 for(const suite of Object.keys(EXPECTED)){
  const from=path.join(inputs,`object-capture-${suite}-${runId}-${attempt}`),to=path.join(out,relativeOut(suite));
  try{assert(fs.existsSync(from),'missing capture artifact');copyTree(from,to);verifySuite(to,suite,identity);accepted.push(suite);}catch(e){failures.push(suite+': '+e.message);}
 }
 const budgets={};for(const group of ['spawner','rainmaker','clam']){
  try{const inv=assertArtifactBudget(path.join(out,group),budgetLimit);budgets[group]={eligible:inv.files.length>0,totalBytes:inv.totalBytes,files:inv.files.length};}catch(e){budgets[group]={eligible:false};failures.push(group+' budget: '+e.message);}
  if(outputFile)fs.appendFileSync(outputFile,group+'='+budgets[group].eligible+'\n');
 }
 if(prepareResult!=='success')failures.push('all source/build/emitted QA must succeed: '+prepareResult);
 if(captureResult!=='success')failures.push('all five capture jobs must succeed: '+captureResult);
 const result={status:failures.length?'failed':'passed',...identity,expectedSuites:Object.keys(EXPECTED),accepted,failures,budgets};
 fs.writeFileSync(path.join(out,'aggregate-result.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const option=n=>process.argv[process.argv.indexOf('--'+n)+1];
 const result=aggregate({inputs:option('inputs'),out:option('out'),diagnostics:option('diagnostics'),identity:{sourceSha:option('head'),contentHash:option('content'),inputHash:option('input'),buildRevision:option('revision')},runId:option('run'),attempt:option('attempt'),prepareResult:option('prepare-result'),captureResult:option('capture-result'),outputFile:process.env.GITHUB_OUTPUT});
 console.log(JSON.stringify(result));if(result.status!=='passed')process.exitCode=1;
}
