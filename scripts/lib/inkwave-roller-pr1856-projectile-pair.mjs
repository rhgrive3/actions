import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {readCurrentPairGitTree,scanCurrentPairProduction,CURRENT_PAIR_FIXTURE_SHA256} from './inkwave-projectile-current-pair.mjs';
import {planCharacterPoseBaseline} from './inkwave-character-pose-baseline.mjs';
import {ROLLER_PR1856_POSE_PAIR} from './inkwave-roller-pr1856-pose-pair.mjs';

export const ROLLER_PROJECTILE_MODE='roller-pr1856-main3003-exact-production-pair';
export const ROLLER_PROJECTILE_BASE='3003088e7d3da6e3b41829a96714698a348b555b';
export const ROLLER_PROJECTILE_SOURCE='2b103150d808c623c39268d6aa1833b3075d3a7c';
export const ROLLER_PROJECTILE_FIXTURE_SHA256='280c971bbbb832b8ef255508fb3866a3299bdb583ba7350668a687bfa15df0dc';
// Identity checks assume this verifier and its dependencies stay at the exact
// independently reviewed bytes. Its own body is not an independent trust root:
// a candidate-controlled workflow/checker can replace itself. No future sibling
// is preapproved by this current-code source admission.
const reviewedQABlobs=Object.freeze({
 '.github/workflows/inkwave-projectile-visuals.yml':'d6823643c8e6668496a01ff5e3baad3a22d0ec1b',
 'scripts/fixtures/inkwave-roller-pr1856-main3003-inputs.json.gz':'cadf8c4a9597974bab4f5c4da345563ee1dda5a7',
 'scripts/tests/inkwave-roller-pr1856-projectile-pair.test.mjs':'92b639381f6acb7e42faee08ff46d34ebf5bbada',
 'scripts/tests/inkwave-ci-source-admission.test.mjs':'d66e26571e628e0e34da1543920668b0d07f1136',
 'scripts/verify-inkwave-roller-pr1856-projectile-pair.mjs':'dc37404888028cb89c8596b6dc5aeb578fe45413',
 'scripts/lib/inkwave-projectile-current-pair.mjs':'0949cc14d85cf5ab78fb187377cb3c6948606b3f',
 'scripts/fixtures/inkwave-projectile-current-pair-20261023.json.gz':'23d7e88913114ce013423b80ffd2a4ae58616f65',
});
export const ROLLER_QA_IDENTITY='RH grive <hataritu7@gmail.com> 1792798310 +0000';
export const ROLLER_QA_MESSAGE='Admit exact Roller1856 main3003 projectile source pair';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const objectHash=(type,bytes)=>createHash('sha1').update(type+' '+bytes.length+'\0').update(bytes).digest('hex');
const packed=fs.readFileSync(new URL('../fixtures/inkwave-roller-pr1856-main3003-inputs.json.gz',import.meta.url));
assert.equal(digest(packed),ROLLER_PROJECTILE_FIXTURE_SHA256,'reviewed Roller main3003 input fixture');
const manifest=JSON.parse(gunzipSync(packed));
assert.equal(CURRENT_PAIR_FIXTURE_SHA256,'adf375e9e5a53d3f7ea0724d296a4b201c68edbfc6aea44291617a7d9de20ad9','fixed shared copy-scope fixture');
assert.equal(manifest.baseline.commit,ROLLER_PROJECTILE_BASE);
assert.equal(manifest.candidate.commit,ROLLER_PROJECTILE_SOURCE);
assert.equal(manifest.baseline.leaves.length,1459);
assert.equal(manifest.candidate.leaves.length,1460);
assert.equal(manifest.savedCandidateBuild.canonicalInputs.length,1422);
const production=new Map(manifest.candidate.leaves.map(row=>[row.path,row]));
for(const row of manifest.savedCandidateBuild.canonicalInputs)assert.equal(production.get(row.path)?.sha256,row.sha256,row.path+': saved canonical input closure');
assert.deepEqual(manifest.changedProductionPaths,Object.keys(ROLLER_PR1856_POSE_PAIR.paths).filter(p=>ROLLER_PR1856_POSE_PAIR.paths[p].baseline!==ROLLER_PR1856_POSE_PAIR.paths[p].candidate).sort());
const sorted=rows=>[...rows].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
export const rollerProjectileManifest=()=>structuredClone(manifest);

export function assertRollerNormalBuildProfile(env=process.env){
 for(const name of ['INKWAVE_ACCOUNT_BUILD','INKWAVE_NATIVE_STAGE_ASSETS','ESBUILD_MODULE','ESBUILD_BINARY_PATH'])
  assert.ok(!env[name],name+': unsupported external build input in normal Roller profile');
 for(const name of ['INKWAVE_BUILD_UNMINIFIED','INKWAVE_NO_THREE_SHAKE'])
  assert.notEqual(env[name],'1',name+': normal minified build profile required');
 assert.ok(!env.INKWAVE_BUILD_TRANSFORM_CONCURRENCY||env.INKWAVE_BUILD_TRANSFORM_CONCURRENCY==='4','normal build transform concurrency');
 return {optimization:'esbuild-minify',threeShake:true,accountBuild:null,nativeStageMode:'browser-direct',transformConcurrency:4};
}

