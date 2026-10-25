import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url), file='.github/workflows/inkwave-specials-1130.yml';
const workflow=fs.readFileSync(new URL(file,root),'utf8');
const files=["patches/splatoon3/tests/reefslider-visual-lifecycle.test.mjs", "patches/splatoon3/tests/triple-splashdown-impact-vfx.test.mjs"];
const own='scripts/tests/inkwave-reef-splash-workflow-registration.test.mjs';
const titles=['Verify Reefslider and Splashdown CI registration','Reviewed Reefslider and Splashdown source regressions','Reviewed Reefslider and Splashdown emitted-site regressions'];
const additions=["      - 'patches/splatoon3/tests/reefslider-visual-lifecycle.test.mjs'\n      - 'patches/splatoon3/tests/triple-splashdown-impact-vfx.test.mjs'\n      - 'scripts/tests/inkwave-reef-splash-workflow-registration.test.mjs'\n", "      - name: Verify Reefslider and Splashdown CI registration\n        run: node --test scripts/tests/inkwave-reef-splash-workflow-registration.test.mjs\n", "      - name: Reviewed Reefslider and Splashdown source regressions\n        run: |\n          set -e\n          node --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=1 patches/splatoon3/tests/reefslider-visual-lifecycle.test.mjs\n          node --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=1 patches/splatoon3/tests/triple-splashdown-impact-vfx.test.mjs\n", "      - name: Reviewed Reefslider and Splashdown emitted-site regressions\n        run: |\n          set -e\n          INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=1 --test-name-pattern='arming warning|death, interruption' patches/splatoon3/tests/reefslider-visual-lifecycle.test.mjs\n          INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=1 patches/splatoon3/tests/triple-splashdown-impact-vfx.test.mjs\n"];
function step(text,name){const marker='      - name: '+name+'\n';assert.equal(text.split(marker).length,2,name+' once');return text.split(marker)[1].split(/\n      - /)[0];}
const extractionRegression="            scripts/tests/inkwave-special-frame-extraction.test.mjs \\\n";
function verify(text){
 assert.equal(text.split(extractionRegression).length,2,'exact added extraction regression once');
 assert.ok(fs.existsSync(new URL('scripts/tests/inkwave-special-frame-extraction.test.mjs',root)));
 assert.ok(step(text,'Special source and transformed fixture regressions (not emitted-site coverage)').includes(extractionRegression.trimEnd()),'extraction regression stays in transformed-source step');
 text=text.replace(extractionRegression,'');
 for(const p of [...files,own]){assert.equal(text.split("      - '"+p+"'").length,2,p+' explicit trigger once');assert.ok(fs.existsSync(new URL(p,root)));}
 assert.equal(step(text,titles[0]).trim(),'run: node --test '+own);
 const source=step(text,titles[1]),emitted=step(text,titles[2]);
 for(const body of [source,emitted]){
  assert.ok(body.includes('set -e\n'),'first failure propagates');
  assert.equal(body.split('--test-concurrency=1').length,3,'two serial invocations');
  assert.equal(body.split('--experimental-vm-modules --experimental-global-webcrypto').length,3,'actual fixture VM flags');
  for(const p of files)assert.equal(body.split(p).length,2,p+' once per representation');
 }
 assert.ok(!source.includes('INKWAVE_BUILT_SITE'),'source fixture does not impersonate output');
 assert.equal(emitted.split('INKWAVE_BUILT_SITE=_site node').length,3,'both emitted invocations require actual site');
 assert.ok(emitted.includes("--test-name-pattern='arming warning|death, interruption' "+files[0]),'source-only fixed RNG cadence must not run against minified output');
 assert.ok(text.indexOf('      - name: Build actual production composition')<text.indexOf('      - name: '+titles[2]),'build precedes output tests');
 const authenticatedInkjetFragments=[{"text":"      - 'patches/splatoon3/tests/inkjet-nozzle-owner.test.mjs'\n      - 'scripts/check-inkwave-inkjet-presentation-browser.mjs'\n      - 'scripts/tests/inkwave-inkjet-workflow-registration.test.mjs'\n      - 'patches/splatoon3/tests/source-fixture.mjs'\n","sha256":"d644c00a6077c0a3033ecacbdefe0bf4ff3b639da72e4e7e831c3bf7a2c65277"},{"text":"      - name: Verify Inkjet nozzle CI registration\n        run: node --test scripts/tests/inkwave-inkjet-workflow-registration.test.mjs\n","sha256":"6c8d3ea6bc587bae404776d5c20f9f2b182411351800ea3229c7624c5aeca37e"},{"text":"      - name: Reviewed Inkjet nozzle owner source regressions\n        run: node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/inkjet-nozzle-owner.test.mjs\n","sha256":"d57c9722aea856881d3801652e7103e4390ed79597b7b062a317037c33e4040f"},{"text":"      - name: Reviewed Inkjet nozzle owner emitted-site regressions\n        run: INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/inkjet-nozzle-owner.test.mjs\n","sha256":"6ec74e88cbcd3d2071a2316b35547102d1c717f790e2154c0365cf9c54cca245"},{"text":"      - name: Inspect rendered Inkjet nozzle attachment and lifecycle\n        run: |\n          set -euo pipefail\n          browser_executable=\"$(node --input-type=module -e 'import {chromium} from \"playwright\"; process.stdout.write(chromium.executablePath())')\"\n          node scripts/check-inkwave-inkjet-presentation-browser.mjs --site _site --browser-executable \"$browser_executable\" --evidence-dir .ci-scratch/splashdown-browser/inkjet-nozzles\n","sha256":"1b06e8536e578d81b7fa69e67d95fbc6ec95609389886bb67badb69cd67e8380"}];
 for(const {text:fragment,sha256} of authenticatedInkjetFragments){
  assert.equal(createHash('sha256').update(fragment).digest('hex'),sha256,'pinned Inkjet fragment bytes');
  assert.equal(text.split(fragment).length,2,'exact approved Inkjet fragment once');text=text.replace(fragment,'');
 }
 for(const fragment of additions){assert.equal(text.split(fragment).length,2,'exact owned fragment');text=text.replace(fragment,'');}
 assert.equal(createHash('sha256').update(text).digest('hex'),'6e54682aced8b71bb9c71c8bdc3fc79511dd152d030e7b5941266ebdbc1e58c7','removing the two authenticated addition sets restores every original workflow byte');
}
test('reviewed Reefslider source3/emitted2 and Splashdown source4/emitted4 are explicitly registered without altering prior gates',()=>verify(workflow));
test('missing trigger, step, site, serial command or honest emitted selection rejects',()=>{
 for(const needle of [...files.map(p=>"      - '"+p+"'"),"      - '"+own+"'",...titles.map(t=>'      - name: '+t),'--test-concurrency=1',"--test-name-pattern='arming warning|death, interruption'",'INKWAVE_BUILT_SITE=_site node','set -e'])assert.throws(()=>verify(workflow.replace(needle,'')),needle);
});
function shell(body,failAt){
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'reef-splash-routing-'));
 const calls=path.join(dir,'calls');
 const prelude=`node(){ printf 'call\\n' >> "$CALLS"; n=$(wc -l < "$CALLS"); if test "$n" = "$FAIL_AT"; then return 17; fi; return 0; }; export -f node;\n`;
 const command=body.split('run: |\n')[1].split('\n').map(x=>x.replace(/^          /,'')).join('\n');
 try{const p=spawnSync('bash',['-e','-c',prelude+command],{env:{...process.env,CALLS:calls,FAIL_AT:String(failAt)},encoding:'utf8'});assert.ifError(p.error);return {exit:p.status,calls:fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\n').length:0};}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const title of titles.slice(1))test(title+' preserves success and fails closed before the next command',()=>{
 const body=step(workflow,title);assert.deepEqual(shell(body,0),{exit:0,calls:2});assert.deepEqual(shell(body,1),{exit:17,calls:1});assert.deepEqual(shell(body,2),{exit:17,calls:2});
});

