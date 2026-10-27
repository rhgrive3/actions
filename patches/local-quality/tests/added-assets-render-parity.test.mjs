import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {MUZZLE_SPLASH,INK_RING} from '../../splatoon3/runtime/s3-sweps-assets.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const before=read('./fixtures/added-assets/ink-sheets-before.mjs.txt'),after=read('../../splatoon3/runtime/s3-ink-sheets.mjs');
const sheet=source=>new Function('MUZZLE_SPLASH','INK_RING',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return {splashCone,createInkSheets,FIRE_INK};')(MUZZLE_SPLASH,INK_RING);
const old=sheet(before),fresh=sheet(after);
function snap(f){return [f.mesh,f.drillMesh].map(m=>({count:m.count,visible:m.visible,matrix:Buffer.from(m.instanceMatrix.array.buffer),color:Buffer.from(m.instanceColor.array.buffer),attrs:Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,v])=>[k,{bytes:Buffer.from(v.array.buffer),ranges:v.updateRanges.map(r=>({...r}))}])),key:m.material.customProgramCacheKey()}));}
// Only the deliberately versioned shader-program key differs for these legacy
// non-wet scenarios. Keep the immutable baseline and every other byte/field.
function requireLegacySheetDrawParity(current,baseline){
 assert.equal(current.length,2);assert.equal(baseline.length,2);
 assert.equal(baseline[0].key,'s3-ink-sheet-2','pinned baseline sheet key');
 assert.equal(current[0].key,'s3-ink-sheet-wet-wave-1','reviewed current sheet key');
 const expected=[{...baseline[0],key:'s3-ink-sheet-wet-wave-1'},baseline[1]];
 assert.deepEqual(current,expected);
}
test('actual ink sheet draw keeps every matrix, shader input, upload range and branch precedence',()=>{
 const pair=[old,fresh].map(api=>api.createInkSheets(THREE,new THREE.Scene(),{nearDither:'',rim:''}));
 const kinds=Object.keys(old.FIRE_INK),dirs=[new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0),new THREE.Vector3(1e-10,-1,1e-10),new THREE.Vector3(.3,.5,-.8)];
 let frames=0;
 for(const hz of [30,60,120])for(let scenario=0;scenario<24;scenario++){
  for(const f of pair){f.clear();for(let i=0;i<24;i++){const kind=kinds[(i+scenario)%kinds.length],burst=f.add(kind,new THREE.Vector3(i%3,1,-i%7),dirs[i%dirs.length],new THREE.Color(.1,.7,.3),i*.371+scenario,0);if(burst?.kind==='arrow'&&i%2)burst.horizontalSweep=true;}f.drill(new THREE.Vector3(1,2,3),dirs[3],new THREE.Color(.1,.2,.3),.2,0,1);}
  for(let frame=0;frame<18;frame++){const time=frame/hz;const a=pair[0].draw(time,new THREE.Vector3()),b=pair[1].draw(time,new THREE.Vector3());assert.deepEqual(b,a);requireLegacySheetDrawParity(snap(pair[1]),snap(pair[0]));frames++;}
 }
 for(const f of pair)f.dispose();assert.equal(frames,1296);
});
test('splash public values and fresh result ownership remain exact; hot caller may own its result',()=>{
 const scratch={};for(let i=0;i<20000;i++){const cfg={minLength:Math.sin(i)*2,length:Math.cos(i)*5,radius:(i%19)*.13},age=(i%103)/100,layer=i%4;const a=old.splashCone(cfg,age,layer),b=fresh.splashCone(cfg,age,layer,scratch);assert.equal(b,scratch);assert(Object.is(a.length,b.length));assert(Object.is(a.radius,b.radius));}assert.notEqual(fresh.splashCone(old.FIRE_INK.shot,.2,0),fresh.splashCone(old.FIRE_INK.shot,.2,0));
});
test('true arrows eliminate draw clones while horizontal overrides preserve the old basis',()=>{
 const pair=[old,fresh].map(api=>api.createInkSheets(THREE,new THREE.Scene(),{nearDither:'',rim:''}));for(const f of pair)f.add('arrow',new THREE.Vector3(),new THREE.Vector3(.2,.5,.7),new THREE.Color(),.2,0);
 const clone=THREE.Vector3.prototype.clone;let copies=0;THREE.Vector3.prototype.clone=function(){copies++;return clone.call(this);};
 try{pair[0].draw(.02,null);const baseline=copies;copies=0;pair[1].draw(.02,null);assert.equal(baseline,4);assert.equal(copies,0);requireLegacySheetDrawParity(snap(pair[1]),snap(pair[0]));}finally{THREE.Vector3.prototype.clone=clone;for(const f of pair)f.dispose();}
});
const oldHud=new Function(read('./fixtures/added-assets/hud-look-before.mjs.txt').replace(/^export /gm,'')+';return adaptS3HudLook;')();
const hudRaw=read('../../../inkwave-public/src/ui/hud.js');
function tubeMethod(source){const i=source.indexOf('  _s3TankTube('),j=source.indexOf('\n  }',i)+4;assert(i>=0&&j>i);return source.slice(i,j);}
const tankMethods=[oldHud('src/ui/hud.js',hudRaw),adaptBuildSource('src/ui/hud.js',hudRaw)].map(s=>new Function('innerWidth','innerHeight',`return class {${tubeMethod(s)}}`));
const makeTank=(C,w,h)=>{const t=new (C(w,h))();t._L={};t._tank={t:0};t._tube=[{setAttribute(_k,v){this.d=v;}},{setAttribute(_k,v){this.d=v;}}];t.tank={offsetLeft:-20,offsetTop:11,offsetWidth:60,offsetHeight:110};return t;};
test('actual composed squid tube keeps 50000 exact SVG strings across geometry and phase changes',()=>{
 const pair=tankMethods.map(C=>makeTank(C,1280,720));
 for(let i=0;i<50000;i++){
  for(const t of pair){if(i%101===0)t._L.tubeGeo=null;if(i%137===0){t.tank.offsetLeft=-20+(i%13);t.tank.offsetTop=(i%11)-5;t.tank.offsetHeight=70+i%61;}if(i%389===0&&t._L.tubeGeo)t._L.tubeGeo.w+=.03125;t._tank.t=i*.013;}
  const ink=[0,.5,.99499,.995,1][i%5],dt=[1/30,1/60,1/120,.2,0][i%5];for(const t of pair)t._s3TankTube(ink,dt);assert.equal(pair[1]._tube[0].d,pair[0]._tube[0].d);assert.equal(pair[1]._tube[1].d,pair[0]._tube[1].d);assert.equal(pair[1]._L.tubePhase,pair[0]._L.tubePhase);
 }
});

