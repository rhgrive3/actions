import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {paintSourcePaths} from './inkwave-main-ink-baseline.mjs';
const blob=text=>createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
// Explicit Git roots refer to immutable checked-out commits, not a copied
// comparison scratch tree. This verifies only the selected admitted leaves.
export function verifyDeclaredPaintSources({baseline,candidate,baseGitRoot,candidateGitRoot,baseSha,candidateSha,expectedPair=null,
 readGit=(root,args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:8*1024*1024})}){
 const paths=paintSourcePaths(expectedPair);
 for(const sha of [baseSha,candidateSha])assert.match(sha??'',/^[0-9a-f]{40}$/,'declared immutable commit required');
 const originals=[baseline,candidate],roots=[baseGitRoot,candidateGitRoot],shas=[baseSha,candidateSha],immutable=[new Map(),new Map()];
 for(let side=0;side<2;side++){
  assert.equal(readGit(roots[side],['rev-parse','--verify','HEAD']).trim(),shas[side],'declared commit must match Git HEAD');
  for(const path of paths){
   const source=readGit(roots[side],['show',shas[side]+':'+path]);
   assert.equal(typeof source,'string','immutable source exists');
   assert.equal(originals[side].get(path),source,'working source differs from declared immutable Git blob: '+path);
   immutable[side].set(path,source);
  }
 }
 return {baseline:immutable[0],candidate:immutable[1],evidence:{
  scope:`exact ${paths.length}-leaf Git verification; no whole repository or compiled equivalence claim`,
  declaredBaseCommit:baseSha,declaredCandidateCommit:candidateSha,
  paths:paths.map(path=>({path,baseGitBlob:blob(immutable[0].get(path)),candidateGitBlob:blob(immutable[1].get(path))}))
 }};
}
