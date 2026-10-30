import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync,spawn} from 'node:child_process';
import {plan,parseTap,compare} from './rainmaker-ab-contract.mjs';
const BASE='af588fb0f3f74eefa681a3a4f776154999085814';
const bundle=path.dirname(fileURLToPath(import.meta.url));
const [mode,rootArg,outArg]=process.argv.slice(2);
plan(mode);
assert.ok(rootArg&&outArg,'usage: runner source|emitted product-checkout evidence-dir');
const root=fs.realpathSync(rootArg),out=path.resolve(outArg);fs.mkdirSync(out,{recursive:true});
function git(...args){const p=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);return p.stdout.trim();}
assert.equal(git('rev-parse','HEAD'),BASE);
assert.equal(git('status','--porcelain','--untracked-files=no'),'','tracked files must be pristine');
const tree=git('rev-parse','HEAD^{tree}');
const qa=spawnSync('git',['-C',bundle,'rev-parse','HEAD'],{encoding:'utf8'});assert.equal(qa.status,0,qa.stderr);const qaSha=qa.stdout.trim();assert.match(qaSha,/^[0-9a-f]{40}$/);
const runnerSha256=createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const contractSha256=createHash('sha256').update(fs.readFileSync(path.join(bundle,'rainmaker-ab-contract.mjs'))).digest('hex');
function blob(s){return createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');}
const versions={old:fs.readFileSync(path.join(bundle,'rainmaker-v3.mjs.txt'),'utf8'),new:fs.readFileSync(path.join(bundle,'rainmaker-early.mjs.txt'),'utf8')};
assert.equal(blob(versions.old),'c656d8d0b36fdb1193e402fc11b6aaae2407a4d7');
assert.equal(blob(versions.new),'47e67868068d69686e9211eae36db57d217b276f');
const oldLoop='for(const pl of planes)d=Math.max(d,pl.distanceToPoint(vertex));';
const newLoop='for(const pl of planes){d=Math.max(d,pl.distanceToPoint(vertex));if(d>union)break;}';
assert.equal(versions.new.replace(newLoop,oldLoop),versions.old,'only strict early-bound differs');
function directoryDigest(dir){
 const h=createHash('sha256');let files=0;
 function visit(d){for(const entry of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const p=path.join(d,entry.name);assert.ok(!entry.isSymbolicLink(),'no emitted symlink');
  if(entry.isDirectory())visit(p);else{assert.ok(entry.isFile());h.update(path.relative(dir,p)+'\0');h.update(createHash('sha256').update(fs.readFileSync(p)).digest());files++;}
 }}visit(dir);assert.ok(files>0);return {files,sha256:h.digest('hex')};
}
const site=path.join(root,'_site');
const emitted=mode==='emitted'?directoryDigest(site):null;
const build=emitted?JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8')):null;
if(emitted)assert.ok(typeof build.contentHash==='string'&&build.contentHash.length>0);
const evidence={base:BASE,tree,qaSha,runnerSha256,contractSha256,mode,node:process.version,platform:process.platform,arch:process.arch,
 oldBlob:blob(versions.old),newBlob:blob(versions.new),emitted,buildContentHash:build?.contentHash??null,
 policy:'single paired sample per suite; not proof of stable speedup',runs:[],complete:false};
const evidenceFile=path.join(out,'comparison.json');
const save=()=>fs.writeFileSync(evidenceFile,JSON.stringify(evidence,null,2)+'\n');save();
const tests=path.join(root,'patches/splatoon3/tests');
const temporary=[];
try{
 for(const variant of ['old','new']){
  const p=path.join(tests,'.rainmaker-ab-'+process.pid+'-'+variant+'.test.mjs');
  fs.writeFileSync(p,versions[variant],{flag:'wx'});temporary.push(p);
 }
 const receipts=new Map();
 for(const item of plan(mode)){
  assert.equal(git('status','--porcelain','--untracked-files=no'),'');
  if(emitted)assert.deepEqual(directoryDigest(site),emitted,'same immutable emitted bytes before each child');
  const label=(item.extreme?'extremes':'normal')+'-'+item.variant;
  const log=path.join(out,label+'.tap'),err=path.join(out,label+'.stderr'),timing=path.join(out,label+'.time');
  const env={...process.env,INKWAVE_RAINMAKER_SOURCE:'1',INKWAVE_RAINMAKER_AIM_EXTREMES:item.extreme?'1':'0'};
  for(const k of ['NODE_OPTIONS','NODE_TEST_CONTEXT','INKWAVE_BUILT_ROOT','INKWAVE_BUILT_SITE','INKWAVE_UPSTREAM_SOURCE'])delete env[k];
  if(emitted)env.INKWAVE_BUILT_SITE=site;
  const fd=fs.openSync(log,'wx'),ef=fs.openSync(err,'wx');
  console.log(JSON.stringify({event:'actor-pair-start',base:BASE,qaSha,mode,label}));
  const started=Date.now();
  let code,signal;
  try{
   ({code,signal}=await new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/time',['-f','%e %U %S %M','-o',timing,process.execPath,
     '--experimental-vm-modules','--test','--test-concurrency=1','--test-reporter=tap',temporary[item.variant==='old'?0:1]],
     {cwd:root,env,stdio:['ignore',fd,ef]});
    child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));
   }));
  }finally{fs.closeSync(fd);fs.closeSync(ef);}
  const run={...item,label,code,signal,wallMs:Date.now()-started,timing:fs.existsSync(timing)?fs.readFileSync(timing,'utf8').trim():null};
  evidence.runs.push(run);save();
  console.log(JSON.stringify({event:'actor-pair-child-exit',base:BASE,qaSha,mode,...run}));
  if(code!==0||signal!==null){console.error(fs.readFileSync(log,'utf8').split(/\r?\n/).slice(-120).join('\n'));console.error(fs.readFileSync(err,'utf8').slice(-8192));}
  assert.equal(code,0,'child must pass; inspect '+log);assert.equal(signal,null);
  const values=run.timing.split(/\s+/).map(Number);assert.equal(values.length,4);assert.ok(values.every(Number.isFinite));
  [run.elapsedSeconds,run.userSeconds,run.systemSeconds,run.maxRssKiB]=values;
  const rows=parseTap(fs.readFileSync(log,'utf8'),item.extreme);
  const bytes=JSON.stringify(rows);run.receiptsSha256=createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(out,label+'.receipts.json'),bytes+'\n');
  receipts.set(label,rows);save();
  console.log(JSON.stringify({event:'actor-pair-child-verified',base:BASE,qaSha,mode,...run,receiptCount:rows.length}));
 }
 for(const suite of ['normal','extremes'])compare(receipts.get(suite+'-old'),receipts.get(suite+'-new'));
 assert.equal(git('status','--porcelain','--untracked-files=no'),'');
 if(emitted)assert.deepEqual(directoryDigest(site),emitted);
 evidence.complete=true;save();console.log(JSON.stringify(evidence));
}finally{for(const p of temporary)fs.unlinkSync(p);}
