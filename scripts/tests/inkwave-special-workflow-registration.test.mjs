import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const workflow=fs.readFileSync(new URL('.github/workflows/inkwave-specials-1130.yml',root),'utf8');
const projectile=fs.readFileSync(new URL('.github/workflows/inkwave-projectile-visuals.yml',root),'utf8');
const tests=['area-special-vfx-clock','booyah-orb-clock','projectile-special-vfx-clock','special-crab-ribbon-lifetime','support-special-vfx-cadence','zipcaster-trail-lifecycle','ink-vac-shot-vfx','kraken-jump-spin','screen-close-presentation'];
const title='Special source and transformed fixture regressions (not emitted-site coverage)';
function step(text,name){const marker='      - name: '+name+'\n';assert.equal(text.split(marker).length,2,name+' exactly once');return text.split(marker)[1].split(/\n      - /)[0];}
function verify(text){
 assert.ok(text.includes("      - 'patches/splatoon3/runtime/area-special-vfx-clock.mjs'"));
 assert.ok(text.includes('sparse-checkout: |\n            .github/workflows\n'));
 assert.ok(step(text,'Install pinned special fixture transformer').includes('esbuild@0.28.2'));
 assert.ok(step(text,'Verify special CI registration contracts').includes('node --test scripts/tests/inkwave-special-workflow-registration.test.mjs'));
 const body=step(text,title);assert.ok(body.includes('node --experimental-vm-modules --test --test-concurrency=2'));
 assert.ok(body.includes('export ESBUILD_MODULE'));
 for(const env of ['AREA_VFX_ESBUILD','SPECIAL_VFX_ESBUILD','SUPPORT_VFX_ESBUILD'])assert.ok(body.includes(env+'="$ESBUILD_MODULE"'),env);
 for(const name of tests){const file='patches/splatoon3/tests/'+name+'.test.mjs';assert.equal(body.split(file).length,2,file+' once');assert.ok(fs.existsSync(new URL(file,root)));if(!name.startsWith('special-')&&!name.startsWith('kraken-'))assert.ok(text.includes("      - '"+file+"'"));}
 assert.ok(!body.includes('INKWAVE_BUILT_SITE'),'source/transform tests must not impersonate emitted-site coverage');
}
test('all nine special fixtures run with pinned transformation and explicit trigger coverage',()=>verify(workflow));
test('each missing registration, transformer, environment and area clock trigger rejects',()=>{
 for(const needle of [...tests.map(name=>'            patches/splatoon3/tests/'+name+'.test.mjs'),'esbuild@0.28.2','export ESBUILD_MODULE','AREA_VFX_ESBUILD="$ESBUILD_MODULE"','SPECIAL_VFX_ESBUILD="$ESBUILD_MODULE"','SUPPORT_VFX_ESBUILD="$ESBUILD_MODULE"',"      - 'patches/splatoon3/runtime/area-special-vfx-clock.mjs'",'            .github/workflows'])assert.throws(()=>verify(workflow.replace(needle,'')),needle);
});
// This new-main port must not recreate historical frozen354 admission routes.
// Current-main source admission is owned separately and is not broadened here.
test('new-main special registration does not import obsolete frozen354 admission routes',()=>{
 for(const file of ['scripts/lib/inkwave-special-production-epoch.mjs','scripts/tests/inkwave-special-production-epoch.test.mjs'])assert.ok(!projectile.includes("      - '"+file+"'"),'obsolete admission file is not registered');
 for(const mode of ['frozen354-reviewed-special-production-pair','frozen354-reviewed-special-nozzle-pair'])assert.ok(!projectile.includes(mode),'no obsolete automatic route');
});
// Protect existing genuine emitted coverage and immutable-source/browser gates.
const historicalSteps={
  "Source-backed 19-special runtime and gameplay boundaries": "a2f088587a7407a86db98079d18ab23442c3dfd54c947c17b0d97dbaa8f1b0be",
  "Inkjet cadence, fair pool admission and production composition": "9c8cb8bc659f464d29a268853b5cbaa6cec595b6d1764110b06ddd4ddc1442b6",
  "Public sub and current catalogue lifecycle regressions": "354d01de6193d722388bac757fe7574728855a4e4867e7bddc555e28098e800e",
  "Build actual production composition": "0b06dd1c1d7205bdf5b23f8d427e7707d2a0aa44bb55a0852c6023afdc55bb71",
  "Check actual catalogue activation with and without optional VFX": "db6525a0d7545fd95266aa369f7efabb6d56daac5e4df33a27efad95ccb0e499",
  "Probe emitted Inkjet presentation on SwiftShader (candidate only)": "161a7ce1bbac4764819e2267362759099bf96dea9aea39d4f1c8d25509ab0ded",
  "Verify native Inkjet terminal contacts and remote ghosts": "16edd6f741dd905298bfcadebabf488e1300fde87d3fa9a0ab4e157afffb9669",
  "Verify Inkjet production composition in emitted modules": "cf748c999f05143b7b14b6cd2dd791eff698fdadcda94c57b96555c761fb0241",
  "Verify new boundaries in emitted modules": "5d934260f791a937bee22f9e087b035d495362e65b46503ce5ddc91e22d1d133"
};
test('original emitted and browser gates are byte-identical',()=>{
 for(const[name,sha]of Object.entries(historicalSteps))assert.equal(createHash('sha256').update(step(workflow,name)).digest('hex'),sha,name);
 assert.equal(workflow.split('test "$actual_source_sha" = "$EXPECTED_SOURCE_SHA"').length-1,2);
});

