import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
let loaded;
const production=()=>loaded??=fixture({extraExports:`
export { VARIANT_MODELS } from './patches/splatoon3/runtime/weapon-models/variants-ranged-defense.mjs';
export * as CH from './patches/splatoon3/runtime/weapon-models/chargers.mjs';
export * as SP from './patches/splatoon3/runtime/weapon-models/splatlings.mjs';
export * as DU from './patches/splatoon3/runtime/weapon-models/dualies.mjs';
export * as BR from './patches/splatoon3/runtime/weapon-models/brellas.mjs';
export * as ST from './patches/splatoon3/runtime/weapon-models/stringers.mjs';`});
const geometries=d=>[['body',d.body],['ink',d.ink],...Object.entries(d.parts).map(([n,p])=>[n,p.src]),['glow',d.glow]].filter(([,g])=>g?.attributes);
function signature(d){return geometries(d).map(([n,g])=>[n,...Object.entries(g.attributes).map(([k,a])=>[k,Array.from(a.array)]),Array.from(g.index?.array??[])]);}
test('ranged variants own fresh finishes while preserving exact topology, channels, ink and gameplay anchors',async()=>{
 const f=await production(),base={...f.CH.MODELS,...f.SP.MODELS,...f.DU.MODELS,...f.BR.MODELS,...f.ST.MODELS};
 const fresh=()=>({kind:'test-family',parts:{},gripL:{pos:new f.THREE.Vector3(0,0,.1),handZ:new f.THREE.Vector3(0,0,1),handY:new f.THREE.Vector3(0,1,0)}});
 const rows=JSON.parse(fs.readFileSync(new URL('../reference/weapon-variants-ranged-defense-1130.json',import.meta.url))).records;
 for(const [id,spec] of Object.entries(f.VARIANT_MODELS)){
  if(spec.inkPartition||spec.addedDetail)continue;
  assert.ok(rows.some(r=>r.sourceRow===id&&r.baseId===spec.baseId),id+' pinned row');
  const original=base[spec.baseId].build(fresh()),snapshot=signature(original),v=spec.build(fresh());
  assert.deepEqual(signature(original),snapshot,id+' base untouched');
  assert.equal(spec.animate,base[spec.baseId].animate,id+' identical animation');
  assert.equal(spec.hold,base[spec.baseId].hold,id+' identical hold');
  assert.equal(v.kind,original.kind);assert.deepEqual(v.muzzle.toArray(),original.muzzle.toArray());
  assert.deepEqual(Object.keys(v.parts),Object.keys(original.parts));
  let changed=0;
  for(const [n,g] of geometries(v)){
   const b=new Map(geometries(original)).get(n);assert.ok(b,id+' '+n);
   const fixedString=id==='Stringer_Short_01'&&['string','stringL'].includes(n);
   assert.deepEqual(Array.from(g.index?.array??[]),Array.from(b.index?.array??[]),id+' index '+n);
   for(const [a,attr] of Object.entries(g.attributes)){
    assert.ok(Array.from(attr.array).every(Number.isFinite),id+' finite '+n+'.'+a);
    if(fixedString&&a==='color'){
     const black=new f.THREE.Color('#24272a');
     for(let i=0;i<attr.count;i++)assert.deepEqual([attr.getX(i),attr.getY(i),attr.getZ(i)],Array.from(new Float32Array([black.r,black.g,black.b])),id+' sourced fixed string');
     assert.notDeepEqual(Array.from(attr.array),Array.from(b.attributes.color.array));changed++;
    } else if(a!=='color'||n==='ink'||n==='glow'||original.parts[n]?.mat!=='body'&&n!=='body') assert.deepEqual(Array.from(attr.array),Array.from(b.attributes[a].array),id+' unchanged '+n+'.'+a);
    else if(!Buffer.from(attr.array.buffer).equals(Buffer.from(b.attributes[a].array.buffer)))changed++;
   }
   if(v.parts[n]) {assert.deepEqual(v.parts[n].pivot.toArray(),original.parts[n].pivot.toArray());assert.equal(v.parts[n].mat,fixedString?'body':original.parts[n].mat);}
  }
  assert.ok(changed>0,id+' visible owned color difference');
  assert.deepEqual(signature(spec.build(fresh())),signature(v),id+' deterministic');
 }
});

