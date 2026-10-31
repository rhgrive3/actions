import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {updateRippleUniforms} from '../ink-ripple-presentation.mjs';
import {adaptInkRipplePresentation} from '../ink-ripple-presentation-adapter.mjs';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/idle-followup-baseline-c0938a3f.json',import.meta.url)));
const once=(s,a,b)=>{assert.equal(s.split(a).length,2);return s.replace(a,b)};
const raw=frozen.files['inkwave-public/src/world/inkShading.js'];
const load=source=>new Function('THREE','updateRippleUniforms',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return {inkUniforms,inkBeforeRender,INK_PARS,INK_SLOPE,INK_COLOR,INK_ROUGH,INK_GEL,INK_EMISSIVE,INK_LIGHTS,INK_LIGHT_MAPS,INK_SHADE};')(THREE,updateRippleUniforms);
const before=load(raw),after=load(adaptInkRipplePresentation('src/world/inkShading.js',fs.readFileSync(new URL('../../../inkwave-public/src/world/inkShading.js',import.meta.url),'utf8'),once));
const rows=(u,n=24)=>Array.from({length:n},(_,i)=>[...u.uRip.value[i].toArray(),...u.uRipP.value[i].toArray()]);
const live=(U,n=24)=>rows(U,n).filter(r=>{const age=Math.fround(Math.fround(U.uInkClock.value)-Math.fround(r[3]));return !(age<=0||age>=Math.fround(r[7]));});
const paint=()=>({clock:1,rip:new Float32Array(96),ripP:new Float32Array(96)});
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
test('stable packed prefix matches original float32-visible slot order across sparse/random tables and boundaries',()=>{
 const r=rng(91),a=before.inkUniforms(),b=after.inkUniforms();
 for(let scene=0;scene<2500;scene++){
  const p=paint();p.clock=[0,1,8.7,10,1e4,1e6][scene%6]+r()*.01;
  for(let i=0;i<24;i++){const o=i*4;p.rip.set([i,r()*4,r()*3,p.clock+(r()-.5)*2],o);p.ripP.set([.01+r()*.01,.12+r()*.2,1,r()],o);if(i===scene%24)p.rip[o+3]=p.clock;if(i===(scene+1)%24)p.rip[o+3]=p.clock-p.ripP[o+3];}
  const A=Buffer.from(p.rip.buffer).toString('hex'),B=Buffer.from(p.ripP.buffer).toString('hex');before.inkBeforeRender(a,p);after.inkBeforeRender(b,p);
  assert.deepEqual(live(b,b.uRipActiveCount.value),live(a));assert.equal(b.uRipActiveCount.value,live(a).length);assert.equal(Buffer.from(p.rip.buffer).toString('hex'),A);assert.equal(Buffer.from(p.ripP.buffer).toString('hex'),B);
 }
});
test('expiry filtering uses shader float precision and refreshes after same-clock between-pass replacement',()=>{
 const p=paint(),U=after.inkUniforms();p.clock=8.7;p.rip[3]=8;p.ripP[3]=.7;assert(p.clock-p.rip[3]>=p.ripP[3],'a naive JS double filter wrongly discards this live shader ripple');after.inkBeforeRender(U,p);assert.equal(U.uRipActiveCount.value,1);assert.equal(U.uRip.value[0].w,8);
 p.rip[3]=-99;p.rip.set([7,1,2,8.5],4*23);p.ripP.set([.01,.2,1,.8],4*23);after.inkBeforeRender(U,p);assert.equal(U.uRipActiveCount.value,1);assert.equal(U.uRip.value[0].x,7);
 p.clock=20;after.inkBeforeRender(U,p);assert.equal(U.uRipActiveCount.value,0);
 delete p.rip;after.inkBeforeRender(U,p);assert.equal(U.uRipActiveCount.value,0);
});
test('empty table has zero Vector4 writes; full-table fallback remains byte/order equivalent',()=>{
 const p=paint(),a=before.inkUniforms(),b=after.inkUniforms(),fallback=after.inkUniforms(false);p.rip.fill(0);p.ripP.fill(0);let writes=0;for(const v of [...b.uRip.value,...b.uRipP.value]){const set=v.set;v.set=function(...args){writes++;return set.apply(this,args)}}
 for(let i=0;i<120;i++)after.inkBeforeRender(b,p);assert.equal(writes,0);assert.equal(b.uRipActiveCount.value,0);
 p.clock=1.2;for(let i=0;i<96;i++){p.rip[i]=i*.01;p.ripP[i]=i*.02;}before.inkBeforeRender(a,p);after.inkBeforeRender(fallback,p);assert.deepEqual(rows(fallback),rows(a));assert.equal(fallback.uRipActiveCount.value,24);
});
test('GLSL retains every original ripple arithmetic statement after the derivative scope repair and supports an actual full-table material variant',()=>{
 const full=after.INK_SLOPE.replace(/#ifndef INK_RIPPLE_FULL_TABLE\n[\s\S]*?#endif\n/g,'');
 // Preserve the frozen arithmetic oracle. Reverse only the independently
 // reviewed footprint relocation; missing/duplicate declarations fail closed.
 const hoisted='  // Keep the pixel footprint outside every spatial ripple/coverage branch.\n  float rFar = 1.0 - smoothstep(0.05, 0.18, length(fwidth(vWPos)));\n';
 const clamp='    if (rl > 0.75) rS *= 0.75 / rl;';
 const frozenLayout=once(once(full,hoisted,''),clamp,clamp+'\n    float rFar = 1.0 - smoothstep(0.05, 0.18, length(fwidth(vWPos)));');
 assert.equal(frozenLayout,before.INK_SLOPE);
 assert.ok(full.indexOf('fwidth(vWPos)')<full.indexOf('if (gInk > 0.01)'));
 assert.match(after.INK_SLOPE,/if \(i >= uRipActiveCount\) break/);
 let source=fs.readFileSync(new URL('../../../inkwave-public/src/world/levelMaterial.js',import.meta.url),'utf8');source=adaptInkRipplePresentation('src/world/levelMaterial.js',source,once);
 const names=Object.keys(after),factory=new Function('THREE','TEXLIB_GLSL','STAGE_SURFACES','FIRST_STAGE_SLOT','LAST_STAGE_SLOT','G',...names,source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return createLevelMaterial;')(THREE,'',[],28,28,{},...names.map(k=>after[k]));
 for(const packed of [true,false]){const mat=factory(null,1024,null,{ripplePacking:packed});assert.equal(mat.userData.uniforms.uRipActiveCount.packed,packed);assert.equal(!!mat.defines?.INK_RIPPLE_FULL_TABLE,!packed);const sh={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};mat.onBeforeCompile(sh);assert.match(sh.fragmentShader,/uRipActiveCount/);mat.dispose();}
});
test('missing or duplicate render hook body fails protected composition',()=>{
 const needle='  const ra = U.uRip.value, rb = U.uRipP.value;';assert.throws(()=>adaptInkRipplePresentation('src/world/inkShading.js',raw.replace(needle,''),once));
 assert.throws(()=>adaptInkRipplePresentation('src/world/inkShading.js',raw+'\n'+raw.slice(raw.indexOf('export function inkBeforeRender'),raw.indexOf('// ---------------------------------------------------------------------------------------------------- fragment pars')),once));
});
test('actual PaintSystem 24-slot priority table and 25th replacement stay authoritative at all three render rates',()=>{
 const source=fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js',import.meta.url),'utf8'),start=source.indexOf('  ripple(pos, amp ='),end=source.indexOf('\n  }\n',start)+4;
 const ripple=new Function('RIP_N','return ({'+source.slice(start,end)+'}).ripple;')(24);
 for(const hz of [30,60,120]){
  const p=paint();p.clock=10;p.rip.fill(0);p.ripP.fill(0);for(let i=0;i<24;i++){p.rip[i*4+3]=-99;p.ripP[i*4+3]=.01;}p._ripS=new Float32Array(24);
  for(let i=0;i<25;i++)ripple.call(p,new THREE.Vector3(i,0,0),.001+i*.001,.14,1.2,.7);
  assert.equal(p.rip.filter((_,i)=>i%4===3&&p.rip[i]===10).length,24);
  const A=Buffer.from(p.rip.buffer).toString('hex'),B=Buffer.from(p.ripP.buffer).toString('hex'),S=Buffer.from(p._ripS.buffer).toString('hex'),a=before.inkUniforms(),b=after.inkUniforms();
  for(let tick=0;tick<hz*5;tick++){p.clock=10+tick/hz;before.inkBeforeRender(a,p);after.inkBeforeRender(b,p);assert.deepEqual(live(b,b.uRipActiveCount.value),live(a));}
  assert.equal(b.uRipActiveCount.value,0);assert.equal(Buffer.from(p.rip.buffer).toString('hex'),A);assert.equal(Buffer.from(p.ripP.buffer).toString('hex'),B);assert.equal(Buffer.from(p._ripS.buffer).toString('hex'),S);
 }
});