function verifyEmitted(text){
 for(const file of ['scripts/tests/inkwave-special-frame-emitted.test.mjs','patches/loading-cache/vendor/acorn.mjs'])assert.ok(text.includes("      - '"+file+"'"),file+' trigger');
 const body=step(text,'Verify special frame corrections in actual emitted modules');
 assert.equal(body.trim(),'run: INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test scripts/tests/inkwave-special-frame-emitted.test.mjs');
 assert.ok(text.indexOf('      - name: Build actual production composition')<text.indexOf('      - name: Verify special frame corrections in actual emitted modules'));
 // This step belongs to the existing built/browser job, whose sparse checkout includes both dependencies.
 const job=text.slice(text.lastIndexOf('          sparse-checkout: |',text.indexOf('      - name: Build actual production composition')),text.indexOf('      - name: Build actual production composition'));
 for(const directory of ['patches','scripts'])assert.ok(job.includes('            '+directory+'\n'));
 const source=fs.readFileSync(new URL('scripts/tests/inkwave-special-frame-emitted.test.mjs',root),'utf8');
 assert.ok(source.includes('from "../../patches/loading-cache/vendor/acorn.mjs"'));
 assert.ok(fs.existsSync(new URL('patches/loading-cache/vendor/acorn.mjs',root)));
}
test('actual emitted regression runs after full build with mandatory site and vendored parser available',()=>verifyEmitted(workflow));
test('missing emitted step, site, VM flag, trigger or sparse dependency rejects',()=>{
 for(const needle of ['      - name: Verify special frame corrections in actual emitted modules','INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test scripts/tests/inkwave-special-frame-emitted.test.mjs',"      - 'scripts/tests/inkwave-special-frame-emitted.test.mjs'","      - 'patches/loading-cache/vendor/acorn.mjs'"])
  assert.throws(()=>verifyEmitted(workflow.replace(needle,'')),needle);
 for(const directory of ['patches','scripts'])assert.throws(()=>verifyEmitted(workflow.replaceAll('            '+directory+'\n','')),directory);
});

// The two separately reviewed presentation increments retain their own source
// and transformed routes; the original nine and genuine emitted-eight gate stay intact.
const reviewedIncrementFiles=['patches/splatoon3/tests/super-chump-launch-direction.test.mjs','patches/splatoon3/tests/ultra-stamp-jump-presentation.test.mjs'];
const reviewedIncrementTitle='Reviewed Chump and Stamp source/transform regressions';
function verifyReviewedIncrements(text){
 const body=step(text,reviewedIncrementTitle),command='node --experimental-vm-modules --test --test-concurrency=1';
 assert.equal(body.split(command).length,3,'two serial source/transform invocations');
 assert.ok(body.includes('ESBUILD_MODULE="$(node -p "require.resolve(\'esbuild\')")"'));
 assert.ok(body.includes('export ESBUILD_MODULE'));
 const emittedMarker='STAMP_PRESENTATION_EMITTED=1 '+command;
 assert.equal(body.split(emittedMarker).length,2,'explicit Stamp transformed invocation');
 const [raw,emitted]=body.split(emittedMarker);
 for(const file of reviewedIncrementFiles){
  assert.equal(text.split("      - '"+file+"'").length,2,file+' explicit trigger once');
  assert.equal(raw.split(file).length,2,file+' source invocation once');
  assert.ok(fs.existsSync(new URL(file,root)),file+' materialized');
 }
 assert.equal(emitted.split(reviewedIncrementFiles[1]).length,2,'Stamp transformed fixture once');
 assert.ok(!emitted.includes(reviewedIncrementFiles[0]),'Chump already covers both representations internally');
 assert.ok(!body.includes('INKWAVE_BUILT_SITE'),'transformed fixtures are not full emitted-site coverage');
 const chump=fs.readFileSync(new URL(reviewedIncrementFiles[0],root),'utf8');
 assert.ok(chump.includes('for(const emitted of [false,true])'),'Chump covers source and transformed/minified modules');
}
test('reviewed Chump and Stamp fixtures have explicit triggers and serial source/transform routes',()=>verifyReviewedIncrements(workflow));
test('missing reviewed fixture route, trigger, transformer or transformed mode rejects',()=>{
 for(const needle of ['      - name: '+reviewedIncrementTitle,'export ESBUILD_MODULE','STAMP_PRESENTATION_EMITTED=1 ',...reviewedIncrementFiles.map(file=>"      - '"+file+"'"),...reviewedIncrementFiles.map(file=>'            '+file)]){
  const start=workflow.indexOf('      - name: '+reviewedIncrementTitle);
  const changed=needle==='export ESBUILD_MODULE'?workflow.slice(0,start)+workflow.slice(start).replace(needle,''):workflow.replace(needle,'');
  assert.throws(()=>verifyReviewedIncrements(changed),needle);
 }
 assert.throws(()=>verifyReviewedIncrements(workflow.replaceAll('--test-concurrency=1','--test-concurrency=2')),'serial bound');
});
test('original nine-fixture command remains byte-identical while reviewed increments use a separate step',()=>{
 assert.equal(createHash('sha256').update(step(workflow,title)).digest('hex'),'c28f0b96f40954601807f3da3bcddf0a02f1ff45fa97811685257e2b09b2337d');
 verify(workflow);verifyEmitted(workflow);
});