function triangles(g) {
 const p=g.attributes.position,n=g.attributes.normal,out=[];
 for(let i=0;i<g.index.count;i+=3)out.push([0,1,2].map(j=>{const k=g.index.getX(i+j);return [p.getX(k),p.getY(k),p.getZ(k),n.getX(k),n.getY(k),n.getZ(k)].join(',');}).join('|'));
 return out.sort();
}
test('Heavy Edit Nouveau transfers only ammo-box triangles to native team ink, conserving complete surface and all animation',async()=>{
 const f=await production(),spec=f.VARIANT_MODELS.Spinner_HyperShort_01,base=f.SP.MODELS[spec.baseId];
 const fresh=()=>({kind:'splatling',parts:{},gripL:{pos:new f.THREE.Vector3(0,0,.1),handZ:new f.THREE.Vector3(0,0,1),handY:new f.THREE.Vector3(0,1,0)}});
 const b=base.build(fresh()),v=spec.build(fresh()),before=signature(b);
 assert.deepEqual([...triangles(b.body),...triangles(b.ink)].sort(),[...triangles(v.body),...triangles(v.ink)].sort());
 assert.ok(v.body.index.count<b.body.index.count);assert.ok(v.ink.index.count>b.ink.index.count);
 assert.equal(v.body.index.count+v.ink.index.count,b.body.index.count+b.ink.index.count);
 assert.deepEqual(v.muzzle.toArray(),b.muzzle.toArray());assert.equal(spec.animate,base.animate);
 for(const [name,p] of Object.entries(b.parts))assert.deepEqual(triangles(v.parts[name].src),triangles(p.src));
 // Every old ink triangle survives. Newly owned ink is only the original grey box.
 const expected=[];const col=b.body.attributes.color,grey=new f.THREE.Color('#d9d8d3');
 for(let i=0;i<b.body.index.count;i+=3){const ids=[0,1,2].map(j=>b.body.index.getX(i+j));if(ids.every(k=>Math.abs(col.getX(k)-grey.r)<1e-6&&Math.abs(col.getY(k)-grey.g)<1e-6&&Math.abs(col.getZ(k)-grey.b)<1e-6))expected.push(i);}
 assert.equal(v.ink.index.count-b.ink.index.count,expected.length*3);
 assert.deepEqual(signature(b),before);assert.deepEqual(signature(spec.build(fresh())),signature(v));
});

test('Twinklez silver tanks leave native ink while nozzle tips retain team ownership',async()=>{
 const f=await production(),spec=f.VARIANT_MODELS.Maneuver_Normal_02,base=f.DU.MODELS.dualies;
 const fresh=()=>({kind:'dualies',parts:{},dual:true});
 const b=base.build(fresh()),v=spec.build(fresh()),before=signature(b);
 assert.deepEqual([...triangles(b.body),...triangles(b.ink)].sort(),[...triangles(v.body),...triangles(v.ink)].sort());
 assert.equal(v.body.index.count+v.ink.index.count,b.body.index.count+b.ink.index.count);
 assert.ok(v.ink.index.count<b.ink.index.count);assert.ok(v.ink.index.count>0);
 for(let i=0;i<v.ink.attributes.position.count;i++)assert.ok(v.ink.attributes.position.getY(i)>.035,'only nozzle remains team ink');
 assert.equal(v.dual,true);assert.deepEqual(v.muzzle.toArray(),b.muzzle.toArray());
 assert.equal(spec.animate,base.animate);assert.deepEqual(signature(b),before);
 assert.deepEqual(signature(spec.build(fresh())),signature(v));
});

test('MIL-K fixed red strings keep bow animation and all geometry unchanged',async()=>{
 const f=await production(),spec=f.VARIANT_MODELS.Stringer_Short_02,base=f.ST.MODELS[spec.baseId];
 const b=base.build({kind:'charger',parts:{}}),v=spec.build({kind:'charger',parts:{}});
 for(const [n,g] of geometries(b))assert.deepEqual(triangles(g),triangles(new Map(geometries(v)).get(n)),n);
 for(const n of ['string','stringL']){assert.equal(v.parts[n].mat,'body');assert.equal(b.parts[n].mat,'ink');assert.deepEqual(v.parts[n].pivot.toArray(),b.parts[n].pivot.toArray());}
 assert.equal(spec.animate,base.animate);assert.deepEqual(v.bowCfg,b.bowCfg);assert.deepEqual(v.muzzle.toArray(),b.muzzle.toArray());
});
test('Undercover Sorella partitions shaft/check lines without geometry duplication or rig drift',async()=>{
 const f=await production(),spec=f.VARIANT_MODELS.Shelter_Compact_01,base=f.BR.MODELS[spec.baseId];
 const b=base.build({kind:'shooter',parts:{}}),v=spec.build({kind:'shooter',parts:{}});
 assert.deepEqual(geometries(b).flatMap(([,g])=>triangles(g)).sort(),geometries(v).flatMap(([,g])=>triangles(g)).sort());
 assert.ok(v.ink.index.count>b.ink.index.count);assert.equal(v.parts.canopyInk.mat,'ink');assert.equal(v.parts.canopy.mat,'body');
 assert.deepEqual(v.parts.canopyInk.pivot.toArray(),v.parts.canopy.pivot.toArray());assert.equal(spec.animate,base.animate);
 assert.deepEqual(v.muzzle.toArray(),b.muzzle.toArray());
});
test('Heavy Deco adds only24 low-poly rhinestones without modifying underlying weapon triangles or ink',async()=>{
 const f=await production(),spec=f.VARIANT_MODELS.Spinner_Standard_01,base=f.SP.MODELS.splatling;
 const fresh=()=>({kind:'splatling',parts:{},gripL:{pos:new f.THREE.Vector3(0,0,.1),handZ:new f.THREE.Vector3(0,0,1),handY:new f.THREE.Vector3(0,1,0)}});
 const b=base.build(fresh()),v=spec.build(fresh()),counts=new Map();for(const t of triangles(v.body))counts.set(t,(counts.get(t)||0)+1);
 for(const t of triangles(b.body)){assert.ok(counts.get(t)>0);counts.set(t,counts.get(t)-1);}
 assert.equal(v.body.index.count-b.body.index.count,24*8*3);assert.deepEqual(triangles(v.ink),triangles(b.ink));
 assert.deepEqual(v.muzzle.toArray(),b.muzzle.toArray());assert.equal(spec.animate,base.animate);
 const total=geometries(v).reduce((n,[,g])=>n+g.index.count/3,0);assert.ok(total<=16000,'existing16k budget');
});
