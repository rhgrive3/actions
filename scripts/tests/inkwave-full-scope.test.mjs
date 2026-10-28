import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyChangedFiles,classifyExactDiff} from '../ci/inkwave-full-scope.mjs';
const a='a'.repeat(40),b='b'.repeat(40);
function diff(paths,{fetch=false,broken=false,head=b}={}){
 const calls=[];const run=(_program,args)=>{
   calls.push(args);
   if(broken)return {status:1,stdout:Buffer.alloc(0)};
   if(args[0]==='rev-parse')return {status:0,stdout:Buffer.from(head+'\n')};
   if(args[0]==='cat-file')return {status:fetch&&calls.filter(x=>x[0]==='cat-file').length===1?1:0,stdout:Buffer.from('commit\n')};
   if(args[0]==='fetch')return {status:0,stdout:Buffer.alloc(0)};
   if(args.includes('--name-only'))return {status:0,stdout:Buffer.from(paths.join('\0')+(paths.length?'\0':''))};
   throw Error('Unexpected git operation');
 };
 return {result:classifyExactDiff({event:'pull_request',base:a,head:b,run}),calls};
}
test('only explicit CI-only paths skip full source tree, and no manual candidate commit pin is required',()=>{
 const ci=['scripts/tests/inkwave-staged-ci-policy.test.mjs','scripts/tests/inkwave-network-diagnostic-workflow.test.mjs','.github/workflows/inkwave-fast-pr.yml','docs/ci-explained.md'];
 assert.equal(classifyChangedFiles(ci),'contracts-only');
 assert.equal(diff(ci).result.mode,'contracts-only');
 assert.equal(diff([]).result.mode,'contracts-only','same tree with new commit SHA is CI-only');
 assert.equal(diff(ci,{fetch:true}).result.mode,'contracts-only');
});
test('all production code, any source test, full workflow policy or unknown names force full validation',()=>{
 for(const file of ['inkwave-public/src/game/match.js','patches/splatoon3/profile.json','patches/local-quality/tests/quality.test.mjs','scripts/tests/inkwave-unknown.test.mjs','scripts/ci/run-inkwave-test-suite.mjs','.github/workflows/validate-inkwave-update.yml','scripts/build-inkwave.mjs','README.md','../../escape','docs/not-md.js']){
   assert.equal(classifyChangedFiles([file]),'full',file);
   assert.equal(diff([file]).result.mode,'full',file);
 }
 assert.equal(classifyChangedFiles(['scripts/tests/inkwave-staged-ci-policy.test.mjs','patches/splatoon3/runtime/roller.mjs']),'full');
});
test('untrusted refs, partial clones and failed comparison always use full validation',()=>{
 assert.equal(classifyExactDiff({event:'push',base:a,head:b}).mode,'full');
 assert.equal(classifyExactDiff({event:'pull_request',base:'main',head:b}).mode,'full');
 assert.equal(classifyExactDiff({event:'pull_request',base:a,head:'bad'}).mode,'full');
 assert.equal(diff([], {broken:true}).result.mode,'full');
 assert.equal(diff([], {head:a}).result.mode,'full');
 assert.equal(classifyChangedFiles(['docs/a\nmain.js']),'full');
 assert.equal(classifyChangedFiles(['docs/a\0main.js']),'full');
});
test('base fetch is immutable, bounded, and only performed after a missing base object',()=>{
 const {calls}=diff(['.github/workflows/inkwave-fast-pr.yml'],{fetch:true});
 assert.deepEqual(calls.find(x=>x[0]==='fetch'),['fetch','--no-tags','--depth=1','origin',a]);
 assert.deepEqual(calls.find(x=>x[0]==='-c'),['-c','diff.renames=false','diff','--no-ext-diff','--no-renames','--name-only','-z',a,b]);
 assert.equal(diff([]).calls.some(x=>x[0]==='fetch'),false);
});
