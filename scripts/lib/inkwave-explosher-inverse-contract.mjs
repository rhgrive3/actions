// Exact reviewed after-native leaf contract. Does not authorize native capture.
import assert from 'node:assert/strict';
export const COMMON_HEAD='364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c';
export const SHAPE_PATH='patches/splatoon3/runtime/s3-projectile-shapes.mjs';
export const NATIVE_SOURCE_SHA256='0229bd0cb4b7a883568ee37a2a1097e07ee3cc7ed094a0765b626c7147987ac4';
export const NATIVE_EMITTED='1f87be3cd704dee23d3289e91d4684eec6e1eaf50ce5a943298e9dc3263ab904';
export const BASELINE_EMITTED='6ce2c4fe4be28b2ab7c0d2be2a1402d302e2f84b0978690450129c10ec9c74ea';
export function requireInverseShapePair(before,after){
 for(const[r,lane]of[[before,'before'],[after,'after']]){
  const p=r.shapeOverlay;assert(p,'Missing inverse provenance');
  assert.equal(p.sourceEpochKind,'published-commit');assert.equal(p.commonSourceTree,'c52b1342cd2d8262bde72bbbfe38f04b1219caa4');assert.equal(p.finalCommonHeadPending,false);assert.equal(p.nativeCaptureReady,true);
  assert.equal(p.schema,2,'Inverse provenance schema');assert.equal(p.comparisonMode,'after-native-inverse-baseline','Inverse provenance mode');
  assert(!Object.hasOwn(p,'originalEmittedSha256'),'Ambiguous original provenance forbidden');
  assert.equal(r.actualSourceSha,COMMON_HEAD,'Inverse provenance source');assert.equal(r.sourceSha,COMMON_HEAD);assert.equal(p.expectedCommonSourceHead,COMMON_HEAD);
  assert.equal(r.sourceShapeSha256,NATIVE_SOURCE_SHA256,'Native source provenance');
  assert.equal(p.nativeSourceBlob,'ff05f46db9eb5179440cd2c375663148ca05f48a');assert.equal(p.candidateSourceBlob,p.nativeSourceBlob);assert.equal(p.baselineSourceBlob,'7afb76e80960dde61d51effb89057dd1f183d16f');
  assert.equal(p.lane,lane);assert.equal(p.sameBuildComparison,true);assert.equal(p.fullGameTwoBuildAcceptance,false);
  assert.equal(p.compiler,'0.28.2');assert.equal(r.build.build.esbuild,p.compiler);assert.match(r.build.build.revision,/^[a-zA-Z0-9_-]+$/);
  assert.equal(p.buildContentHash,r.build.contentHash);assert.match(p.buildContentHash,/^[a-f0-9]{64}$/);
  assert.deepEqual(p.paths,[SHAPE_PATH,'_versions/'+r.build.build.revision+'/'+SHAPE_PATH]);
  assert.equal(p.nativeEmittedSha256,NATIVE_EMITTED,'Native emitted provenance');assert.equal(p.baselineEmittedSha256,BASELINE_EMITTED,'Baseline emitted provenance');assert.equal(p.candidateEmittedSha256,p.nativeEmittedSha256,'Candidate/native provenance');assert.notEqual(p.baselineEmittedSha256,p.nativeEmittedSha256);
  for(const path of p.paths)assert.equal(r.build.artifacts[path],p.nativeEmittedSha256,'Build native provenance');
  assert.equal(p.transformedEmittedSha256,lane==='before'?p.baselineEmittedSha256:p.nativeEmittedSha256,'Consumed lane provenance');
 }
 for(const k of ['schema','comparisonMode','nativeSourceBlob','baselineSourceBlob','candidateSourceBlob','nativeEmittedSha256','baselineEmittedSha256','candidateEmittedSha256','compiler','paths','buildContentHash'])assert.deepEqual(before.shapeOverlay[k],after.shapeOverlay[k],'Cross-lane inverse provenance '+k);
}
