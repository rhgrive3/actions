// Preserve every original stage assertion while bounding each VM/geometry heap.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {nativeStageIdentity} from './lib/inkwave-native-stages.mjs';
const assets=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const catalog=JSON.parse(fs.readFileSync(path.join(assets,'catalog.json')));
assert(catalog.stages.length>0);
fs.mkdirSync(out,{recursive:true});
const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});assert.equal(head.status,0);
const report={status:'running',sourceHead:head.stdout.trim(),sourceCommit:catalog.sourceCommit,nativeBindings:nativeStageIdentity(),stages:catalog.stages.map(s=>s.id),cases:[]};
const write=()=>fs.writeFileSync(path.join(out,'matrix.json'),JSON.stringify(report,null,2)+'\n');
write();
for(const stage of catalog.stages)for(const [file,prefix] of [
 ['native-bot-landing.test.mjs','source bot launch retains an actual directed objective route after touchdown: '],
 ['native-integration.test.mjs','native source physics, painting, movement, nav and rules: ']
]){
 assert.deepEqual(nativeStageIdentity(),report.nativeBindings,'native source changed during the matrix');
 const name=prefix+stage.id,pattern='^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$';
 const result=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-reporter=tap','--test-name-pattern',pattern,'patches/native-stages/tests/'+file],{
  encoding:'utf8',timeout:15*60*1000,maxBuffer:4*1024*1024,env:{...process.env,INKWAVE_NATIVE_STAGE_ASSETS:assets,INKWAVE_NATIVE_STAGE_TEST_CHILD:'1'}
 });
 const log=(result.stdout||'')+(result.stderr||''),logFile=stage.id+'-'+file+'.log';
 fs.writeFileSync(path.join(out,logFile),log);
 const ok=result.status===0&&!result.error&&/^# pass 1$/m.test(log)&&/^# fail 0$/m.test(log)&&log.includes('ok 1 - '+name);
 report.cases.push({id:stage.id,name,file,logFile,sourceSha256:stage.sourceSha256,exitCode:result.status,signal:result.signal,processError:result.error?.message||null,ok});
 write();console.log(JSON.stringify(report.cases.at(-1)));
}
report.status=report.cases.length===catalog.stages.length*2&&report.cases.every(c=>c.ok)?'passed':'failed';
write();assert.equal(report.status,'passed','Every stage must pass both original suites in its isolated process');
