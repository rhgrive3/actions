import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { segmentCapsuleEntry } from '../runtime/projectile-collision.mjs';
import { predictCatalogueSub, catalogueSubPredictionChargeKey } from '../runtime/all-subs.mjs';
import { predictKitSub, kitSubPredictionChargeKey } from '../runtime/kit-subs.mjs';
import { predictPointSensor } from '../runtime/support-sensor-flight.mjs';
import { createThrowPrediction, appendThrowPredictionPoint, noteThrowPredictionImpact, finishThrowPrediction } from '../runtime/throw-prediction-record.mjs';
import { THROW_PREVIEW_INTERVAL } from '../runtime/throw-prediction.mjs';

// The earlier review checked a legacy first-contact arc; current main owns a
// longer full-outcome forecast for bouncing, charging and placed weapons.
// The exhaustive actor/physics/scene parity suite lives in
// throw-prediction-parity.test.mjs; these are the cross-version integration
// invariants the review must still enforce.
test('reviewed subsystem functions are available without creating a gameplay owner', () => {
  assert.equal(typeof predictCatalogueSub, 'function');
  assert.equal(typeof predictKitSub, 'function');
  assert.equal(typeof predictPointSensor, 'function');
  assert.equal(typeof catalogueSubPredictionChargeKey, 'function');
  assert.equal(typeof kitSubPredictionChargeKey, 'function');
  assert.equal(predictCatalogueSub({}, {}, null), null);
  assert.equal(predictKitSub({THREE}, {}, null), null);
  assert.equal(predictPointSensor({THREE}, null), null);
  assert.ok(THROW_PREVIEW_INTERVAL > 0 && THROW_PREVIEW_INTERVAL <= 1 / 30);
});

test('reviewed first-entry capsule solver orders actor and terrain contacts', () => {
  const a=new THREE.Vector3(0,1,0),b=new THREE.Vector3(0,1,2);
  const actor=new THREE.Vector3(0,0,1.3);
  const r=.35+.2,height=1.7,wallT=1.2/2;
  const t=segmentCapsuleEntry(a,b,actor,.35,height,r);
  assert.ok(t>=0 && t<wallT,'first body surface precedes the intervening wall');
  const later=segmentCapsuleEntry(a,b,new THREE.Vector3(0,0,1.85),.35,height,r);
  assert.ok(later>wallT,'wall precedes a more distant body');
  assert.equal(segmentCapsuleEntry(a,a,new THREE.Vector3(3,0,0),.35,height,r),Infinity);
  assert.equal(segmentCapsuleEntry(a,a,new THREE.Vector3(0,0,0),.35,height,r),0);
});

test('reviewed forecast result separates first impact, final explosion and target dependence', () => {
  const origin=new THREE.Vector3(0,1.35,0),velocity=new THREE.Vector3(0,12,50);
  const prediction=createThrowPrediction('fizzy',origin,velocity);
  appendThrowPredictionPoint(prediction,new THREE.Vector3(0,2,1));
  noteThrowPredictionImpact(prediction,new THREE.Vector3(0,0,2),new THREE.Vector3(0,1,0),1/30,'world');
  prediction.explosions.push({point:new THREE.Vector3(0,0,4),time:.5,index:0});
  finishThrowPrediction(prediction,new THREE.Vector3(0,0,4),.5,'explosion');
  assert.equal(prediction.kind,'fizzy');
  assert.equal(prediction.firstImpact.kind,'world');
  assert.equal(prediction.firstImpact.time,1/30);
  assert.notDeepEqual(prediction.firstImpact.point.toArray(),prediction.endpoint.toArray());
  assert.equal(prediction.outcome,'explosion');
  assert.equal(prediction.points.length,3);
  assert.equal(prediction.simulationStep,1/60);
});

test('main installs source-aware sub owners before the unified prediction UI', () => {
  const installed=fs.readFileSync(new URL('../runtime/install.mjs',import.meta.url),'utf8');
  const kit=installed.indexOf('installKitSubs(api, profile);');
  const catalogue=installed.indexOf('installAllSubs(api);');
  const prediction=installed.indexOf('installThrowPrediction(api);');
  assert.ok(kit>=0 && kit<catalogue && catalogue<prediction,'one terminal preview owner retains complete sub forecasts');
  const legacy=fs.readFileSync(new URL('../runtime/all-subs.mjs',import.meta.url),'utf8');
  assert.match(legacy,/predictCatalogueSub\(api,this,actor,options\)/);
  assert.match(legacy,/segmentCapsuleEntry\(/);
});
