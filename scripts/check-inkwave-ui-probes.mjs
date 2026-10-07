#!/usr/bin/env node
// Diagnostic only: #560/#565 share active assertions; #589 shares Range assertions.
// One prebuilt site, no workflow changes and no replacement of required full suites.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
export const PROBE_SCRIPTS=['scripts/check-inkwave-ui-probes.mjs','scripts/check-inkwave-browser.mjs','scripts/check-inkwave-hud-authority.mjs','scripts/check-inkwave-range.mjs'];
export const RANGE_RUNS=['chromium-desktop','chromium-phone','webkit-tablet'];
export function smokePlan({site,evidence,profile}) {
  const child=(name,script,extra)=>({name,script,args:['--site',site,'--evidence-dir',path.join(evidence,name),'--profile-dir',path.join(profile,name),...extra]});
  return [child('hud','scripts/check-inkwave-browser.mjs',['--exact-source','--ui-probes-only']),child('range','scripts/check-inkwave-range.mjs',['--signage-only'])];
}
export async function executeSmokePlan(plan,run) {
  const outcomes=[];
  // A failure in the first independent probe must not hide Range diagnostics.
  for(const task of plan) {
    try {outcomes.push({name:task.name,...await run(task)});}
    catch(error) {outcomes.push({name:task.name,code:null,error:String(error)});}
  }
  return outcomes;
}
export function validateSmokeReceipts({hud,range,sourceSha,contentHash,outcomes}) {
  const errors=[];
  for(const name of ['hud','range'])if(outcomes.find(x=>x.name===name)?.code!==0)errors.push(name+' child did not exit successfully');
  if(hud?.status!=='passed'||hud.scope!=='ui-probes-only'||hud.fullAcceptance!==false||hud.sourceSha!==sourceSha||hud.contentHash!==contentHash)errors.push('HUD diagnostic scope/identity/status');
  if(hud?.hudAuthority?.authoritativeSpread?.length!==4||hud?.hudAuthority?.winnerPodium?.states?.length!==2)errors.push('HUD probe coverage');
  if(range?.status!=='passed'||range.scope!=='signage-only'||range.fullAcceptance!==false||range.contentHash!==contentHash)errors.push('Range diagnostic scope/identity/status');
  if(JSON.stringify(range?.runs?.map(x=>x.name))!==JSON.stringify(RANGE_RUNS))errors.push('Range desktop/phone/tablet coverage');
  for(const row of range?.runs||[]) {
    if(row.status!=='passed'||row.checks?.signageBudget?.active?.width!==1024||JSON.stringify(row.checks?.signageViews?.map(x=>x.zone))!==JSON.stringify(['gallery','wall']))errors.push('Range signage assertions '+row.name);
  }
  return errors;
}
export function requiredSmokeImages() {
  return [
    ...['shooter','dualies','splatling','blaster'].map(w=>'hud/authoritative-spread-'+w+'.png'),
    ...[0,1].flatMap(w=>['loss','back'].map(s=>'hud/winner-podium-'+w+'-'+s+'.png')),
    ...RANGE_RUNS.flatMap(name=>['active','world-gallery','world-wall'].map(kind=>'range/'+name+'-signage-'+kind+'.png')),
    'range/chromium-desktop-signage-high.png',
  ];
}

async function main() {
  const option=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('Required '+name);return path.resolve(process.argv[i+1]);};
  const site=option('--site'),evidence=option('--evidence-dir'),profile=option('--profile-dir');
  const physical=p=>fs.existsSync(p)?fs.realpathSync(p):path.join(physical(path.dirname(p)),path.basename(p));
  for(const p of [evidence,profile]){
    const real=physical(p);
    if(['/tmp','/var/tmp','/dev/shm'].some(root=>real===root||real.startsWith(root+'/')))throw Error('Use workspace-owned persistent storage: '+real);
    fs.mkdirSync(p,{recursive:true});
  }
  // Refuse stale receipts/profile reuse so an interrupted child cannot pass on old evidence.
  for(const task of smokePlan({site,evidence,profile}))for(const flag of ['--evidence-dir','--profile-dir']){
    const p=task.args[task.args.indexOf(flag)+1];
    if(fs.existsSync(p)&&fs.readdirSync(p).length)throw Error('Use fresh probe output/profile directory: '+p);
  }
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
  const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const verifierHashes={};
  for(const file of PROBE_SCRIPTS){
    const bytes=fs.readFileSync(path.join(ROOT,file));
    if(!bytes.equals(execFileSync('git',['show',sourceSha+':'+file],{cwd:ROOT})))throw Error('Probe differs from source commit: '+file);
    verifierHashes[file]=digest(bytes);
  }
  const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
  const result={status:'failed',scope:'ui-five-diagnostic',fullAcceptance:false,issues:[560,589,565],sourceSha,contentHash:manifest.contentHash,verifierHashes,visualReviewRequired:true};
  const run=task=>new Promise(resolve=>{
    const child=spawn(process.execPath,[task.script,...task.args],{cwd:ROOT,stdio:'inherit',env:{...process.env,RANGE_BROWSERS:'chromium,webkit'}});
    child.once('error',error=>resolve({code:null,error:String(error)}));
    child.once('close',(code,signal)=>resolve({code,signal}));
  });
  result.outcomes=await executeSmokePlan(smokePlan({site,evidence,profile}),run);
  const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(evidence,name)));}catch{return null;}};
  const hud=read('hud/browser-result.json'),range=read('range/range-result.json');
  result.errors=validateSmokeReceipts({hud,range,sourceSha,contentHash:manifest.contentHash,outcomes:result.outcomes});
  result.images=requiredSmokeImages().map(file=>{
    const p=path.join(evidence,file);try{const bytes=fs.readFileSync(p);if(bytes.length<8||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('invalid PNG');return{file,bytes:bytes.length,sha256:digest(bytes)};}
    catch{result.errors.push('Missing or invalid image: '+file);return{file,missing:true};}
  });
  if(!result.errors.length)result.status='passed';
  fs.writeFileSync(path.join(evidence,'ui-probes-result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  if(result.status!=='passed')process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
