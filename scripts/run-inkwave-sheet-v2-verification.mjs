#!/usr/bin/env node
// Runs the fixed candidate, not this verifier checkout, then seals its evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sheetV2PinSummary,verifySheetV2SourceInputs,verifySheetV2Epoch,SHEET_V2_EPOCH} from './lib/inkwave-sheet-v2-epoch.mjs';
const root=fs.realpathSync(fileURLToPath(new URL('..',import.meta.url))),pins=sheetV2PinSummary();
const known=new Set(['--baseline','--candidate','--site','--evidence','--verifier-sha','--tools']);
const options={};for(let i=2;i<process.argv.length;i+=2){const k=process.argv[i],v=process.argv[i+1];assert(known.has(k)&&v&&!v.startsWith('--')&&!Object.hasOwn(options,k),'strict runner arguments');options[k]=v;}
for(const k of known)assert(Object.hasOwn(options,k),'required '+k);
const baseline=fs.realpathSync(options['--baseline']),candidate=fs.realpathSync(options['--candidate']);
const site=path.resolve(options['--site']),out=path.resolve(options['--evidence']),tools=fs.realpathSync(options['--tools']);
const within=(a,b)=>a===b||a.startsWith(b+path.sep),hash=b=>createHash('sha256').update(b).digest('hex');
for(const p of [site,out]){assert(!fs.existsSync(p),'new output/evidence paths required');assert.equal(path.join(fs.realpathSync(path.dirname(p)),path.basename(p)),p,'output parent must already exist without aliases');for(const r of [baseline,candidate,root])assert(!within(p,r)&&!within(r,p),'outputs separate from every checkout');}
assert(!within(site,out)&&!within(out,site),'site and evidence are separate');fs.mkdirSync(out,{recursive:true});
const sourceOptions={candidateProfile:'sheet-birth-successor',baseline,candidate,baseSha:pins.base.commit,baseTree:pins.base.tree,candidateSha:pins.candidate.commit,candidateTree:pins.candidate.tree,verifierSha:options['--verifier-sha']};
const checked=verifySheetV2SourceInputs(sourceOptions);
for(const [name,version]of [['esbuild','0.28.2'],['playwright','1.62.1'],['ws','8.22.0']])assert.equal(JSON.parse(fs.readFileSync(path.join(tools,name,'package.json'))).version,version,'pinned '+name);
const environment=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_')&&!k.startsWith('INKWAVE_')&&!['NODE_OPTIONS','GH_TOKEN','GITHUB_TOKEN','ESBUILD_MODULE','PLAYWRIGHT_MODULE','WS_MODULE'].includes(k)));
const receipt={schema:1,epoch:SHEET_V2_EPOCH,verifier:checked.verifier,candidate:pins.candidate,baseline:pins.base,status:'running',commands:[],runtime:[]};
const save=()=>fs.writeFileSync(out+'/execution.json',JSON.stringify(receipt,null,2)+'\n');save();
async function command(label,argv,extra={}) {
 const logfile=path.join(out,label+'.log'),fd=fs.openSync(logfile,'wx'),start=Date.now();
 const exit=await new Promise((resolve,reject)=>{const p=spawn(argv[0],argv.slice(1),{cwd:candidate,env:{...environment,...extra},stdio:['ignore',fd,fd]});p.on('error',reject);p.on('exit',(code,signal)=>resolve({code,signal}));});fs.closeSync(fd);
 const row={label,argv,environment:extra,...exit,seconds:(Date.now()-start)/1000,logSha256:hash(fs.readFileSync(logfile))};receipt.commands.push(row);save();assert.equal(exit.code,0,label+' failed; preserved '+logfile);return fs.readFileSync(logfile,'utf8');
}
function identity(label) {
 const {receipt:destination,evidence}=verifySheetV2Epoch({...sourceOptions,epoch:SHEET_V2_EPOCH,provenance:'local',publishedHeads:'none',site,receipt:path.join(out,label+'.json')});
 const fd=fs.openSync(destination,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify(evidence,null,2)+'\n');}finally{fs.closeSync(fd);}return evidence;
}
try {
 await command('build',[process.execPath,'scripts/build-inkwave.mjs','inkwave-public',site],{ESBUILD_MODULE:path.join(tools,'esbuild/lib/main.js')});
 receipt.identityBefore=identity('identity-before');
 const groups={
  pool:{count:12,files:['patches/splatoon3/tests/s3-fire-birth-cache.test.mjs','scripts/tests/inkwave-sixway-pool-acceptance.test.mjs','patches/splatoon3/tests/shooter-muzzle-droplets.test.mjs','patches/splatoon3/tests/splatling-cosmetics.test.mjs']},
  shapes:{count:11,files:['patches/splatoon3/tests/s3-projectile-shapes.test.mjs','scripts/tests/inkwave-sixway-interactions.test.mjs']},
  spawn:{count:30,files:['scripts/tests/inkwave-sixway-spawn-acceptance.test.mjs','patches/splatoon3/tests/respawn-weapon-state.test.mjs','patches/splatoon3/tests/respawn-spawn-owner.test.mjs','patches/splatoon3/tests/respawn-ready-handoff.test.mjs']}
 };
 // The independent groups run together, but each test file runs serially.
 const nodeRuns=await Promise.allSettled(Object.entries(groups).flatMap(([group,{count,files}])=>['source','emitted'].map(async mode=>{
  const extra={};if(mode==='emitted')extra.INKWAVE_BUILT_SITE=site;
  if(group==='pool')extra.SIXWAY_POOL_EVIDENCE=path.join(out,mode+'-pool.json');
  if(group==='spawn')extra.SIXWAY_ACCEPTANCE_EVIDENCE=path.join(out,mode+'-spawn.json');
  const text=await command(mode+'-'+group,[process.execPath,'--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1',...files],extra);
  assert(new RegExp('^# tests '+count+'$','m').test(text));assert(new RegExp('^# pass '+count+'$','m').test(text));
  for(const key of ['fail','cancelled','skipped','todo'])assert(new RegExp('^# '+key+' 0$','m').test(text),mode+' '+group+' '+key);
  receipt.runtime.push({group,mode,pass:count,fail:0,skipped:0});save();
 })));for(const result of nodeRuns)if(result.status==='rejected')throw result.reason;
 await command('startup-budget',[process.execPath,'scripts/check-inkwave-startup-budget.mjs',site]);
 const browserEnvironment={PLAYWRIGHT_MODULE:path.join(tools,'playwright/index.js'),WS_MODULE:path.join(tools,'ws/index.js')};
 if(process.env.CHROMIUM_PATH)browserEnvironment.CHROMIUM_PATH=process.env.CHROMIUM_PATH;
 const runners=[];
 for(const [relative,name,helper]of [['scripts/check-inkwave-sixway-pool-browser.mjs','pool-browser','inkwave-range-menu-entry.mjs'],['scripts/check-inkwave-respawn-exclusion.mjs','room','inkwave-local-relay-fixture.mjs']]) {
  const original=fs.readFileSync(path.join(candidate,relative),'utf8');let text=original;
  const importBefore="'./lib/"+helper+"'";assert.equal(text.split(importBefore).length,2);text=text.replace(importBefore,JSON.stringify(pathToFileURL(path.join(candidate,'scripts/lib',helper)).href));
  const oldOutput='8e3a99d990ef0f2185c0b013386c24b8e1c676975927a255efd6808ff2b0e09f';assert.equal(text.split(oldOutput).length,2);text=text.replace(oldOutput,pins.build.contentHash);
  if(name==='room'){
   const oldInput='09589df9b999fcad5c6ae7db6d9ad4519816ff0231736f2f5492ea4a1ff83003';assert.equal(text.split(oldInput).length,2);text=text.replace(oldInput,pins.build.inputHash);
   const observe='spawn-exclusion|spawn-pose-motion|respawn-lifecycle|weapon-handoff-motion|roller';assert.equal(text.split(observe).length,2);text=text.replace(observe,observe+'|s3-projectile-shapes');
  }
  const file=path.join(out,name+'-bound.mjs');fs.writeFileSync(file,text,{flag:'wx'});runners.push({name,relative,sourceSha256:hash(original),runnerSha256:hash(text),file});
 }
 fs.writeFileSync(out+'/runner-bindings.json',JSON.stringify(runners,null,2)+'\n',{flag:'wx'});
 const browserRuns=await Promise.allSettled(runners.map(async runner=>{
  await command(runner.name,[process.execPath,runner.file,site,path.join(out,runner.name),...(runner.name==='room'?['--sixway']:[])],browserEnvironment);
  const proof=JSON.parse(fs.readFileSync(path.join(out,runner.name,runner.name==='room'?'browser.json':'receipt.json')));
  assert.equal(proof.status,'passed');assert.deepEqual(proof.errors,[]);assert.equal(proof.scriptSha256,runner.runnerSha256);
  const manifest=JSON.parse(fs.readFileSync(site+'/inkwave-build.json'));
  for(const response of proof.responses){assert.equal(response.status,200);assert.equal(response.sha256,manifest.artifacts[response.path.slice(1)]);}
  if(runner.name==='room')assert.equal(proof.cases.length,10);else assert(proof.pool.length===2&&proof.pool.every(p=>p.sameObject&&p.sheetPass&&p.newDropsPass));
  receipt.runtime.push({browser:runner.name,status:'passed',moduleBodies:proof.responses.length});save();
 }));for(const result of browserRuns)if(result.status==='rejected')throw result.reason;
 receipt.identityAfter=identity('identity-after');receipt.status='passed';save();
 const complete={schema:1,epoch:SHEET_V2_EPOCH,candidate:pins.candidate,verifier:checked.verifier.commit,status:'passed',nodeSource:53,nodeEmitted:53,roomCases:10,poolCases:2,inputHash:pins.build.inputHash,contentHash:pins.build.contentHash,executionSha256:hash(fs.readFileSync(out+'/execution.json'))};
 fs.writeFileSync(out+'/acceptance.json',JSON.stringify(complete,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(complete));
} catch(error){receipt.status='failed';receipt.error=error.stack;save();throw error;}
