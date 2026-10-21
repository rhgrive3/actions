import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {SOURCE_SITE_REFERENCES,verifyMappedReference,checkLocalReferences} from '../check-inkwave-local-references.mjs';
const repo=process.env.INKWAVE_REFERENCE_TEST_SOURCE||fileURLToPath(new URL('../../',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-ref-contract-'));try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
function put(root,p,bytes){const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,bytes);}
function copied(root){for(const row of SOURCE_SITE_REFERENCES)for(const p of [row.source,row.target])put(root,p,fs.readFileSync(path.join(repo,p)));}
test('all nine exact production source/site mappings retain pinned bytes and classifications',()=>{
 assert.equal(SOURCE_SITE_REFERENCES.length,9);
 for(const r of SOURCE_SITE_REFERENCES)assert.equal(verifyMappedReference(repo,r.source,r.ref).target,r.target);
 assert.equal(checkLocalReferences(repo).mapped.length,9);
});
test('unknown, additional traversal, changed ref and changed owner are not mapped',()=>{
 const r=SOURCE_SITE_REFERENCES[0];
 for(const [s,ref]of [[r.source,r.ref+'x'],[r.source,'../'+r.ref],[r.source.replace('nav.js','other.js'),r.ref],[r.source,'../../patches/missing.mjs']])assert.throws(()=>verifyMappedReference(repo,s,ref),/Unknown source\/site reference/);
});
test('source and target byte changes or absent target reject instead of waiving missing imports',()=>fixture(root=>{
 copied(root);const r=SOURCE_SITE_REFERENCES[0];
 for(const p of [r.source,r.target]){const b=fs.readFileSync(path.join(root,p));put(root,p,Buffer.concat([b,Buffer.from('// mutation')]));assert.throws(()=>verifyMappedReference(root,r.source,r.ref),/Pinned reference source mismatch/);put(root,p,b);}
 fs.renameSync(path.join(root,r.target),path.join(root,r.target+'.kept'));assert.throws(()=>verifyMappedReference(root,r.source,r.ref),/ENOENT/);
}));
test('ordinary missing, escaping local refs and runtime build-only imports remain rejected',()=>fixture(root=>{
 put(root,'inkwave-public/src/game/probe.js',"import './absent.js';");assert.throws(()=>checkLocalReferences(root),/MISSING/);
 const outside=path.join(root,'external');fs.mkdirSync(outside);put(outside,'target.js','export {};');
 const nested=path.join(root,'repo');put(nested,'inkwave-public/src/game/probe.js',"import '../../../../external/target.js';");assert.throws(()=>checkLocalReferences(nested),/escapes repository/);
 put(root,'patches/local-quality/prop-atlas-adapter.mjs','export {};');put(root,'inkwave-public/src/game/probe.js',"import '../../../patches/local-quality/prop-atlas-adapter.mjs';");assert.throws(()=>checkLocalReferences(root),/build-only/);
 fs.symlinkSync(path.join(root,'patches/local-quality/prop-atlas-adapter.mjs'),path.join(root,'inkwave-public/src/game/alias.mjs'));put(root,'inkwave-public/src/game/probe.js',"import './alias.mjs';");assert.throws(()=>checkLocalReferences(root),/build-only/);
 fs.mkdirSync(path.join(root,'inkwave-public/src/game/directory'));put(root,'inkwave-public/src/game/probe.js',"import './directory';");assert.throws(()=>checkLocalReferences(root),/not a file/);
}));
test('mapped target symlinks cannot escape repository even with matching bytes',()=>fixture(root=>{
 const nested=path.join(root,'repo');copied(nested);const r=SOURCE_SITE_REFERENCES[0];const old=path.join(nested,r.target);fs.renameSync(old,path.join(root,'saved.mjs'));fs.symlinkSync(path.join(root,'saved.mjs'),old);assert.throws(()=>verifyMappedReference(nested,r.source,r.ref),/escapes repository/);
}));
test('emitted proof requires exact input keys and both root/versioned artifact digests',()=>fixture(root=>{
 const r=SOURCE_SITE_REFERENCES[0],rev='a'.repeat(64),data=Buffer.from('export const fixture=true;');
 const files={[r.sourceInputKey]:r.sourceSha256,[r.inputKey]:r.targetSha256};const paths=[r.target,'_versions/'+rev+'/'+r.target];const artifacts=Object.fromEntries(paths.map(p=>[p,sha(data)]));for(const p of paths)put(root,p,data);
 const m={build:{revision:rev},files,artifacts};const save=()=>put(root,'inkwave-build.json',JSON.stringify(m));save();assert.equal(verifyMappedReference(repo,r.source,r.ref,root).emittedVerified,true);
 for(const key of Object.keys(files)){const v=files[key];files[key]='0'.repeat(64);save();assert.throws(()=>verifyMappedReference(repo,r.source,r.ref,root),/input manifest mismatch/);files[key]=v;}
 save();for(const p of paths){put(root,p,'changed');assert.throws(()=>verifyMappedReference(repo,r.source,r.ref,root),/artifact mismatch/);put(root,p,data);}
 delete artifacts[paths[1]];save();assert.throws(()=>verifyMappedReference(repo,r.source,r.ref,root),/artifact mismatch/);
}));

test('known mappings cannot bypass pins through inkwave-public patch shadows',()=>fixture(root=>{
 copied(root);const r=SOURCE_SITE_REFERENCES[0];
 const shadow=path.resolve(root,path.dirname(r.source),r.ref);put(root,path.relative(root,shadow),fs.readFileSync(path.join(root,r.target)));
 assert.throws(()=>checkLocalReferences(root),/Unexpected source\/site shadow/);
 for(const p of [r.source,r.target]){const b=fs.readFileSync(path.join(root,p));put(root,p,Buffer.concat([b,Buffer.from('// mutation')]));assert.throws(()=>checkLocalReferences(root),/Pinned reference source mismatch/);put(root,p,b);}
}));
