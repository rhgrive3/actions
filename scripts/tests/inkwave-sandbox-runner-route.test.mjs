import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
function browserRunner(text){
 const start=text.indexOf('\n  browser:'),end=text.indexOf('\n  ',start+4);
 assert(start>=0,'Browser matrix job required');
 const browser=text.slice(start);
 const match=/^    runs-on: (.+)$/m.exec(browser);
 assert(match,'Browser job must select runner');
 return match[1];
}
const runner=browserRunner(workflow);
test('active and catalog sandbox consumers use supported Ubuntu and other shards stay unchanged',()=>{
 assert.equal(runner,"\x24{{ (matrix.suite == 'active' || matrix.suite == 'catalog') && 'ubuntu-22.04' || 'ubuntu-latest' }}");
 const resolve=suite=>{const match=runner.match(/^\$\{\{ \(matrix\.suite == 'active' \|\| matrix\.suite == 'catalog'\) && '(ubuntu-[\d.]+)' \|\| '(ubuntu-latest)' \}\}$/);assert(match);return ['active','catalog'].includes(suite)?match[1]:match[2];};
 for(const suite of ['active','catalog'])assert.equal(resolve(suite),'ubuntu-22.04');
 for(const suite of ['ui','responsive','network','range','startup'])assert.equal(resolve(suite),'ubuntu-latest');
 for(const name of ['active','catalog','ui','responsive','network','range','startup'])assert.match(workflow,new RegExp('suite: '+name));
 assert.match(workflow,/npx playwright install --with-deps \$\{\{ matrix\.browsers \}\}/);
});
test('sandbox runner route rejects bypass, accidental widening and incorrect shell',()=>{
 for(const wrong of [
  runner.replace("'ubuntu-22.04'","'ubuntu-latest'"),
  runner.replace("matrix.suite == 'catalog'","matrix.suite != 'catalog'"),
  runner.replace("matrix.suite == 'active'","matrix.suite == 'ui'"),
  runner.replace("'ubuntu-latest'","'ubuntu-22.04'"),
  runner.replace("'ubuntu-22.04'","'ubuntu-slim'"),
 ])assert.notEqual(wrong,runner);
 assert.doesNotMatch(workflow.slice(workflow.indexOf('\n  browser:')),/--no-sandbox.*wiper/);
});

test('composed CPU recorder keeps its real sandbox, supported runner and original trace scope',()=>{
 const cpu=readFileSync(new URL('../../.github/workflows/inkwave-composed-cpu.yml',import.meta.url),'utf8');
 const job=cpu.slice(cpu.indexOf('\n  source-and-emitted:'));
 assert.match(job,/^    runs-on: ubuntu-22\.04$/m);
 assert.match(job,/node scripts\/benchmark-inkwave-composed-cpu\.mjs --site _site --source-sha "\$SOURCE_SHA" --frames 30 --stages range --quality low --evidence-dir \.cpu-ci/);
 const helper=readFileSync(new URL('../lib/inkwave-sandbox-browser.mjs',import.meta.url),'utf8');
 assert.match(helper,/chromiumSandbox: true/);
 assert.doesNotMatch(helper,/chromiumSandbox: false|--no-sandbox/);
 const recorder=readFileSync(new URL('../benchmark-inkwave-composed-cpu.mjs',import.meta.url),'utf8');
 assert.match(recorder,/await launchSandboxBrowser\(chromium/);
});

test('all other real sandbox entry points stay in their supported active or catalog lane',()=>{
 const browser=workflow.slice(workflow.indexOf('\n  browser:')).split('\n  resource_paint_continuation:')[0];
 for(const [script,suite]of [['check-inkwave-post-depth-browser.mjs','active'],['check-inkwave-offscreen-hair-reentry.mjs','active'],['check-inkwave-wiper-native-acceptance.mjs','catalog']]){
  const source=readFileSync(new URL('../'+script,import.meta.url),'utf8');
  assert.match(source,/await launchSandboxBrowser\(chromium/);
  const owners=browser.split(/^      - /m).filter(step=>step.includes('node scripts/'+script));
  assert.ok(owners.length,script+' has a real workflow owner');
  for(const owner of owners)assert.ok(owner.includes("matrix.suite == '"+suite+"'"),script+' stays in '+suite);
 }
});

test('browser executable caches separate Linux distribution releases without falling back to foreign ABIs',()=>{
 function inspect(text){
  const browser=text.slice(text.indexOf('\n  browser:'));
  const platform=browser.split(/^      - /m).find(step=>step.includes('id: verified-site'));
  assert.ok(platform,'Actual browser platform probe required');
  assert.match(platform,/\. \/etc\/os-release/);
  for(const name of ['ID','VERSION_ID'])assert.ok(platform.includes('test -n "$'+name+'"'),'Missing platform value must fail closed');
  assert.ok(platform.includes("printf 'release=%s-%s\\n' \"$ID\" \"$VERSION_ID\" >> \"$GITHUB_OUTPUT\""));
  const cache=browser.split(/^      - /m).find(step=>step.startsWith('name: Cache pinned browser executables\n'));
  assert.ok(cache);assert.match(cache,/path: \$\{\{ env\.PLAYWRIGHT_BROWSERS_PATH \}\}/);
  assert.doesNotMatch(cache,/restore-keys:/,'No fallback may restore a different Linux ABI');
  const key=/^          key: (.+)$/m.exec(cache)?.[1];assert.ok(key);
  for(const token of ['runner.os','runner.arch','steps.verified-site.outputs.release','matrix.browsers',"hashFiles('node_modules/playwright-core/browsers.json')"])assert.ok(key.includes('${{ '+token+' }}'),'Cache identity must retain '+token);
  assert.ok(key.includes('playwright-1.62.1-'));
  const resolve=release=>key.replace(/\$\{\{ ([^}]+) \}\}/g,(_,name)=>({'runner.os':'Linux','runner.arch':'X64','steps.verified-site.outputs.release':release,'matrix.browsers':'chromium webkit',"hashFiles('node_modules/playwright-core/browsers.json')":'same-browser-revision'}[name]));
  const keys=['ubuntu-22.04','ubuntu-24.04','ubuntu-26.04','debian-12'].map(resolve);
  assert.equal(new Set(keys).size,keys.length,'Same revision directory can contain incompatible distribution builds');
 }
 inspect(workflow);
 for(const changed of [
  workflow.replace('${{ steps.verified-site.outputs.release }}-',''),
  workflow.replace('          . /etc/os-release\n',''),
  workflow.replace('          test -n "$VERSION_ID"\n',''),
  workflow.replace('      - name: Cache pinned browser executables\n','      - name: Cache pinned browser executables\n        restore-keys: Linux-X64-playwright\n'),
 ])assert.throws(()=>inspect(changed));
});
