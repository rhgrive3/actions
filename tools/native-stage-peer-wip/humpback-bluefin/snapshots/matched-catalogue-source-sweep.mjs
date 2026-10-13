import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {readStage} from '/workspace/stage-worktrees/bluefin/patches/native-stages/tests/fixture.mjs';
import {fixture} from '/workspace/stage-worktrees/bluefin/patches/splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '/workspace/stage-worktrees/bluefin/scripts/inkwave-source-composition.mjs';
import {prepareNativeStageBuild} from '/workspace/stage-worktrees/bluefin/scripts/lib/inkwave-native-stages.mjs';
import {sweptWorldHit} from '/workspace/stage-worktrees/bluefin/patches/splatoon3/runtime/weapons-collision.mjs';
import {MAIN_WEAPON_CATALOG} from '/workspace/stage-worktrees/bluefin/patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
const dir='/workspace/stage-worktrees/humpback/.ci-scratch/bluefin-stage-peer';
const sourceRoot='/workspace/stage-worktrees/bluefin';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const evidencePath=dir+'/final-source-aim-diagnostic-1ad/browser/online.json';
const evidence=JSON.parse(fs.readFileSync(evidencePath));
const step=evidence.lastCase.fireAdmissionDiagnostic.stepTrace.find(v=>v.before.ownerLocal&&v.before.wid==='s3-blaster-short');
assert.equal(step.dt,1/60);assert.equal(step.before.age,0);assert.equal(step.before.ghost,false);assert.equal(step.ended,true);
const prepared=prepareNativeStageBuild(process.env.INKWAVE_NATIVE_STAGE_ASSETS);
const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,
 adaptRuntime:(rel,code)=>rel==='patches/native-stages/runtime/build-config.mjs'?`export const nativeStageBuild=${JSON.stringify(prepared.config)};`:adaptBuildSource(rel,code),
 extraExports:"export {NativeLevel,NativePhysics,sweepNativeLevelSphere} from './patches/native-stages/runtime/engine.mjs';"});
const V=a=>new f.THREE.Vector3(...a);
const data=readStage(sourceRoot+'/.codex-stage-sources/generated','bluefin');
const L=new f.NativeLevel(data);
const r=MAIN_WEAPON_CATALOG.records.find(r=>r.id==='s3-blaster-short');
const c=r.parameters.CollisionParam,m=r.parameters.MoveParam;
assert.equal(c.InitRadiusForField,.2);assert.equal(c.EndRadiusForField,.2);
assert.ok(m.GoStraightToBrakeStateFrame>=1,'first actual tick remains in the installed straight phase');
const from=V(step.before.position),to=from.clone().addScaledVector(V(step.before.velocity),step.dt),radius0=c.InitRadiusForField,radius1=c.EndRadiusForField;
const out=()=>({point:V([0,0,0]),normal:V([0,0,0])});
const physics=new f.NativePhysics(L);
const compatibility=sweptWorldHit(physics,from,to,radius0,radius1,out(),true);
const exactStatic=L.triangleWorld.sweepSphere(from,to,radius0,{ignoreGrates:true});
const originalNative=f.sweepNativeLevelSphere(L,from,to,radius0,out(),true,(view,a,b,r,o,skip)=>sweptWorldHit({level:view},a,b,r,r,o,skip));
const chosen=L.blocks[compatibility.block];
const hit=h=>h&&({hit:h.hit??true,distance:h.dist??h.distance,point:h.point.toArray(),normal:h.normal.toArray(),block:h.block??null,face:h.face??null,triangle:h.triangle??null,u:h.u??null,v:h.v??null});
const sourceFiles={};
for(const name of ['vertices','indices','collision','normals','flags','objects','bvh','order','triangleFace','mask']){
 const p=sourceRoot+'/.codex-stage-sources/generated/bluefin/'+name+'.bin';sourceFiles[name]={sha256:sha(p),bytes:fs.statSync(p).size};
}
const bound=[['weaponsCollision','patches/splatoon3/runtime/weapons-collision.mjs'],['catalogueRuntime','patches/splatoon3/runtime/main-weapon-catalog.mjs'],['catalogueData','patches/splatoon3/runtime/main-weapon-catalog-data.mjs'],['nativeSphere','patches/native-stages/runtime/native-projectile-sweep.mjs'],['definition','patches/native-stages/definitions/bluefin.json']];
const receipt={schema:1,scope:'Read-only original Bluefin source: replay exact naturally admitted current Game first Luna catalogue step through unmodified catalogue OBB and previously accepted native sphere helpers. Not a new browser run, projectile policy, or packaging qualification.',beforeEvidence:{path:evidencePath,sha256:sha(evidencePath),helperSha256:sha(dir+'/bluefin-source-aim-natural-diagnostic.mjs'),binding:evidence.binding},sourceBindings:Object.fromEntries(bound.map(([k,p])=>[k,sha(sourceRoot+'/'+p)])),sourceFiles,
 actualRecordedStep:step,submittedSegment:{from:from.toArray(),to:to.toArray(),radius0,radius1,dt:step.dt,length:from.distanceTo(to)},
 staticBlockCount:L.staticBlockCount,blockCount:L.blocks.length,dynamicBlocks:L.blocks.length-L.staticBlockCount,
 catalogueRecord:{id:r.id,sourceActor:r.sourceActor,sourceSha256:r.sourceSha256,CollisionParam:c,MoveParam:m,BlastParam:r.parameters.BlastParam,BlasterBurstParam:r.parameters.BlasterBurstParam,SplashPaintParam:r.parameters.SplashPaintParam,SplashSpawnParam:r.parameters.SplashSpawnParam,descriptorKeyObservation:'Not recorded in the earlier browser diagnostic; raw grounded normal record fields are shown without relabeling an unobserved runtime key.'},
 compatibilityHit:hit(compatibility),selectedCompatibilityBlock:{id:chosen.id,nativeObject:chosen.nativeObject??null,nativeFace:chosen.nativeFace??null,center:chosen.center.toArray(),half:chosen.half.toArray(),aabbMin:chosen.aabbMin.toArray(),aabbMax:chosen.aabbMax.toArray(),sourceObject:chosen.nativeObject===undefined?null:L.manifest.objects[chosen.nativeObject]},
 exactStaticHit:hit(exactStatic),acceptedNativeHit:hit(originalNative)};
assert.equal(compatibility.hit,true);assert.equal(compatibility.dist,0);
assert.ok(compatibility.point.distanceTo(V(step.after.position))<1e-8,'unmodified catalogue hit exactly reproduces actual browser termination position');
assert.equal(exactStatic,null);assert.equal(originalNative.hit,false);
assert.equal(receipt.dynamicBlocks,0);
receipt.status='closed-counterexample';receipt.assertions={exactBrowserTerminationMatched:true,compatibilityInitialOverlap:true,originalSourceSegmentClear:true,dynamicBlockCountZero:true,noSourceOrBodyWrites:true};
const receiptPath=dir+'/matched-catalogue-source-sweep.json';fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,receiptPath,sha256:sha(receiptPath),segment:receipt.submittedSegment,compatibilityHit:receipt.compatibilityHit,sourceObject:receipt.selectedCompatibilityBlock.sourceObject?.name,sourceClear:!receipt.exactStaticHit,dynamicBlocks:receipt.dynamicBlocks}));