const reviewedTrizookaFile='patches/splatoon3/tests/trizooka-lobe-vfx.test.mjs';
function verifyReviewedTrizooka(text){
 const body=step(text,'Reviewed Trizooka glob source/transform regressions');
 const command='node --experimental-vm-modules --test --test-concurrency=1';
 assert.equal(text.split("      - '"+reviewedTrizookaFile+"'").length,2,'approved Trizooka explicit trigger');
 assert.equal(body.split(command).length,3,'serial source and transform invocations');
 assert.equal(body.split(reviewedTrizookaFile).length,3,'same approved file in both invocations');
 assert.ok(body.includes('export ESBUILD_MODULE'));
 assert.equal(body.split('TRIZOOKA_VFX_ESBUILD="$ESBUILD_MODULE" '+command).length,2,'explicit Trizooka transformer route');
 assert.ok(fs.existsSync(new URL(reviewedTrizookaFile,root)));
 assert.ok(!body.includes('INKWAVE_BUILT_SITE'),'fixture transform is not full emitted-site coverage');
}
test('approved Trizooka fixture is explicitly triggered and runs source plus transformed serial routes',()=>verifyReviewedTrizooka(workflow));
test('missing approved Trizooka filename, mode, environment or route rejects',()=>{
 for(const needle of ["      - '"+reviewedTrizookaFile+"'",'      - name: Reviewed Trizooka glob source/transform regressions','TRIZOOKA_VFX_ESBUILD="$ESBUILD_MODULE" ', '            '+reviewedTrizookaFile])assert.throws(()=>verifyReviewedTrizooka(workflow.replace(needle,'')),needle);
 const start=workflow.indexOf('      - name: Reviewed Trizooka glob source/transform regressions');
 assert.throws(()=>verifyReviewedTrizooka(workflow.slice(0,start)+workflow.slice(start).replace('export ESBUILD_MODULE','')));
});

const reviewedInkVacFiles=['patches/splatoon3/tests/ink-vac-model-muzzle.test.mjs','patches/splatoon3/tests/ink-vac-shot-vfx.test.mjs'];
function verifyReviewedInkVac(text){
 const body=step(text,'Reviewed Ink Vac nozzle source/transform regressions'),command='node --experimental-vm-modules --test --test-concurrency=1';
 for(const file of [reviewedInkVacFiles[0],'patches/network-replication/tests/robustness-fixture.mjs'])assert.equal(text.split("      - '"+file+"'").length,2,file+' approved trigger');
 assert.equal(body.split(command).length,3,'serial source and transformed invocations');
 assert.ok(body.includes('export ESBUILD_MODULE'));
 const marker='SPECIAL_VFX_ESBUILD="$ESBUILD_MODULE" '+command;assert.equal(body.split(marker).length,2,'explicit Ink Vac transform route');
 for(const part of body.split(marker))for(const file of reviewedInkVacFiles)assert.equal(part.split(file).length,2,file+' once in each representation');
 for(const file of [...reviewedInkVacFiles,'patches/network-replication/tests/robustness-fixture.mjs'])assert.ok(fs.existsSync(new URL(file,root)),file+' sparse input');
 assert.ok(!body.includes('INKWAVE_BUILT_SITE'),'transformed model fixture is not complete emitted-site coverage');
}
test('approved Ink Vac nozzle and birth fixtures run source/transform with their shared fixture trigger',()=>verifyReviewedInkVac(workflow));
test('missing approved Ink Vac filename, fixture trigger, serial command or transformed mode rejects',()=>{
 for(const needle of ["      - '"+reviewedInkVacFiles[0]+"'","      - 'patches/network-replication/tests/robustness-fixture.mjs'",'      - name: Reviewed Ink Vac nozzle source/transform regressions','SPECIAL_VFX_ESBUILD="$ESBUILD_MODULE" ',...reviewedInkVacFiles.map(file=>'            '+file)]){
  const start=workflow.indexOf('      - name: Reviewed Ink Vac nozzle source/transform regressions');
  const changed=(needle.startsWith('            ')||needle.startsWith('SPECIAL_VFX_ESBUILD='))?workflow.slice(0,start)+workflow.slice(start).replace(needle,''):workflow.replace(needle,'');
  assert.throws(()=>verifyReviewedInkVac(changed),needle);
 }
});
