// Run with node --expose-internals. Uses this Node's bundled parser, no download.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const acorn=require('internal/deps/acorn/acorn/dist/acorn');
const file='scripts/check-inkwave-idle-resources.mjs';
const base='4d6166936eaa8058a8b936053992960b510eec88';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trimEnd();
const before=git('show',base+':'+file),after=fs.readFileSync(file,'utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function inspect(source){
 const rows={evaluations:[],functions:{},flags:null,waits:[],screenshotTimeouts:[]};
 function walk(n){
  if(!n||typeof n!=='object')return;
  if(n.type==='FunctionDeclaration')rows.functions[n.id.name]=source.slice(n.start,n.end);
  if(n.type==='VariableDeclarator'&&n.id.name==='BROWSER_ARGS')rows.flags=source.slice(n.start,n.end);
  if(n.type==='CallExpression'){
   const method=n.callee.property?.name;
   if(method==='evaluate')rows.evaluations.push(source.slice(n.arguments[0].start,n.arguments[0].end));
   if(n.callee.name==='setTimeout'&&n.arguments[1]?.type==='Literal')rows.waits.push(n.arguments[1].value);
   if(method==='screenshot')for(const p of n.arguments.at(-1)?.properties||[])if(p.key.name==='timeout')rows.screenshotTimeouts.push(p.value.value);
   if(method==='waitForFunction')for(const p of n.arguments.at(-1)?.properties||[])if(p.key.name==='timeout')rows.waits.push(p.value.value);
  }
  for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);
 }
 walk(acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}));return rows;
}
const a=inspect(before),b=inspect(after);
assert.equal(a.evaluations.length,12);assert.deepEqual(b.evaluations,a.evaluations);
assert.equal(b.flags,a.flags);assert.deepEqual(b.waits,a.waits);assert.deepEqual(b.screenshotTimeouts,a.screenshotTimeouts);
const helpers=['validateIdleResult','observeColdEnvironment','inspectColdBoot','retireDesktopForCold','closeProbeOwner','launchColdMobileBrowser'];
for(const name of helpers)assert.equal(b.functions[name],a.functions[name],name);
assert.match(before,/setDefaultTimeout\(120000\)/);assert.match(after,/IDLE_OPERATION_TIMEOUT_MS=120000/);
console.log(JSON.stringify({status:'passed',base,checkedCommit:git('rev-parse','HEAD'),checkedSourceSha256:sha(after),evaluatedRoutineCount:12,evaluatedRoutinesByteUnchanged:true,evaluatedRoutineSha256:b.evaluations.map(sha),validatorByteUnchanged:true,validatorSha256:sha(b.functions.validateIdleResult),browserFlagsByteUnchanged:true,explicitTimeoutsUnchanged:b.waits,screenshotTimeoutsUnchanged:b.screenshotTimeouts,existingFunctionsByteUnchanged:helpers,existingOperationLimitMs:120000,watchdogScope:'each page.evaluate; not a fix for external runner shutdown or GPU completion proof'},null,2));
