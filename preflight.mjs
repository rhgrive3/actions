import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
export function validatePreflight(plan,pkg,git,readSource,readPackage){
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 assert.equal(plan.head,'fd82e9fc65986e207d8939869f4a5687e2962fc7');assert.equal(plan.tree,'aadfc9ea81df43cc755a9cfb85d95cafeccdd71d');
 assert.equal(git('rev-parse','HEAD'),plan.head);assert.equal(git('rev-parse','HEAD^{tree}'),plan.tree);assert.equal(git('status','--porcelain'),'');
 assert.equal(plan.variantIds.length,59);assert.equal(new Set(plan.variantIds).size,59);for(const row of ['Shooter_Blaze_02','Shooter_Expert_02','Shooter_Flash_01'])assert(!plan.variantIds.includes(row));
 for(const f of plan.payload){const b=readSource(f.path);assert.equal(hash(b),f.sha256);assert.equal(crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),f.blob);}
 for(const f of pkg.files){assert(!f.path.startsWith('/')&&!f.path.split('/').includes('..'));const b=readPackage(f.path);assert.equal(hash(b),f.sha256);assert.equal(b.length,f.bytes);}
 return true;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const here=path.dirname(fileURLToPath(import.meta.url)),source=path.resolve(process.argv[2]||'../candidate');validatePreflight(JSON.parse(fs.readFileSync(path.join(here,'acceptance-plan.json'))),JSON.parse(fs.readFileSync(path.join(here,'package.json'))),(...a)=>execFileSync('git',['-C',source,...a],{encoding:'utf8'}).trim(),p=>fs.readFileSync(path.join(source,p)),p=>fs.readFileSync(path.join(here,p)));console.log('Exact existing manual head and package verified');}