test('composed Inkjet additions are exact, singular and do not permit unrelated workflow edits',()=>{
 const authenticated=["      - 'patches/splatoon3/tests/inkjet-nozzle-owner.test.mjs'\n      - 'scripts/check-inkwave-inkjet-presentation-browser.mjs'\n      - 'scripts/tests/inkwave-inkjet-workflow-registration.test.mjs'\n      - 'patches/splatoon3/tests/source-fixture.mjs'\n","      - name: Verify Inkjet nozzle CI registration\n        run: node --test scripts/tests/inkwave-inkjet-workflow-registration.test.mjs\n","      - name: Reviewed Inkjet nozzle owner source regressions\n        run: node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/inkjet-nozzle-owner.test.mjs\n","      - name: Reviewed Inkjet nozzle owner emitted-site regressions\n        run: INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/inkjet-nozzle-owner.test.mjs\n","      - name: Inspect rendered Inkjet nozzle attachment and lifecycle\n        run: |\n          set -euo pipefail\n          browser_executable=\"$(node --input-type=module -e 'import {chromium} from \"playwright\"; process.stdout.write(chromium.executablePath())')\"\n          node scripts/check-inkwave-inkjet-presentation-browser.mjs --site _site --browser-executable \"$browser_executable\" --evidence-dir .ci-scratch/splashdown-browser/inkjet-nozzles\n"];
 for(const fragment of authenticated){
  assert.throws(()=>verify(workflow.replace(fragment,'')),'missing Inkjet fragment');
  assert.throws(()=>verify(workflow.replace(fragment,fragment+fragment)),'duplicate Inkjet fragment');
  assert.throws(()=>verify(workflow.replace(fragment,fragment.replace('      -','      x'))),'modified Inkjet fragment');
 }
 assert.throws(()=>verify(workflow.replace('esbuild@0.28.2','esbuild@0.28.3')),'unrelated existing gate edit');
 assert.throws(()=>verify(workflow.replace('  catalogue-browser:\n','  catalogue-browser:\n    continue-on-error: true\n')),'job failure masking');
});

test('extraction regression is additive, singular and cannot mask prior gates',()=>{
 for(const changed of [workflow.replace(extractionRegression,''),workflow.replace(extractionRegression,extractionRegression+extractionRegression),workflow.replace(extractionRegression,extractionRegression.replace('extraction.test','missing.test')),workflow.replace(extractionRegression,extractionRegression.trimEnd()+' || true\n')])assert.throws(()=>verify(changed));
});
