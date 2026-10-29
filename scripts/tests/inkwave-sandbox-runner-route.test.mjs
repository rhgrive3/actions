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
test('catalog runs on supported sandbox-capable Ubuntu and other shards stay unchanged',()=>{
 assert.equal(runner,"\x24{{ matrix.suite == 'catalog' && 'ubuntu-22.04' || 'ubuntu-latest' }}");
 const resolve=suite=>{const match=runner.match(/^\$\{\{ matrix\.suite == 'catalog' && '(ubuntu-[\d.]+)' \|\| '(ubuntu-latest)' \}\}$/);assert(match);return suite==='catalog'?match[1]:match[2];};
 assert.equal(resolve('catalog'),'ubuntu-22.04');
 for(const suite of ['active','ui','responsive','network','range','startup'])assert.equal(resolve(suite),'ubuntu-latest');
 for(const name of ['active','catalog','ui','responsive','network','range','startup'])assert.match(workflow,new RegExp('suite: '+name));
 assert.match(workflow,/npx playwright install --with-deps \$\{\{ matrix\.browsers \}\}/);
});
test('sandbox runner route rejects bypass, accidental widening and incorrect shell',()=>{
 for(const wrong of [
  runner.replace("'ubuntu-22.04'","'ubuntu-latest'"),
  runner.replace("matrix.suite == 'catalog'","matrix.suite != 'catalog'"),
  runner.replace("'ubuntu-latest'","'ubuntu-22.04'"),
  runner.replace("'ubuntu-22.04'","'ubuntu-slim'"),
 ])assert.notEqual(wrong,runner);
 assert.doesNotMatch(workflow.slice(workflow.indexOf('\n  browser:')),/--no-sandbox.*wiper/);
});