export function assertRollerEvent(event,eventName,baseSha,candidateSha){
 assert.equal(eventName,'pull_request','Roller admission requires actual pull_request event');
 assert.equal(event.repository?.full_name,'rhgrive3/actions','Roller event repository');
 const pr=event.pull_request;
 assert.equal(pr?.number,1856,'Roller event PR number');
 assert.equal(pr.base?.ref,'main','Roller event base ref');
 assert.equal(pr.base?.sha,ROLLER_PROJECTILE_BASE,'Roller event exact main3003 base');
 assert.equal(pr.head?.ref,'fix/roller-vertical-recovery-20261023','Roller event owned head ref');
 assert.equal(pr.head?.repo?.full_name,'rhgrive3/actions','Roller event owned head repository');
 assert.equal(baseSha,ROLLER_PROJECTILE_BASE,'Roller declared exact main3003 base');
 assert.match(candidateSha??'',/^[0-9a-f]{40}$/,'Roller immutable actual candidate required');
 assert.equal(pr.head.sha,candidateSha,'Roller event head must equal declared actual candidate');
}

export function assertRollerProductionRows(rows,side,hashes=true){
 assert.ok(side==='baseline'||side==='candidate','known Roller inventory side');
 const expected=manifest[side].leaves,actual=sorted(rows);
 assert.equal(actual.length,expected.length,side+': complete production inventory length');
 for(let i=0;i<expected.length;i++){
  const e=expected[i],a=actual[i];
  assert.equal(a.path,e.path,side+': complete production inventory paths');
  for(const key of hashes?['mode','sha','sha256']:['mode','sha'])assert.equal(a[key],e[key],e.path+': pinned '+key);
 }
}

// Under the unchanged reviewed verifier, retain the fixed source pair and
// exactly the reviewed QA child. This is not protection against checker replacement.
export function assertRollerCandidateRevision({head,parents,changedPaths}){
 if(head===ROLLER_PROJECTILE_SOURCE){assert.deepEqual(changedPaths,[]);return;}
 assert.deepEqual(parents,[ROLLER_PROJECTILE_SOURCE],'Roller candidate must be the immediate QA-only child of2b103');
 assert.deepEqual([...changedPaths].sort(),[...manifest.qaPaths].sort(),'Roller QA successor has exactly the reviewed eight QA paths');
}

export function rollerFrozenCommit(tree){
 assert.match(tree,/^[0-9a-f]{40}$/,'frozen QA tree SHA');
 const raw='tree '+tree+'\nparent '+ROLLER_PROJECTILE_SOURCE+'\nauthor '+ROLLER_QA_IDENTITY+'\ncommitter '+ROLLER_QA_IDENTITY+'\n\n'+ROLLER_QA_MESSAGE+'\n';
 return {tree,raw,commit:objectHash('commit',Buffer.from(raw))};
}
export function assertRollerFrozenRevision({head,tree,raw},expected){
 assert.equal(tree,expected.tree,'exact frozen Roller QA tree');
 assert.equal(head,expected.commit,'only the one frozen Roller QA successor is admitted');
 assert.equal(raw,expected.raw,'exact frozen Roller QA commit header/message');
}

// Reconstruct Git's tree hash in memory. Preflight writes no Git objects.
function treeHash(rows){
 const root=new Map();
 for(const row of rows){let dir=root;const parts=row.path.split('/');for(const part of parts.slice(0,-1)){if(!dir.has(part))dir.set(part,new Map());assert.ok(dir.get(part) instanceof Map,'valid fixed Git tree');dir=dir.get(part);}assert.ok(!dir.has(parts.at(-1)),'unique fixed Git leaf');dir.set(parts.at(-1),row);}
 const hash=dir=>{
  const entries=[...dir].map(([name,value])=>value instanceof Map?{name,mode:'40000',sha:hash(value),sort:name+'/'}:{name,mode:value.mode,sha:value.sha,sort:name});
  entries.sort((a,b)=>Buffer.compare(Buffer.from(a.sort),Buffer.from(b.sort)));
  const body=Buffer.concat(entries.flatMap(e=>[Buffer.from(e.mode+' '+e.name+'\0'),Buffer.from(e.sha,'hex')]));
  return objectHash('tree',body);
 };return hash(root);
}

