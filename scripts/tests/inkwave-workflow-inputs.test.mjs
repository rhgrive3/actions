import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const fileExists=file=>fs.existsSync(path.join(root,file))&&fs.statSync(path.join(root,file)).isFile();
function patterns(workflow){
 const body=read('.github/workflows/'+workflow).match(/\n  pull_request:\n([\s\S]*?)(?=\n  \w|\n\w|$)/)?.[1];
 assert(body,'pull_request path gate exists: '+workflow);
 return [...body.matchAll(/^      - ['"]?([^'"\n]+)['"]?$/gm)].map(m=>m[1]);
}
function matches(file,pattern){
 let source='';for(let i=0;i<pattern.length;i++){
  if(pattern[i]==='*'){if(pattern[i+1]==='*'){i++;if(pattern[i+1]==='/'){i++;source+='(?:.*/)?';}else source+='.*';}else source+='[^/]*';}
  else if(pattern[i]==='?')source+='[^/]';else source+=pattern[i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 }return new RegExp('^'+source+'$').test(file);
}
// Discover direct imports and literal source reads from the executed tests.
// Dynamic runtime loaders need reviewed explicit inputs; this does not pretend
// to prove every transitive browser import or every GitHub event condition.
function directInputs(entry){
 const text=read(entry),out=new Set([entry]),add=file=>{file=path.relative(root,path.resolve(root,file));if(fileExists(file))out.add(file);};
 for(const [,spec]of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g))if(spec.startsWith('.'))add(path.join(path.dirname(entry),spec));
 for(const [,value]of text.matchAll(/['"]((?:inkwave-public\/|patches\/|scripts\/|tools\/|src\/)[^'"\n]+)['"]/g))add(value.startsWith('src/')?'inkwave-public/'+value:value);
 for(const [,value]of text.matchAll(/new URL\(['"]([^'"]+)['"]/g))add(path.join(path.dirname(entry),value));
 return out;
}
function covered(workflow,inputs){
 const gate=patterns(workflow);for(const file of inputs)assert(gate.some(p=>matches(file,p)),workflow+' misses executed input '+file);
 assert(!gate.some(p=>matches('docs/unrelated-guide.md',p)),workflow+' must remain focused');
 assert(!gate.some(p=>matches('README.md',p)),workflow+' must remain focused');
}
const quality='patches/local-quality/tests/quality.test.mjs';
for(const [workflow,entries,extra]of[
 ['inkwave-runtime-frame-parity.yml',[quality,'patches/local-quality/tests/runtime-frame-scratch.test.mjs','patches/local-quality/tests/hud-hotpath.test.mjs'],[]],
 ['inkwave-paint-hotpath.yml',[quality,'patches/local-quality/tests/paint-hotpath.test.mjs'],[]],
 ['inkwave-composed-cpu.yml',['patches/local-quality/tests/body-balance-work.test.mjs','patches/local-quality/tests/body-balance-work-fixture.mjs','scripts/benchmark-inkwave-body-balance.mjs'],['inkwave-public/src/game/motion/locomotion-profile.js','inkwave-public/src/game/motion/source-bank.js','inkwave-public/src/game/motion/run-foot-path.js','scripts/build-inkwave.mjs','scripts/lib/inkwave-runtime-evidence.mjs','scripts/check-inkwave-patches.mjs','scripts/check-inkwave-startup-budget.mjs','scripts/prepare-inkwave-ci-apt.py','patches/local-quality/tests/motion-fk-hotpath.test.mjs']],
 ['inkwave-ink-micro-surface.yml',['patches/local-quality/tests/ink-micro-surface.test.mjs','patches/local-quality/tests/grate-normal.test.mjs','patches/local-quality/tests/paint-hotpath.test.mjs'],['inkwave-public/src/world/inkShading.js','inkwave-public/src/world/levelMaterial.js','inkwave-public/src/world/texlib.js','scripts/build-inkwave.mjs','scripts/lib/inkwave-runtime-evidence.mjs']],
])test(workflow+' covers direct executed-test inputs',()=>covered(workflow,new Set([...entries.flatMap(entry=>[...directInputs(entry)]),...extra])));

const composedCpuBrowserInstall = `      - name: Install Chromium for emitted CPU trace smoke
        run: |
          sudo python3 scripts/prepare-inkwave-ci-apt.py
          npx playwright install --with-deps chromium
`;
const composedCpuRecorder = `      - name: Actual browser CPU recorder, finite gameplay state and GC trace
        env:
          SOURCE_SHA: \${{ github.event.pull_request.head.sha }}
        run: node scripts/benchmark-inkwave-composed-cpu.mjs --site _site --source-sha "$SOURCE_SHA" --frames 30 --stages range --quality low --evidence-dir .cpu-ci
`;
function composedCpuBrowserContract(source){
 const triggers=source.slice(0,source.indexOf('\npermissions:'));
 assert(triggers.includes("      - 'scripts/prepare-inkwave-ci-apt.py'\n"),'APT helper updates trigger the workflow');
 assert.match(source,/^    timeout-minutes: 20$/m,'existing job timeout remains bounded');
 assert(source.includes(composedCpuBrowserInstall),'prepare the signed HTTPS archive before the unchanged Playwright install');
 assert(source.includes(composedCpuRecorder),'retain the source-bound actual browser CPU recorder command');
 assert(source.indexOf(composedCpuBrowserInstall)<source.indexOf(composedCpuRecorder),'browser installation precedes the CPU trace');
 const required=source.slice(source.indexOf('  source-and-emitted:'),source.indexOf('      - uses: actions/upload-artifact@v4'));
 assert.doesNotMatch(required,/^\s+(?:if|continue-on-error):/m,'required source, emitted and browser checks remain unconditional');
 for(const command of [
  'test "$(git rev-parse HEAD)" = "$SOURCE_SHA"',
  'node scripts/check-inkwave-patches.mjs --quick',
  'node --experimental-vm-modules --test patches/local-quality/tests/body-balance-work.test.mjs scripts/tests/inkwave-cpu-trace.test.mjs scripts/tests/inkwave-cpu-history.test.mjs scripts/tests/inkwave-cpu-gameplay-digest.test.mjs scripts/tests/inkwave-cpu-counters.test.mjs scripts/tests/inkwave-composed-cpu-comparison.test.mjs',
  'node --experimental-vm-modules --test patches/local-quality/tests/motion-fk-hotpath.test.mjs',
  'node scripts/build-inkwave.mjs inkwave-public _site',
  'node scripts/check-inkwave-startup-budget.mjs _site',
  'INKWAVE_BUILT_SITE: _site',
  'run: node --experimental-vm-modules --test patches/local-quality/tests/body-balance-work.test.mjs',
  'node --experimental-vm-modules scripts/benchmark-inkwave-body-balance.mjs balance-benchmark.json',
 ])assert(required.includes(command),'retain existing gate: '+command);
}
test('composed CPU browser setup prepares APT before the unchanged install and actual trace gates',()=>{
 composedCpuBrowserContract(read('.github/workflows/inkwave-composed-cpu.yml'));
});
test('composed CPU browser contract rejects lost setup, reordered commands and weakened gates',()=>{
 const source=read('.github/workflows/inkwave-composed-cpu.yml');
 for(const [before,after]of [
  ["      - 'scripts/prepare-inkwave-ci-apt.py'\n",''],
  ['          sudo python3 scripts/prepare-inkwave-ci-apt.py\n',''],
  ['          sudo python3 scripts/prepare-inkwave-ci-apt.py\n          npx playwright install --with-deps chromium','          npx playwright install --with-deps chromium\n          sudo python3 scripts/prepare-inkwave-ci-apt.py'],
  ['timeout-minutes: 20','timeout-minutes: 30'],
  ['--with-deps chromium','chromium'],
  [composedCpuBrowserInstall+composedCpuRecorder,composedCpuRecorder+composedCpuBrowserInstall],
  ['--source-sha "$SOURCE_SHA" --frames 30','--source-sha "$SOURCE_SHA" --frames 1'],
  ['        run: node scripts/benchmark-inkwave-composed-cpu.mjs','        if: false\n        run: node scripts/benchmark-inkwave-composed-cpu.mjs'],
  ['          node scripts/check-inkwave-startup-budget.mjs _site\n',''],
 ]){assert(source.includes(before),before);assert.throws(()=>composedCpuBrowserContract(source.replace(before,after)));}
});

for(const [workflow,tool]of[['inkwave-squid-heading-qa.yml','squid-heading-qa'],['inkwave-swim-entry-qa.yml','swim-entry-qa']])test(workflow+' covers the current authored hashes and shared harness inputs',()=>{
 const entry='tools/'+tool+'/run.mjs',source=read(entry),list=source.match(/for\(const name of (\[[^\n]+?\])\)basis\.authoredHashes/);
 assert(list,'authored identity input list must stay inspectable');const authored=JSON.parse(list[1].replaceAll("'",'"'));assert(authored.length>=8);
 covered(workflow,new Set([...authored,...directInputs(entry),'tools/squid-production-qa/lighting.mjs','patches/loading-cache/vendor/acorn.mjs','scripts/build-inkwave.mjs','scripts/inkwave-source-composition.mjs','scripts/check-inkwave-startup-budget.mjs']));
});
test('swim film covers its imported shared fixtures and their composition/cache dependencies',()=>{
 const entries=['swim-presentation','swim-surface-fps','swim-film-offscreen'].map(name=>'patches/local-quality/tests/'+name+'.test.mjs');
 covered('inkwave-swim-film.yml',new Set([...entries.flatMap(entry=>[...directInputs(entry)]),'scripts/inkwave-source-composition.mjs','patches/splatoon3/tests/fixture-cache.mjs']));
});
test('audio source audit has focused relevant triggers and an immutable manual entry',()=>{
 covered('inkwave-audio-source-audit.yml',['patches/splatoon3/runtime/audio/s3-real/manifest.json','patches/splatoon3/audio-adapter.mjs','inkwave-public/src/audio/audio.js','tools/audio/collect-public-reference-recordings.py']);
 const source=read('.github/workflows/inkwave-audio-source-audit.yml');assert.match(source,/  workflow_dispatch:/);assert.match(source,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);assert.match(source,/retention-days: 5/);
});
