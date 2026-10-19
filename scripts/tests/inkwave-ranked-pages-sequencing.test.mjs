import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
 assert.match(pages,/group: "pages-inkwave"\n  cancel-in-progress: true/);
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