const git=(root,args)=>{
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1'});
 return execFileSync('git',['-C',root,...args],{encoding:'utf8',env,timeout:15000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
};
export function expectedRollerQASuccessor(root){
 const rows=git(root,['ls-tree','-r','-z','--full-tree',ROLLER_PROJECTILE_SOURCE]).split('\0').filter(Boolean).map(line=>{
  const m=/^(\d+) (blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);assert.ok(m,'fixed source tree leaf');return {mode:m[1],sha:m[3],path:m[4]};
 });
 assert.equal(treeHash(rows),manifest.candidate.tree,'complete fixed source tree reconstruction');
 const leaves=new Map(rows.map(r=>[r.path,r]));
 for(const [p,sha]of Object.entries(reviewedQABlobs)){assert.match(sha,/^[0-9a-f]{40}$/,'frozen QA sibling blob '+p);leaves.set(p,{path:p,mode:'100644',sha});}
 const ownPath='scripts/lib/inkwave-roller-pr1856-projectile-pair.mjs';
 leaves.set(ownPath,{path:ownPath,mode:'100644',sha:objectHash('blob',fs.readFileSync(new URL(import.meta.url)))});
 assert.deepEqual([...Object.keys(reviewedQABlobs),ownPath].sort(),[...manifest.qaPaths].sort());
 return rollerFrozenCommit(treeHash([...leaves.values()]));
}
function gitState(root,commit){
 return readCurrentPairGitTree(root,commit);
}
export const scanRollerProduction=scanCurrentPairProduction;

export function verifyRollerProjectilePair({baseline,candidate,baseSha,candidateSha,event,eventName}){
 const buildProfile=assertRollerNormalBuildProfile();
 assertRollerEvent(event,eventName,baseSha,candidateSha);
 const roots=[fs.realpathSync(baseline),fs.realpathSync(candidate)];
 assert.notEqual(roots[0],roots[1],'separate actual Roller source worktrees required');
 const read=(root,relative)=>{try{return fs.readFileSync(path.join(root,relative),'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const pose=roots.map(root=>new Map(Object.keys(ROLLER_PR1856_POSE_PAIR.paths).map(p=>[p,read(root,p)])));
 const planned=planCharacterPoseBaseline(...pose);
 assert.equal(planned.pairEvidence.mode,ROLLER_PR1856_POSE_PAIR.mode,'existing reviewed17-leaf pose contract');
 assert.deepEqual(planned.changes,[]);assert.deepEqual([...planned.sources],[...pose[0]],'baseline pose unchanged, including absent helper');
 const checkouts=[];
 for(const [i,side,commit]of [[0,'baseline',baseSha],[1,'candidate',candidateSha]]){
  const root=roots[i],before=gitState(root,commit);
  assertRollerProductionRows(before.entries,side,false);
  if(i===0)assert.equal(before.tree,manifest.baseline.tree,'exact main3003 full tree');
  else{
   const parents=git(root,['cat-file','-p',commit]).split('\n').filter(l=>l.startsWith('parent ')).map(l=>l.slice(7));
   const changedPaths=git(root,['diff','--name-only',ROLLER_PROJECTILE_SOURCE,commit]).trim().split('\n').filter(Boolean);
   assertRollerCandidateRevision({head:commit,parents,changedPaths});
   if(commit===ROLLER_PROJECTILE_SOURCE)assert.equal(before.tree,manifest.candidate.tree,'exact preserved2b103 full tree');
   else{
    assertRollerFrozenRevision({head:commit,tree:before.tree,raw:git(root,['cat-file','-p',commit])},expectedRollerQASuccessor(root));
    for(const p of manifest.qaPaths)assert.match(git(root,['ls-tree',commit,'--',p]),/^100644 blob /,p+': regular reviewed QA leaf');
    git(root,['diff','--exit-code',commit,'--',...manifest.qaPaths]);
   }
  }
  assertRollerProductionRows(scanRollerProduction(root),side);
  assert.deepEqual(gitState(root,commit),before,'actual source HEAD/tree stable during admission');
  checkouts.push({commit,tree:before.tree,productionLeaves:before.entries.length});
 }
 // Recheck physical source bytes after pose planning, before a receipt exists.
 for(const [i,side]of [[0,'baseline'],[1,'candidate']]){
  assertRollerProductionRows(scanRollerProduction(roots[i]),side);
  const now=gitState(roots[i],checkouts[i].commit);assert.equal(now.tree,checkouts[i].tree,'actual tree stable before receipt');
  assertRollerProductionRows(now.entries,side,false);
 }
 return {schema:1,mode:ROLLER_PROJECTILE_MODE,sourceBase:ROLLER_PROJECTILE_BASE,sourceHead:ROLLER_PROJECTILE_SOURCE,
  declaredBaseCommit:baseSha,declaredCandidateCommit:candidateSha,checkouts,
  productionChanges:manifest.changedProductionPaths,canonicalInputsCovered:1422,buildProfile,copyScopeFixtureSha256:CURRENT_PAIR_FIXTURE_SHA256,
  preservedBuildEvidence:{inputHash:manifest.savedCandidateBuild.inputHash,contentHash:manifest.savedCandidateBuild.contentHash},
  poseContract:planned.pairEvidence,posePaths:planned.evidence,changes:[],writtenPaths:[],replayed:[],
  scope:'Read-only exact main3003/2b103 production/copy and existing17-leaf pose source admission under the unchanged independently reviewed verifier. Both distinct inputs remain intact; no replay.',
  limitation:'A candidate-controlled workflow/checker can replace itself; no future sibling is preapproved. Source identity only, not build execution, toolchain-byte identity, pose/gameplay/RNG equality, browser/hardware acceptance or retail matching.'};
}
