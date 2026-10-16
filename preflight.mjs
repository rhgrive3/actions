import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function validatePreflight({plan,files,readDiagnostic,readSource,head,tree,dirty}){
 assert.equal(plan.head,'e649b794cf2fc042b410ee8ef67c6668698d5df1');assert.equal(plan.tree,'7c3d533e01394d0733ab55476803e66a36cd20d7');assert.equal(head,plan.head);assert.equal(tree,plan.tree);assert.equal(dirty,'');assert.deepEqual(plan.expectedFrames,{clams:24,carriers:4,rainmaker:18});
 assert.ok(files.length>=18);assert.equal(new Set(files.map(f=>f.path)).size,files.length);
 for(const f of files){assert.ok(!path.isAbsolute(f.path)&&f.path.split('/').every(x=>x&&x!=='.'&&x!=='..'));assert.equal(hash(readDiagnostic(f.path)),f.sha256,f.path);}
 for(const f of plan.payload){const b=readSource(f.path);assert.equal(hash(b),f.sha256,f.path);assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex'),f.blob,f.path);}
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const here=path.dirname(fileURLToPath(import.meta.url)),candidate=path.resolve(here,'../candidate'),plan=JSON.parse(fs.readFileSync(path.join(here,'acceptance-plan.json'))),pkg=JSON.parse(fs.readFileSync(path.join(here,'package.json')));const git=(...args)=>execFileSync('git',['-C',candidate,...args],{encoding:'utf8'}).trim();validatePreflight({plan,files:pkg.files,readDiagnostic:p=>fs.readFileSync(path.join(here,p)),readSource:p=>fs.readFileSync(path.join(candidate,p)),head:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),dirty:git('status','--porcelain')});console.log('Exact game source and diagnostic payloads verified');}
