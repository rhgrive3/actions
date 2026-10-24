// Reproducible negative constraints and unchanged native frames. These tests
// accept diagnostic evidence; they do NOT accept a production motion fix.
import test from 'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{gunzipSync}from'node:zlib';import{execFileSync}from'node:child_process';import{fileURLToPath}from'node:url';
import*as T from'../../inkwave-public/vendor/three/build/three.module.js';import{floorEvaluator}from'../lib/inkwave-roller-floor-constraints.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),folder=path.join(root,'reports/roller-ground-boundary-20261023'),
 read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p)),p=read(path.join(folder,'observed.json.gz')),control=read(path.join(folder,'control.json.gz'));
const at=tick=>{const e=p.layerEvents.find(x=>x.tick===tick&&x.stage==='rollerIKIn'&&x.side==='R');return{e,evaluate:floorEvaluator(e.constraints,e.target)};},selected=tick=>p.layerEvents.find(x=>x.tick===tick&&x.stage==='nativeIKIn'&&x.side==='R').quaternion;

test('observation preserves all 66 actual native frames including landing40 and recovery49',()=>{
 const rows=p=>p.frames.map(({render,...native})=>native);assert.deepEqual(p.matchConditions,control.matchConditions);assert.deepEqual(rows(p),rows(control));assert.equal(p.frames.length,66);
 for(const tick of[40,49]){assert.deepEqual(p.frames[tick].centre,control.frames[tick].centre);assert.deepEqual(p.frames[tick].pose,control.frames[tick].pose);}
 assert.deepEqual(p.errors,[]);assert.deepEqual(control.errors,[]);
});

test('hold-only correction violates the existing floor admission at both required witnesses',()=>{
 for(const tick of[40,49]){const{evaluate}=at(tick),held=evaluate(selected(tick-1));assert(held.error>.003,'prior orientation is inadmissible at native tick '+tick);assert.equal(held.leftReachError,0,'not a weakened support-grip limit');}
});

test('legal floor endpoints do not make scalar or quaternion interpolation legal',()=>{
 const{e,evaluate}=at(49),q=new T.Quaternion().fromArray(e.quaternion),sample=a=>evaluate(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),a).multiply(q).toArray()),lo=sample(1.25),hi=sample(1.5);
 assert(lo.error<=.003&&hi.error<=.003);assert(sample(1.375).error>.003);
 const midpoint=new T.Quaternion().fromArray(lo.q).slerp(new T.Quaternion().fromArray(hi.q),.5);
 assert(evaluate(midpoint.toArray()).error>.003,'a shortest quaternion path can penetrate between valid endpoints');
});

test('bounded replay matches native floor queries and rejects both boundary-only prototypes',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'roller-boundary-'));
 try{const out=path.join(tmp,'analysis.json');execFileSync(process.execPath,['scripts/analyze-inkwave-roller-floor-boundary.mjs',path.join(folder,'observed.json.gz'),out],{cwd:root,stdio:'pipe'});const a=read(out),saved=read(path.join(folder,'analysis.json'));
  assert.equal(a.replay.count,1472);assert(a.replay.maxError<1e-12);assert(a.replay.maxQComponentDifference<1e-12);
  assert.deepEqual(a.slerpCounterexample,saved.slerpCounterexample);assert.deepEqual(a.proposals,saved.proposals);
  assert(a.proposals.simpleAdmission.stepFromPrior>1,'gate-only admission still fails the recovery boundary');
  assert(a.proposals.nativeHandoff.remainingCorrection>1,'old costs stick until the original native deadline');
  assert.equal(a.operation.newRuntimeQueries,0);assert(a.operation.offlineRootQueries<=64,'no enlarged search');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
