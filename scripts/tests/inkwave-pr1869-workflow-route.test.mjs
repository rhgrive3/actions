import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-projectile-visuals.yml',import.meta.url),'utf8');
const EDITS=[["      - name: Check out immutable base for the explicitly aligned reference\n        if: ${{ matrix.side == 'before' }}","      - name: Check out immutable base for the explicitly aligned reference\n        if: ${{ matrix.side == 'before' || (github.event_name == 'pull_request' && (github.event.pull_request.number == 1869 || github.head_ref == 'fix/inkwave-ci-composed-regressions-20261024')) }}"],["      - name: Verify immutable baseline checkout before any alignment\n        if: ${{ matrix.side == 'before' }}","      - name: Verify immutable baseline checkout before any alignment\n        if: ${{ matrix.side == 'before' || (github.event_name == 'pull_request' && (github.event.pull_request.number == 1869 || github.head_ref == 'fix/inkwave-ci-composed-regressions-20261024')) }}"],["      - 'scripts/verify-inkwave-projectile-current-pair.mjs'\n","      - 'scripts/verify-inkwave-projectile-current-pair.mjs'\n      - 'scripts/verify-inkwave-pr1869-current-pair.mjs'\n      - 'scripts/lib/inkwave-pr1869-current-pair.mjs'\n      - 'scripts/tests/inkwave-pr1869-current-pair.test.mjs'\n      - 'scripts/tests/inkwave-pr1869-workflow-route.test.mjs'\n"],["      - name: Verify fail-closed immutable workflow routes\n        if: ${{ matrix.side == 'after' }}\n        run: node --test --test-concurrency=1 scripts/tests/inkwave-exact-head-workflow-routes.test.mjs scripts/tests/inkwave-main26a4-production-epoch.test.mjs scripts/tests/inkwave-runtime-ui-production-epoch.test.mjs scripts/tests/inkwave-projectile-current-pair.test.mjs scripts/tests/inkwave-main3003-firing-pair.test.mjs scripts/tests/inkwave-main3003-respawn-pair.test.mjs","      - name: Verify fail-closed immutable workflow routes\n        if: ${{ matrix.side == 'after' }}\n        run: node --test --test-concurrency=1 scripts/tests/inkwave-exact-head-workflow-routes.test.mjs scripts/tests/inkwave-main26a4-production-epoch.test.mjs scripts/tests/inkwave-runtime-ui-production-epoch.test.mjs scripts/tests/inkwave-projectile-current-pair.test.mjs scripts/tests/inkwave-main3003-firing-pair.test.mjs scripts/tests/inkwave-main3003-respawn-pair.test.mjs scripts/tests/inkwave-pr1869-current-pair.test.mjs scripts/tests/inkwave-pr1869-workflow-route.test.mjs"],["      - name: Preserve the two reviewed October 23 production pairs without historical replay\n","      - name: Admit PR1869 immutable source pair without replay\n        id: pr1869_current_pair\n        if: ${{ github.event_name == 'pull_request' && (github.event.pull_request.number == 1869 || github.head_ref == 'fix/inkwave-ci-composed-regressions-20261024') }}\n        shell: bash\n        run: |\n          set -euo pipefail\n          git cat-file -e '890e0ef8ab32238624b6ffff8069e2c9e3515dd6^{commit}' || git fetch --no-tags --depth=1 --filter=blob:none origin 890e0ef8ab32238624b6ffff8069e2c9e3515dd6\n          node scripts/verify-inkwave-pr1869-current-pair.mjs --phase source --baseline \"$INKWAVE_REFERENCE_ROOT\" --candidate . --event \"$GITHUB_EVENT_PATH\" --receipt \"$RUNNER_TEMP/inkwave-pr1869-${{ matrix.side }}/source.json\"\n          printf 'admitted=true\\n' >> \"$GITHUB_OUTPUT\"\n      - name: Preserve the two reviewed October 23 production pairs without historical replay\n"],["      - name: Verify isolated reference inputs, distinct build identity and emitted BGM regressions\n","      - name: Bind PR1869 immutable source receipt to actual side build\n        if: ${{ github.event_name == 'pull_request' && (github.event.pull_request.number == 1869 || github.head_ref == 'fix/inkwave-ci-composed-regressions-20261024') }}\n        shell: bash\n        env:\n          PAIR_SIDE: ${{ matrix.side }}\n        run: |\n          set -euo pipefail\n          case \"$PAIR_SIDE\" in\n            before) site=.built-site/baseline ;;\n            after) site=.built-site/projectiles ;;\n            *) echo 'Invalid PR1869 capture side' >&2; exit 1 ;;\n          esac\n          node scripts/verify-inkwave-pr1869-current-pair.mjs --phase build --baseline \"$INKWAVE_REFERENCE_ROOT\" --candidate . --event \"$GITHUB_EVENT_PATH\" --source-receipt \"$RUNNER_TEMP/inkwave-pr1869-${{ matrix.side }}/source.json\" --side \"$PAIR_SIDE\" --site \"$site\" --receipt \"$RUNNER_TEMP/inkwave-pr1869-${{ matrix.side }}/build.json\"\n      - name: Verify isolated reference inputs, distinct build identity and emitted BGM regressions\n"],["\n  compare:\n","      - name: Preserve PR1869 source and build admission receipts\n        if: ${{ always() && github.event_name == 'pull_request' && (github.event.pull_request.number == 1869 || github.head_ref == 'fix/inkwave-ci-composed-regressions-20261024') }}\n        uses: actions/upload-artifact@v4\n        with:\n          name: projectile-pr1869-receipts-${{ matrix.side }}-${{ github.event.pull_request.head.sha || github.sha }}\n          path: ${{ runner.temp }}/inkwave-pr1869-${{ matrix.side }}/\n          if-no-files-found: error\n          retention-days: 14\n          compression-level: 0\n\n  compare:\n"]];
const ORIGINAL_SHA256='d263fe9da3dc7884588c208db376ca31008bf66acebfdfabbac3897135369844';
const sha=value=>createHash('sha256').update(value).digest('hex');
const sourceName='Admit PR1869 immutable source pair without replay';
const buildName='Bind PR1869 immutable source receipt to actual side build';
const uploadBlock="      - name: Preserve PR1869 source and build admission receipts\n        if: ${{ always() && github.event_name == 'pull_request' && (github.event.pull_request.number == 1869 || github.head_ref == 'fix/inkwave-ci-composed-regressions-20261024') }}\n        uses: actions/upload-artifact@v4\n        with:\n          name: projectile-pr1869-receipts-${{ matrix.side }}-${{ github.event.pull_request.head.sha || github.sha }}\n          path: ${{ runner.temp }}/inkwave-pr1869-${{ matrix.side }}/\n          if-no-files-found: error\n          retention-days: 14\n          compression-level: 0\n";
function step(text,name){
 const marker='      - name: '+name+'\n';assert.equal(text.split(marker).length,2,'unique named step '+name);
 const start=text.indexOf(marker),next=text.indexOf('\n      - ',start+marker.length);
 return text.slice(start,next<0?text.length:next+1);
}
function verifyWorkflow(text){
 let original=text;
 for(const [before,after]of [...EDITS].reverse()){
  assert.equal(original.split(after).length,2,'exact singular reviewed route edit');
  original=original.replace(after,before);
 }
 assert.equal(sha(original),ORIGINAL_SHA256,'all original workflow bytes and historical commands retained');
 const at=name=>{step(text,name);return text.indexOf('      - name: '+name+'\n');};
 for(const name of ['Replay reviewed Roller births, pool reset and pinned paint in the main reference','Align only the reviewed character pose for exact projectile comparison'])assert(at(sourceName)<at(name));
 for(const name of ['Build selected reference with explicit alignment provenance','Build complete candidate production composition'])assert(at(name)<at(buildName));
 for(const name of ['Capture native reference, not necessarily untouched public main','Capture candidate native game including desktop and mobile workloads'])assert(at(buildName)<at(name));
 assert(at(sourceName)<at(buildName));return true;
}
test('PR1869 wiring retains every original workflow byte and native capture/comparison command',()=>verifyWorkflow(workflow));
test('source, replay, build, identity, receipt and native capture mutations fail closed',()=>{
 const edits=[
  ['fix/inkwave-ci-composed-regressions-20261024','fix/unreviewed'],
  ['--phase source','--phase build'],
  [' --event "$GITHUB_EVENT_PATH" --receipt "$RUNNER_TEMP/inkwave-pr1869-',' --receipt "$RUNNER_TEMP/inkwave-pr1869-'],
  ["printf 'admitted=true\\n'","printf 'admitted=false\\n'"],
  ["github.head_ref == 'fix/roller-vertical-recovery-20261023'","github.head_ref == 'unreviewed-roller'"],
  [' --source-receipt "$RUNNER_TEMP/inkwave-pr1869-',' --removed-source-receipt "$RUNNER_TEMP/inkwave-pr1869-'],
  [' --site "$site"',''],
  ["git cat-file -e '890e0ef8ab32238624b6ffff8069e2c9e3515dd6^{commit}'","git cat-file -e '"+'1'.repeat(40)+"^{commit}'"],
  [' || git fetch --no-tags',' || true # git fetch --no-tags'],
  [uploadBlock,''],[' --mode baseline',' --mode candidate'],[' --require-complete',''],
 ];
 for(const [before,after]of edits){const changed=workflow.replace(before,after);assert.notEqual(changed,workflow,before);assert.throws(()=>verifyWorkflow(changed));}
});
function shellBody(name,side){
 const text=step(workflow,name),marker='        run: |\n';assert.equal(text.split(marker).length,2);
 return text.slice(text.indexOf(marker)+marker.length).split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n').replaceAll('${{ matrix.side }}',side);
}
function runShell(name,{side='before',nodeStatus=0,gitStatus=0,fetchStatus=gitStatus}={}){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'iw-pr1869-wiring-'))),bin=path.join(root,'bin');fs.mkdirSync(bin);
 const argsFile=path.join(root,'args'),gitFile=path.join(root,'git'),output=path.join(root,'output'),runner=path.join(root,'runner');
 fs.mkdirSync(runner);
 fs.writeFileSync(path.join(bin,'node'),'#!/bin/bash\nprintf "%s\\n" "$@" > "$ARGS_FILE"\nexit "$NODE_STATUS"\n',{mode:0o755});
 fs.writeFileSync(path.join(bin,'git'),'#!/bin/bash\nprintf "%s\\n" "$*" >> "$GIT_FILE"\nif [ "$1" = fetch ]; then exit "$GIT_FETCH_STATUS"; fi\nexit "$GIT_STATUS"\n',{mode:0o755});
 const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,ARGS_FILE:argsFile,GIT_FILE:gitFile,GITHUB_OUTPUT:output,RUNNER_TEMP:runner,INKWAVE_REFERENCE_ROOT:path.join(root,'base'),GITHUB_EVENT_PATH:path.join(root,'event.json'),PAIR_SIDE:side,NODE_STATUS:String(nodeStatus),GIT_STATUS:String(gitStatus),GIT_FETCH_STATUS:String(fetchStatus)};
 try{
  const result=spawnSync('bash',['--noprofile','--norc','-c',shellBody(name,side)],{env,encoding:'utf8'});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);
  return{status:result.status,stderr:result.stderr,args:fs.existsSync(argsFile)?fs.readFileSync(argsFile,'utf8').trimEnd().split('\n'):[],output:fs.existsSync(output)?fs.readFileSync(output,'utf8'):'',gitCalls:fs.existsSync(gitFile)?fs.readFileSync(gitFile,'utf8').trimEnd().split('\n'):[],root,runner};
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('actual source shell admits only after successful object and verifier commands',()=>{
 const good=runShell(sourceName);assert.equal(good.status,0);assert.equal(good.output,'admitted=true\n');
 assert.deepEqual(good.args,['scripts/verify-inkwave-pr1869-current-pair.mjs','--phase','source','--baseline',path.join(good.root,'base'),'--candidate','.','--event',path.join(good.root,'event.json'),'--receipt',path.join(good.runner,'inkwave-pr1869-before/source.json')]);
 assert.equal(good.gitCalls.length,1);
 const recovered=runShell(sourceName,{gitStatus:19,fetchStatus:0});assert.equal(recovered.status,0);assert.equal(recovered.output,'admitted=true\n');assert.equal(recovered.gitCalls.length,2);assert.equal(recovered.gitCalls[1],'fetch --no-tags --depth=1 --filter=blob:none origin 890e0ef8ab32238624b6ffff8069e2c9e3515dd6');assert.ok(recovered.args.length>0);
 const failedFetch=runShell(sourceName,{gitStatus:19,fetchStatus:23});assert.equal(failedFetch.status,23);assert.equal(failedFetch.output,'');assert.equal(failedFetch.args.length,0);
 const bad=runShell(sourceName,{nodeStatus:17});assert.equal(bad.status,17);assert.equal(bad.output,'');
 const object=runShell(sourceName,{gitStatus:19});assert.equal(object.status,19);assert.equal(object.output,'');assert.equal(object.args.length,0);assert.equal(object.gitCalls.length,2);
});
test('actual build shell binds each side and propagates failures before native capture',()=>{
 for(const side of ['before','after']){
  const result=runShell(buildName,{side});assert.equal(result.status,0);
  assert.deepEqual(result.args,['scripts/verify-inkwave-pr1869-current-pair.mjs','--phase','build','--baseline',path.join(result.root,'base'),'--candidate','.','--event',path.join(result.root,'event.json'),'--source-receipt',path.join(result.runner,'inkwave-pr1869-'+side+'/source.json'),'--side',side,'--site',side==='before'?'.built-site/baseline':'.built-site/projectiles','--receipt',path.join(result.runner,'inkwave-pr1869-'+side+'/build.json')]);
  assert.equal(runShell(buildName,{side,nodeStatus:17}).status,17);
 }
 const invalid=runShell(buildName,{side:'unreviewed'});assert.notEqual(invalid.status,0);assert.equal(invalid.args.length,0);assert.match(invalid.stderr,/Invalid PR1869 capture side/);
});


