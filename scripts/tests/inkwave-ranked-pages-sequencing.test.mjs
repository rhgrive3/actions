import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
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
const coreBrowserSetup="      - name: Install pinned source regression and build tool\n        run: |\n          npm install --no-save --no-package-lock --silent esbuild@0.28.2 playwright@1.62.1\n          # Hosted Azure apt mirror fetched fonts at 45 kB/s (7m43s, run 40487962033).\n          # Rewrite only the stalled mirror before Playwright's unchanged dependency installation.\n          sudo python3 scripts/prepare-inkwave-ci-apt.py\n          npx --no-install playwright install --with-deps chromium\n";
function verifySettingsBrowserConsumers(p,u,s){
 const build=p.slice(p.indexOf('      - name: Build optimized site'),p.indexOf('      - name: Upload INKWAVE site'));
 const core=u.slice(u.indexOf('  validate_core:'),u.indexOf('  patch_tests:'));
 const shards=u.slice(u.indexOf('  patch_tests:'),u.indexOf('\n  # Required /validate'));
 assert.equal(build.split(pagesBrowserSetup).length,2,'Pages installs exact dependencies and managed Chromium once');
 assert.equal(core.split(coreBrowserSetup).length,2,'core installs exact dependencies and managed Chromium once');
 assert.ok(build.indexOf(pagesBrowserSetup)<build.indexOf('node --experimental-vm-modules --test patches/local-quality/tests/*.test.mjs'));
 assert.ok(core.indexOf(coreBrowserSetup)<core.indexOf('      - name: Run requested focused source regressions'));
 assert.ok(core.indexOf(coreBrowserSetup)<core.indexOf('node scripts/ci/run-inkwave-test-suite.mjs source-browser'));
 // Tarball cache keys may identify all tools; CPU shard executable steps may not provision browsers.
 assert.doesNotMatch(shards.replace(/^          key: .*\n/gm,''),/playwright|chromium/);
 const acceptance=u.slice(u.indexOf('  validate:\n'),u.indexOf('  browser:\n'));
 assert.ok(acceptance.includes('    needs: [admission_preflight, build_site, validate_core, patch_tests, circleci_offload_gate, browser, seven_claims, resource_paint_continuation]'));
 for(const gate of ['PREFLIGHT_RESULT','BUILD_RESULT','CORE_RESULT','PATCH_RESULT','SEVEN_RESULT','RESOURCE_RESULT','BROWSER_RESULT'])
   assert.ok(acceptance.includes('test "$'+gate+'" = success'),gate+' cannot be omitted from full acceptance');
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
