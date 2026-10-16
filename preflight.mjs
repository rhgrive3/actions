import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
export function validatePreflight(plan,pkg,git,readSource,readPackage){
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 assert.equal(plan.head,'d44473fcd59599eb94bb3bb9a959e22da118184a');assert.equal(plan.tree,'0fd8de5349efc039f1f67ccd3446f0230950d6c5');
 assert.equal(git('rev-parse','HEAD'),plan.head);assert.equal(git('rev-parse','HEAD^{tree}'),plan.tree);assert.equal(git('status','--porcelain'),'');
 assert.equal(plan.variantIds.length,60);assert.equal(new Set(plan.variantIds).size,60);assert(plan.variantIds.includes('Blaster_Short_01'));
 for(const f of plan.payload){const b=readSource(f.path);assert.equal(hash(b),f.sha256);assert.equal(crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),f.blob);}
 for(const f of pkg.files){assert(!f.path.startsWith('/')&&!f.path.split('/').includes('..'));const b=readPackage(f.path);assert.equal(hash(b),f.sha256);assert.equal(b.length,f.bytes);}
 return true;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const here=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(process.argv[2]||'../candidate');validatePreflight(JSON.parse(fs.readFileSync(path.join(here,'acceptance-plan.json'))),JSON.parse(fs.readFileSync(path.join(here,'package.json'))),(...a)=>execFileSync('git',['-C',source,...a],{encoding:'utf8'}).trim(),p=>fs.readFileSync(path.join(source,p)),p=>fs.readFileSync(path.join(here,p)));console.log('Exact Luna default head and package verified');}
