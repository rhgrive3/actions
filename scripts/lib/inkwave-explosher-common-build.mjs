// Final admission is deliberately unset until an independently reviewed real build exists.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
export const ADMISSION_RELEASE_ENABLED=true;
const descriptorUrl=new URL('../fixtures/explosher-common-build-364dd0.json',import.meta.url);
const descriptorSha256='fc6b60e5ba487acd552383e7b1125bad0aa249828ce2e8f7a35897a56c4916ca';
export const APPROVED_COMMON_BUILD=null;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const blob=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const safe=p=>{assert(typeof p==='string'&&p.length&&!path.isAbsolute(p)&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..'),'Unsafe manifest path');return p;};
const read=(root,p)=>fs.readFileSync(path.join(root,safe(p)));
const git=(root,args)=>{const r=spawnSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(r.status,0,'Cannot establish checkout identity');return r.stdout;};
const walk=(root,at='')=>fs.readdirSync(path.join(root,at),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(root,path.posix.join(at,e.name)):[path.posix.join(at,e.name)]);
const inputPath=p=>{const [kind,...rest]=safe(p).split('/');const tail=rest.join('/');assert(tail,'Empty input path');if(kind==='upstream')return'inkwave-public/'+tail;if(kind==='patch')return'patches/splatoon3/'+tail;if(kind==='build-script')return'scripts/'+tail;assert(['touch-layout','reliability','local-quality','network-replication','practice-range','loading-cache','native-stages'].includes(kind),'Unknown input identity namespace');return'patches/'+kind+'/'+tail;};
// Exported for bounded negative tests and independent review, never a capture authorization.
export function inspectCommonBuild({root,site,approval}){
 assert(approval&&approval.schema===1,'No independently approved common build');
 for(const key of ['head','tree'])assert.match(approval[key],/^[a-f0-9]{40}$/);
 for(const key of ['buildIdentitySha256','outputManifestSha256','inputHash','contentHash'])assert.match(approval[key],/^[a-f0-9]{64}$/);
 root=fs.realpathSync(root);site=fs.realpathSync(site);
 assert.equal(git(root,['rev-parse','HEAD']).trim(),approval.head,'Checkout head differs');assert.equal(git(root,['rev-parse','HEAD^{tree}']).trim(),approval.tree,'Checkout tree differs');
 const tree=git(root,['ls-tree','-r','-z','HEAD']).split('\0').filter(Boolean).map(s=>{const i=s.indexOf('\t'),[mode,type,id]=s.slice(0,i).split(' ');return{mode,type,blob:id,path:s.slice(i+1)};});
 assert(tree.length>0);const tracked=new Set();
 for(const f of tree){safe(f.path);assert.equal(f.type,'blob','Submodules not admitted');assert(['100644','100755'].includes(f.mode),'Repository symlinks not admitted');tracked.add(f.path);assert.equal(blob(read(root,f.path)),f.blob,'Checkout body differs: '+f.path);}
 assert.equal(git(root,['status','--porcelain','--untracked-files=all']).trim(),'','Checkout is not clean');
 const sourceWalk=(at='')=>fs.readdirSync(path.join(root,at),{withFileTypes:true}).filter(e=>!(at===''&&['.git','node_modules'].includes(e.name))).flatMap(e=>e.isDirectory()?sourceWalk(path.posix.join(at,e.name)):[path.posix.join(at,e.name)]);
 assert.deepEqual(sourceWalk().sort(),[...tracked].sort(),'Uncommitted or missing checkout inputs, including ignored files');
 // Independently bind all build inputs and exact build script, not just the shape leaf.
 const manifestBytes=read(site,'inkwave-build.json');assert.equal(sha(manifestBytes),approval.buildIdentitySha256,'Build identity differs');const build=JSON.parse(manifestBytes);
 assert.equal(build.schema,1);assert.equal(build.build.esbuild,'0.28.2');assert.equal(build.build.optimization,'esbuild-minify');
 assert.equal(sha(JSON.stringify(build.files)),build.inputHash);assert.equal(build.inputHash,approval.inputHash);
 assert.equal(sha(JSON.stringify(build.artifacts)),build.contentHash);assert.equal(build.contentHash,approval.contentHash);
 assert.equal(sha(read(root,'scripts/build-inkwave.mjs')),build.build.script,'Build script differs');
 for(const[p,h]of Object.entries(build.files)){const rel=inputPath(p);assert(tracked.has(rel),'Build input is not committed: '+rel);assert.equal(sha(read(root,rel)),h,'Build input differs: '+rel);}
 assert.equal(sha(JSON.stringify(approval.outputManifest)),approval.outputManifestSha256,'Output manifest seal differs');
 const expectedPaths=approval.outputManifest.map(f=>safe(f.path));assert.equal(new Set(expectedPaths).size,expectedPaths.length,'Duplicate output path');assert.deepEqual(walk(site).sort(),[...expectedPaths].sort(),'Full output coverage differs');
 for(const f of approval.outputManifest){const bytes=read(site,f.path);assert.equal(bytes.length,f.bytes,'Output size differs: '+f.path);assert.equal(sha(bytes),f.sha256,'Output differs: '+f.path);}
 for(const[p,h]of Object.entries(build.artifacts))assert.equal(sha(read(site,p)),h,'Build artifact differs: '+p);
 return{schema:1,head:approval.head,tree:approval.tree,buildIdentitySha256:sha(manifestBytes),inputHash:build.inputHash,contentHash:build.contentHash,outputManifestSha256:approval.outputManifestSha256,verifiedSourceFiles:tree.length,verifiedInputs:Object.keys(build.files).length,verifiedOutputs:expectedPaths.length,root,site};
}
export function requireApprovedCommonBuild(root,site){assert(ADMISSION_RELEASE_ENABLED,'Final common build is not independently admitted; native capture forbidden');const bytes=fs.readFileSync(descriptorUrl);assert.equal(sha(bytes),descriptorSha256,'Reviewed descriptor bytes changed');return inspectCommonBuild({root,site,approval:JSON.parse(bytes)});}
