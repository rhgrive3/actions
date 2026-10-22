// Current-main source/role rebase controls. Synthetic I/O, no browser/build/GPU acceptance.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {SOURCE_SHA,SOURCE_TREE} from '../../scripts/prepare-inkwave-material-common.mjs';
import {requireNormalNativeReceipt} from '../../scripts/lib/inkwave-material-normal-admission.mjs';
import {generatedReceipt} from '../../scripts/tests/material-native-common/normal-receipt-fixture.mjs';
const OLD='cc0c90afe8031643e6a890974f8f44a40a30509e',OLD_TREE='de64f6d82cdf518b9acbc4ce3ae7c897509b406c';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'),hash=b=>createHash('sha256').update(b).digest('hex');
const frame=read('scripts/check-inkwave-material-native-frame.mjs'),paired=read('scripts/check-inkwave-material-native-paired.mjs');
const inverse=s=>s.replaceAll(SOURCE_SHA,OLD).replaceAll(SOURCE_TREE,OLD_TREE)
 .replace("assert.equal(bound.commonVariant,'B');assert.equal(bound.overlayVariant,'A')","assert.equal(bound.commonVariant,'A');assert.equal(bound.overlayVariant,'B')")
 .replace("assert.equal(b.commonVariant,'B');assert.equal(b.overlayVariant,'A')","assert.equal(b.commonVariant,'A');assert.equal(b.overlayVariant,'B')")
 .replace('hash(overlay),bound.baselineEmittedSha256','hash(overlay),bound.candidateEmittedSha256')
 .replace('path.join(site,target))),bound.candidateEmittedSha256','path.join(site,target))),bound.baselineEmittedSha256')
 .replace("const bytes=variant==='A'&&p===target?overlay:original","const bytes=variant==='B'&&p===target?overlay:original");
test('only source/tree and explicit production/control roles differ from admitted ea92 canonical native frame',()=>{assert.equal(SOURCE_SHA,'c0938a3f84768474df91713f7b372f9d7f8fe96a');assert.equal(SOURCE_TREE,'97b9938391f156dc332f6a56ac6fe3d21d9f9dc7');assert.equal(hash(inverse(frame)),'440a225f6f27ddf5fdf6880b5fc2448f9ea97707cb46b3bc8762a9e58fe6119e');});
test('only source/tree and explicit production/control roles differ from admitted ea92 paired gates and statistics',()=>{assert.equal(hash(inverse(paired)),'ebb6ed23463fd1313692dd391dafe3522d663e209b65c794ab71c3aff6b81be8');assert.equal(hash(inverse(read('scripts/lib/inkwave-material-normal-admission.mjs'))),'d4f6dba1bab48bf1dfb50281163587320c132ce303549619e7ac32f9023fd26d');});
for(const variant of ['A','B'])test('new-source actual producer schema admits '+variant+' without mutation',()=>{const r=generatedReceipt(variant),before=JSON.stringify(r);requireNormalNativeReceipt(r,variant);assert.equal(JSON.stringify(r),before);assert.equal(r.sourceSha,SOURCE_SHA);});
for(const [name,mutate]of[
 ['cc0 normal receipt',r=>{r.sourceSha=OLD;r.overlay.sourceSha=OLD;r.overlay.sourceTree=OLD_TREE;}],
 ['cc0 overlay source only',r=>{r.overlay.sourceSha=OLD;}],
 ['cc0 overlay tree only',r=>{r.overlay.sourceTree=OLD_TREE;}]
])test('rejects stale '+name,()=>{const r=generatedReceipt('A');mutate(r);assert.throws(()=>requireNormalNativeReceipt(r,'A'));});
const start=frame.indexOf("const sourceSha='"),end=frame.indexOf('\nconst loaded=new Map()',start);assert.ok(start>=0&&end>start);
function frameGuard(boundChange={}){
 const overlay=Buffer.from('candidate'),original=Buffer.from('baseline'),manifest={contentHash:'content',inputHash:'input',build:{revision:'revision'}};
 const bound={sourceSha:SOURCE_SHA,sourceTree:SOURCE_TREE,contentHash:'content',inputHash:'input',revision:'revision',modulePath:'src/world/inkShading.js',commonVariant:'B',overlayVariant:'A',candidateEmittedSha256:hash(original),baselineEmittedSha256:hash(overlay),...boundChange};
 const fakeFs={readFileSync(p){if(p==='/overlay/inkShading.js')return overlay;if(p==='/overlay/receipt.json')return JSON.stringify(bound);return original;}};
 return Function('fs','path','assert','verifyRuntimeBuild','site','source','overlayArg','hash',frame.slice(start,end)+';return{sourceSha,bound};')(fakeFs,path,assert,(site,source,sha)=>{assert.equal(sha,SOURCE_SHA);return manifest;},'/site','/source','/overlay/inkShading.js',hash);
}
test('actual driver source/overlay guard accepts exact current main synthetic input',()=>assert.equal(frameGuard().sourceSha,SOURCE_SHA));
for(const [name,bad]of [['old source',{sourceSha:OLD}],['old tree',{sourceTree:OLD_TREE}],['old coherent pair',{sourceSha:OLD,sourceTree:OLD_TREE}],['wrong served material',{candidateEmittedSha256:'0'.repeat(64)}]])test('actual driver rejects '+name+' before HTTP/browser',()=>assert.throws(()=>frameGuard(bad)));
const compiler=read('scripts/prepare-inkwave-material-common.mjs'),guardStart=compiler.indexOf(" assert.equal(execFileSync('git',['rev-parse','HEAD']"),guardEnd=compiler.indexOf('\n inspectCompilerInputs(root);',guardStart);assert.ok(guardStart>=0&&guardEnd>guardStart);
const commonGuard=Function('assert','execFileSync','SOURCE_SHA','SOURCE_TREE','root',compiler.slice(guardStart,guardEnd)+';return true;');
function gitGuard(head,tree){return commonGuard(assert,(_cmd,args)=>args[0]==='diff'?'':(args[1]==='HEAD'?head:tree)+'\n',SOURCE_SHA,SOURCE_TREE,'/source');}
test('actual compiler checkout guard accepts immutable current main',()=>assert.equal(gitGuard(SOURCE_SHA,SOURCE_TREE),true));
test('actual compiler checkout guard refuses coherent oldcc0',()=>assert.throws(()=>gitGuard(OLD,OLD_TREE)));
test('actual compiler checkout guard refuses mismatched tree',()=>assert.throws(()=>gitGuard(SOURCE_SHA,OLD_TREE)));
test('raw historical provenance still names cc0 and original failed capture',()=>{const p=JSON.parse(read('tools/material-native-aa/postprocess/historical-fixture-provenance.json'));assert.equal(p.common,OLD);assert.equal(p.qaHead,'5625829733c77afa6ff26c89a4b067a1cf4643d4');assert.equal(p.newOwnerEvidencePresent,false);});
test('native owner observer and registration differ only by explicit contract label',()=>{for(const [file,expected]of [['postprocess-owners.mjs','e873d6c6c616ffe492b46db2c96ed53e3ad239bb2e7e27299aff2a04294e1e3e'],['register-postprocess.mjs','1e2d0184ac2b3c6fef7561816ab025b359aa5bdec73182b2221566e9a8d0e527']]){const s=read('tools/material-native-aa/postprocess/'+file);assert.equal(s.split('c093-native-six-pass').length,2);assert.equal(hash(s.replace('c093-native-six-pass','cc0-native-six-pass')),expected);}});
