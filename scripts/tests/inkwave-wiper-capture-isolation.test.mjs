import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseBrowserLane, SUITES} from '../ci/run-circleci-browser-lane.mjs';

const workflow=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
const suiteRegistry=JSON.parse(fs.readFileSync(new URL('../ci/inkwave-test-suites.json',import.meta.url),'utf8'));
const title='Capture all current-head Wiper charged and tap native views';
const guard="${{ !cancelled() && matrix.suite == 'catalog' && steps.verified-site.outcome == 'success' && steps.browser-prepare.outcome == 'success' }}";
function step(name,source=workflow){
 const browser=source.slice(source.indexOf('  browser:\n'));
 const start=browser.indexOf('      - name: '+name+'\n');assert.notEqual(start,-1,name);
 const end=browser.indexOf('\n      - ',start+1);
 return browser.slice(start,end<0?undefined:end);
}
function ifLine(s){return /^        if: (.+)$/m.exec(s)?.[1];}

test('Wiper isolation uses the explicit Actions expression and refuses canceled or unready shards',()=>{
 const capture=step(title);assert.equal(ifLine(capture),guard);
 // Model precisely the extracted expression. An earlier unrelated failure is
 // not an input; !cancelled() overrides Actions' implicit success() check.
 const expression=guard.slice(4,-3).replace('cancelled()','cancelled').replace('steps.verified-site',"steps['verified-site']").replace('steps.browser-prepare',"steps['browser-prepare']");
 const evaluate=Function('cancelled','matrix','steps','return ('+expression+')');
 for(const prior of ['success','failure'])for(const cancelled of [false,true])for(const suite of ['catalog','active'])for(const site of ['success','failure','skipped'])for(const browser of ['success','failure','skipped']){
  const actual=evaluate(cancelled,{suite},{'verified-site':{outcome:site},'browser-prepare':{outcome:browser}});
  assert.equal(actual,!cancelled&&suite==='catalog'&&site==='success'&&browser==='success',JSON.stringify({prior,cancelled,suite,site,browser}));
 }
 assert.doesNotMatch(capture,/continue-on-error:/);
 assert.match(capture,/node --experimental-vm-modules --test scripts\/tests\/inkwave-wiper-native-acceptance\.test\.mjs/);
 assert.match(capture,/timeout 30m node scripts\/check-inkwave-wiper-native-acceptance\.mjs/);
 assert.match(capture,/node scripts\/check-inkwave-wiper-native-receipt\.mjs/);
});

test('unrelated capture and required receipts keep their normal failure semantics',()=>{
 const hissen=step('Observe native Hissen main draws at first-birth-relative phases');
 assert.equal(ifLine(hissen),"matrix.suite == 'catalog'");assert.doesNotMatch(hissen,/cancelled\(\)|continue-on-error/);
 const binding=step('Bind passing browser evidence to the tested commit');
 assert.equal(ifLine(binding),undefined);assert.doesNotMatch(binding,/continue-on-error:/);
 assert.match(binding,/wiper-native\/wiper-native-result\.json/);
 assert.match(binding,/reports\['wiper-native\/wiper-native-result\.json'\]\['sourceSha'\].*os\.environ\['SOURCE_SHA'\]/);
 const evidence=step('Package bounded browser failure evidence');
 assert.equal(ifLine(evidence),'always() && (failure() || cancelled())');
 const gate=workflow.slice(workflow.indexOf('  validate:\n'),workflow.indexOf('  browser:\n'));
 assert.match(gate,/if: \$\{\{ always\(\) && inputs\.diagnostic_only != true \}\}/);
 assert.doesNotMatch(gate,/!cancelled\(\)|continue-on-error/);
 assert.match(gate,/test "\$CORE_RESULT" = success/);assert.match(gate,/test "\$PATCH_RESULT" = success/);assert.match(gate,/test "\$CIRCLECI_RESULT" = success/);
});

