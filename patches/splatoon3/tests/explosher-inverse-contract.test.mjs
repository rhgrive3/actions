import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './explosher-stage-fixture.mjs';
import {requireExplosherStagePair} from '../../../scripts/lib/inkwave-explosher-stage-admission.mjs';
import {validateContinuousPair,explosherCaptureIdentity,explosherVideoDeliveryProvenance} from '../../../scripts/lib/inkwave-explosher-video-gate.mjs';
import {requireInverseShapePair,NATIVE_EMITTED,BASELINE_EMITTED} from '../../../scripts/lib/inkwave-explosher-inverse-contract.mjs';
function pair(stage){const a=fixture(),b=fixture('after');if(stage==='preflight')for(const f of[a,b]){f.frames=f.frames.slice(0,1);f.receipt.captureMode='preflight';f.receipt.captureTicks=[0];}return[a,b];}
function prior(a,b){const provenance={before:explosherCaptureIdentity(a.receipt),after:explosherCaptureIdentity(b.receipt)};for(const f of[a,b])f.receipt.stageAdmission.laneProvenance=structuredClone(provenance);}
function gate(stage,a,b){return stage==='preflight'?requireExplosherStagePair(stage,a.frames,b.frames,a.receipt,b.receipt):validateContinuousPair(a.frames,b.frames,a.receipt,b.receipt,a.sha,b.sha);}
const both=fn=>(a,b)=>{fn(a.receipt);fn(b.receipt);};
const changes=[
 ['unpublished epoch',both(r=>r.shapeOverlay.sourceEpochKind='unpublished-tree')],
 ['wrong tree',both(r=>r.shapeOverlay.commonSourceTree='0'.repeat(40))],
 ['pending head',both(r=>r.shapeOverlay.finalCommonHeadPending=true)],
 ['not capture ready',both(r=>r.shapeOverlay.nativeCaptureReady=false)],
 ['old schema',both(r=>r.shapeOverlay.schema=1)],
 ['old mode',both(r=>r.shapeOverlay.comparisonMode='baseline-native')],
 ['ambiguous original',both(r=>r.shapeOverlay.originalEmittedSha256=BASELINE_EMITTED)],
 ['swapped native baseline',both(r=>{r.shapeOverlay.nativeEmittedSha256=BASELINE_EMITTED;r.shapeOverlay.baselineEmittedSha256=NATIVE_EMITTED;r.shapeOverlay.candidateEmittedSha256=BASELINE_EMITTED;r.shapeOverlay.transformedEmittedSha256=r.shapeOverlay.lane==='before'?NATIVE_EMITTED:BASELINE_EMITTED;})],
 ['both lanes native',both(r=>r.shapeOverlay.transformedEmittedSha256=NATIVE_EMITTED)],
 ['both lanes baseline',both(r=>r.shapeOverlay.transformedEmittedSha256=BASELINE_EMITTED)],
 ['unbound both baseline',both(r=>{r.shapeOverlay.baselineEmittedSha256='c'.repeat(64);if(r.shapeOverlay.lane==='before')r.shapeOverlay.transformedEmittedSha256='c'.repeat(64);})],
 ['unbound both native including build',both(r=>{r.shapeOverlay.nativeEmittedSha256=r.shapeOverlay.candidateEmittedSha256='d'.repeat(64);if(r.shapeOverlay.lane==='after')r.shapeOverlay.transformedEmittedSha256='d'.repeat(64);for(const p of r.shapeOverlay.paths)r.build.artifacts[p]='d'.repeat(64);})],
 ['mixed lane native',(a,b)=>b.receipt.shapeOverlay.nativeEmittedSha256='d'.repeat(64)],
 ['missing native',both(r=>delete r.shapeOverlay.nativeEmittedSha256)],
 ['missing baseline',both(r=>delete r.shapeOverlay.baselineEmittedSha256)],
 ['missing build binding',both(r=>delete r.build.artifacts[r.shapeOverlay.paths[1]])],
 ['baseline-native build',both(r=>{for(const p of r.shapeOverlay.paths)r.build.artifacts[p]=BASELINE_EMITTED;})],
 ['wrong compiler',both(r=>r.shapeOverlay.compiler=r.build.build.esbuild='0.28.1')],
 ['wrong source role',both(r=>r.shapeOverlay.nativeSourceBlob=r.shapeOverlay.baselineSourceBlob)],
 ['wrong native source bytes',both(r=>r.sourceShapeSha256='e'.repeat(64))],
 ['wrong build path',both(r=>r.shapeOverlay.paths[1]='other-shape.mjs')],
 ['both source epoch changed',both(r=>r.sourceSha=r.actualSourceSha=r.shapeOverlay.expectedCommonSourceHead='f8c6999727a436ad0d267cd5dd4b1dc687047cdf')],
];
for(const stage of['preflight','video'])for(const[name,change]of changes)test(stage+' rejects inverse '+name+' even with refreshed prior identities',()=>{const[a,b]=pair(stage);change(a,b);prior(a,b);assert.throws(()=>gate(stage,a,b));});
for(const stage of['preflight','video'])for(const field of['rng','physical'])test(stage+' keeps '+field+' equal under valid inverse provenance',()=>{const[a,b]=pair(stage);requireInverseShapePair(a.receipt,b.receipt);if(field==='rng')b.frames[0].measurement.rng.word++;else b.frames[0].measurement.physical[0].vel[0]++;assert.throws(()=>gate(stage,a,b));});
test('delivery and stage identities expose native/baseline roles without original alias',()=>{const[a,b]=pair('video');const id=explosherCaptureIdentity(a.receipt);assert.equal(id.shape.native,NATIVE_EMITTED);assert.equal(id.shape.baseline,BASELINE_EMITTED);assert(!Object.hasOwn(id.shape,'original'));const wrap=f=>({r:f.receipt,manifestSha256:'a'.repeat(64),sourceReceiptSha256:'b'.repeat(64)}),p=explosherVideoDeliveryProvenance(wrap(a),wrap(b));assert.equal(p.nativeEmittedSha256,p.after.consumedShapeSha256);assert.equal(p.baselineEmittedSha256,p.before.consumedShapeSha256);assert.equal(p.comparisonMode,'after-native-inverse-baseline');});
