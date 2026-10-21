import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const TARGET = 'patches/splatoon3/runtime/swim-motion.mjs';
export const CURRENT_SHA256 = '1a82a040a09f9a99ed74ce5baffa23bb2f64a22cd902aee8ec8c64c8aeec3b26';
export const REFERENCE_SHA256 = '8a2045310aeded88b76f9cb2ac7a10fc962c018df14cebd5a3b2d9834e700688';
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const git = (root,...args) => execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const once = (source,from,to) => { assert.equal(source.split(from).length-1,1,'exact single rollback anchor'); return source.replace(from,to); };

export function rollbackSwimInitialization(source) {
  assert.equal(hash(source),CURRENT_SHA256,'reviewed current swim input');
  const block = `  const worldQuaternion = pivot.getWorldQuaternion(new THREE.Quaternion());
  // Begin from the mantle that was actually drawn before this owner became
  // eligible. sourceMotion does not maintain the native sqYaw accumulator.
  const headingX = 2 * (worldQuaternion.x * worldQuaternion.y - worldQuaternion.w * worldQuaternion.z);
  const headingZ = 2 * (worldQuaternion.y * worldQuaternion.z + worldQuaternion.w * worldQuaternion.x);
  const yaw = Math.hypot(headingX, headingZ) > 1e-8
    ? Math.atan2(headingX, headingZ) : ch.yaw + ch.sqYaw;
`;
  let result=once(source,block,'');
  result=once(result,'    yaw, bank: ch.sqRoll,','    yaw: ch.yaw + ch.sqYaw, bank: ch.sqRoll,');
  result=once(result,'    worldQuaternion,','    worldQuaternion: pivot.getWorldQuaternion(new THREE.Quaternion()),');
  assert.equal(hash(result),REFERENCE_SHA256,'reviewed counterfactual output');
  return result;
}

export function captureSourceIdentity(root,head,expect) {
  assert.match(head,/^[0-9a-f]{40}$/);assert(['baseline','candidate'].includes(expect));
  root=fs.realpathSync(root);assert.equal(git(root,'rev-parse','HEAD'),head,'exact source checkout');
  const tree=git(root,'rev-parse','HEAD^{tree}'),files={};
  const entries=execFileSync('git',['ls-tree','-rz','--full-tree','HEAD'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  for(const entry of entries){
    const match=/^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(entry);assert(match,'only tracked regular source files are supported');
    const [,mode,expectedGitBlob,rel]=match;assert(!path.isAbsolute(rel)&&!rel.split('/').includes('..'),'tracked path containment');
    const file=path.join(root,rel),stat=fs.lstatSync(file);assert(stat.isFile()&&!stat.isSymbolicLink(),'tracked file is regular');
    assert.equal((stat.mode&0o111)!==0,mode==='100755','tracked executable mode');
    const bytes=fs.readFileSync(file),actualGitBlob=gitBlob(bytes),sha256=hash(bytes);
    if(rel===TARGET){assert.equal(sha256,expect==='baseline'?REFERENCE_SHA256:CURRENT_SHA256,'named target role');if(expect==='candidate')assert.equal(actualGitBlob,expectedGitBlob,'candidate target remains exact');}
    else assert.equal(actualGitBlob,expectedGitBlob,'unchanged tracked source '+rel);
    files[rel]={mode,gitBlob:actualGitBlob,sha256};
  }
  assert(files[TARGET],'tracked target exists');
  return {schema:1,kind:expect==='baseline'?'counterfactual-swim-entry-rollback':'current-source',sourceSha:head,pristineTree:tree,target:TARGET,currentSha256:CURRENT_SHA256,referenceSha256:REFERENCE_SHA256,files,filesHash:hash(JSON.stringify(files))};
}

export function verifyIdentityPair(before,after,head){
  for(const [identity,kind]of [[before,'counterfactual-swim-entry-rollback'],[after,'current-source']]){
    assert.equal(identity?.schema,1);assert.equal(identity.kind,kind);assert.equal(identity.sourceSha,head);assert.match(identity.pristineTree,/^[0-9a-f]{40}$/);
    assert.equal(identity.target,TARGET);assert.equal(identity.currentSha256,CURRENT_SHA256);assert.equal(identity.referenceSha256,REFERENCE_SHA256);
    assert.equal(identity.filesHash,hash(JSON.stringify(identity.files)),'full source receipt content hash');
  }
  assert.equal(before.pristineTree,after.pristineTree);assert.deepEqual(Object.keys(before.files),Object.keys(after.files),'same full tracked source set');
  assert.equal(before.files[TARGET].sha256,REFERENCE_SHA256);assert.equal(after.files[TARGET].sha256,CURRENT_SHA256);assert.equal(before.files[TARGET].mode,after.files[TARGET].mode);
  const a={...before.files},b={...after.files};delete a[TARGET];delete b[TARGET];assert.deepEqual(a,b,'every other tracked source/body/mode remains exact');
  return true;
}

export function prepareReference(root,head,receipt){
  const pristine=captureSourceIdentity(root,head,'candidate'),file=path.join(root,TARGET);
  fs.writeFileSync(file,rollbackSwimInitialization(fs.readFileSync(file,'utf8')));
  const derived=captureSourceIdentity(root,head,'baseline');verifyIdentityPair(derived,pristine,head);
  fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(derived,null,2)+'\n');return derived;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [root,head,receipt]=process.argv.slice(2);assert(root&&head&&receipt,'root exact-head receipt required');
  const result=prepareReference(path.resolve(root),head,path.resolve(receipt));console.log(JSON.stringify({kind:result.kind,sourceSha:result.sourceSha,sourceFiles:Object.keys(result.files).length,filesHash:result.filesHash,target:result.target}));
}
