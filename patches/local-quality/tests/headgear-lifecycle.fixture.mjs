import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';import test from 'node:test';
const site=process.env.INKWAVE_HEADGEAR_SITE;if(!site)throw Error('INKWAVE_HEADGEAR_SITE required');const load=rel=>import(pathToFileURL(path.join(site,rel)).href);
const {install}=await load('patches/splatoon3/runtime/install.mjs');install(JSON.parse(fs.readFileSync(path.join(site,'patches/splatoon3/profile.json'))));
const {Character}=await load('src/game/character.js');const {G}=await load('src/core/ctx.js');const {resolveStyle,randomStyle,HATS}=await load('src/game/character-style.js');const {headgearState,warmHeadgear}=await load('patches/local-quality/headgear/lifecycle.mjs');
const {randomStyle:originalRandomStyle}=await import(new URL('../../../inkwave-public/src/game/character-style.js',import.meta.url));
const {adaptHeadgear}=await import('../headgear-adapter.mjs');
const state={form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:false,charge:0,ink:1,hp:1,vy:0};
const make=(hat)=>{G.settings={quality:'high'};const c=new Character({name:'headgear-lifecycle',sourceMotion:false,isLocal:true,style:{hat,hair:0,skin:2,outfit:0,eyes:0}});c.onEvent=null;return c;};
function group(c){const s=headgearState(c);return s.groups.find(g=>g.lod===s.active).group;}
function visible(c){return headgearState(c).groups.filter(x=>x.group.visible).length;}
test('persisted headgear IDs remain stable and original random pool does not expand',()=>{assert.equal(HATS.length,12);for(let hat=0;hat<12;hat++)assert.equal(resolveStyle(JSON.parse(JSON.stringify({hat}))).hat,hat);for(let i=0;i<1000;i++){let seed=i+1;const st=randomStyle(()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296));seed=i+1;const old=originalRandomStyle(()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296));assert.deepEqual(st,old);assert(st.hat>=0&&st.hat<=3);}});
test('existing no-hat Character allocates no new gear',()=>{const c=make(0);assert.equal(headgearState(c),null);c.dispose();});
for(const hat of [4,5,6,7,8,9,10,11])test('headgear '+hat+' owns LOD/quality/color/form/disposal lifecycle',()=>{
 const c=make(hat);assert.equal(c.skeleton.bones.length,87);assert.equal(headgearState(c).active,'game');assert.equal(group(c).parent,c.bones.head);assert.equal(visible(c),1);
 for(let i=0;i<4;i++)for(const lod of ['hero','far','game']){c.setLod(lod);assert.equal(headgearState(c).active,lod);assert.equal(visible(c),1);}
 assert.equal(headgearState(c).groups.length,3);const original=headgearState(c).groups.map(x=>x.group);
 let colorCalls=0, colorHooks=0;for(const g of original){const fn=g.userData.setInkColor||g.setInkColor;if(fn){colorHooks++;const wrap=(value)=>{colorCalls++;return fn.call(g,value);};if(g.userData.setInkColor)g.userData.setInkColor=wrap;else g.setInkColor=wrap;}}
 c.setColor('#e637ab');assert.equal(colorCalls,colorHooks);assert.equal(c.color.getHex(),0xe637ab);if(hat<7)for(const g of original){let matched=false;g.traverse(o=>{if(o.material?.color?.getHex()===0xe637ab)matched=true;if(o.material){const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>'};o.material.onBeforeCompile(shader,{});if(shader.uniforms.earInk?.value?.getHex()===0xe637ab)matched=true;}});assert(matched,'team material updated in each cached LOD');}for(const g of original){assert.equal(g.parent,c.bones.head);g.traverse(o=>{if(o.isMesh)for(const value of o.geometry.attributes.position.array)assert(Number.isFinite(value));});}
 c.setLod(null);c.inWorld=true;c._rendered=false;c._screenPx=()=>1;c._updateLod(.016);assert.equal(headgearState(c).active,'far');c._screenPx=()=>10000;c._updateLod(.016);assert.equal(headgearState(c).active,'hero');
 G.settings.quality='low';c._updateLod(.016);assert(headgearState(c).signature.endsWith(':low'));assert(original.every(g=>!g.parent));
 warmHeadgear(c);assert.equal(headgearState(c).groups.length,3);assert.equal(visible(c),1);
 c.inWorld=false;c.setLod('game');for(let i=0;i<35;i++)c.update(1/60,{...state,form:'swim'});assert.equal(c.kid.visible,false);assert.equal(group(c).parent,c.bones.head);for(let i=0;i<35;i++)c.update(1/60,state);assert.equal(c.kid.visible,true);
 c.setVisible(false);assert.equal(c.root.visible,false);c.setVisible(true);assert.equal(c.root.visible,true);
 const all=headgearState(c).groups.map(x=>x.group),resources=new Set();for(const g of all)g.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});const events=new Map();for(const x of resources)x.addEventListener('dispose',()=>events.set(x,(events.get(x)||0)+1));
 c.dispose();c.dispose();assert.equal(headgearState(c),null);assert(all.every(g=>!g.parent));assert.equal(events.size,resources.size);for(const n of events.values())assert.equal(n,1);
});
test('ten gear replacements release all owned attachments without touching shared body geometry',()=>{for(let i=0;i<10;i++){const c=make(4+i%8),body=c.meshes.skin.geometry;let disposed=false;body.addEventListener('dispose',()=>disposed=true);warmHeadgear(c);const all=headgearState(c).groups.map(x=>x.group);c.dispose();assert.equal(headgearState(c),null);assert(all.every(g=>!g.parent));assert.equal(disposed,false);}});

test('build adapter fails closed on absent or duplicated catalog anchors',()=>{const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/character-style.js',import.meta.url),'utf8');assert.throws(()=>adaptHeadgear('src/game/character-style.js',raw.replace("export const HATS =","const HATS =")),/headgear conflict/);assert.throws(()=>adaptHeadgear('src/game/character-style.js',raw+raw),/headgear conflict/);});

for(const hat of [4,5])test('new material hooks preserve authored weave and share native damage/flash uniforms '+hat,()=>{const c=make(hat),s=headgearState(c),materials=new Set();for(const {group} of s.groups)group.traverse(o=>{if(o.material)materials.add(o.material);});let weave=false;for(const m of materials){const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>'};m.onBeforeCompile(shader,{});assert.equal(shader.uniforms.uHurt,c.u.uHurt);assert.equal(shader.uniforms.uFlash,c.u.uFlash);assert(shader.fragmentShader.includes('float iwHurtM'));assert(shader.fragmentShader.includes('totalEmissiveRadiance += uFlash'));if(shader.fragmentShader.includes('weaveUV')){weave=true;assert(shader.fragmentShader.indexOf('float iwHurtM')>shader.fragmentShader.indexOf('weaveUV'),'damage follows authored weave');}}assert(weave);c.dispose();});

const {createInkBlackFlapCap,INK_BLACK_FLAP_CAP_FIT}=await load('patches/local-quality/headgear/character-headgear-ink-black-flap-cap.js');
for(const lod of ['far','game','hero'])test('cap '+lod+' authored panels consume native clearance instead of ignoring the callback',()=>{
 let calls=0;const compact=createInkBlackFlapCap({lod,clearance:()=>0}),expanded=createInkBlackFlapCap({lod,clearance:()=>{calls++;return .18;}});
 try{let moved=0;assert.equal(compact.children.length,expanded.children.length);for(let i=0;i<compact.children.length;i++){const a=compact.children[i].geometry.attributes.position.array,b=expanded.children[i].geometry.attributes.position.array;assert.equal(a.length,b.length);for(let j=0;j<a.length;j+=3)if(Math.hypot(a[j]-b[j],a[j+1]-b[j+1],a[j+2]-b[j+2])>.005)moved++;}assert(calls>100,'actual native callback used');assert(moved>100,'clearance must change the authored geometry');}finally{compact.dispose();expanded.dispose();}
});
test('cap rear hair exit stays below its authored rear skirt hem',()=>{const g=createInkBlackFlapCap({lod:'game',clearance:()=>0});let rearHemElevation=Infinity;try{g.traverse(o=>{if(!o.isMesh)return;for(const part of o.geometry.userData.parts||[]){if(!part.name.startsWith('side-flap-'))continue;for(let j=part.firstIndex;j<part.firstIndex+part.indexCount;j++){const i=o.geometry.index.array[j],p=o.geometry.attributes.position,x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(Math.abs(x)<.0001&&z<0)rearHemElevation=Math.min(rearHemElevation,Math.atan2(y-.164,Math.hypot(x,z-.014)));}}});assert(Number.isFinite(rearHemElevation));assert(INK_BLACK_FLAP_CAP_FIT.rim(Math.PI)<=rearHemElevation+.01,'hair must exit beneath the actual rear cover instead of the crown seam');}finally{g.dispose();}});

for(const hat of [4,5,6,7,8,9,10,11])test('headgear '+hat+' warmup borrows owned fit without acquiring hair',async()=>{
 const {hairStats}=await load('patches/splatoon3/runtime/hair-cache.mjs');
 const {HEADGEAR}=await load('patches/local-quality/headgear/catalog.mjs');
 const item=HEADGEAR.find(x=>x.id===hat),create=item.create,calls=[];let c;
 item.create=options=>{calls.push(options.ctx);return create(options);};
 try {
  c=make(hat);const before=hairStats(),fit=c.hairKeys483[0].entry.hatContext;
  assert.deepEqual(c.hairKeys483.map(r=>r.lod),['game']);
  warmHeadgear(c);assert.deepEqual(hairStats(),before);assert.equal(headgearState(c).groups.length,3);
  assert.equal(calls.length,3);if(item.fit.preserveHair){assert.equal(fit,null);assert(calls.every(ctx=>ctx.preserveHair&&ctx.offIn(0,0)===0));}else assert(calls.every(ctx=>ctx===fit),'warmup must borrow the exact owned native fit');
  c._updateLod(0);G.settings.quality='low';c._updateLod(0);
  assert.equal(c.hairAnatomy483,null);assert(c.hairKeys483.length>0);
  const rebuilt=hairStats(),freshFit=c.hairKeys483[0].entry.hatContext;
  if(item.fit.preserveHair)assert.equal(freshFit,null);else assert.notEqual(freshFit,fit);warmHeadgear(c);assert.deepEqual(hairStats(),rebuilt);
  const liveFits=new Set(c.hairKeys483.map(r=>r.entry.hatContext));
  assert.equal(calls.length,6);if(item.fit.preserveHair)assert(calls.slice(3).every(ctx=>ctx.preserveHair));else assert(calls.slice(3).every(ctx=>ctx!==fit&&liveFits.has(ctx)),'quality rebuild must use fresh owned fits');
 } finally {item.create=create;c?.dispose();}
 assert.equal(hairStats().entries,0);assert.equal(hairStats().liveUsers,0);
});

for(const lod of ['far','game','hero'])test('armor flat earprint '+lod+' preserves ink and native hurt/flash shader contracts',()=>{
 const c=make(4);c.setLod(lod);c.setColor('#8844bb');let count=0;const materials=new Set();group(c).traverse(o=>{if(o.material)materials.add(o.material);});
 try{for(const material of materials){const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>'};material.onBeforeCompile(shader,{});if(!shader.uniforms.earInk)continue;count++;const ink=shader.uniforms.earInk;assert.equal(ink.value.getHex(),0x8844bb);assert.equal(shader.uniforms.uHurt,c.u.uHurt);assert.equal(shader.uniforms.uFlash,c.u.uFlash);assert(shader.fragmentShader.indexOf('dotInk')<shader.fragmentShader.indexOf('float iwHurtM'),'native damage must follow print color');assert(shader.fragmentShader.includes('totalEmissiveRadiance += uFlash'));assert(material.customProgramCacheKey().includes('inkwave-armor-flat-earprint-v1'));assert(material.customProgramCacheKey().includes('iw-headgear-signals-v1'));c.setColor('#33cc88');assert.equal(shader.uniforms.earInk,ink);assert.equal(ink.value.getHex(),0x33cc88);assert(!shader.vertexShader.includes('\\n'));assert(!shader.fragmentShader.includes('\\n'));}assert.equal(count,1,'one material owns flat non-emissive ear print');}finally{c.dispose();}
});

const THREE=await import('three');
for(const lod of ['far','game','hero'])for(const side of [-1,1])test('armor ear '+side+' '+lod+' has outward visible front and back panels',async()=>{
 const {HEADGEAR}=await load('patches/local-quality/headgear/catalog.mjs');const g=HEADGEAR.find(x=>x.id===4).create({lod});g.updateMatrixWorld(true);
 try{const vertices=[[side*.181,.249,.002],[side*.300,.154,.015],[side*.185,.090,.035]],ray=new THREE.Raycaster();for(const weights of [[.2,.6,.2],[.2,.3,.5],[.5,.3,.2]]){const p=new THREE.Vector3();for(let i=0;i<3;i++)p.addScaledVector(new THREE.Vector3(...vertices[i]),weights[i]);for(const sign of [-1,1]){ray.set(new THREE.Vector3(p.x,p.y,sign*.5),new THREE.Vector3(0,0,-sign));const hit=ray.intersectObject(g,true)[0];assert(hit,`ear ${side} ${lod} ${sign<0?'rear':'front'} must be visible`);assert.equal(hit.object.material.side,THREE.FrontSide,'correct winding required, not DoubleSide workaround');assert(Math.abs(hit.point.z-(p.z+sign*.0175))<.00002,'first visible surface must be the actual ear face, not interior pad or opposite panel');const index=hit.face,position=hit.object.geometry.attributes.position,a=new THREE.Vector3().fromBufferAttribute(position,index.a),b=new THREE.Vector3().fromBufferAttribute(position,index.b),c=new THREE.Vector3().fromBufferAttribute(position,index.c),normal=b.sub(a).cross(c.sub(a)).normalize();assert(normal.z*sign>.8,'face winding points out of prism');}}}finally{g.userData.dispose();}
});

// ShaderLib is intentionally not exported by the production Three bundle. Read
// its locked vendored shader literals for hook-order checks; exact-head browser
// QA still performs actual WebGL compilation and hurt/flash pixel assertions.
const nativeThreeSource=fs.readFileSync(new URL('../../../inkwave-public/vendor/three/build/three.module.js',import.meta.url),'utf8');
function physicalShaderLiteral(stage){const symbol=nativeThreeSource.match(new RegExp('meshphysical_'+stage+':\\s*([\\w$]+)'))?.[1];assert(symbol,'native physical shader mapping');const line=nativeThreeSource.split('\n').find(x=>x.startsWith('const '+symbol+' = '));assert(line?.endsWith(';'),'native physical shader literal');return JSON.parse(line.slice(('const '+symbol+' = ').length,-1));}
for(const lod of ['far','game','hero'])test('armor coating '+lod+' preserves physical lighting, native signals and owned material disposal',()=>{
 const c=make(4);c.setLod(lod);const g=group(c),m=g.children.find(x=>x.name==='shell')?.material;
 try{
  assert(m?.isMeshPhysicalMaterial);assert.equal(m.clearcoat,.55);assert.equal(m.clearcoatRoughness,.18);assert.equal(m.roughness,.58);assert.equal(m.metalness,.13);assert.equal(m.color.getHex(),0x363b3e);
  const shader={uniforms:{},vertexShader:physicalShaderLiteral('vert'),fragmentShader:physicalShaderLiteral('frag')};m.onBeforeCompile(shader,{});const f=shader.fragmentShader;
  assert(f.includes('uniform float clearcoat;'));assert(f.includes('#include <clearcoat_normal_fragment_begin>'));assert(f.includes('#include <lights_physical_fragment>'));
  assert(f.includes('weaveUV'));assert(f.includes('float iwHurtM'));assert(f.indexOf('weaveUV')<f.indexOf('float iwHurtM'));assert(f.indexOf('float iwHurtM')<f.indexOf('#include <roughnessmap_fragment>'));assert(f.includes('totalEmissiveRadiance += uFlash;'));
  for(const key of ['uHurt','uHurtSeed','uFlash'])assert.equal(shader.uniforms[key],c.u[key]);
  assert(m.customProgramCacheKey().includes('inkwave-armor-twill-v3|iw-headgear-signals-v1'));
  c.setColor('#e637ab');assert.equal(m.color.getHex(),0x363b3e);assert.equal(m.clearcoat,.55);assert.equal(m.clearcoatRoughness,.18);
  let disposed=0;m.addEventListener('dispose',()=>disposed++);c.dispose();c.dispose();assert.equal(disposed,1);
 }finally{c.dispose();}
});

const {buildOwnedHairStyle}=await load('src/game/character-geo.js');
const {HEADGEAR}=await load('patches/local-quality/headgear/catalog.mjs');
test('face accessories preserve every native hair vertex, attribute, index and rest pose',()=>{
 for(const quality of ['low','high']){G.settings={quality};for(let hair=0;hair<8;hair++)for(const lod of ['hero','game','far']){
  const bare=buildOwnedHairStyle({hair,hat:0,brows:0},lod);
  try{for(const hat of [8,10]){const fit=buildOwnedHairStyle({hair,hat,brows:0},lod);try{
   assert.equal(fit.hatContext,null);assert.deepEqual(Object.keys(fit.geo.attributes),Object.keys(bare.geo.attributes));
   for(const key of Object.keys(bare.geo.attributes))assert.deepEqual(fit.geo.attributes[key].array,bare.geo.attributes[key].array,`${quality}/${hair}/${lod}/${hat}/${key}`);
   assert.deepEqual(fit.geo.index?.array,bare.geo.index?.array);assert.deepEqual(fit.rest,bare.rest);assert.deepEqual(fit.meta,bare.meta);
  }finally{fit.geo.dispose();}}}finally{bare.geo.dispose();}
 }}
});
test('new attachments have finite complete surfaces, bounded batches, reduced LOD and idempotent ownership',()=>{
 const metrics=[];
 for(const item of HEADGEAR.filter(i=>i.id>=8)){
  let previous=Infinity;
  for(const lod of ['hero','game','far']){
   const root=item.create({lod}),resources=new Set();let triangles=0,meshes=0;const textures=new Set();
   root.traverse(o=>{if(!o.isMesh)return;meshes++;const g=o.geometry;resources.add(g);assert(g.attributes.position.count>0);assert(g.attributes.normal);for(const a of Object.values(g.attributes))for(const x of a.array)assert(Number.isFinite(x));
    const count=g.index?.count||g.attributes.position.count;assert.equal(count%3,0);triangles+=count/3;
    if(g.index)for(const i of g.index.array)assert(i>=0&&i<g.attributes.position.count);
    for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const t of Object.values(m))if(t?.isTexture){resources.add(t);textures.add(t);}}
   });
   assert(meshes<=8,`${item.key} draw batch budget`);assert(triangles<=60000,`${item.key} triangle budget`);assert(triangles<=previous,`${item.key} monotonic LOD`);if(lod==='far')assert(triangles<previous,`${item.key} far actually simplified`);previous=triangles;
   const events=new Map();for(const x of resources)x.addEventListener('dispose',()=>events.set(x,(events.get(x)||0)+1));const dispose=root.userData.dispose||root.dispose;assert.equal(typeof dispose,'function');dispose.call(root);dispose.call(root);assert.equal(events.size,resources.size);for(const n of events.values())assert.equal(n,1);
   metrics.push({id:item.id,key:item.key,lod,meshes,triangles,textures:textures.size});
  }
 }
 console.log('NEW_HEADGEAR_METRICS '+JSON.stringify(metrics));
});

test('all new material batches retain authored hooks plus native hurt and flash uniforms',()=>{
 for(const hat of [8,9,10,11]){const c=make(hat);try{
  warmHeadgear(c);for(const {group:g} of headgearState(c).groups)g.traverse(o=>{for(const material of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){
   const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>'};
   material.onBeforeCompile(shader,{});for(const key of ['uHurt','uHurtSeed','uFlash'])assert.equal(shader.uniforms[key],c.u[key]);assert(material.customProgramCacheKey().includes('iw-headgear-signals-v1'));
  }});
 }finally{c.dispose();}}
});

test('new persisted selections survive teardown, no-hat reset and fresh character reopening',()=>{
 for(const hat of [8,9,10,11]){
  const selected=make(hat),saved=JSON.stringify(selected.style);selected.dispose();assert.equal(headgearState(selected),null);
  const reset=make(0);assert.equal(headgearState(reset),null);reset.dispose();
  const restored=resolveStyle(JSON.parse(saved)),reopened=make(restored.hat);try{assert.equal(reopened.style.hat,hat);assert.equal(group(reopened).userData.lod,'game');assert.equal(visible(reopened),1);}finally{reopened.dispose();}
 }
});
