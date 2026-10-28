import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const pages=read('.github/workflows/pages-inkwave.yml'),ranked=read('.github/workflows/validate-inkwave-ranked.yml'),runner=read('scripts/check-inkwave-ranked-browser.mjs');
const block=pages.slice(pages.indexOf('      - name: Verify deployed ranked modes'));
const condition=block.match(/^        if: (.+)$/m)?.[1];
const admitted=new Function('success','steps','github','return ('+condition+');');
const args=(outcome='success',ref='refs/heads/main',repository='rhgrive3/actions',ok=true)=>[()=>ok,{deployment:{outcome}},{ref,repository}];
test('public ranked verification requires successful same-repository main deployment',()=>{
 assert.equal(admitted(...args()),true);
 for(const outcome of ['failure','cancelled','skipped',undefined])assert.equal(admitted(...args(outcome===undefined?'':outcome)),false);
 assert.equal(admitted(...args('success','refs/heads/topic')),false);
 assert.equal(admitted(...args('success','refs/pull/1/merge')),false);
 assert.equal(admitted(...args('success','refs/heads/main','fork/actions')),false);
 assert.equal(admitted(...args('success','refs/heads/main','rhgrive3/actions',false)),false);
});
test('deployment, checkout SHA and existing artifact remain one strict sequence',()=>{
 assert.ok(pages.indexOf('uses: actions/deploy-pages@v4')<pages.indexOf('      - name: Verify deployed ranked modes'));
 assert.match(pages,/ref: \$\{\{ github.sha \}\}/);
 assert.match(block,/test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
 assert.match(pages,/node scripts\/build-inkwave.mjs inkwave-public _site/);
 assert.match(block,/node scripts\/check-inkwave-ranked-browser.mjs _site reports\/ranked-public-browser/);
 assert.doesNotMatch(block,/build-inkwave|checkout@|deploy-pages@|continue-on-error|workflow_dispatch/);
 assert.match(pages,/group: "pages-inkwave-\$\{\{ github\.ref \}\}"\n  cancel-in-progress: true/);
 assert.match(pages,/            server\/src\n/);
});
test('push and PR local ranked coverage, strict gate and existing permissions remain',()=>{
 assert.match(ranked,/  push:/);assert.match(ranked,/  pull_request:/);
 assert.match(ranked,/node --experimental-vm-modules --test patches\/splatoon3\/tests\/ranked-\*.test.mjs/);
 assert.match(ranked,/node scripts\/check-inkwave-ranked-browser.mjs _site-ranked reports\/ranked-browser/);
 assert.match(ranked,/RANKED_RELAY_DELAY_MS: 200/);
 assert.doesNotMatch(ranked,/RANKED_PUBLIC_URL/);
 assert.match(ranked,/permissions:\n  contents: read\njobs:/);
 assert.match(pages,/permissions:\n  contents: read\n  pages: write\n  id-token: write\n/);
 assert.doesNotMatch(pages,/actions: write|contents: write|workflow_run:/);
 assert.match(runner,/attempt<30/);assert.match(runner,/AbortSignal.timeout\(15000\)/);assert.match(runner,/setTimeout\(r,10000\)/);
});
test('actual public identity gate accepts exact artifact and rejects stale or changed deployment',async()=>{
 const body=runner.slice(runner.indexOf('let publishedIdentity=null;'),runner.indexOf('const served=new Set();'));
 const execute=new Function('assert','URL','AbortSignal','fetch','setTimeout','publicUrl','build',`return (async()=>{${body};return publishedIdentity;})();`);
 const expected={inputHash:'input',contentHash:'content',build:{revision:'revision'}};
 async function run(manifest){let fetches=0;const result=execute(assert,URL,AbortSignal,async()=>{fetches++;return {ok:true,json:async()=>manifest};},f=>f(),'https://rhgrive3.github.io/actions/',expected);return {result,fetches:()=>fetches};}
 const good=await run(expected);assert.equal((await good.result).revision,'revision');assert.equal(good.fetches(),1);
 for(const altered of [{...expected,inputHash:'old'},{...expected,contentHash:'other'},{...expected,build:{revision:'newer'}}]){
  const bad=await run(altered);await assert.rejects(bad.result,/Published build did not match/);assert.equal(bad.fetches(),30);
 }
});

const updateWorkflow=read('.github/workflows/validate-inkwave-update.yml');
const settingsHudTest=read('patches/local-quality/tests/settings-hud-queue.test.mjs');
const pagesBrowserSetup='          npm ci --no-audit --no-fund\n          npx --no-install playwright install --with-deps --no-shell chromium\n';
const coreBrowserSetup='      - name: Install pinned source regression and build tool\n        run: |\n          npm install --no-save --no-package-lock --silent esbuild@0.28.2 playwright@1.62.1\n          # Hosted Azure apt mirror fetched fonts at 45 kB/s (7m43s, run 40487962033).\n          # Rewrite only the stalled mirror before Playwright\'s unchanged dependency installation.\n          sudo python3 scripts/prepare-inkwave-ci-apt.py\n          npx --no-install playwright install --with-deps chromium\n';
// Inspect only the named job, not a coincidental dependency string elsewhere.
function jobBlock(u,name){
 const matches=[...u.matchAll(/^  ([a-zA-Z0-9_-]+):[ \t]*$/gm)],hits=matches.filter(x=>x[1]===name);
 assert.equal(hits.length,1,`unique ${name} job`);const i=matches.indexOf(hits[0]);return u.slice(hits[0].index,matches[i+1]?.index??u.length);
}
function verifyRequiredDag(u){
 assert.doesNotMatch(u,/^defaults\s*:/m);
 const expected={admission_preflight:null,build_site:'admission_preflight',validate_core:'build_site',patch_tests:'build_site',circleci_offload_gate:'validate_core',browser:'build_site',seven_claims:'build_site',resource_paint_continuation:'build_site'};
 const conditions={"admission_preflight":"inputs.diagnostic_only != true","build_site":"inputs.diagnostic_only != true && (github.event_name != 'pull_request' || github.event.pull_request.draft == false)","validate_core":"inputs.diagnostic_only != true && needs.build_site.outputs.contracts_only != 'true' && (github.event_name != 'pull_request' || github.event.pull_request.draft == false)","patch_tests":"${{ inputs.diagnostic_only != true && needs.build_site.outputs.contracts_only != 'true' && (github.event_name != 'pull_request' || github.event.pull_request.draft == false) && !(vars.INKWAVE_CIRCLECI_OFFLOAD == 'enabled' && github.event_name == 'pull_request' && github.head_ref != 'inkwave/runtime-performance-ui' && github.head_ref != 'inkwave/final-nine-way-integration') }}","circleci_offload_gate":"${{ inputs.diagnostic_only != true && (github.event_name != 'pull_request' || github.event.pull_request.draft == false) && (vars.INKWAVE_CIRCLECI_OFFLOAD == 'enabled' && github.event_name == 'pull_request' && github.head_ref != 'inkwave/runtime-performance-ui' && github.head_ref != 'inkwave/final-nine-way-integration') }}","browser":"${{ inputs.diagnostic_only != true && needs.build_site.outputs.contracts_only != 'true' && (github.event_name != 'pull_request' || github.event.pull_request.draft == false) && !(vars.INKWAVE_CIRCLECI_OFFLOAD == 'enabled' && github.event_name == 'pull_request' && github.head_ref != 'inkwave/runtime-performance-ui' && github.head_ref != 'inkwave/final-nine-way-integration') }}","seven_claims":"inputs.diagnostic_only != true && needs.build_site.outputs.contracts_only != 'true' && (github.event_name != 'pull_request' || github.event.pull_request.draft == false)","resource_paint_continuation":"inputs.diagnostic_only != true && needs.build_site.outputs.contracts_only != 'true' && (github.event_name != 'pull_request' || github.event.pull_request.draft == false)"};
 for(const [name,need] of Object.entries(expected)){
  const b=jobBlock(u,name),needs=[...b.matchAll(/^    needs: (.+)$/gm)];assert.equal(needs.length,need===null?0:1,`unique ${name} needs`);if(need!==null)assert.equal(needs[0][1],need);
  const condition=[...b.matchAll(/^    if: (.+)$/gm)];assert.equal(condition.length,1,`unique ${name} job condition`);assert.equal(condition[0][1],conditions[name],`exact ${name} admission condition`);assert.doesNotMatch(condition[0][1],/\b(?:always|success|failure|cancelled)\s*\(/i);assert.doesNotMatch(b,/^\s*(?:-\s*)?continue-on-error\s*:/m);
 }
 const gate=jobBlock(u,'validate'),needs=[...gate.matchAll(/^    needs: (.+)$/gm)];assert.equal(needs.length,1);assert.equal(needs[0][1],'[admission_preflight, build_site, validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation]');
 assert.match(gate,/^    if: \${\{ always\(\) && inputs\.diagnostic_only != true && \(github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false\) \}\}$/m);
 assert.doesNotMatch(gate,/^\s*(?:-\s*)?continue-on-error\s*:/m);assert.doesNotMatch(gate,/^    defaults\s*:/m);const gateSteps=gate.slice(gate.indexOf('    steps:'));assert.doesNotMatch(gateSteps,/^\s*(?:-\s*)?(?:if|shell|continue-on-error)\s*:/m);
 const bindings={PREFLIGHT_RESULT:'admission_preflight.result',BUILD_RESULT:'build_site.result',CONTRACTS_ONLY:'build_site.outputs.contracts_only',CORE_RESULT:'validate_core.result',PATCH_RESULT:'patch_tests.result',CIRCLECI_RESULT:'circleci_offload_gate.result',BROWSER_RESULT:'browser.result',SEVEN_RESULT:'seven_claims.result',RESOURCE_RESULT:'resource_paint_continuation.result'};
 for(const [env,source] of Object.entries(bindings))assert.ok(gate.includes(`          ${env}: \${{ needs.${source} }}`),`missing exact ${env} binding`);
 assert.ok(gate.includes("          OFFLOAD_ACTIVE: ${{ vars.INKWAVE_CIRCLECI_OFFLOAD == 'enabled' && github.event_name == 'pull_request' && github.head_ref != 'inkwave/runtime-performance-ui' && github.head_ref != 'inkwave/final-nine-way-integration' }}"));
 const marker='        run: |\n',at=gate.indexOf(marker);assert.ok(at>=0&&gate.indexOf(marker,at+1)<0,'unique gate shell');
 const shell=gate.slice(at+marker.length).split('\n').filter(x=>x.trim()).map(x=>{assert.ok(x.startsWith('          '));return x.slice(10);}).join('\n');
 const common={PREFLIGHT_RESULT:'success',BUILD_RESULT:'success',CORE_RESULT:'success',PATCH_RESULT:'success',CIRCLECI_RESULT:'skipped',BROWSER_RESULT:'success',SEVEN_RESULT:'success',RESOURCE_RESULT:'success',CONTRACTS_ONLY:'false',OFFLOAD_ACTIVE:'false'};
 const variants=[common,{...common,OFFLOAD_ACTIVE:'true',PATCH_RESULT:'skipped',CIRCLECI_RESULT:'success',BROWSER_RESULT:'skipped'},{...common,CONTRACTS_ONLY:'true',CORE_RESULT:'skipped',PATCH_RESULT:'skipped',CIRCLECI_RESULT:'skipped',BROWSER_RESULT:'skipped',SEVEN_RESULT:'skipped',RESOURCE_RESULT:'skipped'}];
 const run=env=>spawnSync('bash',['-e','-c',shell],{env:{...process.env,...env},encoding:'utf8'}).status;
 for(const good of variants){assert.equal(run(good),0,'valid fan-in outcome must pass');for(const key of Object.keys(bindings).filter(x=>x!=='CONTRACTS_ONLY')){for(const bad of good[key]==='success'?['failure','cancelled','skipped']:['success','failure','cancelled'])assert.notEqual(run({...good,[key]:bad}),0,`${key}=${bad} must fail closed`);}}
}
function verifyPagesSequence(p){
 assert.doesNotMatch(p,/^defaults\s*:/m);
 const deploy=jobBlock(p,'deploy');assert.match(deploy,/^    if: github\.repository == 'rhgrive3\/actions' && github\.ref == 'refs\/heads\/main'$/m);assert.doesNotMatch(deploy,/^    defaults\s*:/m);assert.doesNotMatch(deploy,/^\s*(?:-\s*)?continue-on-error\s*:/m);const names=['Checkout','Build optimized site','Upload INKWAVE site','Deploy to GitHub Pages','Verify deployed ranked modes'];let previous=-1;
 const blocks={};for(const name of names){const re=new RegExp(`^      - name: ${name}$`,'gm'),hits=[...deploy.matchAll(re)];assert.equal(hits.length,1,`unique Pages step ${name}`);const start=hits[0].index;assert.ok(start>previous,`Pages step order ${name}`);previous=start;const next=deploy.slice(start+1).search(/^      - (?:name:|uses:)/m);blocks[name]=deploy.slice(start,next<0?deploy.length:start+1+next);}
 for(const name of names.slice(0,4)){assert.doesNotMatch(blocks[name],/^\s*(?:-\s*)?(?:if|continue-on-error):/m,`${name} must use ordinary success sequencing`);}
 assert.match(blocks.Checkout,/ref: \${\{ github\.sha \}\}/);assert.match(blocks['Build optimized site'],/set -euo pipefail/);assert.doesNotMatch(blocks['Build optimized site'],/\|\|\s*true|set \+e|continue-on-error|exit 0/);
 assert.match(blocks['Build optimized site'],/node scripts\/build-inkwave\.mjs inkwave-public _site/);assert.match(blocks['Upload INKWAVE site'],/uses: actions\/upload-pages-artifact@v4\n        with:\n          path: _site/);assert.match(blocks['Deploy to GitHub Pages'],/uses: actions\/deploy-pages@v4/);assert.match(blocks['Verify deployed ranked modes'],/node scripts\/check-inkwave-ranked-browser\.mjs _site reports\/ranked-public-browser/);
 const publicCondition=blocks['Verify deployed ranked modes'].match(/^        if: (.+)$/m)?.[1];assert.ok(publicCondition);const publicGate=new Function('success','steps','github','return ('+publicCondition+');');assert.equal(publicGate(...args()),true);for(const outcome of ['failure','cancelled','skipped',''])assert.equal(publicGate(...args(outcome)),false);assert.equal(publicGate(...args('success','refs/heads/topic')),false);assert.equal(publicGate(...args('success','refs/heads/main','fork/actions')),false);assert.equal(publicGate(...args('success','refs/heads/main','rhgrive3/actions',false)),false);
}
function verifySettingsBrowserConsumers(p,u,s){
 verifyPagesSequence(p);
 const build=p.slice(p.indexOf('      - name: Build optimized site'),p.indexOf('      - name: Upload INKWAVE site'));
 const core=u.slice(u.indexOf('  validate_core:'),u.indexOf('  patch_tests:'));
 const shards=u.slice(u.indexOf('  patch_tests:'),u.indexOf('\n  # Required /validate'));
 assert.equal(build.split(pagesBrowserSetup).length,2,'Pages installs exact dependencies and managed Chromium once');
 assert.equal(core.split(coreBrowserSetup).length,2,'core installs exact dependencies and managed Chromium once');
 assert.ok(build.indexOf(pagesBrowserSetup)<build.indexOf('node --test scripts/tests/inkwave-pages-source-identity.test.mjs scripts/tests/inkwave-ranked-pages-sequencing.test.mjs'));
 assert.ok(core.indexOf(coreBrowserSetup)<core.indexOf('      - name: Run requested focused source regressions'));
 assert.ok(core.indexOf(coreBrowserSetup)<core.indexOf('node scripts/ci/run-inkwave-test-suite.mjs source-browser'));
 // Tarball cache keys may identify all tools; CPU shard executable steps may not provision browsers.
 assert.doesNotMatch(shards.replace(/^          key: .*\n/gm,''),/playwright|chromium/);
 verifyRequiredDag(u);
 assert.doesNotMatch(p.slice(p.indexOf('      - name: Verify deployed ranked modes')),/npm install|npx .*playwright install/);
 assert.ok(p.includes('node scripts/check-inkwave-ranked-browser.mjs _site reports/ranked-public-browser'));
 assert.ok(s.includes("const executablePath=process.env.CI?chromium.executablePath():"));
 assert.ok(s.includes("if(process.env.CI){"));
 assert.ok(s.includes("if(!fs.existsSync(executablePath))throw new Error('Required settings HUD Chromium is not installed');"));
 assert.ok(s.includes("return t.skip('Chromium is not installed');"));
 assert.ok(s.indexOf("if(!fs.existsSync(executablePath))throw new Error")<s.indexOf("return t.skip('Chromium is not installed');"));
 assert.ok(s.includes("assert.notEqual(result.serialized,result.authored,'the fixture exercises native CSS canonicalization')"));
 assert.ok(s.includes('assert.ok(result.restored)'));
 assert.ok(s.includes('assert.equal(n,0,JSON.stringify(result))'));
}
test('both settings HUD consumers provision matching browsers before required source tests without touching CPU shards',()=>verifySettingsBrowserConsumers(pages,updateWorkflow,settingsHudTest));
test('settings browser dependency, ordering, mandatory coverage and failure controls reject mutations',()=>{
 const mutations=[
  [pages.replace("    if: github.repository == 'rhgrive3/actions' && github.ref == 'refs/heads/main'",'    if: true'),updateWorkflow,settingsHudTest],
  [pages.replace('  deploy:\n','  deploy:\n    defaults:\n      run:\n        shell: sh\n'),updateWorkflow,settingsHudTest],
  [pages, 'defaults:\n  run:\n    shell: sh\n'+updateWorkflow,settingsHudTest],
  ['defaults:\n  run:\n    shell: sh\n'+pages,updateWorkflow,settingsHudTest],
  [pages,updateWorkflow.replace('  admission_preflight:\n    if: inputs.diagnostic_only != true','  admission_preflight:\n    if: true'),settingsHudTest],
  [pages,updateWorkflow.replace("github.event.pull_request.draft == false","true"),settingsHudTest],
  [pages,updateWorkflow.replace('  validate_core:\n    needs: build_site\n    if:', '  validate_core:\n    needs: build_site\n    if: SUCCESS() ||'),settingsHudTest],
  [pages,updateWorkflow.replace('  validate_core:\n    needs: build_site\n    if:', '  validate_core:\n    needs: build_site\n    if: FAILURE() ||'),settingsHudTest],
  [pages,updateWorkflow.replace('  validate:\n','  validate:\n    defaults:\n      run:\n        shell: sh\n'),settingsHudTest],
  [pages.replace("        if: success() && steps.deployment.outcome == 'success'","        if: true || steps.deployment.outcome == 'success'"),updateWorkflow,settingsHudTest],
  [pages.replace('      - name: Upload INKWAVE site\n','      - name: Upload INKWAVE site\n        - continue-on-error: true\n'),updateWorkflow,settingsHudTest],
  [pages,updateWorkflow.replace('  validate_core:\n    needs: build_site\n    if:', '  validate_core:\n    needs: build_site\n    if: failure() ||'),settingsHudTest],
  [pages,updateWorkflow.replace('  validate_core:\n    needs: build_site\n    if:', '  validate_core:\n    needs: build_site\n    if: cancelled() ||'),settingsHudTest],
  [pages,updateWorkflow.replace('  validate_core:\n    needs: build_site\n    if:', '  validate_core:\n    needs: build_site\n    if: !success() ||'),settingsHudTest],
  [pages,updateWorkflow.replace('      - name: Require every source and patch regression to pass\n','      - name: Require every source and patch regression to pass\n        if: false\n'),settingsHudTest],
  [pages,updateWorkflow.replace('      - name: Require every source and patch regression to pass\n','      - name: Require every source and patch regression to pass\n        shell: sh\n'),settingsHudTest],
  [pages.replace('      - name: Upload INKWAVE site\n','      - name: Upload INKWAVE site\n        if: always()\n'),updateWorkflow,settingsHudTest],
  [pages.replace('      - name: Deploy to GitHub Pages\n','      - name: Deploy to GitHub Pages\n        continue-on-error: true\n'),updateWorkflow,settingsHudTest],
  [pages.replace('          path: _site','          path: _other'),updateWorkflow,settingsHudTest],
  [pages.replace('      - name: Build optimized site','      - name: Build optimized site\n      - name: Build optimized site'),updateWorkflow,settingsHudTest],
  [pages,updateWorkflow.replace('    needs: [admission_preflight, build_site, validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation]','    needs: [validate_core, patch_tests, circleci_offload_gate]'),settingsHudTest],
  [pages,updateWorkflow.replace('  build_site:\n    needs: admission_preflight','  build_site:\n    needs: admission_preflight\n    continue-on-error: true'),settingsHudTest],
  [pages,updateWorkflow.replace('  validate_core:\n    needs: build_site\n    if:', '  validate_core:\n    needs: build_site\n    if: always() ||'),settingsHudTest],
  [pages,updateWorkflow.replace('          test "$CORE_RESULT" = success','          true # weakened core'),settingsHudTest],
  [pages.replace(pagesBrowserSetup,''),updateWorkflow,settingsHudTest],
  [pages.replace('npm ci --no-audit --no-fund','npm install --no-audit --no-fund'),updateWorkflow,settingsHudTest],
  [pages.replace('--with-deps --no-shell chromium','--with-deps --no-shell webkit'),updateWorkflow,settingsHudTest],
  [pages.replace(pagesBrowserSetup,'').replace('      - name: Upload INKWAVE site',pagesBrowserSetup+'      - name: Upload INKWAVE site'),updateWorkflow,settingsHudTest],
  [pages,updateWorkflow.replace(coreBrowserSetup,''),settingsHudTest],
  [pages,updateWorkflow.replace(coreBrowserSetup,coreBrowserSetup.replace('--with-deps chromium','--with-deps chromium || true')),settingsHudTest],
  [pages,updateWorkflow.replace(coreBrowserSetup,'').replace('      - name: Verify migrated direct game source ownership',coreBrowserSetup+'      - name: Verify migrated direct game source ownership'),settingsHudTest],
  [pages,updateWorkflow,settingsHudTest.replace("if(!fs.existsSync(executablePath))throw new Error('Required settings HUD Chromium is not installed');",'')],
  [pages,updateWorkflow,settingsHudTest.replace('process.env.CI?chromium.executablePath():','')],
  [pages,updateWorkflow,settingsHudTest.replace('assert.ok(result.restored)','')]
 ];
 for(const args of mutations)assert.throws(()=>verifySettingsBrowserConsumers(...args));
});
test('CI missing browser fails and local missing browser keeps explicit skip without launching Chromium',()=>{
 const start=settingsHudTest.indexOf(' const executablePath='),end=settingsHudTest.indexOf(' const browser=await chromium.launch',start);
 assert.ok(start>=0&&end>start);
 const select=new Function('process','chromium','fs','t',settingsHudTest.slice(start,end)+'return executablePath;');
 const chromium={executablePath:()=>'/managed/chromium'},skips=[];
 const t={skip:message=>{skips.push(message);return 'skipped';}};
 assert.throws(()=>select({env:{CI:'true',CHROMIUM_EXECUTABLE:'/external/chromium'}},chromium,{existsSync:()=>false},t),/Required settings HUD Chromium/);
 assert.equal(skips.length,0);
 assert.equal(select({env:{CI:'true',CHROMIUM_EXECUTABLE:'/external/chromium'}},chromium,{existsSync:p=>p==='/managed/chromium'},t),'/managed/chromium');
 assert.equal(select({env:{}},chromium,{existsSync:()=>false},t),'skipped');
 assert.deepEqual(skips,['Chromium is not installed']);
 assert.equal(select({env:{CHROMIUM_EXECUTABLE:'/local/chromium'}},chromium,{existsSync:p=>p==='/local/chromium'},t),'/local/chromium');
});

test('Pages publication is main-only and lockfile pins its full toolchain',()=>{
 assert.match(pages,/deploy:\n    if: github.repository == 'rhgrive3\/actions' && github.ref == 'refs\/heads\/main'/);
 const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
 for(const name of ['esbuild','playwright','ws','vite'])assert.equal(lock.packages['node_modules/'+name].version,pkg.devDependencies[name]);
 assert.equal(pkg.devDependencies.playwright,'1.62.1');
});

test('ranked QA provisions full Chromium used by the runner without unused headless shell',()=>{
 assert.match(ranked,/playwright install --with-deps --no-shell chromium/);
 assert.match(runner,/launchOptions.channel='chromium'/);
 for(const name of readdirSync(new URL('../../patches/splatoon3/tests',import.meta.url)).filter(n=>/^ranked-.*\.test\.mjs$/.test(n)))assert.doesNotMatch(read('patches/splatoon3/tests/'+name),/from ['"]playwright|import\(['"]playwright/);
});
