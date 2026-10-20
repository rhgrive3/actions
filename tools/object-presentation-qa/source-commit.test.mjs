import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sourceCommitVerifier, quoteGitPath } from './source-commit.mjs';
function repo(format='sha1') {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'object-commit-test-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 git('init','--object-format='+format);git('config','core.autocrlf','false');
 const write=(name,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),bytes);};
 const commit=()=>{git('add','--all');git('-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','identity fixture');return git('rev-parse','HEAD');};
 const old=(sha,file)=>{const actual=git('hash-object','--',file);assert.equal(actual,git('rev-parse',sha+':'+file));return actual;};
 return {root,git,write,commit,old};
}
for(const format of ['sha1','sha256'])test(format+' tracked binary, UTF-8 and difficult paths preserve ordered old Git hashes',()=>{
 const r=repo(format),names=['ordinary','space name','quote"name','back\\slash','line\nname','tab\tname','vertical\vname','form\fname','日本語','--flag','sub/one'];
 names.forEach((n,i)=>r.write(n,i%2?Buffer.from([0,255,13,10,i]):Buffer.from('line\r\nsecond\n'+i)));
 const sha=r.commit(),expected=new Map(names.map(n=>[n,r.old(sha,n)]));
 const verify=sourceCommitVerifier(r.root,sha,names.concat(names[0]));
 for(const n of names)assert.equal(verify(n),expected.get(n));
});
test('Git clean filters and EOL attributes stay equivalent, not raw Node hashes',()=>{
 const r=repo();r.write('.gitattributes','*.txt text eol=lf\n*.clean filter=qa\n');r.git('config','filter.qa.clean','sed s/WORK/CLEAN/g');r.git('config','filter.qa.required','true');
 r.write('eol.txt','a\r\nb\r\n');r.write('value.clean','WORK\n');const sha=r.commit();
 const files=['.gitattributes','eol.txt','value.clean'],verify=sourceCommitVerifier(r.root,sha,files);
 for(const n of files)assert.equal(verify(n),r.old(sha,n));
 for(const n of ['eol.txt','value.clean']){const b=fs.readFileSync(path.join(r.root,n)),raw=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');assert.notEqual(raw,verify(n));}
});
test('missing, untracked, modified and wrong-commit sources fail before capture',()=>{
 const r=repo();r.write('a','original');const sha=r.commit();r.write('untracked','x');
 assert.throws(()=>sourceCommitVerifier(r.root,sha,['untracked']),/tracked source/);
 fs.renameSync(path.join(r.root,'a'),path.join(r.root,'saved-a'));
 assert.throws(()=>sourceCommitVerifier(r.root,sha,['a']));fs.renameSync(path.join(r.root,'saved-a'),path.join(r.root,'a'));
 r.write('a','mutated');assert.throws(()=>sourceCommitVerifier(r.root,sha,['a']),/source commit/);assert.throws(()=>r.old(sha,'a'));
 const newer=r.commit();assert.notEqual(newer,sha);assert.throws(()=>sourceCommitVerifier(r.root,sha,['a']),/source commit/);
 assert.equal(sourceCommitVerifier(r.root,newer,['a'])('a'),r.old(newer,'a'));
});
test('mutation after batch validation is not accepted from cached proof',()=>{
 const r=repo();r.write('a','original');const sha=r.commit(),verify=sourceCommitVerifier(r.root,sha,['a']);
 r.write('a','changed');assert.throws(()=>verify('a'),/unchanged after Git/);assert.throws(()=>verify('a',Buffer.from('changed')),/unchanged after Git/);
 assert.throws(()=>verify('not-in-inventory',Buffer.from('x')),/included in verified inventory/);
});
test('committed symlink is not silently accepted as ordinary blob',()=>{
 const r=repo();r.write('target','content');fs.symlinkSync('target',path.join(r.root,'link'));const sha=r.commit();
 assert.throws(()=>r.old(sha,'link'));assert.throws(()=>sourceCommitVerifier(r.root,sha,['link']),/ordinary committed source/);
});
test('worktree symlink replacing regular source and escaping paths fail closed',()=>{
 const r=repo();r.write('a','content');r.write('target','content');const sha=r.commit();
 fs.renameSync(path.join(r.root,'a'),path.join(r.root,'saved'));fs.symlinkSync('target',path.join(r.root,'a'));
 assert.throws(()=>sourceCommitVerifier(r.root,sha,['a']),/ordinary source file/);
 for(const p of ['../escape','/absolute','sub/../a','./a','a\0bad'])assert.throws(()=>sourceCommitVerifier(r.root,sha,[p]));
 assert.throws(()=>sourceCommitVerifier(r.root,'HEAD',['target']),/fixed source commit/);
});
test('executable regular blob remains accepted and no write flag is used',()=>{
 const r=repo();r.write('tool','#!/bin/sh\nexit 0\n');fs.chmodSync(path.join(r.root,'tool'),0o755);const sha=r.commit();
 assert.equal(sourceCommitVerifier(r.root,sha,['tool'])('tool'),r.old(sha,'tool'));
 assert.equal(quoteGitPath('a\vb'),'"a\\013b"');
});
test('batch hash output count, order and syntax mismatches fail closed',()=>{
 const r=repo();r.write('a','first');r.write('b','second');const sha=r.commit();
 const actualGit=execFileSync('which',['git'],{encoding:'utf8'}).trim(),shim=fs.mkdtempSync(path.join(os.tmpdir(),'object-git-shim-'));
 fs.writeFileSync(path.join(shim,'git'),`#!${process.execPath}\nconst fs=require('node:fs'),cp=require('node:child_process');const args=process.argv.slice(2);let out=cp.execFileSync(${JSON.stringify(actualGit)},args,{input:fs.readFileSync(0),encoding:'utf8'});if(args[0]==='hash-object'){let rows=out.trimEnd().split('\\n');if(process.env.OBJECT_HASH_MUTANT==='short')rows.pop();if(process.env.OBJECT_HASH_MUTANT==='long')rows.push(rows[0]);if(process.env.OBJECT_HASH_MUTANT==='reverse')rows.reverse();if(process.env.OBJECT_HASH_MUTANT==='invalid')rows[0]='not-an-object-id';out=rows.join('\\n')+'\\n';}process.stdout.write(out);\n`,{mode:0o755});
 const oldPath=process.env.PATH,oldMutant=process.env.OBJECT_HASH_MUTANT;
 try {process.env.PATH=shim+path.delimiter+oldPath;for(const mode of ['short','long','reverse','invalid']){process.env.OBJECT_HASH_MUTANT=mode;assert.throws(()=>sourceCommitVerifier(r.root,sha,['a','b']),undefined,mode);}}
 finally {process.env.PATH=oldPath;if(oldMutant===undefined)delete process.env.OBJECT_HASH_MUTANT;else process.env.OBJECT_HASH_MUTANT=oldMutant;}
});
