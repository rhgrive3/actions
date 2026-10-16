import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function validateLayout(here,plan,files,diagnosticHead){
 const candidate=path.resolve(here,'../candidate'),git=(dir,...a)=>execFileSync('git',['-C',dir,...a],{encoding:'utf8'}).trim();
 assert.match(plan.head,/^[a-f0-9]{40}$/);assert.match(plan.tree,/^[a-f0-9]{40}$/);assert.match(diagnosticHead||'',/^[a-f0-9]{40}$/);assert.equal(git(here,'rev-parse','HEAD'),diagnosticHead,'literal diagnostic checkout');
 for(const f of files){assert.ok(!f.path.startsWith('/')&&!f.path.split('/').includes('..'));const file=path.join(here,f.path);assert.equal(hash(fs.readFileSync(file)),f.sha256,f.path);if(f.path.endsWith('.mjs'))execFileSync(process.execPath,['--check',file]);}
 assert.equal(git(candidate,'rev-parse','HEAD'),plan.head);assert.equal(git(candidate,'rev-parse','HEAD^{tree}'),plan.tree);assert.equal(git(candidate,'status','--porcelain'),'');for(const f of plan.payload)assert.equal(hash(fs.readFileSync(path.join(candidate,f.path))),f.sha256,f.path);return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const here=path.dirname(fileURLToPath(import.meta.url)),m=JSON.parse(fs.readFileSync(path.join(here,'package.json'))),plan=JSON.parse(fs.readFileSync(path.join(here,'acceptance-plan.json')));validateLayout(here,plan,m.files,process.env.GITHUB_SHA);console.log('Exact runtime head and literal diagnostic root payload verified');}