test('the exact shader-key exception never hides changed draw state or unrelated keys',()=>{
 const pair=[old,fresh].map(api=>api.createInkSheets(THREE,new THREE.Scene(),{nearDither:'',rim:''}));
 try{
  for(const f of pair){f.add('arrow',new THREE.Vector3(),new THREE.Vector3(.2,.5,.7),new THREE.Color(),.2,0);f.draw(.02,null);}
  const a=snap(pair[1]),b=snap(pair[0]);requireLegacySheetDrawParity(a,b);
  const copy=rows=>rows.map(r=>({...r,matrix:Buffer.from(r.matrix),color:Buffer.from(r.color),attrs:Object.fromEntries(Object.entries(r.attrs).map(([k,v])=>[k,{...v,bytes:Buffer.from(v.bytes),ranges:v.ranges.map(x=>({...x}))}]))}));
  const mutations=[
   r=>{r[0].key='s3-ink-sheet-2';},r=>{r[0].key='unknown';},r=>{delete r[0].key;},
   r=>{r[1].key='s3-ink-drill-unknown';},r=>{r[0].count++;},r=>{r[0].visible=!r[0].visible;},
   r=>{r[0].matrix[0]^=1;},r=>{r[0].color[0]^=1;},
   r=>{Object.values(r[0].attrs)[0].bytes[0]^=1;},r=>{Object.values(r[0].attrs)[0].ranges.push({start:0,count:1});},
  ];
  for(const mutate of mutations){const current=copy(a),baseline=copy(b);requireLegacySheetDrawParity(current,baseline);mutate(current);assert.throws(()=>requireLegacySheetDrawParity(current,baseline));}
  const corruptBaseline=copy(b);corruptBaseline[0].key='s3-ink-sheet-wet-wave-1';assert.throws(()=>requireLegacySheetDrawParity(copy(a),corruptBaseline));
 }finally{for(const f of pair)f.dispose();}
});
