#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {pathToFileURL} from 'node:url';

const modes=['zones','tower','rainmaker','clams'];
const views=['phone-portrait','phone-landscape','small-phone','tablet-portrait','tablet-landscape','tablet-split','desktop'];
const mobileViews=['small-phone','phone','android','standard','landscape','browser-bars','notched','tablet','desktop'];
const responsiveScreens=['loading','title','main','settings','setup','loadout','locker','howto','credits','pause','results','boss-results','results-change-gear','loadout-continue','online','mode','lobby'];
const primaryScreens=new Set(['main','setup','loadout','results','online','mode','news']);
function requireEvidence(ok,message){if(!ok)throw Error('Success evidence: '+message);}
function passed(report,label){requireEvidence(report?.status==='passed'&&Array.isArray(report.errors)&&report.errors.length===0,label+' is not a complete passing report');}
function identity(report,build,label){for(const [key,expected]of Object.entries({contentHash:build.contentHash,inputHash:build.inputHash,revision:build.build?.revision}))requireEvidence(report[key]===expected&&typeof expected==='string'&&expected.length>0,label+' '+key+' differs from the tested build');}
async function hash(file){const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);return h.digest('hex');}
async function inventory(root){
 const result=[];
 async function visit(directory){
  for(const name of (await fs.readdir(directory)).sort()){
   const file=path.join(directory,name),stat=await fs.lstat(file);
   requireEvidence(!stat.isSymbolicLink(),'symbolic links are not evidence files');
   if(stat.isDirectory())await visit(file);
   else {requireEvidence(stat.isFile(),'unsupported evidence entry');result.push({path:path.relative(root,file).split(path.sep).join('/'),bytes:stat.size,sha256:await hash(file)});}
  }
 }
 await visit(root);return result;
}
export async function packageSuccessEvidence({kind,input,output,build,sourceSha,stepOutcome,full=false}){
 requireEvidence(stepOutcome==='success','browser process and cleanup must succeed');
 requireEvidence(/^[0-9a-f]{40}$/.test(sourceSha),'source SHA must be immutable');
 requireEvidence(['ranked','responsive'].includes(kind),'unsupported suite');
 input=path.resolve(input);output=path.resolve(output);
 requireEvidence(output!==input&&!output.startsWith(input+path.sep)&&!input.startsWith(output+path.sep),'output must be an isolated sibling directory');
 const files=await inventory(input),names=new Set(files.map(x=>x.path));
 const read=async file=>{requireEvidence(names.has(file),'missing '+file);return JSON.parse(await fs.readFile(path.join(input,file),'utf8'));};
 const requireFile=file=>requireEvidence(names.has(file)&&files.find(x=>x.path===file).bytes>0,'missing or empty '+file);
 const keep=new Set(files.map(x=>x.path)),checks=[];
 if(kind==='ranked'){
  const report=await read('result.json');passed(report,'ranked');identity(report,build,'ranked');
  requireEvidence(report.scope==='offline-and-online'&&report.delayMs===200,'complete offline/online delayed relay coverage is required');
  requireEvidence(Array.isArray(report.results)&&report.results.length===4&&new Set(report.results.map(x=>x.mode)).size===4,'all four ranked modes are required');
  for(const mode of modes){
   const row=report.results.find(x=>x.mode===mode);
   requireEvidence(row?.offline?.mode===mode&&row.proof&&Array.isArray(row.online)&&row.online.length===2&&row.online.every(x=>x.mode===mode),'missing ranked mode/context '+mode);
   for(const phase of ['offline','objective','online-0','online-1']){const name=mode+'-'+phase+'.jpg';requireFile(name);await read(name+'.state.json');}
  }
  const gear=await read('remote-contact-gear.json'),charge=await read('rainmaker-charge-receipts.json');
  identity(gear,build,'remote contact gear');requireEvidence(gear.status==='passed'&&charge.status==='passed','native gear/charge receipt is incomplete');
  checks.push('result.json','remote-contact-gear.json','rainmaker-charge-receipts.json');
  if(!full)for(const name of keep)if(/^trace-\d+\.zip$/.test(name))keep.delete(name);
 }else{
  const receipt=await read('ci-result.json');
  requireEvidence(receipt.status==='passed'&&receipt.suite==='responsive'&&receipt.sourceSha===sourceSha&&receipt.contentHash===build.contentHash,'responsive CI receipt identity mismatch');
  const report=await read('responsive/responsive-result.json');passed(report,'responsive');
  requireEvidence(Array.isArray(report.cases)&&report.cases.length===14,'all fourteen responsive cases are required');
  const seen=new Set();
  for(const row of report.cases){
   const group=row.engine+'-'+row.name;
   requireEvidence(['chromium','webkit'].includes(row.engine)&&views.includes(row.name)&&!seen.has(group)&&row.status==='passed','invalid responsive case '+group);seen.add(group);
   const prefix='responsive/cases/'+group+'/'+group+'-';
   const screens=row.name==='desktop'?responsiveScreens:[...responsiveScreens,'quit','drawer','boss-lobby','news'];
   for(const screen of screens)requireFile(prefix+screen+'.png');
   if(!full&&!['phone-portrait','desktop'].includes(row.name))for(const screen of screens)if(!primaryScreens.has(screen))keep.delete(prefix+screen+'.png');
  }
  checks.push('ci-result.json','responsive/responsive-result.json');
  for(const [lane,engine,model,expected]of [['chromium','chromium','mobile-emulation',mobileViews],['webkit','webkit','mobile-emulation',mobileViews],['webkit-resize','webkit','resizable-touch',['phone','landscape']]]){
   const file='mobile-menus/'+lane+'/result.json',r=await read(file);passed(r,file);identity(r,build,file);
   requireEvidence(r.engine===engine&&r.viewportModel===model&&r.audit===false,'unexpected mobile lane '+lane);
   requireEvidence(Array.isArray(r.cases)&&r.cases.length===expected.length&&new Set(r.cases.map(x=>x.name)).size===expected.length,'incomplete mobile lane '+lane);
   for(const c of r.cases){
    requireEvidence(expected.includes(c.name)&&Array.isArray(c.checks)&&c.checks.length>0&&c.checks.every(x=>x.ok===true),'failed mobile case '+c.name);
    for(const screen of Object.keys(c.screens||{}))requireFile('mobile-menus/'+lane+'/'+c.name+'-'+screen+'.png');
   }
   checks.push(file);
  }
 }
 // Publish nothing on a validation failure. An existing destination may be a
 // prior run's evidence, so do not silently replace or merge it.
 await fs.mkdir(output,{recursive:false});
 let retainedBytes=0;
 try{
  for(const file of files){
   file.retained=keep.has(file.path);
   if(!file.retained)continue;
   const target=path.join(output,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(input,file.path),target);
   requireEvidence(await hash(target)===file.sha256,'evidence changed during copy: '+file.path);retainedBytes+=file.bytes;
  }
  const result={schema:'inkwave-success-evidence-v1',status:'passed',kind,sourceSha,contentHash:build.contentHash,inputHash:build.inputHash,revision:build.build?.revision,full,checks,
   policy:kind==='ranked'?'all JSON, state and deliberate images; routine success omits only trace ZIPs':'all JSON/mobile images; every responsive viewport keeps primary screens; both engines retain all phone-portrait and desktop screens; unknown new captures are retained',
   originalFiles:files.length,retainedFiles:keep.size,originalBytes:files.reduce((n,x)=>n+x.bytes,0),retainedBytes,files};
  await fs.writeFile(path.join(output,'success-evidence-inventory.json'),JSON.stringify(result,null,2)+'\n');return result;
 }catch(error){await fs.rm(output,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [kind,input,output,manifest,sourceSha]=process.argv.slice(2);
  const result=await packageSuccessEvidence({kind,input,output,build:JSON.parse(await fs.readFile(manifest,'utf8')),sourceSha,stepOutcome:process.env.INKWAVE_BROWSER_STEP_OUTCOME,full:process.env.INKWAVE_FULL_SUCCESS_EVIDENCE==='1'});
  if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,'path='+path.resolve(output)+'\n');
  console.log(JSON.stringify({kind,originalFiles:result.originalFiles,retainedFiles:result.retainedFiles,originalBytes:result.originalBytes,retainedBytes:result.retainedBytes,full:result.full}));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
