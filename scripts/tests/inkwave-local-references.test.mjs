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
// Copy real module bytes in the published layout: src/ is owned by upstream,
// patches/ by the repository. A shadow receives the same complete module graph.
function copyClosure(root,published,target=published,seen=new Set()){
 if(seen.has(target))return;seen.add(target);
 const source=published.startsWith('patches/')?published:path.join('inkwave-public',published);
 for(const [base,p]of [[repo,source],[root,target]])assert.ok(!path.relative(base,path.resolve(base,p)).startsWith('..'));
 const bytes=fs.readFileSync(path.join(repo,source));put(root,target,bytes);
 if(!['.js','.mjs'].includes(path.extname(source)))return;
 const refs=new Set(),text=bytes.toString();
 for(const m of text.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g))refs.add(m[1]);
 for(const m of text.matchAll(/import\s*["']([^"']+)["']/g))refs.add(m[1]);
 const resolve=(owner,ref)=>(ref.startsWith('/')?ref.slice(1):path.normalize(path.join(path.dirname(owner),ref))).split(/[?#]/)[0];
 for(const ref of refs){
  if(!/^(?:\.\.?\/|\/)/.test(ref))continue;
  copyClosure(root,resolve(published,ref),resolve(target,ref),seen);
 }
}
function copied(root){const r=SOURCE_SITE_REFERENCES[0];put(root,r.source,fs.readFileSync(path.join(repo,r.source)));copyClosure(root,'src/config.js','inkwave-public/src/config.js');copyClosure(root,r.target);assert.equal(checkLocalReferences(root).mapped.length,1);}
function rejectsOnly(root,reason){assert.throws(()=>checkLocalReferences(root),error=>{for(const line of error.message.split('\n'))assert.match(line,reason);return true;});}
test('all thirteen exact production source/site mappings retain pinned bytes and classifications',()=>{
 assert.equal(SOURCE_SITE_REFERENCES.length,13);
 for(const r of SOURCE_SITE_REFERENCES)assert.equal(verifyMappedReference(repo,r.source,r.ref).target,r.target);
 assert.equal(checkLocalReferences(repo).mapped.length,13);
});
test('unknown, additional traversal, changed ref and changed owner are not mapped',()=>{
 for(const r of SOURCE_SITE_REFERENCES){
  assert.equal(verifyMappedReference(repo,r.source,r.ref).target,r.target);
  for(const [s,ref]of [[r.source,r.ref+'x'],[r.source,'../'+r.ref],[path.posix.join(path.posix.dirname(r.source),'unregistered-owner.js'),r.ref],[r.source,'../../patches/missing.mjs']])assert.throws(()=>verifyMappedReference(repo,s,ref),/Unknown source\/site reference/);
 }
});
test('source and target byte changes or absent target reject instead of waiving missing imports',()=>fixture(root=>{
 copied(root);const r=SOURCE_SITE_REFERENCES[0];
 for(const p of [r.source,r.target]){assert.equal(verifyMappedReference(root,r.source,r.ref).target,r.target);const b=fs.readFileSync(path.join(root,p));put(root,p,Buffer.concat([b,Buffer.from('// mutation')]));assert.throws(()=>verifyMappedReference(root,r.source,r.ref),error=>{assert.equal(error.message,'Pinned reference source mismatch: '+p);return true;});put(root,p,b);}
 fs.renameSync(path.join(root,r.target),path.join(root,r.target+'.kept'));assert.throws(()=>verifyMappedReference(root,r.source,r.ref),/ENOENT/);
}));
test('every migrated navigation, facade and descriptor edge stays owner-bound and byte-pinned',()=>fixture(root=>{
 // This test calls the individual mapping verifier, not the closure scanner.
 for(const row of SOURCE_SITE_REFERENCES)for(const p of [row.source,row.target])put(root,p,fs.readFileSync(path.join(repo,p)));
 const migrated=SOURCE_SITE_REFERENCES.filter(r=>/src\/game\/nav\.js$|src\/world\/stages\/(?:index|data)\.js$/.test(r.source));
 assert.equal(migrated.length,9);
 for(const r of migrated){
  assert.equal(verifyMappedReference(root,r.source,r.ref).target,r.target);
  assert.throws(()=>verifyMappedReference(root,r.source,r.ref.replace('.mjs','-unknown.mjs')),/Unknown source\/site reference/);
  assert.throws(()=>verifyMappedReference(root,r.source.replace(/[^/]+$/,'unreviewed.js'),r.ref),/Unknown source\/site reference/);
  for(const p of [r.source,r.target]){
   const bytes=fs.readFileSync(path.join(root,p));
   put(root,p,Buffer.concat([bytes,Buffer.from('\n// unreviewed mutation')]));
   assert.throws(()=>verifyMappedReference(root,r.source,r.ref),/Pinned reference source mismatch/);
   put(root,p,bytes);
  }
 }
}));
test('ordinary missing, escaping local refs and runtime build-only imports remain rejected',()=>{
 for(const [ref,reason]of [["./absent.js",/Unknown source\/site reference/],["../../../../external/target.js",/escapes repository/],["../../../patches/local-quality/prop-atlas-adapter.mjs",/build-only/],["./alias.mjs",/build-only/],["./directory",/not a file/]])fixture(outer=>{
  const root=path.join(outer,'repo');put(outer,'external/target.js','export {};');
  put(root,'inkwave-public/src/game/ordinary.mjs','export {};');put(root,'inkwave-public/src/game/probe.js',"import './ordinary.mjs';");
  put(root,'patches/local-quality/prop-atlas-adapter.mjs','export {};');
  fs.symlinkSync(path.join(root,'patches/local-quality/prop-atlas-adapter.mjs'),path.join(root,'inkwave-public/src/game/alias.mjs'));
  fs.mkdirSync(path.join(root,'inkwave-public/src/game/directory'));
  assert.equal(checkLocalReferences(root).status,'passed');
  put(root,'inkwave-public/src/game/probe.js',`import '${ref}';`);rejectsOnly(root,reason);
 });
});
test('mapped target symlinks cannot escape repository even with matching bytes',()=>fixture(root=>{
 const nested=path.join(root,'repo');copied(nested);const r=SOURCE_SITE_REFERENCES[0];const old=path.join(nested,r.target);fs.renameSync(old,path.join(root,'saved.mjs'));fs.symlinkSync(path.join(root,'saved.mjs'),old);assert.throws(()=>verifyMappedReference(nested,r.source,r.ref),/escapes repository/);
}));
test('emitted proof requires exact input keys and both root/versioned artifact digests',()=>fixture(root=>{
 const r=SOURCE_SITE_REFERENCES[0],rev='a'.repeat(64),data=Buffer.from('export const fixture=true;');
 const files={[r.sourceInputKey]:r.sourceSha256,[r.inputKey]:r.targetSha256};const paths=[r.target,'_versions/'+rev+'/'+r.target];const artifacts=Object.fromEntries(paths.map(p=>[p,sha(data)]));for(const p of paths)put(root,p,data);
 const m={build:{revision:rev},files,artifacts};const save=()=>put(root,'inkwave-build.json',JSON.stringify(m));save();assert.equal(verifyMappedReference(repo,r.source,r.ref,root).emittedVerified,true);
 for(const key of Object.keys(files)){assert.equal(verifyMappedReference(repo,r.source,r.ref,root).emittedVerified,true);const v=files[key];files[key]='0'.repeat(64);save();assert.throws(()=>verifyMappedReference(repo,r.source,r.ref,root),/input manifest mismatch/);files[key]=v;save();}
 for(const p of paths){assert.equal(verifyMappedReference(repo,r.source,r.ref,root).emittedVerified,true);put(root,p,'changed');assert.throws(()=>verifyMappedReference(repo,r.source,r.ref,root),error=>{assert.equal(error.message,'Reference emitted artifact mismatch: '+p);return true;});put(root,p,data);}
 assert.equal(verifyMappedReference(repo,r.source,r.ref,root).emittedVerified,true);
 delete artifacts[paths[1]];save();assert.throws(()=>verifyMappedReference(repo,r.source,r.ref,root),/artifact mismatch/);
}));

test('known mappings cannot bypass pins through inkwave-public patch shadows',()=>{
 const r=SOURCE_SITE_REFERENCES[0];
 fixture(root=>{
  copied(root);const shadow=path.resolve(root,path.dirname(r.source),r.ref);
  copyClosure(root,r.target,path.relative(root,shadow));rejectsOnly(root,/Unexpected source\/site shadow/);
 });
 for(const p of [r.source,r.target])fixture(root=>{
  copied(root);put(root,p,Buffer.concat([fs.readFileSync(path.join(root,p)),Buffer.from('// mutation')]));rejectsOnly(root,/Pinned reference source mismatch/);
 });
});
