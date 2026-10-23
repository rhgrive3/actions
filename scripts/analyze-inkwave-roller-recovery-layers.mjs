#!/usr/bin/env node
// Positions are INKWAVE units, velocities/accelerations are fixed-tick finite
// differences, and screen coordinates use the recorded native camera. These
// are diagnostics, never a retail animation acceptance score.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import * as T from '../inkwave-public/vendor/three/build/three.module.js';

const root=path.resolve(process.argv[2]||'.roller-recovery'),out=path.resolve(process.argv[3]||'.roller-recovery/layers/analysis.json');
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p,'utf8'));
const cases=[['before','matched-before-60'],['cf9','matched-cf9-60'],['weighted','matched-weighted-60']];
const published=process.argv.includes('--from-reports');
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const length=a=>Math.hypot(...a);
const angular=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((s,v,i)=>s+v*b[i],0))/Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0))));
const summary=[];
for(const [name,controlDir]of cases){
  const p=read(published?path.join(root,'layers',name+'.json.gz'):path.join(root,'layers',name,'receipt.json'));
  const control=read(published?path.join(root,'matched',(name==='weighted'?'weighted-rejected':name)+'.json.gz'):path.join(root,controlDir,'receipt.json'));
  assert.deepEqual(p.matchConditions,control.matchConditions,'unchanged matched conditions '+name);
  const nativeRows=rows=>rows.map(({render,...native})=>native);
  // Native renderer.info counters are cumulative from an unfrozen boot; they
  // are workload receipts, not part of actor/pose/projectile state identity.
  assert.deepEqual(nativeRows(p.frames),nativeRows(control.frames),'diagnostic wrappers preserve native rows '+name);
  const events=(tick,stage,side)=>p.layerEvents.filter(e=>e.tick===tick&&e.stage===stage&&(!side||e.side===side));
  const last=(tick,stage,side)=>events(tick,stage,side).at(-1);
  const camera=p.matchConditions.camera,cam=new T.Matrix4().compose(new T.Vector3().fromArray(camera.position),new T.Quaternion().fromArray(camera.rotation),new T.Vector3(1,1,1));
  const view=cam.clone().invert(),projection=new T.Matrix4().fromArray(camera.projection);
  const screen=v=>{const q=new T.Vector3().fromArray(v).applyMatrix4(view).applyMatrix4(projection);return[(q.x+1)*400,(1-q.y)*300];};
  const qs=e=>new T.Quaternion().setFromEuler(new T.Euler(...e,'YXZ')).toArray();
  const rows=[];
  for(let tick=46;tick<=58;tick++){
    const blend=last(tick,'blendOut'),pre=last(tick,'blendIn'),detail=last(tick,'detailOut');
    const helper=last(tick,'helper');
    const raw=events(tick,'raw').filter(e=>e.attack&&Math.abs(e.args[0]-e.attack.elapsed)<1e-12&&e.args[4]===e.attack.held).at(-1);
    const actual=helper?.rawPose??raw?.rawPose;
    const rightIn=last(tick,'rollerIKIn','R'),rightConsumed=last(tick,'nativeIKIn','R'),final=last(tick,'applyOut').transforms;
    assert(rightIn&&rightConsumed);
    const r={tick,attack:blend?.attack??last(tick,'applyIn').attack,flickCalls:events(tick,'blendOut').length,
      rawQueries:events(tick,'raw').length,raw:raw?.rawPose??null,helper:helper?.rawPose??null,
      beforeBlend:pre?.pose??null,afterBlend:blend?.pose??null,afterDetail:detail?.pose??null,
      applyInput:last(tick,'applyIn').transforms.pose,ikInput:{target:rightIn.targetWorld,q:rightIn.quaternion},
      ikConsumed:{target:rightConsumed.targetWorld,q:rightConsumed.quaternion},
      floor:final.floorSearch,finalCentre:final.centre,screenCentre:screen(final.centre),
      handR:final.handR,handL:final.handL,pivot:final.pivot,off:final.off,fold:final.fold,drum:final.drum,
      afterRightIK:last(tick,'fullIKOut','R').transforms,afterPivot:last(tick,'pivotAfter').transforms,
      beforeFold:last(tick,'beforeFoldOut').transforms,afterFold:last(tick,'afterFoldOut').transforms};
    if(blend){
      assert.deepEqual(blend.pose,detail.pose,'detail adds nothing to this vertical pose');
      assert.deepEqual(detail.pose,r.applyInput,'no later pose reapplication');
      const w=actual.weight*(blend.attack?.released&&blend.attack?.rolling?1-blend.rollWeight:1);
      const pred={anchor:pre.pose.anchor.map((v,i)=>Math.fround(v+(actual.anchor[i]-v)*w)),euler:pre.pose.euler.map((v,i)=>Math.fround(v+(actual.rotation[i]-v)*w))};
      assert.deepEqual(pred.anchor,blend.pose.anchor);assert.deepEqual(pred.euler,blend.pose.euler,'one scalar-Euler blend, no duplicate correction');
      r.effectiveWeight=w;r.effort=actual.whip*w;
      r.curveQuaternion=qs(actual.rotation);r.blendQuaternion=qs(blend.pose.euler);
      if(raw)r.displayCorrection=blend.pose.euler[0]-Math.fround(pre.pose.euler[0]+(raw.rawPose.rotation[0]-pre.pose.euler[0])*raw.rawPose.weight);
    }
    rows.push(r);
  }
  for(let i=1;i<rows.length;i++){
    const r=rows[i],prev=rows[i-1];
    r.delta=subtract(r.finalCentre,prev.finalCentre);r.speed=length(r.delta)*60;r.screenDelta=subtract(r.screenCentre,prev.screenCentre);r.screenSpeed=length(r.screenDelta)*60;
    r.IKinputAngle=angular(r.ikInput.q,prev.ikInput.q);r.IKconsumedAngle=angular(r.ikConsumed.q,prev.ikConsumed.q);
    r.IKcorrectionAngle=angular(r.ikInput.q,r.ikConsumed.q);
    const expectedWrist=new T.Quaternion().fromArray(r.afterRightIK.kid.quaternion).multiply(new T.Quaternion().fromArray(r.ikConsumed.q));
    r.nativeWristOrientationError=expectedWrist.angleTo(new T.Quaternion().fromArray(r.afterRightIK.handR.quaternion));
    r.targetStep=distance(r.ikInput.target,prev.ikInput.target);
    // Exact wrist-frame decomposition: translation + changing wrist linear
    // transform + the changing relative weapon/fold/geometry-centre position.
    const m=new T.Matrix4().fromArray(r.handR.matrix),pm=new T.Matrix4().fromArray(prev.handR.matrix);
    const local=new T.Vector3().fromArray(r.finalCentre).applyMatrix4(m.clone().invert());
    const oldLocal=new T.Vector3().fromArray(prev.finalCentre).applyMatrix4(pm.clone().invert());
    const linear=new T.Matrix3().setFromMatrix4(m),oldLinear=new T.Matrix3().setFromMatrix4(pm);
    const translation=subtract(r.handR.position,prev.handR.position);
    const rotation=oldLocal.clone().applyMatrix3(linear).sub(oldLocal.clone().applyMatrix3(oldLinear)).toArray();
    const relative=local.clone().sub(oldLocal).applyMatrix3(linear).toArray();
    const sum=add(add(translation,rotation),relative);
    r.decomposition={translation,rotation,relative,error:distance(sum,r.delta),leverLength:oldLocal.length()};
    assert(r.decomposition.error<1e-10,'wrist chain decomposition closes');
    if(i>1){r.acceleration=subtract(r.delta,prev.delta).map(v=>v*3600);r.accelerationNorm=length(r.acceleration);
      r.screenAcceleration=subtract(r.screenDelta,prev.screenDelta).map(v=>v*3600);r.screenAccelerationNorm=length(r.screenAcceleration);}
  }
  const range=rows.filter(r=>r.tick>=48&&r.tick<=56),max=(key)=>range.reduce((a,b)=>a[key]>b[key]?a:b);
  const o={name,status:'diagnostic measurements; no retail acceptance',nativeRowsExactlyEqual:true,equivalenceExcludes:['cumulative render.info counters from unfrozen boot'],instrumentation:p.instrumentation,
    eventCount:p.layerEvents.length,conditions:p.matchConditions,
    window48to56:{maxSpeed:{tick:max('speed').tick,value:max('speed').speed},maxAcceleration:{tick:max('accelerationNorm').tick,value:max('accelerationNorm').accelerationNorm},
      maxScreenSpeed:{tick:max('screenSpeed').tick,value:max('screenSpeed').screenSpeed},maxScreenAcceleration:{tick:max('screenAccelerationNorm').tick,value:max('screenAccelerationNorm').screenAccelerationNorm},
      totalDistance:range.reduce((s,r)=>s+length(r.delta),0)},rows};
  summary.push(o);
}
assert(summary.every(x=>JSON.stringify(x.conditions)===JSON.stringify(summary[0].conditions)),'all three matched conditions equal');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({schema:1,dt:1/60,units:'INKWAVE units; per-second fixed-tick finite differences; pixels at 800x600',summary},null,2)+'\n');
console.log(JSON.stringify(summary.map(({name,nativeRowsExactlyEqual,window48to56})=>({name,nativeRowsExactlyEqual,window48to56})),null,2));
