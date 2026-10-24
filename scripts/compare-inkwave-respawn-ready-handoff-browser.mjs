#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
assert(!fs.existsSync(output),'Preserve previous evidence');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name,'receipt.json')));
const before=read('browser-before'),after=read('browser-after');
const b=Object.fromEntries(before.rows.map(r=>[r.label,r])),a=Object.fromEntries(after.rows.map(r=>[r.label,r]));
const keys=['tick','position','velocity','alive','grounded','groundHit','phase','spawnTime','spawnPose','ink','turf','rolling','flick','fire','physical','previous','shotCount','paintCalls','projectiles','gameplayMuzzle','pose','layers','body','root','kid','chest','camera','seed','palette','geometry'];
const builds=[];
for(const[name,r]of [['browser-before',before],['browser-after',after]]){
 assert.equal(r.status,'captured');assert.deepEqual(r.errors,[]);
 const archived=path.join(root,name,'build-manifest.json.gz');
 const m=JSON.parse(fs.existsSync(archived)?gunzipSync(fs.readFileSync(archived)):fs.readFileSync(path.join(r.site,'inkwave-build.json')));
 assert.equal(r.build,m.contentHash);assert.equal(r.runtimeResponses.length,5);
 for(const v of r.runtimeResponses){assert.equal(v.status,200);assert.equal(v.sha256,m.artifacts[v.path.slice(1)]);}
 builds.push({name,contentHash:m.contentHash,inputHash:m.inputHash,inputCount:Object.keys(m.files).length,artifactCount:Object.keys(m.artifacts).length,runtimeResponses:r.runtimeResponses,inputs:m.files});
}
const inputDifference=Object.keys(builds[0].inputs).filter(k=>builds[0].inputs[k]!==builds[1].inputs[k]);
assert.deepEqual(Object.keys(builds[0].inputs).sort(),Object.keys(builds[1].inputs).sort());
assert.deepEqual(inputDifference,['patch/runtime/weapon-handoff-motion.mjs']);
for(const v of builds)delete v.inputs;
const labels=Object.keys(b);
for(const label of labels){
 for(const k of keys)assert.deepEqual(a[label][k],b[label][k],`${label}.${k}: canonical/native output`);
 for(const k of ['min','max','size'])for(let i=0;i<3;i++)assert(Math.abs(a[label].localDrumBounds[k][i]-b[label].localDrumBounds[k][i])<1e-12);
 for(const object of ['root','kid','pivot','off','drum'])for(const scale of a[label][object].scale)assert(Math.abs(scale-1)<1e-12);
}
for(const label of ['settled','normal-72','normal-74','normal-133','normal-134','normal-145']){
 if(!b[label])continue;
 for(const k of ['pivot','handR','off','drum','projectedDrum'])assert.deepEqual(a[label][k],b[label][k],`${label}.${k}: display settles to existing ready`);
}
const angle=(x,y)=>2*Math.acos(Math.min(1,Math.abs(x.reduce((s,v,i)=>s+v*y[i],0))))*180/Math.PI;
const delta=(rows,n)=>{
 const p=rows['normal-'+(n-1)],q=rows['normal-'+n];
 return {from:n-1,to:n,angleDegrees:angle(p.pivot.quaternion,q.pivot.quaternion),pivotDistance:Math.hypot(...p.pivot.position.map((v,i)=>v-q.pivot.position[i])),projectedWidthDelta:Math.abs(p.projectedDrum.pixelWidth-q.projectedDrum.pixelWidth),projectedHeightDelta:Math.abs(p.projectedDrum.pixelHeight-q.projectedDrum.pixelHeight),weight:q.handoff.weight};
};
// The unchanged59→60 physical flight is outside the display-return window.
const oldSteps=Array.from({length:8},(_,i)=>delta(b,61+i)),newSteps=Array.from({length:14},(_,i)=>delta(a,61+i));
for(let n=61;n<=74;n++)assert(a['normal-'+n].worldDrumBounds.min[1]>=a['normal-'+n].position[1]-1e-6, `normal-${n}: displayed drum clears supported floor`);
const peak=(steps,key)=>Math.max(...steps.map(v=>v[key]));
for(const k of ['angleDegrees','pivotDistance','projectedHeightDelta'])assert(peak(newSteps,k)<peak(oldSteps,k)*.5,`${k}: bounded native display improvement`);
assert(newSteps[1].angleDegrees>.01,'the old carry is not held unchanged');
assert(a['normal-61'].handoff.weight>0);assert.equal(a['normal-74'].handoff.weight,0);
const unsupported=after.missTrace.filter(r=>r.phase==='landing'&&!r.grounded);
assert(unsupported.length>0);assert(unsupported.some(r=>r.spawnPose.phase==='off'));
assert(unsupported.every(r=>!r.eligible));
assert.equal(a['miss-post'].eligible,true);assert.equal(a['miss-post'].phase,null);assert(a['miss-post'].spawnTime<1.4);assert(a['miss-post'].handoff.weight>0);
for(const r of [...before.rows,...after.rows,...after.missTrace]){
 for(const k of ['shotCount','paintCalls','projectiles','turf'])assert.equal(r[k],0);
 assert.equal(r.ink,100);assert.equal(r.rolling,false);assert.equal(r.flick,-1);
}
const dimensions=Object.fromEntries(['settled','normal-60','normal-61','normal-63','normal-66','normal-145'].map(label=>[label,Object.fromEntries([['before',b],['after',a]].map(([name,rows])=>[name,{pivotQuaternion:rows[label].pivot.quaternion,pivotPosition:rows[label].pivot.position,pixels:[rows[label].projectedDrum.pixelWidth,rows[label].projectedDrum.pixelHeight],intrinsicSize:rows[label].localDrumBounds.size,handoff:rows[label].handoff}]))]));
const result={status:'pass',scope:'Matched native offline Game at fixed60Hz; source/build/browser evidence, no FPS/transport/retail/visual-acceptance claim',builds,inputDifference,canonicalFieldsCompared:keys,matchedNormalLabels:labels,oldSteps,newSteps,peaks:Object.fromEntries(['angleDegrees','pivotDistance','projectedWidthDelta','projectedHeightDelta'].map(k=>[k,{before:peak(oldSteps,k),after:peak(newSteps,k)}])),supportedFloorClearance:Array.from({length:14},(_,i)=>({frame:61+i,minY:a['normal-'+(61+i)].worldDrumBounds.min[1],floor:a['normal-'+(61+i)].position[1]})),dimensions,unsupportedNativePoints:unsupported.length,unsupportedReady:0,firstSupportedPostUpdate:{time:a['miss-post'].spawnTime,eligible:a['miss-post'].eligible,fadeWeight:a['miss-post'].handoff.weight},noInput:{shots:0,paintCalls:0,turf:0,ink:100},settledDisplayExact:true};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,matchedNormalLabels:labels.length,peaks:result.peaks,unsupportedReady:0,firstSupportedPostUpdate:result.firstSupportedPostUpdate},null,2));
