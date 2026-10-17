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
test('persisted headgear IDs remain stable and original random pool does not expand',()=>{assert.equal(HATS.length,8);for(let hat=0;hat<8;hat++)assert.equal(resolveStyle(JSON.parse(JSON.stringify({hat}))).hat,hat);for(let i=0;i<1000;i++){let seed=i+1;const st=randomStyle(()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296));seed=i+1;const old=originalRandomStyle(()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296));assert.deepEqual(st,old);assert(st.hat>=0&&st.hat<=3);}});
test('existing no-hat Character allocates no new gear',()=>{const c=make(0);assert.equal(headgearState(c),null);c.dispose();});
for(const hat of [4,5,6,7])test('headgear '+hat+' owns LOD/quality/color/form/disposal lifecycle',()=>{
 const c=make(hat);assert.equal(c.skeleton.bones.length,87);assert.equal(headgearState(c).active,'game');assert.equal(group(c).parent,c.bones.head);assert.equal(visible(c),1);
 for(let i=0;i<4;i++)for(const lod of ['hero','far','game']){c.setLod(lod);assert.equal(headgearState(c).active,lod);assert.equal(visible(c),1);}
 assert.equal(headgearState(c).groups.length,3);const original=headgearState(c).groups.map(x=>x.group);
 let colorCalls=0;for(const g of original){const fn=g.userData.setInkColor||g.setInkColor;if(fn){const wrap=(value)=>{colorCalls++;return fn.call(g,value);};if(g.userData.setInkColor)g.userData.setInkColor=wrap;else g.setInkColor=wrap;}}
 c.setColor('#e637ab');assert.equal(colorCalls,hat===7?0:3);assert.equal(c.color.getHex(),0xe637ab);if(hat!==7)for(const g of original){let matched=false;g.traverse(o=>{if(o.material?.color?.getHex()===0xe637ab)matched=true;if(o.material){const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>'};o.material.onBeforeCompile(shader,{});if(shader.uniforms.earInk?.value?.getHex()===0xe637ab)matched=true;}});assert(matched,'team material updated in each cached LOD');}for(const g of original){assert.equal(g.parent,c.bones.head);g.traverse(o=>{if(o.isMesh)for(const value of o.geometry.attributes.position.array)assert(Number.isFinite(value));});}
 c.setLod(null);c.inWorld=true;c._rendered=false;c._screenPx=()=>1;c._updateLod(.016);assert.equal(headgearState(c).active,'far');c._screenPx=()=>10000;c._updateLod(.016);assert.equal(headgearState(c).active,'hero');
 G.settings.quality='low';c._updateLod(.016);assert(headgearState(c).signature.endsWith(':low'));assert(original.every(g=>!g.parent));
 warmHeadgear(c);assert.equal(headgearState(c).groups.length,3);assert.equal(visible(c),1);
 c.inWorld=false;c.setLod('game');for(let i=0;i<35;i++)c.update(1/60,{...state,form:'swim'});assert.equal(c.kid.visible,false);assert.equal(group(c).parent,c.bones.head);for(let i=0;i<35;i++)c.update(1/60,state);assert.equal(c.kid.visible,true);
 c.setVisible(false);assert.equal(c.root.visible,false);c.setVisible(true);assert.equal(c.root.visible,true);
 const all=headgearState(c).groups.map(x=>x.group),resources=new Set();for(const g of all)g.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});const events=new Map();for(const x of resources)x.addEventListener('dispose',()=>events.set(x,(events.get(x)||0)+1));
 c.dispose();c.dispose();assert.equal(headgearState(c),null);assert(all.every(g=>!g.parent));assert.equal(events.size,resources.size);for(const n of events.values())assert.equal(n,1);
});
test('ten gear replacements release all owned attachments without touching shared body geometry',()=>{for(let i=0;i<10;i++){const c=make(4+i%4),body=c.meshes.skin.geometry;let disposed=false;body.addEventListener('dispose',()=>disposed=true);warmHeadgear(c);const all=headgearState(c).groups.map(x=>x.group);c.dispose();assert.equal(headgearState(c),null);assert(all.every(g=>!g.parent));assert.equal(disposed,false);}});

test('build adapter fails closed on absent or duplicated catalog anchors',()=>{const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/character-style.js',import.meta.url),'utf8');assert.throws(()=>adaptHeadgear('src/game/character-style.js',raw.replace("export const HATS =","const HATS =")),/headgear conflict/);assert.throws(()=>adaptHeadgear('src/game/character-style.js',raw+raw),/headgear conflict/);});

for(const hat of [4,5])test('new material hooks preserve authored weave and share native damage/flash uniforms '+hat,()=>{const c=make(hat),s=headgearState(c),materials=new Set();for(const {group} of s.groups)group.traverse(o=>{if(o.material)materials.add(o.material);});let weave=false;for(const m of materials){const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>'};m.onBeforeCompile(shader,{});assert.equal(shader.uniforms.uHurt,c.u.uHurt);assert.equal(shader.uniforms.uFlash,c.u.uFlash);assert(shader.fragmentShader.includes('float iwHurtM'));assert(shader.fragmentShader.includes('totalEmissiveRadiance += uFlash'));if(shader.fragmentShader.includes('weaveUV')){weave=true;assert(shader.fragmentShader.indexOf('float iwHurtM')>shader.fragmentShader.indexOf('weaveUV'),'damage follows authored weave');}}assert(weave);c.dispose();});

const {createInkBlackFlapCap,INK_BLACK_FLAP_CAP_FIT}=await load('patches/local-quality/headgear/character-headgear-ink-black-flap-cap.js');
for(const lod of ['far','game','hero'])test('cap '+lod+' authored panels consume native clearance instead of ignoring the callback',()=>{
 let calls=0;const compact=createInkBlackFlapCap({lod,clearance:()=>0}),expanded=createInkBlackFlapCap({lod,clearance:()=>{calls++;return .18;}});
 try{let moved=0;assert.equal(compact.children.length,expanded.children.length);for(let i=0;i<compact.children.length;i++){const a=compact.children[i].geometry.attributes.position.array,b=expanded.children[i].geometry.attributes.position.array;assert.equal(a.length,b.length);for(let j=0;j<a.length;j+=3)if(Math.hypot(a[j]-b[j],a[j+1]-b[j+1],a[j+2]-b[j+2])>.005)moved++;}assert(calls>100,'actual native callback used');assert(moved>100,'clearance must change the authored geometry');}finally{compact.dispose();expanded.dispose();}
});
test('cap rear hair exit stays below its authored rear skirt hem',()=>{const g=createInkBlackFlapCap({lod:'game',clearance:()=>0});let rearHemElevation=Infinity;try{g.traverse(o=>{if(!o.isMesh)return;for(const part of o.geometry.userData.parts||[]){if(!part.name.startsWith('side-flap-'))continue;for(let j=part.firstIndex;j<part.firstIndex+part.indexCount;j++){const i=o.geometry.index.array[j],p=o.geometry.attributes.position,x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(Math.abs(x)<.0001&&z<0)rearHemElevation=Math.min(rearHemElevation,Math.atan2(y-.164,Math.hypot(x,z-.014)));}}});assert(Number.isFinite(rearHemElevation));assert(INK_BLACK_FLAP_CAP_FIT.rim(Math.PI)<=rearHemElevation+.01,'hair must exit beneath the actual rear cover instead of the crown seam');}finally{g.dispose();}});

for(const hat of [4,5,6,7])test('headgear '+hat+' warmup borrows owned fit without acquiring hair',async()=>{
 const {hairStats}=await load('patches/splatoon3/runtime/hair-cache.mjs');
 const {HEADGEAR}=await load('patches/local-quality/headgear/catalog.mjs');
 const item=HEADGEAR.find(x=>x.id===hat),create=item.create,calls=[];let c;
 item.create=options=>{calls.push(options.ctx);return create(options);};
 try {
  c=make(hat);const before=hairStats(),fit=c.hairKeys483[0].entry.hatContext;
  assert.deepEqual(c.hairKeys483.map(r=>r.lod),['game']);
  warmHeadgear(c);assert.deepEqual(hairStats(),before);assert.equal(headgearState(c).groups.length,3);
  assert.equal(calls.length,3);assert(calls.every(ctx=>ctx===fit),'warmup must borrow the exact owned native fit');
  c._updateLod(0);G.settings.quality='low';c._updateLod(0);
  assert.equal(c.hairAnatomy483,null);assert(c.hairKeys483.length>0);
  const rebuilt=hairStats(),freshFit=c.hairKeys483[0].entry.hatContext;
  assert.notEqual(freshFit,fit);warmHeadgear(c);assert.deepEqual(hairStats(),rebuilt);
  const liveFits=new Set(c.hairKeys483.map(r=>r.entry.hatContext));
  assert.equal(calls.length,6);assert(calls.slice(3).every(ctx=>ctx!==fit&&liveFits.has(ctx)),'quality rebuild must use fresh owned fits');
 } finally {item.create=create;c?.dispose();}
 assert.equal(hairStats().entries,0);assert.equal(hairStats().liveUsers,0);
});

for(const lod of ['far','game','hero'])test('armor flat earprint '+lod+' preserves ink and native hurt/flash shader contracts',()=>{
 const c=make(4);c.setLod(lod);c.setColor('#8844bb');let count=0;const materials=new Set();group(c).traverse(o=>{if(o.material)materials.add(o.material);});
 try{for(const material of materials){const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <emissivemap_fragment>'};material.onBeforeCompile(shader,{});if(!shader.uniforms.earInk)continue;count++;const ink=shader.uniforms.earInk;assert.equal(ink.value.getHex(),0x8844bb);assert.equal(shader.uniforms.uHurt,c.u.uHurt);assert.equal(shader.uniforms.uFlash,c.u.uFlash);assert(shader.fragmentShader.indexOf('dotInk')<shader.fragmentShader.indexOf('float iwHurtM'),'native damage must follow print color');assert(shader.fragmentShader.includes('totalEmissiveRadiance += uFlash'));assert(material.customProgramCacheKey().includes('inkwave-armor-flat-earprint-v1'));assert(material.customProgramCacheKey().includes('iw-headgear-signals-v1'));c.setColor('#33cc88');assert.equal(shader.uniforms.earInk,ink);assert.equal(ink.value.getHex(),0x33cc88);assert(!shader.vertexShader.includes('\\n'));assert(!shader.fragmentShader.includes('\\n'));}assert.equal(count,1,'one material owns flat non-emissive ear print');}finally{c.dispose();}
});
