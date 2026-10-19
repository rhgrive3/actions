import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.env.SQUID_IDENTITY_SOURCE_ROOT||fileURLToPath(new URL('../../../',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
test('each squid build adapter contributes its exact bytes to qualityIdentity and final inputHash',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'squid-identity-'));
 const files=['squid-motion-binding-adapter.mjs','squid-form-ease-adapter.mjs'];
 const originalHashes=files.map(f=>hash(fs.readFileSync(path.join(root,'patches/local-quality',f))));
 try{
  fs.mkdirSync(path.join(temp,'patches'));
  fs.cpSync(path.join(root,'patches/local-quality'),path.join(temp,'patches/local-quality'),{recursive:true});
  for(const entry of fs.readdirSync(path.join(root,'patches'),{withFileTypes:true}))if(entry.name!=='local-quality')fs.symlinkSync(path.join(root,'patches',entry.name),path.join(temp,'patches',entry.name),entry.isDirectory()?'dir':'file');
  const {qualityIdentity}=await import(pathToFileURL(path.join(temp,'patches/local-quality/adapter.mjs')));
  // Execute the actual production manifest merge and final hash statements.
  const build=fs.readFileSync(path.join(root,'scripts/build-inkwave.mjs'),'utf8');
  const merge=build.match(/for \(const \[file, hash\] of Object\.entries\(identity\.build\.quality\)\) identity\.files\['local-quality\/' \+ file\] = hash;/)?.[0];
  const finish=build.match(/identity\.inputHash = sha256\(JSON\.stringify\(identity\.files\)\);/)?.[0];
  assert(merge&&finish,'production identity path must be reviewed if changed');
  const finalize=Function('identity','sha256',merge+'\n'+finish+'\nreturn identity;');
  const receipt=()=>finalize({build:{quality:qualityIdentity()},files:{'upstream/sentinel':'unchanged'}},hash);
  const baseline=receipt();
  if(process.env.INKWAVE_BUILT_SITE){const emitted=JSON.parse(fs.readFileSync(path.join(process.env.INKWAVE_BUILT_SITE,'inkwave-build.json'),'utf8'));for(const[name,i]of files.map((name,i)=>[name,i])){assert.equal(emitted.build.quality[name],originalHashes[i],'emitted quality hash matches '+name);assert.equal(emitted.files['local-quality/'+name],originalHashes[i],'emitted input map matches '+name);}assert.equal(emitted.inputHash,hash(JSON.stringify(emitted.files)),'emitted final inputHash verifies');}
  for(const[name,i]of files.map((name,i)=>[name,i])){
   const p=path.join(temp,'patches/local-quality',name),before=fs.readFileSync(p);
   assert.equal(baseline.build.quality[name],originalHashes[i],'exact authored adapter hash');
   assert.equal(baseline.files['local-quality/'+name],originalHashes[i],'adapter enters final input map');
   try{fs.appendFileSync(p,'\n// isolated identity mutation\n');const changed=receipt();assert.equal(changed.files['local-quality/'+name],hash(fs.readFileSync(p)));assert.notEqual(changed.inputHash,baseline.inputHash,'changing '+name+' changes inputHash');const other=files[1-i];assert.equal(changed.files['local-quality/'+other],baseline.files['local-quality/'+other]);}
   finally{fs.writeFileSync(p,before);}
   assert.deepEqual(receipt(),baseline,'restoring '+name+' restores the entire identity');
  }
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 for(const[name,i]of files.map((name,i)=>[name,i]))assert.equal(hash(fs.readFileSync(path.join(root,'patches/local-quality',name))),originalHashes[i],'real checkout never mutated');
});
