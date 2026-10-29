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
