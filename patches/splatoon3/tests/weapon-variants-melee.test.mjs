import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Resolve the actual production vendor import map in a VM, not Node's
// package resolver: the site ships Three.js under inkwave-public/vendor/three.
import { fixture } from './source-fixture.mjs';
const { VARIANT_MODELS, R, B, S, W, THREE, M } = await fixture({ extraExports: `
export { VARIANT_MODELS } from './patches/splatoon3/runtime/weapon-models/variants-melee.mjs';
export { MODELS as R } from './patches/splatoon3/runtime/weapon-models/rollers.mjs';
export { MODELS as B } from './patches/splatoon3/runtime/weapon-models/brushes.mjs';
export { MODELS as S } from './patches/splatoon3/runtime/weapon-models/sloshers.mjs';
export { MODELS as W } from './patches/splatoon3/runtime/weapon-models/splatanas.mjs';
export { M } from './patches/splatoon3/runtime/weapon-models/kit.mjs';
` });
const bases={...R,...B,...S,...W};
function snap(g){return g?Object.fromEntries([...Object.entries(g.attributes).map(([k,a])=>[k,Array.from(a.array)]),['index',Array.from(g.index?.array||[])]]):null;}
function fixed(d){return [snap(d.body),snap(d.drumCaps),...Object.values(d.parts).filter(p=>p.mat==='body').map(p=>snap(p.src))];}
function dispose(d){for(const g of [d.body,d.ink,d.drum,d.drumCaps,d.glow,...Object.values(d.parts).map(p=>p.src)])g?.dispose();}
test('26 unique actual alternate-kit rows, never synthesized base or replica keys',()=>{
 assert.equal(Object.keys(VARIANT_MODELS).length,26);
 assert.deepEqual(Object.keys(VARIANT_MODELS).sort(),['Brush_Heavy_01','Brush_Heavy_02','Brush_Mini_01','Brush_Normal_01','Brush_Normal_02','Roller_Compact_01','Roller_Compact_02','Roller_Heavy_01','Roller_Heavy_02','Roller_Hunter_01','Roller_Normal_01','Roller_Wide_01','Roller_Wide_02','Saber_Heavy_01','Saber_Lite_01','Saber_Lite_02','Saber_Normal_01','Saber_Normal_02','Slosher_Bathtub_01','Slosher_Diffusion_01','Slosher_Diffusion_02','Slosher_Double_01','Slosher_Double_02','Slosher_Launcher_01','Slosher_Strong_01','Slosher_Washtub_01'].sort());
});
for(const [id,s] of Object.entries(VARIANT_MODELS))test(`${id}: own finish, preserved ink/anchors/animation, repeatable and isolated`,()=>{
 const baseSpec=bases[s.baseId], base=baseSpec.build({kind:'native',parts:{}}), before=fixed(base);
 const d=s.build({kind:'native',parts:{}}), again=s.build({kind:'native',parts:{}});
 assert.equal(s.sourceRow,id);assert.ok(s.name);assert.ok(s.sourceUrl.startsWith('https://splatoonwiki.org/wiki/'));
 assert.equal(s.animate,baseSpec.animate);assert.equal(s.hold,baseSpec.hold);
 assert.equal(d.kind,base.kind);
 for(const k of ['muzzle','gripR','gripL','drumAt','drumR','rollerFold'])assert.deepEqual(d[k],base[k],k);
 for(const k of ['ink','drum','glow'])assert.deepEqual(snap(d[k]),snap(base[k]),k);
 assert.deepEqual(Object.keys(d.parts),Object.keys(base.parts));
 for(const [name,p] of Object.entries(d.parts)){
  assert.deepEqual(p.pivot,base.parts[name].pivot,name+' pivot'); assert.equal(p.mat,base.parts[name].mat);
  if(p.mat!=='body')assert.deepEqual(snap(p.src),snap(base.parts[name].src),name+' ink/nonbody');
 }
 assert.notDeepEqual(fixed(d),before,'variant must be visible');assert.deepEqual(fixed(base),before,'cached sibling must remain untouched');assert.deepEqual(fixed(d),fixed(again),'deterministic');
 for(const g of [d.body,d.ink,d.drum,d.drumCaps,...Object.values(d.parts).map(p=>p.src)].filter(Boolean)){
  for(const [name,a] of Object.entries(g.attributes))assert.ok(Array.from(a.array).every(Number.isFinite),name+' finite');
  assert.ok(Array.from(g.index.array).every(i=>i>=0&&i<g.attributes.position.count));
 }
 const sibling=s.build({kind:'native',parts:{}});d.body.attributes.color.array[0]=123;
 assert.notEqual(sibling.body.attributes.color.array[0],123);assert.deepEqual(fixed(base),before);
 dispose(base);dispose(d);dispose(again);dispose(sibling);
});

