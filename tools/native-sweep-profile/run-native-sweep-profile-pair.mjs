import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compareNativeSweepProfiles} from './compare-native-sweep-profiles.mjs';
import {isolateProfileEnvironment} from './native-sweep-counters.mjs';
const [rootArg,siteArg,outArg,head]=process.argv.slice(2);
assert.ok(rootArg&&siteArg&&outArg);assert.match(head||'',/^[a-f0-9]{40}$/);
const root=path.resolve(rootArg),site=path.resolve(siteArg),out=path.resolve(outArg),dir=path.dirname(fileURLToPath(import.meta.url));
assert.ok(out!==root&&!out.startsWith(root+path.sep),'save receipts outside tracked source tree');
fs.mkdirSync(out);
const files=['native-sweep-counters.mjs','native-sweep-counters.test.mjs','profile-native-sweep.mjs','compare-native-sweep-profiles.mjs','compare-native-sweep-profiles.test.mjs','run-native-sweep-profile-pair.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,f))).digest('hex')]));
const before=hashes(),env=isolateProfileEnvironment(process.env,{root,head,site});
function run(args,extra,log){
 try{const text=execFileSync(process.execPath,args,{cwd:root,env:{...env,...extra},encoding:'utf8',maxBuffer:32*1024*1024});fs.writeFileSync(path.join(out,log),text,{flag:'wx'});}
 catch(error){fs.writeFileSync(path.join(out,log),String(error.stdout||'')+String(error.stderr||error),{flag:'wx'});throw error;}
}
run(['--test',path.join(dir,'native-sweep-counters.test.mjs'),path.join(dir,'compare-native-sweep-profiles.test.mjs')],{},'counter-tests.tap');
for(const mode of ['source','emitted'])run(['--experimental-vm-modules',path.join(dir,'profile-native-sweep.mjs'),path.join(out,mode+'.json')],mode==='emitted'?{INKWAVE_BUILT_SITE:site}:{},mode+'.log');
const source=JSON.parse(fs.readFileSync(path.join(out,'source.json'),'utf8')),emitted=JSON.parse(fs.readFileSync(path.join(out,'emitted.json'),'utf8'));
const comparison=compareNativeSweepProfiles(source,emitted);assert.deepEqual(hashes(),before,'reviewed QA code changed during run');
fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify({...comparison,reviewedScripts:before,limits:'Observer overhead prevents timing inference; synthetic-stage fixture, not device/FPS.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(comparison));
