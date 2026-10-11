#!/usr/bin/env node
// Source presence is deliberately separate from runtime use and retail parity.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { MAIN_WEAPON_CATALOG } from '../patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
import { ALL_SUB_SPECS } from '../patches/splatoon3/runtime/all-subs.mjs';
import { ALL_SPECIALS } from '../patches/splatoon3/runtime/all-specials.mjs';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const raw=path.resolve(arg('--reference-dir','.ci-scratch/paint-reference-1130'));
const out=path.resolve(arg('--output','reports/inkwave-paint-reference-audit-2026-10-11.json'));
const commit='7280ff9cde8bb1c5dcef46c700c326471584d2e6';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const esc=s=>String(s).replaceAll('~','~0').replaceAll('/','~1');
function fields(v,p='',inside=false,out=[]){
 inside ||= typeof v?.SpecUpType === 'string' && /paint|splash/i.test(v.SpecUpType);
 if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))fields(x,p+'/'+esc(k),inside||/paint|splash/i.test(k),out);
 else if(inside&&typeof v==='number')out.push({pointer:p,value:v});
 return out;
}
function read(actor){
 const name=actor+'.game__GameParameterTable.json',file=path.join(raw,name),bytes=fs.readFileSync(file),data=JSON.parse(bytes);
 return{sourceUrl:`https://github.com/Leanny/splat3/blob/${commit}/data/parameter/1130/weapon/${name}`,sourceSha256:sha(bytes),data};
}
const mains=MAIN_WEAPON_CATALOG.records.map(r=>{
 const s=read(r.sourceActor);assert.equal(s.sourceSha256,r.sourceSha256,r.id+' pinned hash');
 const retained=fields(r.parameters,'/GameParameters'),all=fields(s.data);
 for(const f of retained){let v=s.data;for(const k of f.pointer.split('/').slice(1))v=v[k.replaceAll('~1','/').replaceAll('~0','~')];assert.equal(v,f.value,r.id+f.pointer);}
 return{id:r.id,name:r.names.en,family:r.family,sourceActor:r.sourceActor,sourceUrl:s.sourceUrl,sourceSha256:s.sourceSha256,
  retainedPaintLeaves:retained.length,rawPaintLeaves:all.length,paintFields:all,
  runtime:r.legacy?'Existing native weapon lane plus weapons-fidelity/agent3 adapters':'runtime/main-weapon-catalog.mjs: mode / impactPaint / floorPaint / finishContact',
  verified:'Pinned source hash and retained numeric leaves; separate Actor paint-reachability receipt required',
  retailParity:'unverified',limitations:r.legacy?['Native raster silhouette and world mapping remain calibrated']:['Fixed paint seed 0','Airborne splash immediately projects to floor','DepthScale below 1 is clamped by nonnegative stretch','Sparse defaults and wall drips incomplete']};
});
const subMap={...Object.fromEntries(Object.entries(ALL_SUB_SPECS).map(([id,r])=>[id,r.source.replace('.game__GameParameterTable.json','')])),bomb:'WeaponBombSplash',suction:'WeaponBombSuction',curling:'WeaponBombCurling',pointSensor:'WeaponPointSensor'};
const specialMap={...Object.fromEntries(Object.entries(ALL_SPECIALS).map(([id,r])=>[id,r.source])),trizooka:'WeaponSpUltraShot',bubbler:'WeaponSpGreatBarrier',inkVac:'WeaponSpBlower',storm:'WeaponSpInkStorm',tacticooler:'WeaponSpEnergyStand',tripleSplashdown:'WeaponSpPogo'};
const map=(mapping,kind)=>Object.entries(mapping).map(([id,actor])=>{const s=read(actor);return{id,sourceActor:actor,sourceUrl:s.sourceUrl,sourceSha256:s.sourceSha256,paintFields:fields(s.data),
 runtime:kind==='sub'?(ALL_SUB_SPECS[id]?'runtime/all-subs.mjs: surfacePaintWithCredit':'native/kit-sub path + sub-special-fidelity'):(ALL_SPECIALS[id]?'runtime/all-specials.mjs: paintStamp / paintDisk / special projectile route':'special-specific runtime/kit implementation'),
 interpretation:kind==='sub'?ALL_SUB_SPECS[id]?.calibration||'Inspect dedicated source connection':ALL_SPECIALS[id]?.status||'Inspect dedicated source connection',
 retailParity:'unverified',verified:'Fresh pinned original table read; this is not proof that every field is consumed'};});
const subs=map(subMap,'sub'),specials=map(specialMap,'special');assert.equal(mains.length,65);assert.equal(subs.length,14);assert.equal(specials.length,19);
const result={schema:1,referenceVersion:'11.3.0',sourceCommit:commit,worldUnitsPerSourceUnit:1,worldUnitsAreSI:false,
 scope:'98 source tables with explicit paint/splash numeric pointers; runtime parity remains separately verified',mains,subs,specials,
 sharedGaps:['Retail stencil textures/meshes are not included; procedural blob/ray/drip shapes are calibration','Face projection, multi-surface cross paint and source units need controlled retail image/area validation','CPU grid is coarse; antialiasing and cosmetic specks are not all gameplay paint','Big-special disk tiling currently extends its nominal radius at outer stamps','Renderer wetness restoration after hidden replay is not certified pixel-identical']};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({mains:mains.length,subs:subs.length,specials:specials.length,rawPaintLeaves:mains.concat(subs,specials).reduce((s,r)=>s+r.paintFields.length,0),output:out}));