test('identity manifest matches exported source rows and unique numeric IDs',()=>{
 const ref=JSON.parse(fs.readFileSync(new URL('../reference/weapon-variants-melee-1130.json',import.meta.url)));
 assert.equal(ref.sourceSha256,'53641c4b4c96d56d3ed4ca8d4c7426d83a0bf28af6f85e9eafc391b2ae9f663e');
 assert.equal(ref.records.length,26);assert.equal(new Set(ref.records.map(r=>r.sourceId)).size,26);
 for(const r of ref.records){const s=VARIANT_MODELS[r.sourceRow];assert.ok(s);assert.equal(s.baseId,r.baseId);assert.equal(s.name,r.name);assert.equal(s.sourceUrl,r.appearanceUrl);}
});

// Semantic-region regressions: these fail on the first broad palette draft.
// Shared THREE and M come from the same production VM as the native builders.
const rgb = hex => new THREE.Color(hex).toArray();
function matches(a,i,c){return c.every((v,k)=>Math.abs(a.array[i*3+k]-v)<1e-6);}
function mappedVertices(base,variant,from,to,predicate=()=>true){
 const c=base.attributes.color,v=variant.attributes.color;let n=0;
 for(let i=0;i<c.count;i++)if(matches(c,i,rgb(from))&&predicate(base,i)){
   assert.ok(matches(v,i,rgb(to)),`vertex ${i}: ${from} -> ${to}`);n++;
 }
 assert.ok(n>0,'target region actually exists');return n;
}
test('Carbon Deco recolors supports only, retaining original cap and carabiner',()=>{
 const base=R['s3-roller-compact'].build({parts:{}}),d=VARIANT_MODELS.Roller_Compact_01.build({parts:{}});
 mappedVertices(base.body,d.body,'#f2a92a','#f2a92a');
 mappedVertices(base.drumCaps,d.drumCaps,'#f2a92a','#f2a92a');
 mappedVertices(base.parts.hinge.src,d.parts.hinge.src,'#f2a92a','#d53543');dispose(base);dispose(d);
});
test('Carbon ANG-L chrome finish is restricted to canister, not gray grip brace',()=>{
 const base=R['s3-roller-compact'].build({parts:{}}),d=VARIANT_MODELS.Roller_Compact_02.build({parts:{}});
 mappedVertices(base.body,d.body,'#8f8d86','#b5bbc0',(g,i)=>g.attributes.position.getZ(i)>=.109&&g.attributes.position.getZ(i)<=.256);
 mappedVertices(base.body,d.body,'#8f8d86','#8f8d86',(g,i)=>g.attributes.position.getZ(i)<.109);
 mappedVertices(base.body,d.body,'#f2a92a','#f2a92a');
 for(let i=0;i<base.body.attributes.color.count;i++)if(matches(base.body.attributes.color,i,rgb('#8f8d86'))){
  const z=base.body.attributes.position.getZ(i),inCanister=z>=.109&&z<=.256;
  assert.equal(d.body.attributes.aMat.getX(i),inCanister?M.metal:base.body.attributes.aMat.getX(i));
 }
 dispose(base);dispose(d);
});
test('Starz white handle does not bleach motor fins, hinge metal or drum rims',()=>{
 const base=R['s3-roller-heavy'].build({parts:{}}),d=VARIANT_MODELS.Roller_Heavy_02.build({parts:{}});
 mappedVertices(base.body,d.body,'#18181b','#e6e5df',(g,i)=>g.attributes.aMat.getX(i)===M.rubber);
 mappedVertices(base.body,d.body,'#28282c','#e6e5df',(g,i)=>g.attributes.aMat.getX(i)===M.rubber);
 mappedVertices(base.body,d.body,'#28282c','#28282c',(g,i)=>g.attributes.aMat.getX(i)===M.metal);
 mappedVertices(base.parts.hinge.src,d.parts.hinge.src,'#28282c','#28282c');
 mappedVertices(base.drumCaps,d.drumCaps,'#28282c','#28282c');dispose(base);dispose(d);
});
