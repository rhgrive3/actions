#!/usr/bin/env node
// Measures the unchanged public packaging entrypoint against a fixed Git source.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const baselineSha=process.argv[2]||'3715e29d1656a00b853f73e12a89624b17985b7c';
if(!/^[a-f0-9]{40}$/.test(baselineSha))throw Error('Expected a full baseline commit SHA');
const counts=(process.argv[3]||'2500,5000').split(',').map(Number);
const rounds=Number(process.argv[4]||3);
if(!counts.every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isSafeInteger(rounds)||rounds<1)throw Error('Invalid count or rounds');
const sourcePath='scripts/ci/package-inkwave-evidence.mjs';
const baselineSource=execFileSync('git',['show',`${baselineSha}:${sourcePath}`],{cwd:root});
const candidateSource=fs.readFileSync(path.join(root,sourcePath));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(path.join(root,'.ci-scratch'),{recursive:true});
const scratch=fs.mkdtempSync(path.join(root,'.ci-scratch/evidence-performance-'));
const digestTree=dir=>{
 const files=[];
 const visit=base=>{for(const name of fs.readdirSync(base).sort()){
  const file=path.join(base,name);if(fs.statSync(file).isDirectory())visit(file);
  else files.push([path.relative(dir,file),sha(fs.readFileSync(file))]);
 }};visit(dir);return files;
};
const summaries=[];
try{
 const implementations={};
 for(const [name,source]of Object.entries({baseline:baselineSource,candidate:candidateSource})){
  const module=path.join(scratch,`${name}.mjs`);fs.writeFileSync(module,source);
  implementations[name]=(await import(pathToFileURL(module))).packageBrowserFailureEvidence;
 }
 for(const count of counts){
  const input=path.join(scratch,`input-${count}`),output=path.join(scratch,'bounded');fs.mkdirSync(input);
  for(let i=0;i<count;i++)fs.writeFileSync(path.join(input,`${i%7===0?'証跡-é-😀':'record'}-${String(i).padStart(6,'0')}.json`),'{}');
  const write=(name,body)=>{const file=path.join(input,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);};
  write('large.bin',Buffer.alloc(1024*1024));
  write('failure.log','first failure\nlast diagnostic\n');
  write('wiper-native/frame.png',Buffer.alloc(100,7));
  write('wiper-native/wiper-native-result.json',JSON.stringify({status:'failed',kind:'controlled-native-wiper-visual-acceptance',cases:[{frames:[{images:[{file:'frame.png'}]}]}]}));
  const original=digestTree(input),samples={baseline:[],candidate:[]};
  let expected;
  // Every block alternates ABBA/BAAB to balance cache warmth and ordering.
  for(let round=0;round<rounds;round++){
   const order=round%2?['candidate','baseline','baseline','candidate']:['baseline','candidate','candidate','baseline'];
   for(const name of order){
    const begin=performance.now();
    const result=await implementations[name](input,{output,limit:32768,sourceSha:baselineSha});
    samples[name].push(performance.now()-begin);
    const actual={result,files:digestTree(output)};
    if(expected)assert.deepEqual(actual,expected);else expected=actual;
    assert.deepEqual(digestTree(input),original);
   }
  }
  const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2;};
  const medians=Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,median(values)]));
  summaries.push({generatedSmallFiles:count,totalFiles:original.length,limitBytes:32768,rounds,samplesMs:samples,medianMs:medians,
   reductionPercent:100*(1-medians.candidate/medians.baseline),retained:expected.result.manifest.files.length,
   omitted:expected.result.manifest.omittedInventoryEntries,submittedBytes:expected.result.submittedBytes,
   identicalResults:true,identicalOutputHashes:true,originalFilesUnchanged:true,
   manifestSha256:expected.files.find(([name])=>name==='EVIDENCE_MANIFEST.json')[1]});
 }
 const report={baselineSha,baselineSourceSha256:sha(baselineSource),candidateSourceSha256:sha(candidateSource),
  node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,
  measuredAt:new Date().toISOString(),scope:'synthetic over-budget browser evidence; packaging time including hashing and copies',summaries};
 console.log(JSON.stringify(report,null,2));
}finally{fs.rmSync(scratch,{recursive:true,force:true});}
