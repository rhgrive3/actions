import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url);
const workflow=readFileSync(file,'utf8');
const guard='node --test scripts/tests/inkwave-network-diagnostic-workflow.test.mjs';
const helper='scripts/tests/inkwave-opening-peer-diagnostic.test.mjs';
const job=(text,name)=>{
 const marker=`  ${name}:\n`,i=text.indexOf(marker,text.indexOf('\njobs:\n'));
 assert.ok(i>=0,`missing job ${name}`);
 const tail=text.slice(i+marker.length),end=tail.search(/^  [\w-]+:\n/m);
 return end<0?tail:tail.slice(0,end);
};
const condition=(text,name)=>job(text,name).match(/^    if: (.+)$/m)?.[1];
function verify(text){
 assert.match(text,/      network_opening_diagnostic:\n        description: [^\n]+\n        type: boolean\n        default: false\n/);
 assert.equal(condition(text,'network-opening-diagnostic'),"github.event_name == 'workflow_dispatch' && inputs.diagnostic_only == true && inputs.network_opening_diagnostic == true");
 assert.equal(condition(text,'render-diagnostic'),'inputs.diagnostic_only == true && inputs.network_opening_diagnostic != true');
 for(const name of ['validate_core','patch_tests','browser','seven_claims','resource_paint_continuation'])assert.equal(condition(text,name),'inputs.diagnostic_only != true',name);
 assert.equal(condition(text,'validate'),'${{ always() && inputs.diagnostic_only != true }}');
 assert.match(text,/^  group: validate-inkwave-\$\{\{ github.event.pull_request.number \|\| inputs.source_sha \|\| github.ref \}\}\$\{\{ inputs.diagnostic_only == true && inputs.network_opening_diagnostic == true && '-network-opening-diagnostic' \|\| '' \}\}$/m);
 assert.match(text,/^  cancel-in-progress: \$\{\{ !\(inputs.diagnostic_only == true && inputs.network_opening_diagnostic == true\) \}\}$/m);
 const native=job(text,'network-opening-diagnostic');
 assert.match(native,/WORKFLOW_SHA: \$\{\{ github.workflow_sha \}\}/);
 assert.match(native,/\[\[ "\$SOURCE_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
 assert.ok(native.includes('test "$WORKFLOW_SHA" = "$SOURCE_SHA"'));
 assert.ok(native.includes('test "$(git rev-parse HEAD)" = "$SOURCE_SHA"'));
 assert.ok(native.includes('test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"'));
 assert.ok(native.includes('node scripts/build-inkwave.mjs inkwave-public .built-site/_site'));
 assert.ok(native.includes('node scripts/check-inkwave-combat-ceiling-browser.mjs --site .built-site/_site --source-sha "$SOURCE_SHA" --evidence-dir "$CI_STORAGE/evidence/combat-ceiling"'));
 assert.ok(!native.includes('continue-on-error'));
 assert.ok(!native.includes('check-inkwave-network-browser.mjs'));
 assert.match(native,/uses: actions\/upload-artifact@v4\n        if: always\(\)/);
 assert.ok(job(text,'validate_core').includes(`${guard} ${helper}`));
 assert.ok(native.includes(`node --test scripts/tests/inkwave-combat-ceiling-placement.test.mjs ${helper}`));
 assert.ok(native.includes(guard));
 return true;
}
// Evaluate only this deliberately restricted, validated boolean grammar, never arbitrary source.
function evaluate(expression,context){
 assert.match(expression,/^(?:github\.event_name == 'workflow_dispatch' && )?inputs\.diagnostic_only (?:==|!=) true(?: && inputs\.network_opening_diagnostic (?:==|!=) true)?$/);
 return expression.split(' && ').every(term=>{
  if(term==="github.event_name == 'workflow_dispatch'")return context.event==='workflow_dispatch';
  const [,key,op]=term.match(/^inputs\.(diagnostic_only|network_opening_diagnostic) (==|!=) true$/);
  return op==='=='?context[key]===true:context[key]!==true;
 });
}
test('workflow pins default-false scoped route and exact head evidence',()=>assert.equal(verify(workflow),true));
test('actual scoped predicates admit only explicit manual network diagnostic',()=>{
 for(const event of ['workflow_dispatch','push','pull_request'])for(const diagnostic_only of [false,true])for(const network_opening_diagnostic of [false,true]){
  const c={event,diagnostic_only,network_opening_diagnostic};
  assert.equal(evaluate(condition(workflow,'network-opening-diagnostic'),c),event==='workflow_dispatch'&&diagnostic_only&&network_opening_diagnostic);
  assert.equal(evaluate(condition(workflow,'render-diagnostic'),c),diagnostic_only&&!network_opening_diagnostic);
  assert.equal(evaluate(condition(workflow,'validate_core'),c),!diagnostic_only);
 }
});
test('malformed routing and broad trigger mutations fail closed',()=>{
 for(const [before,after] of [["github.event_name == 'workflow_dispatch' && ",''],['type: boolean\n        default: false\n      deep_lifecycle:','type: string\n        default: true\n      deep_lifecycle:'],["&& inputs.network_opening_diagnostic == true\n    runs-on:","|| inputs.network_opening_diagnostic == true\n    runs-on:"],['inputs.diagnostic_only != true\n    runs-on:','inputs.network_opening_diagnostic != true\n    runs-on:']]){
  const changed=workflow.replace(before,after);assert.notEqual(changed,workflow);assert.throws(()=>verify(changed));
 }
});
test('missing immutable workflow, checkout or build head checks are rejected',()=>{
 for(const literal of ['test "$WORKFLOW_SHA" = "$SOURCE_SHA"','test "$(git rev-parse HEAD)" = "$SOURCE_SHA"','test "$(cat .built-site/_site-source-sha.txt)" = "$SOURCE_SHA"']){
  const changed=workflow.replaceAll(literal,'true # mutation');assert.notEqual(changed,workflow);assert.throws(()=>verify(changed));
 }
});
test('cross-lane concurrency and cancellation changes are rejected',()=>{
 for(const changed of [workflow.replace("'-network-opening-diagnostic'","'-full'"),workflow.replace('cancel-in-progress: ${{ !(inputs.diagnostic_only == true && inputs.network_opening_diagnostic == true) }}','cancel-in-progress: true')])assert.throws(()=>verify(changed));
});
test('failure suppression, upload loss and missing route guards are rejected',()=>{
 for(const changed of [workflow.replace('  network-opening-diagnostic:\n','  network-opening-diagnostic:\n    continue-on-error: true\n'),workflow.replaceAll('if: always()','if: success()'),workflow.replaceAll(guard,'true # guard removed')])assert.throws(()=>verify(changed));
});

test('bounded helper contracts cannot disappear from either CI route',()=>{
 for(const changed of [workflow.replace(`${guard} ${helper}`,guard),workflow.replace(`node --test scripts/tests/inkwave-combat-ceiling-placement.test.mjs ${helper}`,'node --test scripts/tests/inkwave-combat-ceiling-placement.test.mjs')]){
  assert.notEqual(changed,workflow);assert.throws(()=>verify(changed));
 }
});
