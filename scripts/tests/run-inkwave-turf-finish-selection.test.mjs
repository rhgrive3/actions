import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {selectedTapPassed,childPassed,runBounded,childEnvironment} from '../run-inkwave-turf-finish-isolated.mjs';
const name='#410 selected body';
const tap='TAP version 13\n# Subtest: \\#410 selected body\nok 1 - \\#410 selected body\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const counts={tests:1,pass:1,fail:0,skipped:0};
test('exact escaped selected leaf, plan and complete zero-skip summary pass',()=>{
 assert(selectedTapPassed(tap,name));
 assert(childPassed({status:0,signal:null,error:null,stdout:tap},counts,name));
 assert(!childPassed({status:0,signal:null,error:null,stdout:'',stderr:tap},counts,name));
 for(const failed of [{status:1},{signal:'SIGTERM'},{error:new Error('timeout')}])assert(!childPassed({status:0,signal:null,error:null,stdout:tap,...failed},counts,name));
});
test('wrong leaf, skipped or TODO leaf, wrong or duplicate plan and counts fail closed',()=>{
 for(const bad of [tap.replace('ok 1 - \\#410 selected body','ok 1 - /tmp/suite.test.mjs'),tap.replace('ok 1 - \\#410 selected body','ok 1 - \\#410 selected body # SKIP'),tap.replace('ok 1 - \\#410 selected body','ok 1 - \\#410 selected body # TODO'),tap.replace('1..1','1..0'),tap+'1..1\n',tap+'# tests 1\n',tap.replace('# skipped 0','# skipped 1'),tap.replace('# todo 0','# todo 1'),tap.replace('# cancelled 0','# cancelled 1'),tap+'    ok 1 - nested\n',tap+'Bail out!\n',tap.replace('# suites 0\n','')])assert(!selectedTapPassed(bad,name),bad);
});
test('real Node exact selection runs body; zero-match file wrapper cannot pass',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turf-selection-'));
 try {
  const file=path.join(dir,'selected.test.mjs');
  fs.writeFileSync(file,"import test from 'node:test'; test('#410 selected body',()=>{console.log('BODY_EXECUTED')});");
  for(const [pattern,expected] of [['^#410 selected body$',true],['^missing body$',false]]){
   const run=await runBounded(process.execPath,['--test','--test-reporter=tap','--test-name-pattern='+pattern,file],{env:childEnvironment(process.env,'source')});
   assert.equal(run.status,0); assert.equal(run.error,null);
   assert.equal(run.stdout.includes('BODY_EXECUTED'),expected);
   assert.equal(childPassed(run,counts,name),expected,run.stdout);
   if(!expected){assert.match(run.stdout,/# tests 1\n/);assert.match(run.stdout,/# pass 1\n/);assert.match(run.stdout,/# skipped 0\n/);}
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('runner pins explicit TAP reporter and preserves original source hash and heap',()=>{
 const code=fs.readFileSync(new URL('../run-inkwave-turf-finish-isolated.mjs',import.meta.url),'utf8');
 assert(code.includes("'--test-reporter=tap'")); assert(code.includes('11a269156ca1eeaebca16845cabcd4d940fde14e92c202bfad09ae62478b4765'));
 assert(code.includes("'--max-old-space-size=384'"));
});