test('CircleCI accepts only the exact audited Wiper guard and prerequisite ownership',()=>{
 for(const suite of SUITES){
  const captures=parseBrowserLane(workflow,suite).commands.filter(s=>s.name===title);
  assert.equal(captures.length,suite==='catalog'?1:0);
 }
 const wiper=step(title);const site=step('Verify immutable site for this browser shard');
 const mutants=[
  workflow.replace(guard,guard.replace('!cancelled()','always()')),
  workflow.replace(guard,"matrix.suite == 'catalog'"),
  workflow.replace(guard,guard.replace(" && steps.verified-site.outcome == 'success'",'')),
  workflow.replace(guard,guard.replace(" && steps.browser-prepare.outcome == 'success'",'')),
  workflow.replace(title,'Different capture title'),
  workflow.replace(wiper,wiper+'\n'+wiper),
  workflow.replace('        id: verified-site\n',''),
  workflow.replace('        id: browser-prepare\n','        id: verified-site\n'),
  workflow.replace(site+'\n','').replace(wiper,wiper+'\n'+site),
  workflow.replace(wiper,wiper.replace('        run: |','        continue-on-error: true\n        run: |')),
  workflow.replace(wiper,wiper.replace('        run: |','        if: success()\n        run: |')),
 ];
 for(const mutant of mutants){assert.notEqual(mutant,workflow);assert.throws(()=>parseBrowserLane(mutant,'catalog'));}
});

test('isolation regression is mandatory in the default Validate verifier',()=>{
 const file='scripts/tests/inkwave-wiper-capture-isolation.test.mjs';
 const steps=suiteRegistry.verifier.steps;
 assert.equal(steps.flatMap(s=>s.args).filter(s=>s===file).length,1);
 const owner=steps.find(s=>s.args.includes(file));assert.equal(owner.program,'node');assert.ok(owner.args.includes('--test'));
 const core=workflow.slice(workflow.indexOf('  validate_core:\n'),workflow.indexOf('  patch_tests:\n'));
 assert.match(core,/      - name: Verify motion verifier regressions\n        run: node scripts\/ci\/run-inkwave-test-suite\.mjs verifier\n/);
 const verifierStep=core.split('      - name: Verify motion verifier regressions\n')[1].split('\n      - ')[0];
 assert.doesNotMatch(verifierStep,/continue-on-error:|if:/);
 assert.match(core,/^    if: inputs\.diagnostic_only != true$/m);
});

test('a diagnostic Wiper capture cannot turn a failed catalog job green',()=>{
 // Model Actions' default success() for the subsequent binding step: a
 // successful diagnostic step does not erase a previous failing conclusion.
 const capture=step(title),binding=step('Bind passing browser evidence to the tested commit');
 assert.equal(ifLine(capture),guard);assert.equal(ifLine(binding),undefined);
 const job=workflow.slice(workflow.indexOf('  browser:\n')).split(/\n  [A-Za-z][A-Za-z0-9_-]*:\n/)[0];
 assert.doesNotMatch(job,/^ {4}(?:    )?continue-on-error:/m);
 assert.doesNotMatch(capture,/continue-on-error:/);
 for(const [earlier,captureResult,expectedJob,binds]of [
  ['failure','success','failure',false],['failure','failure','failure',false],
  ['success','failure','failure',false],['success','success','success',true],
 ]){
  const job=(earlier==='failure'||captureResult==='failure')?'failure':'success';
  assert.equal(job,expectedJob);assert.equal(job==='success',binds);
 }
});

test('CircleCI keeps its pre-existing fail-fast execution and failed receipt',()=>{
 const runner=fs.readFileSync(new URL('../ci/run-circleci-browser-lane.mjs',import.meta.url),'utf8');
 const execution=runner.slice(runner.indexOf('  for (const step of commands) {'),runner.indexOf('  const native = JSON.parse',runner.indexOf('  for (const step of commands) {')));
 assert.match(execution,/if \(x\.status !== 0\)/);
 assert.match(execution,/record\.status = 'failed'/);
 assert.match(execution,/record\.failedStep = step\.name/);
 assert.match(execution,/recordWrite\(\);\s*throw Error\('Native browser lane failed:/);
 assert.doesNotMatch(execution,/continue-on-error|continue;/);
});
