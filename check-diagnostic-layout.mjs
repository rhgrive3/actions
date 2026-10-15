import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const FIXED_TEST='6facd27aed18206baa7101fb4d51c1fdb8166c54';
export function verifyDiagnosticLayout(root,expectedSha,git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim()){
 root=fs.realpathSync(root);assert.match(expectedSha||'',/^[a-f0-9]{40}$/,'expected diagnostic checkout SHA');assert.equal(git('rev-parse','HEAD'),expectedSha,'actual diagnostic checkout');assert.equal(fs.realpathSync(git('rev-parse','--show-toplevel')),root,'diagnostic repository root, not nested folder');
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),blob=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'diagnostic-manifest.json'))),plan=JSON.parse(fs.readFileSync(path.join(root,'acceptance-plan.json')));
 assert.equal(manifest.candidateHead,plan.candidateHead);assert.equal(plan.candidateHead,'97e73d721e262c4d13f7f9a7eacfedddefacbcd3');
 assert.equal(blob(fs.readFileSync(path.join(root,'variant-plan.test.mjs'))),FIXED_TEST,'corrected test at actual repository root');
 const seen=new Set();for(const f of manifest.files){assert.ok(!path.isAbsolute(f.path)&&!f.path.split('/').includes('..'));assert.ok(!seen.has(f.path));seen.add(f.path);const b=fs.readFileSync(path.join(root,f.path));assert.equal(hash(b),f.sha256,f.path);assert.equal(blob(b),f.blob,f.path);assert.equal(b.length,f.bytes,f.path);}
 for(const required of['variant-plan.test.mjs','check-diagnostic-layout.mjs','diagnostic-layout.test.mjs','.github/workflows/fifth-weapon-acceptance.yml'])assert.ok(seen.has(required),'manifest binds '+required);
 return{diagnosticHead:expectedSha,candidateHead:plan.candidateHead,files:seen.size,testBlob:FIXED_TEST};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(verifyDiagnosticLayout(path.dirname(fileURLToPath(import.meta.url)),process.env.GITHUB_SHA)));
