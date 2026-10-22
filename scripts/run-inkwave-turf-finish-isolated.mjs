import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function childEnvironment(parent, mode, site) {
 const env = Object.fromEntries(Object.entries(parent).filter(([key]) => !key.startsWith('INKWAVE_') && !key.startsWith('NODE_TEST_') && !['NODE_OPTIONS','NODE_PATH'].includes(key)));
 env.NODE_OPTIONS = '--max-old-space-size=384';
 if (mode === 'emitted') { assert(site); env.INKWAVE_BUILT_SITE = env.INKWAVE_TURF_FINISH_SITE = site; }
 else assert.equal(mode, 'source');
 return env;
}
// The known Node-only suite uses ordinary descendants in this POSIX group.
// Reject unsupported platforms rather than silently weakening cleanup.
export async function runBounded(command,args,{cwd,env,timeout=120000,maxBuffer=4*1024*1024}={}) {
 assert.notEqual(process.platform,'win32','POSIX process-group supervision is required');
 return new Promise(resolve=>{
  let child,status=null,signal=null,error=null,stdout='',stderr='',bytes=0,settled=false,deadline,drain;
  const fail=(code,message)=>{if(!error)error=Object.assign(new Error(message),{code});};
  const killGroup=()=>{
   if(!child?.pid)return;
   try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')fail('ECLEANUP',e.message);}
  };
  const onExit=()=>killGroup();
  const onInt=()=>{killGroup();process.exit(130);};
  const onTerm=()=>{killGroup();process.exit(143);};
  const finish=()=>{
   if(settled)return;settled=true;clearTimeout(deadline);clearTimeout(drain);
   killGroup();process.removeListener('exit',onExit);process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);
   child?.stdout?.destroy();child?.stderr?.destroy();child?.unref();
   resolve({status,signal,error,stdout,stderr});
  };
  const stop=()=>{killGroup();if(!drain)drain=setTimeout(()=>{fail('EDRAIN','Process group did not close within two seconds after termination');finish();},2000);};
  try{child=spawn(command,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});}
  catch(e){error=e;finish();return;}
  process.once('exit',onExit);process.once('SIGINT',onInt);process.once('SIGTERM',onTerm);
  for(const [stream,key]of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',chunk=>{
   bytes+=chunk.length;if(bytes>maxBuffer){fail('ENOBUFS','Child output limit exceeded');stop();return;}
   if(key==='stdout')stdout+=chunk.toString();else stderr+=chunk.toString();
  });
  child.once('error',e=>{error=e;stop();});
  child.once('exit',(code,sig)=>{status=code;signal=sig;stop();});
  child.once('close',finish);
  deadline=setTimeout(()=>{fail('ETIMEDOUT','Child exceeded the work deadline');stop();},timeout);
 });
}
export function childPassed(run, counts) {
 return !run.error && !run.signal && run.status === 0 && counts.tests === 1 && counts.pass === 1 && counts.fail === 0 && counts.skipped === 0;
}
function safePath(root, name) {
 assert(typeof name === 'string' && name.length && !path.isAbsolute(name) && !name.includes('\\') && name.split('/').every(p => p && p !== '.' && p !== '..'), 'Invalid identity path: '+name);
 const file=path.join(root,name); assert(fs.lstatSync(file).isFile(), 'Identity entry must be a regular file: '+name);
 assert(fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep), 'Identity path escapes root: '+name); return file;
}
function leaves(root, prefix='') {
 const out=[];
 for(const entry of fs.readdirSync(path.join(root,prefix),{withFileTypes:true})) {
  const name=prefix?prefix+'/'+entry.name:entry.name;
  assert(!entry.isSymbolicLink(), 'Symlink not admitted into bound files: '+name);
  if(entry.isDirectory())out.push(...leaves(root,name));else {assert(entry.isFile());out.push(name);}
 }
 return out.sort();
}
export function bindSite(site) {
 const manifestBytes=fs.readFileSync(path.join(site,'inkwave-build.json'));const manifest=JSON.parse(manifestBytes);
 assert(manifest.artifacts && typeof manifest.artifacts==='object' && !Array.isArray(manifest.artifacts));
 const names=Object.keys(manifest.artifacts).sort();assert(names.length>0);assert(!names.includes('inkwave-build.json'));
 const binding={root:site,manifestSha256:sha256(manifestBytes),inputHash:manifest.inputHash,contentHash:manifest.contentHash,revision:manifest.build?.revision,artifacts:{...manifest.artifacts},names};
 verifySite(binding);return binding;
}
export function verifySite(binding) {
 assert.equal(sha256(fs.readFileSync(path.join(binding.root,'inkwave-build.json'))),binding.manifestSha256,'Build identity changed');
 assert.deepEqual(leaves(binding.root),[...binding.names,'inkwave-build.json'].sort(),'Emitted inventory changed or has undeclared files');
 for(const name of binding.names){const expected=binding.artifacts[name];assert(/^[a-f0-9]{64}$/.test(expected),'Malformed artifact digest: '+name);assert.equal(sha256(fs.readFileSync(safePath(binding.root,name))),expected,'Emitted artifact bytes changed: '+name);}
}
export function bindSource(root) {
 const files={};for(const prefix of ['inkwave-public','patches','scripts'])for(const name of leaves(root,prefix))files[name]=sha256(fs.readFileSync(safePath(root,name)));
 return {root,files,digest:sha256(JSON.stringify(files)),count:Object.keys(files).length};
}
export function verifySource(binding) {
 const current=bindSource(binding.root);assert.equal(current.digest,binding.digest,'Source closure changed');
}

