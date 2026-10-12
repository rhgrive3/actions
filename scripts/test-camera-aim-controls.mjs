/** Reproducible local suite. One child process per file avoids VM fixture memory
 * accumulation. A timeout is a FAILED/INCOMPLETE result, never a passing test. */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.argv[2]||path.join(root,'.camera-aim-results'));
fs.mkdirSync(out,{recursive:true});
const names=['camera-aim-controls','controller-motion-integral','controller-motion-ownership',
 'controller-motion-source','pad-sensitivity','gyro-sensitivity-endpoints','issue-271-no-controller-assist',
 'clock','issue-1098-stored-muzzle','issue-94-muzzle-feedback','issue-945-muzzle-feedback-cache',
 'issue-413-world-aim','issue-608-fidelity-aim','muzzle-grate-safety','issue-264-paint-score-boundaries',
 'issue-six-followup-network-paint','superjump-sub-aim-handoff','kit-network'];
const files=names.map(n=>'patches/splatoon3/tests/'+n+'.test.mjs').concat([
 'patches/local-quality/tests/camera-shoulder.test.mjs',
 'patches/local-quality/tests/issue-480-camera-shake-fidelity.test.mjs',
 'patches/local-quality/tests/issue-862-camera-probe-cache.test.mjs']);
const results=[];
for(const file of files){
 const start=performance.now(),r=spawnSync(process.execPath,['--experimental-vm-modules','--test','--test-concurrency=1',file],
  {cwd:root,encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
 const log=(r.stdout||'')+(r.stderr||'');const logName=path.basename(file).replace('.test.mjs','.tap');
 fs.writeFileSync(path.join(out,logName),log+(r.error?'\n'+r.error.stack:'')+'\n');
 const number=k=>Number(log.match(new RegExp('^# '+k+' (\\d+)','m'))?.[1]||0);
 const item={file,exitCode:r.status,error:r.error?.message||null,seconds:(performance.now()-start)/1000,
  tests:number('tests'),pass:number('pass'),fail:number('fail'),skipped:number('skipped'),log:logName};
 results.push(item);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({builtSite:process.env.INKWAVE_BUILT_SITE||null,
  allPassed:results.every(x=>x.exitCode===0),files:results},null,2)+'\n');
 console.log(`${r.status===0?'PASS':'FAIL'} ${file}: ${item.pass}/${item.tests}`);
}
console.log('TOTAL',results.reduce((n,x)=>n+x.pass,0),'/',results.reduce((n,x)=>n+x.tests,0));
process.exitCode=results.every(x=>x.exitCode===0)?0:1;
