import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const driver=path.join(root,'scripts/check-inkwave-splashdown-browser.mjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const required=['patch/runtime/special-vfx.mjs','patch/runtime/all-specials.mjs','patch/runtime/install.mjs','upstream/src/game/weapons.js','upstream/src/game/actor.js','upstream/src/game/physics.js','upstream/src/world/paint.js','upstream/src/world/level.js','upstream/src/net/netmatch.js'];
const write=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'special-browser-batch-')),site=path.join(dir,'site'),source=path.join(dir,'source'),out=path.join(dir,'evidence'),trace=path.join(dir,'trace.jsonl');
 const revision='protocol-fixture',files={},proofFiles={},artifacts={};
 for(const [i,key] of required.entries()){
  const file=key.replace(/^patch\//,'patches/splatoon3/').replace(/^upstream\//,'inkwave-public/'),bytes=Buffer.from('source fixture '+i+'\n');
  write(path.join(source,file),bytes);files[key]=hash(bytes);proofFiles[file]=blob(bytes);
 }
 const builder=Buffer.from('fixture builder\n');write(path.join(source,'scripts/build-inkwave.mjs'),builder);proofFiles['scripts/build-inkwave.mjs']=blob(builder);
 const generator=Buffer.from('# fixture source proof generator\n');write(path.join(source,'scripts/generate-inkwave-source-proof.py'),generator);proofFiles['scripts/generate-inkwave-source-proof.py']=blob(generator);
 proofFiles['scripts/check-inkwave-splashdown-browser.mjs']=blob(fs.readFileSync(driver));
 proofFiles['scripts/lib/inkjet-terminal-probe.mjs']=blob(fs.readFileSync(path.join(root,'scripts/lib/inkjet-terminal-probe.mjs')));
 for(const file of ['special-vfx.mjs','inkjet-vfx-budget.mjs','inkjet-vfx-clock.mjs']){
  const rel=`_versions/${revision}/patches/splatoon3/runtime/${file}`,bytes=Buffer.from('verified emitted '+file+'\n');write(path.join(site,rel),bytes);artifacts[rel]=hash(bytes);
 }
 const unused=path.join(site,'unused.bin');write(unused,Buffer.from('still verified\n'));artifacts['unused.bin']=hash(fs.readFileSync(unused));
 const manifest={artifacts,contentHash:hash(JSON.stringify(artifacts)),files,inputHash:hash(JSON.stringify(files)),build:{revision,script:hash(builder)}};
 write(path.join(site,'inkwave-build.json'),JSON.stringify(manifest));
 const proof=path.join(dir,'proof.json');write(proof,JSON.stringify({mode:'prepared-composition-not-HEAD',fullBrowserInputVerificationRequired:true,candidateTree:'a'.repeat(40),baseCommit:'b'.repeat(40),files:proofFiles}));
 const module=path.join(dir,'playwright.mjs');
 write(module,`import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const mode=process.env.BATCH_FAILURE||'',trace=process.env.BATCH_TRACE,contexts=[];let serial=0;
const log=row=>fs.appendFileSync(trace,JSON.stringify(row)+'\\n');
function mutate(file){const stat=fs.statSync(file),bytes=fs.readFileSync(file);bytes[0]^=1;fs.writeFileSync(file,bytes);fs.utimesSync(file,stat.atime,stat.mtime);}
export const chromium={launch:async options=>{log({event:'launch',options});if(mode==='launch')throw Error('forced launch');return{
 version:()=> 'protocol fixture; no WebGL was rendered',
 newContext:async options=>{const id=++serial;log({event:'context',id,options});const context={closed:false,
  async newPage(){if(mode==='serve:'+id)mutate(process.env.BATCH_SERVED);return{
   on(event,fn){if(event==='pageerror'&&mode==='page:'+id)fn(Error('forced page error'));},
   async addInitScript(fn){const sandbox={Math:Object.create(Math)};vm.runInNewContext('('+fn.toString()+')()',sandbox);log({event:'seed',id,values:[sandbox.Math.random(),sandbox.Math.random()]});},
   async goto(url){const r=await fetch(url);if(r.status!==200)throw Error('check server failed');},
   request:{async get(url){const r=await fetch(url),bytes=Buffer.from(await r.arrayBuffer());return{status:()=>r.status,body:async()=>bytes};}},
   async evaluate(fn,args){log({event:'case',id,inkjet:args.inkjet,terminal:args.terminal});
    if(mode==='throw:'+id)throw Error('forced case exception');
    if(mode==='tamper:'+id)mutate(process.env.BATCH_UNUSED);
    if(mode==='source:'+id)mutate(process.env.BATCH_SOURCE);
    if(mode==='proof:'+id)mutate(process.env.BATCH_PROOF);
    if(mode==='manifest:'+id)mutate(process.env.BATCH_MANIFEST);
    const count=args.terminal?20:args.inkjet?(args.inkjet.hz===60?12:1):1;
    const data='data:image/png;base64,'+Buffer.alloc(1024,123).toString('base64');
    return{scope:'protocol only; native evaluation not executed',terminalReceipt:args.terminal?{scope:'protocol only'}:null,cases:[{id,inkjet:args.inkjet,terminal:args.terminal}],failures:mode==='case:'+id?['forced assertion']:[],images:Array.from({length:count},(_,i)=>({name:'capture-'+i+'.png',data}))};}
  };},
  async close(){if(this.closed)return;this.closed=true;log({event:'close-context',id});if(mode==='close:'+id)throw Error('forced context cleanup');}
 };contexts.push(context);return context;},
 async close(){log({event:'close-browser'});for(const c of contexts)if(!c.closed)await c.close();if(mode==='browser-close')throw Error('forced browser cleanup');}
};}};
`);
 function run({args=['--batch'],failure='',expectedHash=hash(fs.readFileSync(proof))}={}){
  const result=spawnSync(process.execPath,[driver,'--site',site,'--evidence-dir',out,'--playwright-module',module,'--source-root',source,'--source-proof',proof,'--expected-proof-sha256',expectedHash,...args],{encoding:'utf8',timeout:20000,env:{...process.env,BATCH_FAILURE:failure,BATCH_TRACE:trace,BATCH_UNUSED:unused,BATCH_SOURCE:path.join(source,'inkwave-public/src/game/actor.js'),BATCH_PROOF:proof,BATCH_MANIFEST:path.join(site,'inkwave-build.json'),BATCH_SERVED:path.join(site,`_versions/${revision}/patches/splatoon3/runtime/special-vfx.mjs`)}});
  assert.ifError(result.error);return{...result,events:fs.existsSync(trace)?fs.readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse):[],batch:fs.existsSync(path.join(out,'batch-result.json'))?JSON.parse(fs.readFileSync(path.join(out,'batch-result.json'))):null};
 }
 return{dir,site,source,out,proof,manifest,run,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
function using(fn){const f=fixture();try{return fn(f);}finally{f.close();}}
const grid=[];for(const hz of [30,60,120])for(const actorCount of [1,2,4])for(const layout of ['near','mixed'])grid.push({hz,actorCount,layout});
test('22 cases share one verified build and browser with a fresh closed context and seeded page per case',()=>using(f=>{
 const r=f.run();assert.equal(r.status,0,r.stderr);assert.equal(r.batch.status,'passed');assert.equal(r.batch.checks.length,22);
 assert.equal(r.batch.artifactVerificationPasses,1);assert.equal(r.batch.sourceProofVerificationPasses,1);assert.equal(r.batch.artifactVerificationFiles,4);
 assert.equal(r.batch.artifactVerificationBytes,Object.keys(f.manifest.artifacts).reduce((sum,file)=>sum+fs.statSync(path.join(f.site,file)).size,0));
 assert.equal(r.events.filter(x=>x.event==='launch').length,1);assert.equal(r.events.filter(x=>x.event==='close-browser').length,1);
 let active=0;for(const event of r.events){if(event.event==='context'){active++;assert.equal(active,1);assert.deepEqual(event.options.viewport,{width:960,height:720});}if(event.event==='close-context')active--;}
 assert.equal(active,0);assert.equal(r.events.filter(x=>x.event==='context').length,22);
 const cases=r.events.filter(x=>x.event==='case');assert.equal(cases[0].inkjet,null);assert.equal(cases[0].terminal,null);
 assert.deepEqual(cases.slice(1,19).map(x=>x.inkjet),grid);assert.deepEqual(cases.slice(19).map(x=>x.terminal),[{hz:30},{hz:60},{hz:120}]);
 const seeds=r.events.filter(x=>x.event==='seed');assert.equal(seeds.length,21);assert.ok(seeds.every(x=>JSON.stringify(x.values)===JSON.stringify(seeds[0].values)));
 for(const row of r.batch.checks){assert.equal(row.status,'passed');const result=JSON.parse(fs.readFileSync(path.join(row.evidence,'result.json')));assert.equal(result.contentHash,f.manifest.contentHash);assert.deepEqual(result.errors,[]);if(row.id.startsWith('inkjet-terminal/')){assert.equal(JSON.parse(fs.readFileSync(path.join(row.evidence,'source-preflight.json'))).status,'passed');assert.ok(result.qaIdentity);}else assert.equal(result.qaIdentity,null);}
}));
test('standalone CLI keeps original splashdown, Inkjet and terminal selections',()=>{
 for(const args of [[],['--inkjet','--hz','60','--actors','4','--layout','mixed','--browser-executable','/reviewed/chrome'],['--inkjet-terminals','--hz','120']])using(f=>{
  const r=f.run({args});assert.equal(r.status,0,r.stderr);assert.equal(r.batch,null);assert.equal(r.events.filter(x=>x.event==='context').length,1);
  assert.equal(r.events.find(x=>x.event==='launch').options.executablePath,args.includes('--browser-executable')?'/reviewed/chrome':undefined);
  const result=JSON.parse(fs.readFileSync(path.join(f.out,'result.json')));assert.deepEqual(result.failures,[]);
  assert.equal(fs.readdirSync(f.out).filter(x=>x.endsWith('.png')).length,args.includes('--inkjet')?12:args.includes('--inkjet-terminals')?20:1);
 });
});
test('artifact/proof/input/harness corruption and ambiguous batch flags reject before a browser launch',()=>{
 for(const kind of ['artifact','proof','input','harness','flags'])using(f=>{
  let expectedHash;
  if(kind==='artifact')fs.appendFileSync(path.join(f.site,'unused.bin'),'changed');
  if(kind==='proof')expectedHash='0'.repeat(64);
  if(kind==='input')fs.appendFileSync(path.join(f.source,'inkwave-public/src/game/actor.js'),'changed');
  if(kind==='harness'){const p=JSON.parse(fs.readFileSync(f.proof));p.files['scripts/check-inkwave-splashdown-browser.mjs']='0'.repeat(40);fs.writeFileSync(f.proof,JSON.stringify(p));}
  const r=f.run({expectedHash,args:kind==='flags'?['--batch','--inkjet']:['--batch']});assert.notEqual(r.status,0,kind);assert.equal(r.events.length,0,kind);
 });
});
test('case, page, cleanup, same-length on-disk mutation and source-proof changes fail the entire batch',()=>{
 for(const failure of ['case:3','throw:3','page:3','close:3','tamper:3','source:3','proof:3','manifest:3','serve:3'])using(f=>{
  const r=f.run({failure});assert.notEqual(r.status,0,failure);assert.equal(r.batch.status,'failed');assert.equal(r.batch.checks[2].status,'failed');assert.ok(r.batch.checks.slice(3).every(x=>x.status==='not-run'));
  assert.equal(r.events.filter(x=>x.event==='context').length,3,failure);assert.equal(r.events.filter(x=>x.event==='close-context').length,3,failure);assert.equal(r.events.filter(x=>x.event==='close-browser').length,1,failure);
 });
});
test('preflight-only keeps all terminal receipts and cannot launch the browser',()=>using(f=>{
 const r=f.run({args:['--batch','--preflight-only']});assert.equal(r.status,0,r.stderr);assert.equal(r.events.length,0);assert.equal(r.batch,null);
 for(const hz of [30,60,120])assert.equal(JSON.parse(fs.readFileSync(path.join(f.out,'inkjet-terminal',hz+'hz','source-preflight.json'))).status,'passed');
}));
test('browser launch and final cleanup failures cannot produce a passed batch receipt',()=>{
 for(const failure of ['launch','browser-close'])using(f=>{
  const r=f.run({failure});assert.notEqual(r.status,0,failure);assert.equal(r.batch.status,'failed');assert.equal(r.batch.browserLaunches,1);assert.match(r.batch.error,/forced/);
  assert.ok(r.batch.checks.every(row=>row.status===(failure==='launch'?'not-run':'passed')));
 });
});
test('workflow runs the complete batch with pinned source proof and mandatory contract test',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/inkwave-specials-1130.yml'),'utf8');
 assert.equal(workflow.split("      - 'scripts/tests/inkwave-splashdown-batch.test.mjs'\n").length,2);
 assert.equal(workflow.split('        run: node --test scripts/tests/inkwave-splashdown-batch.test.mjs\n').length,2);
 const step=workflow.split('      - name: Run isolated special browser batch\n')[1]?.split(/\n      - /)[0];assert.ok(step);
 for(const required of ['set -euo pipefail','--git-head --expected-head "$EXPECTED_SOURCE_SHA"','--batch --source-root . --source-proof "$proof" --expected-proof-sha256 "$proof_sha256"','--evidence-dir .ci-scratch/splashdown-browser'])assert.ok(step.includes(required),required);
 assert.equal((workflow.match(/node scripts\/check-inkwave-splashdown-browser\.mjs/g)||[]).length,1);
 assert.ok(!step.includes('continue-on-error'));assert.ok(!step.includes('preflight-only'));
});
