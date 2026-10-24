#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
assert(!fs.existsSync(output),'Preserve earlier evidence');
const read=tag=>JSON.parse(fs.readFileSync(path.join(root,tag,'receipt.json')));
const before=read('browser-before'),after=read('browser-after');
const b=Object.fromEntries(before.rows.map(r=>[r.label,r])),a=Object.fromEntries(after.rows.map(r=>[r.label,r]));
const manifests=[];
for(const[tag,r]of [['browser-before',before],['browser-after',after]]){
 assert.equal(r.status,'captured');assert.deepEqual(r.errors,[]);
 const archive=path.join(root,tag,'build-manifest.json.gz');
 const m=JSON.parse(fs.existsSync(archive)?gunzipSync(fs.readFileSync(archive)):fs.readFileSync(path.join(r.site,'inkwave-build.json')));
 assert.equal(m.contentHash,r.build);assert.equal(r.runtimeResponses.length,5);
 for(const v of r.runtimeResponses){assert.equal(v.status,200);assert.equal(v.sha256,m.artifacts[v.path.slice(1)]);}
 manifests.push(m);
}
assert.deepEqual(Object.keys(manifests[0].files),Object.keys(manifests[1].files));
const changedInputs=Object.keys(manifests[0].files).filter(k=>manifests[0].files[k]!==manifests[1].files[k]);
assert.deepEqual(changedInputs,['patch/runtime/weapon-handoff-motion.mjs']);
const pre=['settled','normal-59','normal-60','normal-61','normal-62'];
for(const label of pre){
 for(const k of Object.keys(b[label]))if(k!=='handoff')assert.deepEqual(a[label][k],b[label][k],`${label}.${k}: ordinary bd5 display/native path unchanged`);
 assert.equal(a[label].handoff?.weight??0,b[label].handoff?.weight??0);
}
const canonical=['tick','position','velocity','alive','grounded','groundHit','phase','spawnTime','spawnPose','eligible','ink','turf','rolling','flick','fire','physical','previous','shotCount','paintCalls','projectiles','gameplayMuzzle','pose','channels','layers','body','root','kid','chest','camera','seed','palette','geometry'];
for(const label of ['reset-immediate','reset-first','reset-settled'])for(const k of canonical)assert.deepEqual(a[label][k],b[label][k],`${label}.${k}: native reset and authority unchanged`);
assert(b['normal-62'].handoff.weight>0&&b['normal-62'].handoff.weight<1);
assert.deepEqual(a['normal-62'].handoff,b['normal-62'].handoff,'reset enters from the same active midpoint');
assert.equal(b['reset-immediate'].handoff.weight,b['normal-62'].handoff.weight);
assert(b['reset-first'].handoff.weight>0,'bd5 old display actually continues after reset');
assert.equal(a['reset-immediate'].handoff,null,'new reset retires old display record immediately');
assert.equal(a['reset-first'].handoff.weight,0);
assert.equal(a['reset-settled'].handoff.weight,0);
for(const k of ['pivot','handR','off','drum','projectedDrum'])assert.deepEqual(a['reset-settled'][k],b['reset-settled'][k],`settled existing pose ${k}`);
for(const r of [...before.rows,...after.rows]){
 for(const k of ['shotCount','paintCalls','projectiles','turf'])assert.equal(r[k],0);
 assert.equal(r.ink,100);assert.equal(r.rolling,false);assert.equal(r.flick,-1);
}
const values=rows=>Object.fromEntries(['normal-62','reset-immediate','reset-first','reset-settled'].map(label=>[label,{handoff:rows[label].handoff,pivot:rows[label].pivot.quaternion,position:rows[label].position,grounded:rows[label].grounded,drumMinY:rows[label].worldDrumBounds.min[1]}]));
const result={status:'pass',scope:'Matched real offline Game with direct Actor.reset in an active display return; no preceding jump/weapon/hide invalidation, fixed60Hz input, no FPS/transport/retail acceptance claim',changedInputs,builds:manifests.map(m=>({inputHash:m.inputHash,contentHash:m.contentHash,inputs:Object.keys(m.files).length,artifacts:Object.keys(m.artifacts).length})),unchangedPreResetLabels:pre,canonicalResetFields:canonical,before:values(b),after:values(a),noInput:{shot:0,paint:0,turf:0,ink:100},settledExistingDisplayExact:true};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'pass',oldAfterReset:b['reset-immediate'].handoff,oldFirstNewUpdate:b['reset-first'].handoff,newAfterReset:a['reset-immediate'].handoff,newFirstNewUpdate:a['reset-first'].handoff,preResetExact:pre.length},null,2));
