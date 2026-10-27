import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
import {prepareQualityComparison,qualityScope} from '../inkwave-quality-scope.mjs';
const a='a'.repeat(40),b='b'.repeat(40),git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
test('scope never fetches invalid endpoints; failed/missing base remains fail-open',()=>{
 for(const base of [null,'bad','0'.repeat(40)]){const calls=[];assert.equal(prepareQualityComparison(base,b,args=>calls.push(args)).available,false);assert.equal(calls.length,0);}
 for(const failure of ['fetch','tree']){const calls=[];const result=prepareQualityComparison(a,b,args=>{calls.push(args);if(args[0]==='fetch'){if(failure==='fetch')throw Error('unavailable');return '';}if(args.at(-1).startsWith(a))throw Error('missing');return '';});assert.equal(result.available,false);assert.equal(calls.filter(x=>x[0]==='fetch').length,1);assert.equal(qualityScope(a,b,()=>{throw Error('unavailable');}).relevant,true);}
});
test('real depth-one checkout fetches only the immutable base and keeps docs/game/delete/rename scope',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quality-shallow-'));
 try{const source=path.join(dir,'source');fs.mkdirSync(source);git(source,['init','-b','main']);git(source,['config','user.name','Fixture']);git(source,['config','user.email','fixture@example.invalid']);
  fs.mkdirSync(path.join(source,'docs'));fs.writeFileSync(path.join(source,'docs/a.md'),'base');fs.writeFileSync(path.join(source,'game.js'),'base');git(source,['add','.']);git(source,['commit','-m','base']);const base=git(source,['rev-parse','HEAD']).trim();
  for(const kind of ['docs','game','delete','rename']){git(source,['reset','--hard',base]);if(kind==='docs')fs.writeFileSync(path.join(source,'docs/a.md'),'changed');if(kind==='game')fs.writeFileSync(path.join(source,'game.js'),'changed');if(kind==='delete')fs.unlinkSync(path.join(source,'game.js'));if(kind==='rename')fs.renameSync(path.join(source,'game.js'),path.join(source,'renamed.js'));git(source,['add','-A']);git(source,['commit','-m',kind]);const head=git(source,['rev-parse','HEAD']).trim(),clone=path.join(dir,kind);git(dir,['clone','--depth=1','--no-tags','file://'+source,clone]);
   assert.equal(git(clone,['rev-list','--all','--count']).trim(),'1');const invoke=args=>git(clone,args),before=qualityScope(base,head,args=>git(source,args));assert.equal(qualityScope(base,head,invoke).relevant,true,'missing tree never skips');const history=prepareQualityComparison(base,head,invoke);assert.equal(history.available,true);assert.equal(history.fetched,true);assert.deepEqual(qualityScope(base,head,invoke),before);assert.equal(before.relevant,kind!=='docs');assert.equal(git(clone,['rev-parse','HEAD']).trim(),head);assert.equal(git(clone,['rev-list','--all','--count']).trim(),'1','base fetch does not deepen the head branch');assert.equal(git(clone,['cat-file','-t',base]),'commit\n');assert.equal(prepareQualityComparison(base,head,invoke).fetched,false);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI fetch failures and zero-before publish relevant true with bound endpoint summary',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'quality-cli-'));try{git(dir,['init']);const output=path.join(dir,'output'),summary=path.join(dir,'summary');execFileSync(process.execPath,[new URL('../inkwave-quality-scope.mjs',import.meta.url).pathname,'--fetch-base'],{cwd:dir,env:{...process.env,QUALITY_BASE_SHA:'0'.repeat(40),QUALITY_HEAD_SHA:b,GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary}});assert.equal(fs.readFileSync(output,'utf8'),'relevant=true\nbuild_required=true\n');assert.match(fs.readFileSync(summary,'utf8'),/base=0+ head=b+; relevant=true/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('partial-clone availability checks cannot perform an implicit unbounded lazy fetch',()=>{
 let fetched=false;const calls=[];const result=prepareQualityComparison(a,b,args=>{calls.push(args);if(args[0]==='fetch'){assert.deepEqual(args,['fetch','--no-tags','--depth=1','origin',a]);fetched=true;return '';}assert.equal(args[0],'--no-lazy-fetch');assert.equal(args[1],'cat-file');if(args.at(-1).startsWith(a)&&!fetched)throw Error('absent local base');return '';});assert.equal(result.available,true);assert.equal(result.fetched,true);assert.equal(calls.filter(x=>x[0]==='fetch').length,1);
});
