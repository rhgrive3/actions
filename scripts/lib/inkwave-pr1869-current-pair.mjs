import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const BASE='7f863ea2d65671abd1453fdae1b61de00f1d10e2';
export const BASE_TREE='599b4be71f691e5faea575747329f4e02ce59dea';
export const REVIEWED='890e0ef8ab32238624b6ffff8069e2c9e3515dd6';
export const REVIEWED_TREE='66fb79e6857848e2443e14773d7ebcd91e8cd8bb';
export const BRANCH='fix/inkwave-ci-composed-regressions-20261024';
export const INPUT_KEYS_SHA256='b998b269a0171118c898da7b60baddf7509900125d8754e2158e8252748f57e3';
export const CONTROL_PATHS=Object.freeze([
 '.github/workflows/inkwave-projectile-visuals.yml',
 'patches/network-replication/tests/issue-1033-handoff-hit.test.mjs',
 'patches/splatoon3/tests/ranked-rainmaker-peer-compat.qa.mjs',
 'scripts/benchmark-aplus-verification.mjs',
 'scripts/check-inkwave-idle-resources.mjs',
 'scripts/check-inkwave-projectile-visuals.mjs',
 'scripts/check-inkwave-range.mjs',
 'scripts/lib/inkwave-pr1869-current-pair.mjs',
 'scripts/fixtures/inkwave-historical-05eb-1862-leaves.json',
 'scripts/tests/continuous-browser-video.test.mjs',
 'scripts/tests/inkwave-23pr-paint-source-pair.test.mjs',
 'scripts/tests/inkwave-31pr-paint-source-pair.test.mjs',
 'scripts/tests/inkwave-ci-source-admission.test.mjs',
 'scripts/tests/inkwave-pr1869-current-pair.test.mjs',
 'scripts/tests/inkwave-pr1869-workflow-route.test.mjs',
 'scripts/tests/inkwave-reef-splash-workflow-registration.test.mjs',
 'scripts/tests/inkwave-results-work-progress.test.mjs',
 'scripts/tests/inkwave-streamed-music-diagnostics.test.mjs',
 'scripts/verify-inkwave-pr1869-current-pair.mjs',
]);
export const PAINT_PATHS=Object.freeze([
 'patches/network-replication/adapter.mjs','patches/network-replication/slosher-paint-admission.mjs',
 'patches/splatoon3/main-ink-footprint-adapter.mjs','patches/splatoon3/runtime/blaster-flight-paint.mjs',
 'patches/splatoon3/runtime/main-ink-footprints.mjs','patches/splatoon3/runtime/main-weapon-catalog.mjs',
 'patches/splatoon3/runtime/paint-packet-codec.mjs','patches/splatoon3/runtime/slosher-intermediate-paint.mjs',
 'patches/splatoon3/runtime/slosher-nearest-paint.mjs','patches/splatoon3/runtime/weapon-edgecases.mjs',
 'patches/splatoon3/runtime/weapons-fidelity.mjs','scripts/inkwave-source-composition.mjs','scripts/lib/inkwave-build-only-modules.mjs',
]);
const ROOTS=['inkwave-public','patches/splatoon3','patches/touch-layout','patches/reliability','patches/local-quality','patches/network-replication','patches/practice-range','patches/native-stages','patches/loading-cache','server'];
const PREFIXES={'upstream/':'inkwave-public/','patch/':'patches/splatoon3/','touch-layout/':'patches/touch-layout/','reliability/':'patches/reliability/','local-quality/':'patches/local-quality/','network-replication/':'patches/network-replication/','practice-range/':'patches/practice-range/','native-stages/':'patches/native-stages/','loading-cache/':'patches/loading-cache/','build-script/':'scripts/'};
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
const ordered=rows=>[...rows].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const safeRelative=rel=>typeof rel==='string'&&rel.length>0&&!path.isAbsolute(rel)&&!rel.includes('\\')&&!rel.includes('\0')&&!rel.split('/').some(p=>!p||p==='.'||p==='..');
export function git(root,args){
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1'});
 return execFileSync('git',['-C',root,...args],{env,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
}
export function readTree(root,commit){
 assert.match(commit,/^[0-9a-f]{40}$/);assert.equal(git(root,['rev-parse','--verify',commit+'^{commit}']).trim(),commit);
 const rows=git(root,['ls-tree','-r','-z','--full-tree',commit]).split('\0').filter(Boolean).map(line=>{
  const m=/^(\d+) (blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);assert(m,'valid full Git tree row');assert(safeRelative(m[4]),'safe Git source path');
  return {path:m[4],mode:m[1],type:m[2],sha:m[3]};
 });
 assert.equal(new Set(rows.map(r=>r.path)).size,rows.length,'unique full tree paths');
 return {commit,tree:git(root,['rev-parse',commit+'^{tree}']).trim(),rows:ordered(rows)};
}
export function selectRoute(event,eventName,repository){
 assert.equal(eventName,'pull_request','PR1869 requires pull_request');assert.equal(repository,'rhgrive3/actions');assert.equal(event?.repository?.full_name,repository);
 const pr=event?.pull_request;assert(pr);assert.equal(event.number,1869);assert.equal(pr.number,1869);
 assert.equal(pr.base?.repo?.full_name,repository);assert.equal(pr.head?.repo?.full_name,repository);
 assert.equal(pr.base.ref,'main');assert.equal(pr.head.ref,BRANCH);assert.equal(pr.base.sha,BASE);
 assert.match(pr.head.sha??'',/^[0-9a-f]{40}$/);assert.notEqual(pr.head.sha,BASE);
 return {repository,pr:1869,branch:BRANCH,base:BASE,head:pr.head.sha};
}
// Public PR1869 preserves the benchmark as 100644, unlike reviewed890's
// executable mode. This exact one-path mode is pinned; no chmod is allowed.
export function assertReviewedTree(reviewed,actual){
 const r=new Map(reviewed.map(x=>[x.path,x])),a=new Map(actual.map(x=>[x.path,x]));
 assert.equal(r.size,reviewed.length);assert.equal(a.size,actual.length);
 for(const p of CONTROL_PATHS)assert(a.has(p),'every closed QA control must exist: '+p);
 for(const p of new Set([...r.keys(),...a.keys()])){
  if(!CONTROL_PATHS.includes(p))assert.deepEqual(a.get(p),r.get(p),'unreviewed tree delta: '+p);
  else {assert(a.has(p),'control input cannot be deleted: '+p);assert.equal(a.get(p).type,'blob');assert.equal(a.get(p).mode,p==='scripts/benchmark-aplus-verification.mjs'?'100644':r.get(p)?.mode??'100644','control mode: '+p);}
 }
}
export function selectedInput(rel){
 if(rel==='package.json')return true;
 if(CONTROL_PATHS.includes(rel)||(/^\.github\/workflows\/[^/]+\.ya?ml$/).test(rel))return true;
 if(rel.startsWith('scripts/')&&/\.(?:mjs|js)$/.test(rel))return true;
 const root=ROOTS.find(r=>rel.startsWith(r+'/'));if(!root)return false;
 const local=rel.slice(root.length+1);
 if(root==='inkwave-public'||(root==='patches/loading-cache'&&local.startsWith('runtime/')))return true;
 return !local.startsWith('tests/')&&!local.endsWith('.md');
}
function actualFile(root,rel){
 assert(safeRelative(rel),'safe source input path');let p=root;
 for(const part of rel.split('/')){p=path.join(p,part);assert(!fs.lstatSync(p).isSymbolicLink(),'source symlink: '+rel);}
 const stat=fs.statSync(p);assert(stat.isFile(),'regular source input: '+rel);const bytes=fs.readFileSync(p);
 return {path:rel,mode:stat.mode&0o111?'100755':'100644',type:'blob',sha:blob(bytes),sha256:hash(bytes)};
}
export function scanInputs(root,treeRows){
 for(const rel of ['package-lock.json','npm-shrinkwrap.json','.npmrc']){
  let stat;try{stat=fs.lstatSync(path.join(root,rel));}catch(error){if(error.code!=='ENOENT')throw error;}
  assert(!stat,'unexpected root install configuration: '+rel);
 }
 const found=[];
 const visit=rel=>{
  const file=path.join(root,rel),stat=fs.lstatSync(file);
  assert(!stat.isSymbolicLink(),'untracked/source symlink: '+rel);
  if(stat.isDirectory()){
   if(ROOTS.some(r=>r!=='inkwave-public'&&rel===r+'/tests')&&!CONTROL_PATHS.some(p=>p.startsWith(rel+'/')))return;
   for(const name of fs.readdirSync(file).sort())visit(rel+'/'+name);
  }else if(selectedInput(rel)){found.push(actualFile(root,rel));}
 };
 for(const rel of [...ROOTS,'scripts','.github/workflows','package.json'])if(fs.existsSync(path.join(root,rel)))visit(rel);
 const actual=ordered(found),expected=treeRows.filter(r=>selectedInput(r.path));
 assert.deepEqual(actual.map(({sha256,...row})=>row),expected,'physical consumed-source inventory must equal committed paths, modes and blobs');
 return actual;
}
function authenticateTracked(root,treeRows){
 const index=git(root,['ls-files','--stage','-z']).split('\0').filter(Boolean).map(line=>{
  const match=/^(\d{6}) ([0-9a-f]{40}) (\d)\t([\s\S]+)$/.exec(line);assert(match,'valid Git index row');assert.equal(match[3],'0','unmerged index forbidden');assert(safeRelative(match[4]),'safe index path');
  return {path:match[4],mode:match[1],type:match[1]==='160000'?'commit':'blob',sha:match[2]};
 });
 assert.deepEqual(ordered(index),treeRows,'index must equal declared committed tree; staged changes forbidden');
 const flags=new Map();for(const line of git(root,['ls-files','-v','-z']).split('\0').filter(Boolean)){
  assert.equal(line[1],' ');const rel=line.slice(2);assert(safeRelative(rel),'safe index flag path');assert(!flags.has(rel),'duplicate index flag');flags.set(rel,line[0]);
 }
 assert.equal(flags.size,treeRows.length,'one flag per committed leaf');
 const present=[],omitted=[];
 for(const row of treeRows){
  assert.equal(row.type,'blob','unsupported tracked gitlink');let actual;
  try{actual=actualFile(root,row.path);}catch(error){
   if(error.code!=='ENOENT')throw error;
   assert(!selectedInput(row.path),'consumed source cannot be sparse');
   assert.equal(flags.get(row.path)?.toUpperCase(),'S','missing ordinary tracked leaf is a deletion');omitted.push(row);continue;
  }
  const {sha256,...identity}=actual;assert.deepEqual(identity,row,'present tracked leaf must match committed bytes and mode: '+row.path);present.push(actual);
 }
 return {present:ordered(present),omitted:ordered(omitted)};
}
export function readCheckout(root,commit){
 root=fs.realpathSync(root);
 assert.equal(fs.realpathSync(git(root,['rev-parse','--show-toplevel']).trim()),root,'actual Git worktree root');
 assert.equal(git(root,['rev-parse','HEAD^{commit}']).trim(),commit,'event commit must equal checkout HEAD');
 const tree=readTree(root,commit),tracked=authenticateTracked(root,tree.rows),inputs=scanInputs(root,tree.rows);
 assert.deepEqual(authenticateTracked(root,tree.rows),tracked,'tracked physical and sparse inventories stable while scanning');
 assert.deepEqual(readTree(root,commit),tree,'source tree stable while scanning');
 return {root,...tree,tracked,inputs};
}
const sideReceipt=s=>({commit:s.commit,tree:s.tree,fullTreeLeaves:s.rows.length,fullTreeSha256:hash(JSON.stringify(s.rows)),physicalInputLeaves:s.inputs.length,physicalInputSha256:hash(JSON.stringify(s.inputs)),trackedPhysicalLeaves:s.tracked.present.length,trackedPhysicalSha256:hash(JSON.stringify(s.tracked.present)),sparseMetadataOnlyLeaves:s.tracked.omitted.length,sparseMetadataOnlySha256:hash(JSON.stringify(s.tracked.omitted))});
export function verifySourcePair({baseline,candidate,event,eventName,repository}){
 const route=selectRoute(event,eventName,repository);
 baseline=fs.realpathSync(baseline);candidate=fs.realpathSync(candidate);assert.notEqual(baseline,candidate,'separate base and candidate checkouts');
 assert(baseline===path.join(candidate,'.ci-baseline')||(!baseline.startsWith(candidate+path.sep)&&!candidate.startsWith(baseline+path.sep)),'separate roots or exact .ci-baseline nesting required');
 const base=readCheckout(baseline,BASE),head=readCheckout(candidate,route.head),reviewed=readTree(candidate,REVIEWED);
 assert.equal(base.tree,BASE_TREE,'pinned actual base full tree');assert.equal(reviewed.tree,REVIEWED_TREE,'pinned reviewed production full tree');
 assertReviewedTree(reviewed.rows,head.rows);
 const bm=new Map(base.rows.map(x=>[x.path,x])),hm=new Map(head.rows.map(x=>[x.path,x]));
 for(const rel of PAINT_PATHS){assert(bm.has(rel),'paint leaf exists');assert.deepEqual(hm.get(rel),bm.get(rel),'paint leaf cannot change or replay: '+rel);}
 assert.deepEqual(readCheckout(baseline,BASE),base,'baseline unchanged during admission');
 assert.deepEqual(readCheckout(candidate,route.head),head,'candidate unchanged during admission');
 return {schema:1,mode:'pr1869-reviewed-current-no-replay',route,reviewedCommit:REVIEWED,reviewedTree:REVIEWED_TREE,
  baseline:sideReceipt(base),candidate:sideReceipt(head),paintPaths:[...PAINT_PATHS],changes:[],writtenPaths:[],
  scope:'Actual pinned base and reviewed current production are preserved without paint, birth, pool or pose replay. Physical source/build inputs are authenticated separately from complete Git metadata.',
  limitation:'Source integrity only. Production is not claimed equal across sides; both native captures and physical/image comparison remain mandatory.'};
}
export function assertSourceReceipt(receipt,actual){assert.deepEqual(receipt,actual,'missing, stale or forged source admission receipt');}
function safeOutputFile(root,rel){
 assert(safeRelative(rel),'safe artifact path');let p=root;
 for(const part of rel.split('/')){p=path.join(p,part);assert(!fs.lstatSync(p).isSymbolicLink(),'artifact symlink: '+rel);}
 assert(fs.statSync(p).isFile(),'regular artifact: '+rel);return p;
}
export function verifyBuildInventory({root,commit,site,inputKeysSha256=INPUT_KEYS_SHA256}){
 root=fs.realpathSync(root);site=fs.realpathSync(site);
 assert.notEqual(site,root);assert(!root.startsWith(site+path.sep),'build cannot contain source');
 const source=readCheckout(root,commit),rows=new Map(source.rows.map(r=>[r.path,r]));
 const raw=fs.readFileSync(safeOutputFile(site,'inkwave-build.json'));
 const manifest=JSON.parse(raw);assert.equal(manifest.schema,1);
 for(const key of ['files','artifacts'])assert(manifest[key]&&typeof manifest[key]==='object'&&!Array.isArray(manifest[key]));
 assert.equal(hash(JSON.stringify(manifest.files)),manifest.inputHash,'input manifest hash');
 assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash,'artifact manifest hash');
 assert.equal(hash(JSON.stringify(Object.keys(manifest.files).sort())),inputKeysSha256,'complete authenticated build input keyset');
 const inputRows=[];
 for(const [key,value]of Object.entries(manifest.files)){
  assert.match(value,/^[0-9a-f]{64}$/);const prefix=Object.keys(PREFIXES).find(p=>key.startsWith(p));assert(prefix,'known input prefix');
  const rel=PREFIXES[prefix]+key.slice(prefix.length);assert(safeRelative(rel),'safe mapped input');
  const actual=actualFile(root,rel),expected=rows.get(rel);assert(expected,'build input committed');
  assert.equal(actual.sha,expected.sha,'input committed blob: '+rel);assert.equal(actual.mode,expected.mode,'input committed mode: '+rel);assert.equal(expected.type,'blob');
  assert.equal(actual.sha256,value,'build input bytes: '+rel);inputRows.push({key,path:rel,sha256:value});
 }
 const builder=actualFile(root,'scripts/build-inkwave.mjs');assert.equal(builder.sha,rows.get(builder.path)?.sha);assert.equal(manifest.build?.script,builder.sha256,'actual builder identity');
 assert.equal(manifest.build?.optimization,'esbuild-minify','normal production build only');
 assert.equal(manifest.build?.esbuild,'0.28.2','pinned production minifier');
 assert.match(manifest.build?.revision ?? '', /^[0-9a-f]{64}$/, 'immutable build revision');
 assert(!manifest.build?.account,'unreviewed account build override');assert.equal(hash(JSON.stringify(manifest.build?.nativeStages)),'ac6368df84129ddbc51d128ba003b29462839c6c17aa6a51199328eef84ec6fb','exact reviewed browser-direct native configuration; no external asset override');
 const artifacts=[];
 const visit=(dir,rel='')=>{for(const name of fs.readdirSync(dir).sort()){
  const p=path.join(dir,name),r=rel?rel+'/'+name:name,st=fs.lstatSync(p);assert(!st.isSymbolicLink(),'output symlink');
  if(st.isDirectory())visit(p,r);else{assert(st.isFile());if(r!=='inkwave-build.json')artifacts.push(r);}
 }};
 visit(site);assert.deepEqual(artifacts.sort(),Object.keys(manifest.artifacts).sort(),'complete output inventory');
 for(const [rel,expected]of Object.entries(manifest.artifacts)){assert.match(expected,/^[0-9a-f]{64}$/);assert.equal(hash(fs.readFileSync(safeOutputFile(site,rel))),expected,'actual built artifact: '+rel);}
 assert.deepEqual(readCheckout(root,commit),source,'source unchanged by output verification');
 assert.equal(fs.readFileSync(path.join(site,'inkwave-build.json')).compare(raw),0,'build manifest stable');
 return {source:sideReceipt(source),manifestSha256:hash(raw),inputHash:manifest.inputHash,contentHash:manifest.contentHash,revision:manifest.build.revision,inputLeaves:inputRows.length,artifactLeaves:artifacts.length,writtenPaths:[]};
}
function physicalFuture(file){
 const absolute=path.resolve(file);let stat;try{stat=fs.lstatSync(absolute);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(stat){assert(!stat.isSymbolicLink(),'receipt must not traverse symlinks');return fs.realpathSync(absolute);}
 const parent=path.dirname(absolute);assert.notEqual(parent,absolute,'resolvable output parent');return path.join(physicalFuture(parent),path.basename(absolute));
}
export function assertReceiptOutside(file,roots,eventFile){
 const absolute=path.resolve(file),resolved=physicalFuture(absolute);
 assert.equal(absolute,resolved,'receipt must not traverse symlinks');
 for(const root of roots.map(r=>fs.realpathSync(r)))assert(resolved!==root&&!resolved.startsWith(root+path.sep),'receipt outside protected checkout');
 if(eventFile)assert.notEqual(resolved,fs.realpathSync(eventFile),'receipt cannot replace event');
 if(fs.existsSync(absolute))assert(fs.lstatSync(absolute).isFile()&&!fs.lstatSync(absolute).isSymbolicLink(),'regular receipt file');
 return absolute;
}
export function writeReceipt(file,value){
 const data=JSON.stringify(value,null,2)+'\n';
 if(fs.existsSync(file)){assert.equal(fs.readFileSync(file,'utf8'),data,'existing receipt must be identical');return;}
 fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.pending-'+process.pid;let created=false;
 try{fs.writeFileSync(tmp,data,{flag:'wx',mode:0o600});created=true;fs.linkSync(tmp,file);}finally{if(created&&fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
