import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EXPECTED_NAMES,SELECTED_PATTERN,verifySelectedTap} from '../check-inkwave-splatling-selected-tap.mjs';
const valid=()=>['TAP version 13',...EXPECTED_NAMES.flatMap((name,i)=>['# Subtest: '+name,`ok ${i+1} - ${name}`]),'1..2','# tests 2','# suites 0','# pass 2','# fail 0','# cancelled 0','# skipped 0','# todo 0',''].join('\n');

test('exact two-leaf Node TAP passes, including CRLF and ordinary diagnostics',()=>{
 assert.deepEqual(verifySelectedTap(valid()),{selected:2,pass:2});
 assert.deepEqual(verifySelectedTap(('# harmless diagnostic\n'+valid()).replace(/\n/g,'\r\n')),{selected:2,pass:2});
});
test('selector is anchored, exact and escapes the decimal point',()=>{
 const re=new RegExp(SELECTED_PATTERN);
 for(const name of EXPECTED_NAMES){assert(re.test(name));assert(!re.test('prefix '+name));assert(!re.test(name+' suffix'));}
 assert(!re.test(EXPECTED_NAMES[1].replace('1.6','1x6')));
 assert(!re.test('splatling retained horizontal'));
});
test('original successful file-wrapper receipt cannot claim a selected gameplay test',()=>{
 const file='patches/splatoon3/tests/weapon-edgecases.test.mjs';
 const wrapper=`TAP version 13\n# Subtest: ${file}\nok 1 - ${file}\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`;
 assert.throws(()=>verifySelectedTap(wrapper),/exact selected leaf names/);
});
test('missing, renamed, duplicate and extra leaves fail closed',()=>{
 for(const text of [valid().replace(EXPECTED_NAMES[1],'renamed'),valid().replace('# Subtest: '+EXPECTED_NAMES[1]+'\n',''),valid()+`# Subtest: ${EXPECTED_NAMES[0]}\nok 3 - ${EXPECTED_NAMES[0]}\n`,valid().replace(EXPECTED_NAMES[1],EXPECTED_NAMES[0])])assert.throws(()=>verifySelectedTap(text));
});
test('failed, skipped, todo, nested and bailout cases cannot pass',()=>{
 for(const text of [valid().replace('ok 2 -','not ok 2 -'),valid().replace(`ok 2 - ${EXPECTED_NAMES[1]}`,`ok 2 - ${EXPECTED_NAMES[1]} # SKIP`),valid().replace(`ok 2 - ${EXPECTED_NAMES[1]}`,`ok 2 - ${EXPECTED_NAMES[1]} # TODO`),valid()+'    # Subtest: hidden\n',valid()+'Bail out! failed\n'])assert.throws(()=>verifySelectedTap(text));
});
test('missing, wrong, duplicate or malformed plans and summaries fail closed',()=>{
 for(const line of ['1..2','# tests 2','# suites 0','# pass 2','# fail 0','# cancelled 0','# skipped 0','# todo 0']){
  assert.throws(()=>verifySelectedTap(valid().replace(line+'\n','')));
  assert.throws(()=>verifySelectedTap(valid()+line+'\n'));
  assert.throws(()=>verifySelectedTap(valid().replace(line,line+' malformed')));
  assert.throws(()=>verifySelectedTap(valid().replace(line,line.replace(/\d+$/,'99'))));
 }
 assert.throws(()=>verifySelectedTap(''));
});
test('workflow preserves pipeline failures and validates TAP from the exact selector',()=>{
 const workflow=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
 const step=workflow.split('      - name: Verify seven claimed gameplay and handoff regressions\n')[1]?.split('      - name:')[0];
 assert(step);assert.match(step,/shell: bash\n/);assert.match(step,/set -euo pipefail/);
 assert.match(step,/splatling_pattern="\$\(node scripts\/check-inkwave-splatling-selected-tap.mjs --pattern\)"/);
 assert.match(step,/--test-reporter=tap --test-name-pattern="\$splatling_pattern" patches\/splatoon3\/tests\/weapon-edgecases.test.mjs \| tee "\$RUNNER_TEMP\/inkwave-splatling-selected.tap"/);
 assert.match(step,/node scripts\/check-inkwave-splatling-selected-tap.mjs "\$RUNNER_TEMP\/inkwave-splatling-selected.tap"/);
 assert(!step.includes('splatling retained horizontal'));assert(!step.includes('|| true'));
});