test('both PR1869 lanes authenticate the baseline and unrelated owners keep their existing routes',()=>{
 const baselineNames=['Check out immutable base for the explicitly aligned reference','Verify immutable baseline checkout before any alignment'];
 const active=(name,side,number,branch,event='pull_request')=>{
  const body=step(workflow,name),expression=body.match(/^        if: \$\{\{ (.+) \}\}$/m)?.[1];assert(expression);
  const github={event_name:event,event:{pull_request:{number}},head_ref:branch};
  return Function('github','matrix',`return Boolean(${expression});`)(github,{side});
 };
 for(const side of ['before','after'])for(const name of [...baselineNames,sourceName,buildName]){
  assert.equal(active(name,side,1869,'fix/inkwave-ci-composed-regressions-20261024'),true);
  // Mixed identities must reach the fail-closed verifier, never silently evade it.
  assert.equal(active(name,side,1869,'foreign-branch'),true);
  assert.equal(active(name,side,1870,'fix/inkwave-ci-composed-regressions-20261024'),true);
 }
 for(const name of [sourceName,buildName]){
  assert.equal(active(name,'after',1856,'fix/roller-vertical-recovery-20261023'),false);
  assert.equal(active(name,'after',1869,'fix/inkwave-ci-composed-regressions-20261024','workflow_dispatch'),false);
 }
 const universal=step(workflow,'Verify fail-closed immutable workflow routes');
 const tests=[...universal.matchAll(/scripts\/tests\/[^ ]+\.test\.mjs/g)].map(match=>match[0]);
 assert.deepEqual(tests,['inkwave-exact-head-workflow-routes','inkwave-main26a4-production-epoch','inkwave-runtime-ui-production-epoch','inkwave-projectile-current-pair','inkwave-main3003-firing-pair','inkwave-main3003-respawn-pair','inkwave-pr1869-current-pair','inkwave-pr1869-workflow-route'].map(name=>'scripts/tests/'+name+'.test.mjs'));
 assert.equal(workflow.includes('historical-delta-sources.json.gz.part'),false);
 for(const name of ['inkwave-reviewed-special-delta-admission','inkwave-roller-pr1856-projectile-pair','inkwave-respawn1862-production-pair'])assert.equal(universal.includes(name),false);
});