export async function main(argv=process.argv.slice(2)) {
// QA-only process isolation; no runtime/test-body transforms or lowered assertions.
const [rootArg, modeArg, outputArg, siteArg, listArg] = argv;
assert(rootArg && ['source','emitted','both'].includes(modeArg) && outputArg, 'Usage: node scripts/run-inkwave-turf-finish-isolated.mjs <repo-root> <source|emitted|both> <receipt-dir> [built-site] [--list]');
const root = path.resolve(rootArg), output = path.resolve(outputArg);
const site = siteArg && siteArg !== '--list' ? path.resolve(siteArg) : null;
if (modeArg !== 'source') assert(site && fs.existsSync(path.join(site,'inkwave-build.json')), 'A complete emitted site is required');
fs.mkdirSync(output,{recursive:true});
const {parse} = await import(pathToFileURL(path.join(root,'patches/loading-cache/vendor/acorn.mjs')).href);
const file='patches/splatoon3/tests/turf-finish.test.mjs';
const siteBinding=site?bindSite(site):null;
const siteIdentity=siteBinding?{path:site,manifestSha256:siteBinding.manifestSha256,inputHash:siteBinding.inputHash,contentHash:siteBinding.contentHash,revision:siteBinding.revision,verifiedArtifactCount:siteBinding.names.length}:null;
const sourceBinding=bindSource(root);
const source=fs.readFileSync(path.join(root,file),'utf8');
const hash=crypto.createHash('sha256').update(source).digest('hex');
// Fail closed on every source change, including aliases, wrappers, skips,
// parameterized registration or new tests the discovery grammar cannot see.
const REVIEWED_TEST_SHA256='11a269156ca1eeaebca16845cabcd4d940fde14e92c202bfad09ae62478b4765';
assert.equal(hash,REVIEWED_TEST_SHA256,'Turf suite changed; review all cases and update the runner pin before executing');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const tests=ast.body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.name==='test').map(n=>{
 const args=n.expression.arguments;assert.equal(args.length,2,'No hidden skip/options permitted');
 assert.equal(args[0].type,'Literal');assert.equal(typeof args[0].value,'string');
 assert.equal(args[1].type,'ArrowFunctionExpression');return args[0].value;
});
assert.equal(tests.length,14,'Reviewed Turf case count changed');assert.equal(new Set(tests).size,tests.length,'Duplicate test names cannot be isolated');
const modes=modeArg==='both'?['source','emitted']:[modeArg];const rows=[];
const receipt={nodeVersion:process.version,siteIdentity,sourceClosure:{sha256:sourceBinding.digest,files:sourceBinding.count},complete:false,sourceFile:file,sourceSha256:hash,discoveredCases:tests,expectedRuns:modes.length*tests.length,unchangedTestBodies:true,heapLimitMiB:384,maxConcurrentChildren:1,rows};
const save=()=>fs.writeFileSync(path.join(output,'isolated-receipt.json'),JSON.stringify(receipt,null,2));save();
if (siteArg === '--list' || listArg === '--list') { console.log(JSON.stringify(receipt)); return; }
for(const mode of modes)for(const [index,name]of tests.entries()){
 verifySource(sourceBinding);if(siteBinding)verifySite(siteBinding);
 const env=childEnvironment(process.env,mode,site);
 const pattern='^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$';
 const args=['--max-old-space-size=384','--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern='+pattern,file];
 const start=performance.now();const run=await runBounded(process.execPath,args,{cwd:root,env,timeout:120000,maxBuffer:4*1024*1024});
 const text=(run.stdout||'')+(run.stderr||'');const counts=Object.fromEntries([...text.matchAll(/^# (tests|pass|fail|skipped) (\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
 const log=`${mode}-${String(index+1).padStart(2,'0')}.tap`;fs.writeFileSync(path.join(output,log),text);
 const row={mode,index:index+1,name,sourceSha256:hash,siteIdentity:mode==='emitted'?siteIdentity:null,command:[process.execPath,...args],exit:run.status,signal:run.signal,error:run.error?.message||null,counts,seconds:(performance.now()-start)/1000,log};
 row.passed=childPassed(run,counts);rows.push(row);save();console.log(JSON.stringify(row));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,'Test source changed');
 verifySource(sourceBinding);if(siteBinding)verifySite(siteBinding);
}
verifySource(sourceBinding);if(siteBinding)verifySite(siteBinding);
receipt.complete=rows.length===receipt.expectedRuns&&rows.every(r=>r.passed);save();process.exitCode=receipt.complete?0:1;

}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
