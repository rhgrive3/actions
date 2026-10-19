import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const TARGET = 'patches/local-quality/squid-motion-binding-adapter.mjs';
export const CURRENT_SHA256 = '6e4d8b6683bbdfeff1078b581373f11e04df35a8411cec7f01062349f36780ca';
export const REFERENCE_SHA256 = 'd4739dfd7dc628917adedf0a90be95dbc65e4788671b9e8595572b9b544afa5e';
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const git = (root,...args) => execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const once = (source,from,to) => { assert.equal(source.split(from).length-1,1,'exact single rollback anchor'); return source.replace(from,to); };

export function rollbackHeadingFix(source) {
  assert.equal(hash(source),CURRENT_SHA256,'reviewed current heading input');
  const result=once(source,"  if(rel==='src/game/motion/source-controller.js'){\n   code=replaceOnce(code,'if(nextKid!==this.formKid){','if(nextKid!==this.formKid){if(!nextKid)this.squidTravelYaw=undefined;','reset squid travel heading on a new dive');\n   code=replaceOnce(code,'if(teleport){this.pivotWeight=0;','if(teleport){this.squidTravelYaw=undefined;this.pivotWeight=0;','reset squid travel heading after teleport');\n   return replaceOnce(code,\"  const wantedYaw=this.speed>1e-5?Math.atan2(this.localX,this.localZ):this.squidYaw;this.squidYaw+=(mod(wantedYaw-this.squidYaw+Math.PI,2*Math.PI)-Math.PI)*(1-Math.exp(-16*dt));\",`  // The Actor root turns toward input independently of its current velocity.\n  // Smooth squid travel in the scene frame, then convert to the current root\n  // frame. Filtering old local headings while that frame turns double-counts\n  // the turn and can point the mantle past its direction of travel.\n  if(!this.manual){\n   const rootYaw=this.character.root.rotation.y;\n   if(!Number.isFinite(this.squidTravelYaw))this.squidTravelYaw=rootYaw;\n   // Retain the existing source tracker's sub-centimeter noise confidence.\n   const confidence=clamp((this.speed-.06)/.30,0,1);\n   if(confidence>0){\n    const move=s.localMove||{};\n    const wantedYaw=this.treadmill?rootYaw+Math.atan2(-(move.x||0),move.z||0):Math.atan2(this.motionVX,this.motionVZ);\n    this.squidTravelYaw+=(mod(wantedYaw-this.squidTravelYaw+Math.PI,2*Math.PI)-Math.PI)*(1-Math.exp(-16*dt*confidence));\n   }\n   this.squidTravelYaw=mod(this.squidTravelYaw+Math.PI,2*Math.PI)-Math.PI;\n   this.squidYaw=mod(this.squidTravelYaw-rootYaw+Math.PI,2*Math.PI)-Math.PI;\n  }else{\n   const wantedYaw=this.speed>1e-5?Math.atan2(this.localX,this.localZ):this.squidYaw;this.squidYaw+=(mod(wantedYaw-this.squidYaw+Math.PI,2*Math.PI)-Math.PI)*(1-Math.exp(-16*dt));\n  }`,'squid travel heading uses one scene frame');\n  }\n",'');
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
  return {schema:1,kind:expect==='baseline'?'counterfactual-heading-rollback':'current-source',sourceSha:head,pristineTree:tree,target:TARGET,currentSha256:CURRENT_SHA256,referenceSha256:REFERENCE_SHA256,files,filesHash:hash(JSON.stringify(files))};
}

export function verifyIdentityPair(before,after,head){
  for(const [identity,kind]of [[before,'counterfactual-heading-rollback'],[after,'current-source']]){
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
  fs.writeFileSync(file,rollbackHeadingFix(fs.readFileSync(file,'utf8')));
  const derived=captureSourceIdentity(root,head,'baseline');verifyIdentityPair(derived,pristine,head);
  fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(derived,null,2)+'\n');return derived;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [root,head,receipt]=process.argv.slice(2);assert(root&&head&&receipt,'root exact-head receipt required');
  const result=prepareReference(path.resolve(root),head,path.resolve(receipt));console.log(JSON.stringify({kind:result.kind,sourceSha:result.sourceSha,sourceFiles:Object.keys(result.files).length,filesHash:result.filesHash,target:result.target}));
}
