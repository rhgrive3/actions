import {expandTestSuiteSteps} from '../ci/run-inkwave-test-suite.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runBounded,childPassed,childEnvironment,bindSite,verifySite,bindSource,verifySource,sha256} from '../run-inkwave-turf-finish-isolated.mjs';
// These process-liveness assertions require Linux /proc, as on Ubuntu CI.
assert.equal(process.platform,'linux','Guard liveness checks require Linux /proc');
const counts={tests:1,pass:1,fail:0,skipped:0};
const selectedName='selected body';
const selectedTap='TAP version 13\nok 1 - selected body\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
test('handled timeout cannot pass even with status zero and passing counts',()=>{
 const run=spawnSync(process.execPath,['--max-old-space-size=64','-e',"process.on('SIGTERM',()=>process.exit(0)); console.log('ready'); setInterval(()=>{},1000)"],{timeout:500,encoding:'utf8',maxBuffer:4096});
 assert.equal(run.error?.code,'ETIMEDOUT');assert.equal(run.status,0);assert.equal(run.signal,null);assert.equal(childPassed({...run,stdout:selectedTap},counts,selectedName),false);
 assert.equal(childPassed({status:0,error:null,signal:'SIGTERM',stdout:selectedTap},counts,selectedName),false);
 assert.equal(childPassed({status:0,error:null,signal:null,stdout:selectedTap},counts,selectedName),true);
});
test('all inherited alternate input and mode selectors are removed; only declared emitted site survives',()=>{
 const parent={PATH:'/bin',INKWAVE_UPSTREAM_SOURCE:'/wrong',INKWAVE_BUILT_ROOT:'/wrong',INKWAVE_BUILT_SITE:'/wrong',INKWAVE_TURF_FINISH_SITE:'/wrong',INKWAVE_NATIVE_STAGE_ASSETS:'/wrong',INKWAVE_DISABLE_FIXTURE_CACHES:'1',INKWAVE_FUTURE_SELECTOR:'/wrong',NODE_OPTIONS:'--require /wrong',NODE_PATH:'/wrong',NODE_TEST_CONTEXT:'child-v8'};
 const source=childEnvironment(parent,'source');assert(!Object.keys(source).some(k=>k.startsWith('INKWAVE_')||k.startsWith('NODE_TEST_')));assert.equal(source.NODE_PATH,undefined);assert.equal(source.NODE_OPTIONS,'--max-old-space-size=384');
 const emitted=childEnvironment(parent,'emitted','/declared');assert.deepEqual(Object.keys(emitted).filter(k=>k.startsWith('INKWAVE_')).sort(),['INKWAVE_BUILT_SITE','INKWAVE_TURF_FINISH_SITE']);assert.equal(emitted.INKWAVE_BUILT_SITE,'/declared');assert.equal(emitted.INKWAVE_TURF_FINISH_SITE,'/declared');
});
function make(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turf-guard-v2-'));const runtime=path.join(dir,'runtime.mjs');fs.writeFileSync(runtime,'export const n=1;');const manifest=path.join(dir,'inkwave-build.json');fs.writeFileSync(manifest,JSON.stringify({artifacts:{'runtime.mjs':sha256(fs.readFileSync(runtime))},inputHash:'test',contentHash:'test',build:{revision:'test'}}));return {dir,runtime,manifest};}
test('altered actual runtime is rejected even when its manifest is untouched',()=>{const x=make();const b=bindSite(x.dir);const manifest=fs.readFileSync(x.manifest);fs.writeFileSync(x.runtime,'export const n=2;');assert.deepEqual(fs.readFileSync(x.manifest),manifest);assert.throws(()=>verifySite(b),/artifact bytes changed/);assert.throws(()=>bindSite(x.dir),/artifact bytes changed/);});
test('manifest identity drift and added undeclared payloads are rejected',()=>{const x=make(),b=bindSite(x.dir);fs.appendFileSync(x.manifest,' ');assert.throws(()=>verifySite(b),/Build identity changed/);const y=make(),c=bindSite(y.dir);fs.writeFileSync(path.join(y.dir,'extra.mjs'),'export{}');assert.throws(()=>verifySite(c),/inventory changed/);});
function makePrebuilt(){
 const x=make(),root=path.join(x.dir,'native-prebuilt');fs.mkdirSync(path.join(root,'scorch'),{recursive:true});fs.mkdirSync(path.join(root,'packs'));
 const chunk=path.join(root,'scorch/triangles.0.bin'),pack=path.join(root,'packs/p.bin');fs.writeFileSync(chunk,'chunk');fs.writeFileSync(pack,'pack');
 const record=Buffer.from(JSON.stringify({arrays:{triangles:{chunks:[{file:'triangles.0.bin',sha256:sha256(fs.readFileSync(chunk))}]}},manifest:{prebuiltTexturePacks:[{file:'packs/p.bin',sha256:sha256(fs.readFileSync(pack))}]}}));
 const stage=path.join(root,'scorch/stage.json');fs.writeFileSync(stage,record);
 const m=JSON.parse(fs.readFileSync(x.manifest));m.build.nativeStages={prebuilt:{stages:{scorch:{stageSha256:sha256(record)}}}};fs.writeFileSync(x.manifest,JSON.stringify(m));
 return {...x,root,chunk,pack,stage};
}
test('declared native prebuilt payload is admitted outside artifacts; undeclared or altered payload is rejected',()=>{
 const x=makePrebuilt(),b=bindSite(x.dir);verifySite(b);assert.deepEqual(Object.keys(b.prebuilt).sort(),['native-prebuilt/packs/p.bin','native-prebuilt/scorch/stage.json','native-prebuilt/scorch/triangles.0.bin']);
 fs.writeFileSync(path.join(x.root,'packs/extra.bin'),'x');assert.throws(()=>verifySite(b),/inventory changed/);
 const y=makePrebuilt();fs.writeFileSync(y.chunk,'chunK');assert.throws(()=>bindSite(y.dir),/artifact bytes changed/);
 const z=makePrebuilt(),c=bindSite(z.dir);fs.writeFileSync(z.pack,'pacK!');assert.throws(()=>verifySite(c),/artifact bytes changed/);
 const w=makePrebuilt(),d=bindSite(w.dir);fs.appendFileSync(w.stage,' ');assert.throws(()=>verifySite(d),/prebuilt stage changed/);
 const v=make();fs.mkdirSync(path.join(v.dir,'native-prebuilt'));fs.writeFileSync(path.join(v.dir,'native-prebuilt/x.bin'),'x');assert.throws(()=>bindSite(v.dir),/inventory changed/);
});
test('source closure detects runtime, helper and inventory drift',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turf-source-v2-'));for(const p of ['patches','scripts','inkwave-public'])fs.mkdirSync(path.join(dir,p));const file=path.join(dir,'scripts/helper.mjs');fs.writeFileSync(file,'export{}');const b=bindSource(dir);verifySource(b);fs.writeFileSync(file,'export const changed=true;');assert.throws(()=>verifySource(b),/Source closure changed/);});

function active(pid){try{const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');return stat.slice(stat.lastIndexOf(')')+2).split(' ')[0]!=='Z';}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function dead(pid){for(let i=0;i<40&&active(pid);i++)await new Promise(r=>setTimeout(r,25));assert.equal(active(pid),false,'Live descendant survived group cleanup: '+pid);}
test('ignored SIGTERM is forcibly bounded and cannot pass',async()=>{
 const start=performance.now();const run=await runBounded(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)"],{timeout:500,maxBuffer:4096});
 assert.equal(run.error?.code,'ETIMEDOUT');assert.equal(run.signal,'SIGKILL');assert.equal(childPassed({...run,stdout:selectedTap},counts,selectedName),false);assert(performance.now()-start<3000);await dead(Number(run.stdout.trim()));
});
test('timeout kills ordinary Node test-style descendants as well as leader',async()=>{
 const code="const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});const c=spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)\"],{stdio:['ignore','inherit','inherit']});console.log(process.pid);setInterval(()=>{},1000)";
 const start=performance.now();const run=await runBounded(process.execPath,['-e',code],{timeout:700,maxBuffer:4096});assert.equal(run.error?.code,'ETIMEDOUT');assert.equal(run.signal,'SIGKILL');const pids=run.stdout.trim().split(/\s+/).map(Number);assert.equal(pids.length,2);assert(pids.every(n=>n>1));for(const pid of pids)await dead(pid);assert(performance.now()-start<3500);
});
test('normal leader exit cannot leave a live descendant or hanging output pipe',async()=>{
 const code="const {spawn}=require('node:child_process');spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)\"],{stdio:['ignore','inherit','inherit']});setTimeout(()=>process.exit(0),300)";
 const run=await runBounded(process.execPath,['-e',code],{timeout:2000,maxBuffer:4096});assert.equal(run.status,0);assert.equal(run.error,null);await dead(Number(run.stdout.trim()));
});
test('actual node --test worker descendant dies at the group deadline',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turf-test-descendant-v3-'));
 const file=path.join(dir,'hang.test.mjs');
 fs.writeFileSync(file,"import test from 'node:test'; process.on('SIGTERM',()=>{}); console.log('descendant='+process.pid); setInterval(()=>{},1000); test('hang',()=>new Promise(()=>{}));");
 const start=performance.now();const run=await runBounded(process.execPath,['--max-old-space-size=64','--test',file],{env:childEnvironment(process.env,'source'),timeout:700,maxBuffer:8192});
 assert.equal(run.error?.code,'ETIMEDOUT');assert.equal(run.signal,'SIGKILL');const match=/descendant=(\d+)/.exec(run.stdout);assert(match,'Actual Node test worker must have started');await dead(Number(match[1]));assert(performance.now()-start<3500);
});

// Guard the executable default CI route, not merely presence of the runner.
function assertTurfWorkflowRoute(workflow) {
 assert.equal(workflow.split('      - \"scripts/tests/run-inkwave-turf-finish-*.test.mjs\"').length-1,2,'Push and PR triggers must include Turf guard changes');
 const core=workflow.split('  validate_core:\n')[1]?.split('  patch_tests:\n')[0];
 assert(core,'Default core job must exist');
 const steps=core.split(/^      - /m);
 const execution=steps.find(step=>step.startsWith('name: Verify all Turf finish cases on emitted site\n'));
 assert.equal(execution, 'name: Verify all Turf finish cases on emitted site\n        run: node scripts/run-inkwave-turf-finish-isolated.mjs . emitted .ci-scratch/turf-finish _site\n');
 const sharedBuild=workflow.split('  build_site:\n')[1]?.split('  validate_core:\n')[0];
 assert(sharedBuild && sharedBuild.includes('node scripts/build-inkwave.mjs inkwave-public _site\n'),
   'Emitted site must be built at the exact source in the dedicated build job');
 assert(sharedBuild.includes('tar -cf immutable-site.tar _site _site-source-sha.txt'),
   'Built site and source identity must be archived together');
 assert(sharedBuild.includes('name: inkwave-patched-site-${{ env.SOURCE_SHA }}'),
   'Immutable emitted archive must be uploaded for the exact head');
 assert(core.includes('needs: build_site\n'), 'Core must require successful build job');
 const download=steps.findIndex(step=>step.includes('uses: actions/download-artifact@v4\n') &&
   step.includes('name: inkwave-patched-site-${{ env.SOURCE_SHA }}'));
 const built=steps.findIndex(step=>step.includes('tar -xf immutable-site.tar\n') &&
   step.includes('test "$(cat _site-source-sha.txt)" = "$SOURCE_SHA"') &&
   step.includes("EXPECTED_CONTENT_HASH='${{ needs.build_site.outputs.content_hash }}'"));
 assert(download>=0 && download<built && built<steps.indexOf(execution),
   'Emitted mode must consume the real immutable build artifact and verify its HEAD and hash');
 assert(core.includes('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"'),'Checkout must be immutable');
 assert(core.includes('scripts/tests/run-inkwave-turf-finish-isolated.test.mjs'),'This workflow guard must remain wired');
 const evidence=steps.find(step=>step.startsWith('name: Retain bounded Turf finish evidence\n'));
 assert(evidence && evidence.includes('        if: always()\n') && evidence.includes('        uses: actions/upload-artifact@v4\n'));
 assert(evidence.includes('          path: .ci-scratch/turf-finish/\n') && evidence.includes('          if-no-files-found: error\n'));
 assert(evidence.includes('          name: inkwave-turf-finish-${{ env.SOURCE_SHA }}-${{ github.run_attempt }}\n'));
}
const turfWorkflow=()=>expandTestSuiteSteps(fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8'));
test('default CI executes every isolated Turf case on genuine emitted build and retains evidence',()=>assertTurfWorkflowRoute(turfWorkflow()));
test('Turf workflow guard rejects list-only, source-only, wrong site, optional execution and lost evidence',()=>{
 const source=turfWorkflow();
 for(const [from,to] of [
  ['. emitted .ci-scratch/turf-finish _site','. source .ci-scratch/turf-finish _site'],
  ['. emitted .ci-scratch/turf-finish _site','. emitted .ci-scratch/turf-finish _site --list'],
  ['. emitted .ci-scratch/turf-finish _site','. emitted .ci-scratch/turf-finish stale-site'],
  ['name: Verify all Turf finish cases on emitted site\n','name: Verify all Turf finish cases on emitted site\n        if: false\n'],
  ['name: Retain bounded Turf finish evidence\n        if: always()','name: Retain bounded Turf finish evidence\n        if: success()'],
  ['node scripts/build-inkwave.mjs inkwave-public _site','echo skipped-build'],
  ['needs: build_site\n','needs: other\n'],
  ['tar -xf immutable-site.tar','echo no-archive'],
  ['name: inkwave-patched-site-${{ env.SOURCE_SHA }}','name: missing-artifact'],
  ['test "$(cat _site-source-sha.txt)" = "$SOURCE_SHA"','echo no-source-proof'],
  ["EXPECTED_CONTENT_HASH='${{ needs.build_site.outputs.content_hash }}'",'EXPECTED_CONTENT_HASH='],
 ]) {assert(source.includes(from));assert.throws(()=>assertTurfWorkflowRoute(source.replace(from,to)));}
});

function assertReopenedTurfWorkflow(workflow){
 const job=workflow.match(/^  reopened-six:\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/m)?.[1];
 assert(job,'missing reopened-six job');
 const steps=job.split(/^      - /m).slice(1);
 assert(!steps.some(step=>step.includes('patches/splatoon3/tests/turf-finish.test.mjs')));
 assert(steps.includes('name: Verify all Turf finish cases on source\n        run: node scripts/run-inkwave-turf-finish-isolated.mjs . source .ci-scratch/turf-finish-source\n'));
 for(const file of ['superjump-gameplay','support-kit-recon-cooler','support-kit-two-peer','issue-835-cooler-punisher','issue-514-sourced-partial-range','issue-1108-roller-wall-idle','map-reveal']) assert(workflow.includes('patches/splatoon3/tests/'+file+'.test.mjs'));
 for(const file of ['bot-paint-device-profile','bot-paint-observation']) assert(workflow.includes('patches/local-quality/tests/'+file+'.test.mjs'));
 assert(workflow.includes('patches/loading-cache/tests/cargo-offline-precache.test.mjs'));
 const evidence=steps.find(step=>step.startsWith('name: Retain bounded Turf source evidence\n'));
 assert(evidence.includes('        if: always()\n') && evidence.includes('        uses: actions/upload-artifact@v4\n'));
 assert(evidence.includes('          path: .ci-scratch/turf-finish-source/\n') && evidence.includes('          if-no-files-found: error\n'));
 assert(workflow.includes("      - 'scripts/run-inkwave-turf-finish-isolated.mjs'"));
}
test('reopened-six replaces only monolithic Turf with bounded source execution and retains failure evidence',()=>{
 assertReopenedTurfWorkflow(fs.readFileSync(new URL('../../.github/workflows/inkwave-reopened-six.yml',import.meta.url),'utf8'));
});
test('reopened-six rejects monolithic Turf execution, missing bounded cases and lost evidence',()=>{
 const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-reopened-six.yml',import.meta.url),'utf8');
 for(const changed of [
  workflow.replace('      - name: Verify all Turf finish cases on source\n','      - name: forbidden monolithic Turf\n        run: node --test patches/splatoon3/tests/turf-finish.test.mjs\n      - name: Verify all Turf finish cases on source\n'),
  workflow.replace('node scripts/run-inkwave-turf-finish-isolated.mjs . source .ci-scratch/turf-finish-source','echo skip-bounded'),
  workflow.replace('          if-no-files-found: error','          if-no-files-found: ignore'),
 ]) {assert.notEqual(changed,workflow);assert.throws(()=>assertReopenedTurfWorkflow(changed));}
});

test('default patch shard retains Turf ownership but runs bounded cases instead of the monolithic file',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-patches.mjs',import.meta.url),'utf8');
 assert(source.includes('const shardFiles = selectTestShard(files, shardIndex, shardCount);'));
 assert(source.includes("const turfFile = path.join(PATCH_ROOT, 'tests/turf-finish.test.mjs');"));
 assert(source.includes('const ordinaryFiles = shardFiles.filter(file => file !== turfFile);'));
 assert(source.includes('if (shardFiles.includes(turfFile)) {'));
 assert(source.includes("['scripts/run-inkwave-turf-finish-isolated.mjs', ROOT, 'source', path.join(logDir, 'turf-finish')]"));
 assert(source.includes('if (turf.status !== 0) throw Error('));
 assert(source.includes('...ordinaryFiles]'));
 assert(!source.includes('...shardFiles]'));
 assert(source.includes("files: shardFiles.map(file => path.relative(ROOT, file).split(path.sep).join('/'))"));
});
test('actual shard dispatch preserves ordinary files, isolated-only shards and fail-closed Turf outcomes',async()=>{
 const code=fs.readFileSync(new URL('../check-inkwave-patches.mjs',import.meta.url),'utf8');
 const start=code.indexOf('  const turfFile =');const end=code.indexOf('  result.stdout =',start);
 assert(start>0 && end>start);
 const invoke=new Function('path','fs','process','runLoggedTestProcess','ROOT','PATCH_ROOT','SRC','shardFiles','logDir','log','concurrency',`return (async()=>{${code.slice(start,end)}return result;})()`);
 const root='/checkout',patch=root+'/patches/splatoon3',turf=patch+'/tests/turf-finish.test.mjs',other=patch+'/tests/other.test.mjs';
 async function run(files,status=0,src=root+'/inkwave-public'){
  const calls=[],writes=[];
  const result=await invoke(path,{writeFileSync:(...args)=>writes.push(args)},{execPath:'/node',env:{}},async(...args)=>{calls.push(args);return {status:args[1][0].includes('isolated')?status:0};},root,patch,src,files,'/evidence','/evidence/patch-tests.log',4);
  return {calls,writes,result};
 }
 const mixed=await run([other,turf]);assert.equal(mixed.calls.length,2);
 assert.deepEqual(mixed.calls[0][1],['scripts/run-inkwave-turf-finish-isolated.mjs',root,'source','/evidence/turf-finish']);
 assert.deepEqual(mixed.calls[1][1],['--experimental-vm-modules','--test','--test-concurrency=4',other]);
 const isolated=await run([turf]);assert.equal(isolated.calls.length,1);assert.equal(isolated.writes.length,1);
 const ordinary=await run([other]);assert.equal(ordinary.calls.length,1);assert.equal(ordinary.calls[0][1].at(-1),other);
 await assert.rejects(run([turf],1),/Isolated Turf failed/);
 await assert.rejects(run([turf],0,'/alternate'),/checkout production source/);
});

test('shard evidence survives Turf-first failure before ordinary log creation and also retains passing receipts',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-patches.mjs',import.meta.url),'utf8');
 assert(source.indexOf("path.join(logDir, 'shard-manifest.json')")<source.indexOf('const turfFile ='));
 const workflow=turfWorkflow();
 const shard=workflow.split('  patch_tests:\n')[1].split(/^  [a-zA-Z_]+:\n/m)[0];
 assert(shard.includes("if: always() && hashFiles('.ci-scratch/inkwave-patches/shard-manifest.json') != ''"));
 assert(!shard.includes("hashFiles('.ci-scratch/inkwave-patches/patch-tests.log')"));
 assert(shard.includes('path: .ci-scratch/inkwave-patches/'));
});

test('changed native payload rejects even when inode, size and mtime are preserved',()=>{
 const x=makePrebuilt();fs.utimesSync(x.chunk,1700000000,1700000000);const b=bindSite(x.dir);
 fs.writeFileSync(x.chunk,'chunK');fs.utimesSync(x.chunk,1700000000,1700000000);
 assert.throws(()=>verifySite(b),/artifact bytes changed/);
});

test('declared chunk named nested/stage.json cannot evade payload digest verification',()=>{
 const x=makePrebuilt();const nested=path.join(x.root,'scorch/nested');fs.mkdirSync(nested);const payload=path.join(nested,'stage.json');fs.renameSync(x.chunk,payload);
 const record=JSON.parse(fs.readFileSync(x.stage));record.arrays.triangles.chunks[0].file='nested/stage.json';fs.writeFileSync(x.stage,JSON.stringify(record));
 const manifest=JSON.parse(fs.readFileSync(x.manifest));manifest.build.nativeStages.prebuilt.stages.scorch.stageSha256=sha256(fs.readFileSync(x.stage));fs.writeFileSync(x.manifest,JSON.stringify(manifest));
 fs.utimesSync(payload,1700000000,1700000000);const b=bindSite(x.dir);fs.writeFileSync(payload,'chunK');fs.utimesSync(payload,1700000000,1700000000);
 assert.throws(()=>verifySite(b),/artifact bytes changed/);
});
