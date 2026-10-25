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
function copied(root){const r=SOURCE_SITE_REFERENCES[0];put(root,r.source,fs.readFileSync(path.join(repo,r.source)));copyClosure(root,'src/config.js','inkwave-public/src/config.js');copyClosure(root,'src/core/buildSlices.js','inkwave-public/src/core/buildSlices.js');copyClosure(root,r.target);assert.equal(checkLocalReferences(root).mapped.length,1);}
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
 const migrated=SOURCE_SITE_REFERENCES.filter(r=>/src\/game\/nav\.js$|src\/world\/stages\/(?:index|range-data)\.js$/.test(r.source));
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

// The public descriptor split moves these imports to range-data.js, not to the
// dynamic loader data.js. Every allowlisted edge must still exist in its owner.
test('current public reference owners declare every admitted edge and retire the old loader owner', () => {
 for (const row of SOURCE_SITE_REFERENCES) {
  const text=fs.readFileSync(path.join(repo,row.source),'utf8');
  const imports=[...text.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)].map(m=>m[1]);
  assert(imports.includes(row.ref), row.source+' must declare '+row.ref);
 }
 const loader=fs.readFileSync(path.join(repo,'inkwave-public/src/world/stages/data.js'),'utf8');
 assert.match(loader,/import\('\.\/range-data\.js'\)/);
 assert.doesNotMatch(loader,/from ['"]\.\.\/\.\.\/\.\.\/patches\/practice-range/);
 const moved=SOURCE_SITE_REFERENCES.filter(r=>r.source==='inkwave-public/src/world/stages/range-data.js');
 assert.equal(moved.length,4);
 for(const row of moved) {
  assert.equal(row.sourceInputKey,'upstream/src/world/stages/range-data.js');
  assert.throws(()=>verifyMappedReference(repo,'inkwave-public/src/world/stages/data.js',row.ref),/Unknown source\/site reference/);
 }
});
test('migrated descriptor emitted proofs require the new exact owner key for all four targets', () => {
 for(const row of SOURCE_SITE_REFERENCES.filter(r=>r.source.endsWith('/range-data.js')))fixture(root=>{
  const rev='b'.repeat(64), data=Buffer.from('export const descriptor=true;');
  const paths=[row.target,'_versions/'+rev+'/'+row.target];
  const files={[row.sourceInputKey]:row.sourceSha256,[row.inputKey]:row.targetSha256};
  const artifacts=Object.fromEntries(paths.map(p=>[p,sha(data)])); for(const p of paths)put(root,p,data);
  const save=()=>put(root,'inkwave-build.json',JSON.stringify({build:{revision:rev},files,artifacts}));
  save();assert.equal(verifyMappedReference(repo,row.source,row.ref,root).emittedVerified,true);
  delete files[row.sourceInputKey];files['upstream/src/world/stages/data.js']=row.sourceSha256;save();
  assert.throws(()=>verifyMappedReference(repo,row.source,row.ref,root),/input manifest mismatch/);
  files[row.sourceInputKey]=row.sourceSha256;delete files['upstream/src/world/stages/data.js'];save();
  assert.equal(verifyMappedReference(repo,row.source,row.ref,root).emittedVerified,true);
  for(const artifact of paths){put(root,artifact,'unreviewed');assert.throws(()=>verifyMappedReference(repo,row.source,row.ref,root),/artifact mismatch/);put(root,artifact,data);}
 });
});
test('historical navigation and facade digests do not substitute for current emitted source identity', () => {
 for(const [owner,oldDigest] of [
  ['inkwave-public/src/game/nav.js','d6fc66dbb6f15957638d29d501e47fe281a68be8d229cfd981bea7b8d9d45e2c'],
  ['inkwave-public/src/world/stages/index.js','c5de32f49be415435f63930d6459011e8d24d415536df28526aa410f2b3a6295']
 ])fixture(root=>{
  const row=SOURCE_SITE_REFERENCES.find(r=>r.source===owner),rev='c'.repeat(64),data=Buffer.from('export {};');
  assert(row);assert.notEqual(row.sourceSha256,oldDigest);
  const files={[row.sourceInputKey]:oldDigest,[row.inputKey]:row.targetSha256};
  const paths=[row.target,'_versions/'+rev+'/'+row.target]; for(const p of paths)put(root,p,data);
  put(root,'inkwave-build.json',JSON.stringify({build:{revision:rev},files,artifacts:Object.fromEntries(paths.map(p=>[p,sha(data)]))}));
  assert.throws(()=>verifyMappedReference(repo,row.source,row.ref,root),/input manifest mismatch/);
 });
});

test('aggregate native registry admits only its reviewed prebuilt descriptor target, not the primary body', () => fixture(root => {
 const row=SOURCE_SITE_REFERENCES.find(r=>r.target==='patches/native-stages/runtime/registry.mjs');
 assert.equal(row.targetSha256,'5eaa9132beca15ac3e5ba9ea9769258bce73bc295ee5331e757465836e1495f1');
 const current=fs.readFileSync(path.join(repo,row.target),'utf8');
 const addition="nativeStageBuild.prebuilt?.stages?.[s.id]?'変換済みの原典モデルを読み込みます。物理・ルール配置は検証中。':";
 assert.equal(current.split(addition).length,2);
 const primary=current.replace(addition,'');
 assert.equal(sha(primary),'bec89cade19764800de9bf5abd781c488c3e204e42f9033f58515646b051039b');
 put(root,row.source,fs.readFileSync(path.join(repo,row.source)));put(root,row.target,primary);
 assert.throws(()=>verifyMappedReference(root,row.source,row.ref),/Pinned reference source mismatch/);
 put(root,row.target,current);assert.equal(verifyMappedReference(root,row.source,row.ref).target,row.target);
 const site=path.join(root,'site'),rev='d'.repeat(64),payload=Buffer.from('export {};');
 const paths=[row.target,'_versions/'+rev+'/'+row.target];for(const p of paths)put(site,p,payload);
 const files={[row.sourceInputKey]:row.sourceSha256,[row.inputKey]:sha(primary)};
 const save=()=>put(site,'inkwave-build.json',JSON.stringify({build:{revision:rev},files,artifacts:Object.fromEntries(paths.map(p=>[p,sha(payload)]))}));
 save();assert.throws(()=>verifyMappedReference(root,row.source,row.ref,site),/input manifest mismatch/);
 files[row.inputKey]=row.targetSha256;save();assert.equal(verifyMappedReference(root,row.source,row.ref,site).emittedVerified,true);
}));

test('reviewed native recovery engine exact epoch rejects old and tampered target proofs', () => fixture(root => {
 const row=SOURCE_SITE_REFERENCES.find(r=>r.target==='patches/native-stages/runtime/engine.mjs');
 const reviewed='7bf0190e65a7d84167ebf71c863071142033653c48f402e6b18715505798db26';
 const previous='0e4312862c7e22923d056af96d68a999c6877f9c3551b7434778f7f656e410de';
 assert.equal(row.targetSha256,reviewed);
 const current=fs.readFileSync(path.join(repo,row.target));assert.equal(sha(current),reviewed);
 put(root,row.source,fs.readFileSync(path.join(repo,row.source)));put(root,row.target,current);
 assert.equal(verifyMappedReference(root,row.source,row.ref).target,row.target);
 put(root,row.target,Buffer.concat([current,Buffer.from('\n// unreviewed engine mutation\n')]));
 assert.throws(()=>verifyMappedReference(root,row.source,row.ref),/Pinned reference source mismatch/);
 put(root,row.target,current);
 const site=path.join(root,'site'),rev='e'.repeat(64),payload=Buffer.from('export {};');
 const paths=[row.target,'_versions/'+rev+'/'+row.target];for(const p of paths)put(site,p,payload);
 const files={[row.sourceInputKey]:row.sourceSha256,[row.inputKey]:reviewed};
 const save=()=>put(site,'inkwave-build.json',JSON.stringify({build:{revision:rev},files,artifacts:Object.fromEntries(paths.map(p=>[p,sha(payload)]))}));
 save();assert.equal(verifyMappedReference(root,row.source,row.ref,site).emittedVerified,true);
 files[row.inputKey]=previous;save();assert.throws(()=>verifyMappedReference(root,row.source,row.ref,site),/input manifest mismatch/);
 files[row.inputKey]=reviewed;save();
 for(const p of paths){put(site,p,'tampered');assert.throws(()=>verifyMappedReference(root,row.source,row.ref,site),/artifact mismatch/);put(site,p,payload);}
 assert.equal(verifyMappedReference(root,row.source,row.ref,site).emittedVerified,true);
}));

// Legacy navigation preparation is now sliced; its native engine edge is unchanged.
// Admit only that reviewed owner epoch, never the prior synchronous source proof.
test('sliced navigation owner rejects its previous pin and unreviewed source bytes', () => fixture(root => {
 const row=SOURCE_SITE_REFERENCES.find(r=>r.source==='inkwave-public/src/game/nav.js');
 const reviewed='4b38ce452c58b1ec60660cb90660603a4a156e2ce58a9d76f013135fa3ebe151';
 const previous='c2a2920e677fd69c6c11848881ffafda90bdd9ff2ba8662579713e5944fceb6a';
 assert.equal(row.sourceSha256,reviewed);
 const current=fs.readFileSync(path.join(repo,row.source));assert.equal(sha(current),reviewed);
 assert.match(current.toString(),/import \{ runBuildSlices \} from '\.\.\/core\/buildSlices\.js'/);
 put(root,row.source,current);put(root,row.target,fs.readFileSync(path.join(repo,row.target)));
 copyClosure(root,'src/core/buildSlices.js','inkwave-public/src/core/buildSlices.js');
 assert.equal(fs.lstatSync(path.join(root,'inkwave-public/src/core/buildSlices.js')).isFile(),true);
 assert.equal(verifyMappedReference(root,row.source,row.ref).target,row.target);
 put(root,row.source,Buffer.concat([current,Buffer.from('\n// unreviewed navigation mutation\n')]));
 assert.throws(()=>verifyMappedReference(root,row.source,row.ref),/Pinned reference source mismatch/);
 put(root,row.source,current);
 const site=path.join(root,'site'),rev='f'.repeat(64),payload=Buffer.from('export {};');
 const paths=[row.target,'_versions/'+rev+'/'+row.target];for(const p of paths)put(site,p,payload);
 const files={[row.sourceInputKey]:reviewed,[row.inputKey]:row.targetSha256};
 const save=()=>put(site,'inkwave-build.json',JSON.stringify({build:{revision:rev},files,artifacts:Object.fromEntries(paths.map(p=>[p,sha(payload)]))}));
 save();assert.equal(verifyMappedReference(root,row.source,row.ref,site).emittedVerified,true);
 files[row.sourceInputKey]=previous;save();assert.throws(()=>verifyMappedReference(root,row.source,row.ref,site),/input manifest mismatch/);
 files[row.sourceInputKey]=reviewed;save();
 assert.equal(verifyMappedReference(root,row.source,row.ref,site).emittedVerified,true);
}));
