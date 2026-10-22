#!/usr/bin/env node
// Dedicated A/A-only diagnostic. Canonical saved QA and native runtime remain unchanged.
import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
import{prepareSequencedDriver,bindDiagnosticDriver,assertGeneratedEvidence}from'./entry-driver.mjs';
import{preparePostprocessDiagnostic,verifyPostprocessBodies}from'./postprocess-driver.mjs';
export const PAIR_SHA256='ebb6ed23463fd1313692dd391dafe3522d663e209b65c794ab71c3aff6b81be8';
export const CHANGES=[[" for(const [lane,variant]of [['A1','A'],['A2','A'],['B1','B']]){", " const replayLanes=aaOnly?[['A1','A'],['A2','A']]:[['A1','A'],['A2','A'],['B1','B']];\n for(const [lane,variant]of replayLanes){"], [" check('B1 observed history and provenance'", " if(!aaOnly)\n check('B1 observed history and provenance'"], [" const report={status:checks.every(x=>x.passed)&&sequentialZeroRepeatAccepted?'diagnostic-recorded':'failed',", " const aaPreflightSequentialAccepted=aaOnly&&rows.length===2&&rows.every(x=>x.integrity&&x.receipt.status==='passed'&&x.evidence.repeatSignal.changed===0);\n const report={status:checks.every(x=>x.passed)&&(aaOnly?aaPreflightSequentialAccepted:sequentialZeroRepeatAccepted)?'diagnostic-recorded':'failed',\n  aaOnly,aaPreflightSequentialAccepted,expectedLanes:replayLanes.map(x=>x[0]),"], ["  limitations:['B1 is an observation, not a B/B reproducibility proof or accepted improvement.',", "  limitations:[aaOnly?'A/A-only baseline preflight: candidate B and performance are not measured.':'B1 is an observation, not a B/B reproducibility proof or accepted improvement.',"], ["const settledDiagnostic=mode==='--settled-replay-diagnostic';", "const aaOnly=mode==='--settled-aa-diagnostic';\nconst settledDiagnostic=mode==='--settled-replay-diagnostic'||aaOnly;"]];
export function prepareAaRunner(source,helperUrl){
 assert.equal(createHash('sha256').update(source).digest('hex'),PAIR_SHA256,'exact reviewed516 paired source');
 let output=source;for(const[a,b]of CHANGES){assert.equal(output.split(a).length,2,'unique A/A-only boundary');output=output.replace(a,b);}
 const original="from './lib/inkwave-material-normal-admission.mjs'";assert.equal(output.split(original).length,2);assert.equal(new URL(helperUrl).protocol,'file:');
 return output.replace(original,'from '+JSON.stringify(helperUrl));
}
export function runAaPreflight(site,source,overlay,out){
 for(const x of [site,source,overlay,out])assert.equal(typeof x,'string');
 [site,source,overlay]=[site,source,overlay].map(x=>path.resolve(x));
 const qa=fileURLToPath(new URL('../../',import.meta.url));assert.equal(path.resolve(process.cwd()),path.resolve(qa),'run from QA checkout, not COMMON');
 const root=path.resolve(out),runner=path.join(root,'aa-paired-runner.mjs');assert.ok(!fs.existsSync(root),'unique evidence directory required');
 const canonical=fs.readFileSync(path.join(qa,'scripts/check-inkwave-material-native-paired.mjs'),'utf8');
 const pairedHelperPath=path.join(qa,'scripts/lib/inkwave-material-normal-admission.mjs');
 const pairedHelper={url:pathToFileURL(pairedHelperPath).href,sha256:'d4f6dba1bab48bf1dfb50281163587320c132ce303549619e7ac32f9023fd26d'};
 const verifyPairedHelper=()=>assert.equal(createHash('sha256').update(fs.readFileSync(pairedHelperPath)).digest('hex'),pairedHelper.sha256,'actual paired admission helper body');verifyPairedHelper();
 const canonicalProgram=prepareAaRunner(canonical,pairedHelper.url);
 const driver=path.join(root,'settled-native-frame.mjs');
 const sequenced=prepareSequencedDriver(fs.readFileSync(path.join(qa,'scripts/check-inkwave-material-native-frame.mjs'),'utf8'),{
  './lib/inkwave-runtime-evidence.mjs':pathToFileURL(path.join(qa,'scripts/lib/inkwave-runtime-evidence.mjs')).href,
  './lib/inkwave-range-menu-entry.mjs':pathToFileURL(path.join(qa,'scripts/lib/inkwave-range-menu-entry.mjs')).href,
  playwright:import.meta.resolve('playwright')
 });
 const extended=preparePostprocessDiagnostic(sequenced,canonicalProgram),prepared=extended.prepared;
 const program=bindDiagnosticDriver(extended.pairedProgram,driver);
 fs.mkdirSync(root,{recursive:true});fs.writeFileSync(runner,program);fs.writeFileSync(driver,prepared.program);
 verifyPostprocessBodies();assertGeneratedEvidence(prepared,driver);
 fs.writeFileSync(path.join(root,'runner-provenance.json'),JSON.stringify({canonicalPairedSha256:PAIR_SHA256,qaWorkingDirectory:qa,pairedHelper,...prepared.provenance,generatedFramePath:driver,generatedPairedSha256:createHash('sha256').update(program).digest('hex'),diagnosticChildLaunches:['A1','A2'].map(lane=>({lane,argv:[driver,path.resolve(site),path.resolve(source),path.resolve(overlay),path.join(root,lane),'A','--settled-diagnostic'],timeoutMs:300000})),mode:'--settled-aa-diagnostic',lanes:['A1','A2'],diagnosticOnly:true,performanceAccepted:false},null,2));
 try{execFileSync(process.execPath,[runner,site,source,overlay,root,'--settled-aa-diagnostic'],{stdio:'inherit',timeout:660000});}
 finally{verifyPostprocessBodies();verifyPairedHelper();assertGeneratedEvidence(prepared,driver);assert.equal(createHash('sha256').update(fs.readFileSync(runner)).digest('hex'),createHash('sha256').update(program).digest('hex'),'actual generated paired body');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){assert.equal(process.argv.length,6,'exactly site/source/overlay/output arguments; no alternate mode');runAaPreflight(...process.argv.slice(2));}
