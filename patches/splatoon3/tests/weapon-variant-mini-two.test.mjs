import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
if(process.env.INKWAVE_BUILT_SITE){const site=path.resolve(process.env.INKWAVE_BUILT_SITE),m=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),sourceHash=sha(fs.readFileSync(new URL('../runtime/weapon-models/variants-mini-followup.mjs',import.meta.url))),registryHash=sha(fs.readFileSync(path.join(site,'patches/splatoon3/runtime/weapon-models/registry.mjs')));assert.equal(m.files['patch/runtime/weapon-models/variants-mini-followup.mjs'],sourceHash);assert.equal(m.artifacts['patches/splatoon3/runtime/weapon-models/registry.mjs'],registryHash);console.log('C_NEXT_EMITTED_BINDING',JSON.stringify({inputHash:m.inputHash,contentHash:m.contentHash,sourceHash,registryHash}));}
const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:`export {weaponModelSpec,registeredWeaponVariantModels,buildWeaponModel} from './patches/splatoon3/runtime/weapon-models/registry.mjs';export {ALTERNATE_WEAPON_KITS} from './patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';export {animateWeapon} from './inkwave-public/src/game/character-weapons.js';export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';`});
const THREE=f.THREE,rows=['Spinner_Quick_01','Spinner_Quick_02'],V=Object.fromEntries(rows.map(row=>{const s=f.weaponModelSpec(row);assert.ok(s);assert.equal(s.sourceRow,row);assert.ok(f.registeredWeaponVariantModels().includes(row));return[row,s]}));
const palettes={Spinner_Quick_01:{'#493098':'#28516a','#e5bc21':'#dadbd9'},Spinner_Quick_02:{'#493098':'#5b6846','#e5bc21':'#d6c18c','#255cd2':'#b56130'}};
const fresh=()=>({kind:'native',parts:{},gripL:{pos:new THREE.Vector3(0,0,.1),handZ:new THREE.Vector3(0,0,1),handY:new THREE.Vector3(0,1,0)}}), channels=d=>Object.fromEntries([...Object.entries(d).filter(([,v])=>v?.isBufferGeometry),...Object.entries(d.parts).map(([k,p])=>['parts.'+k,p.src])]);
const raw=g=>({attrs:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{type:a.array.constructor.name,itemSize:a.itemSize,normalized:a.normalized,array:Array.from(a.array)}])),index:Array.from(g.index?.array||[]),groups:g.groups});
for(const [row,spec]of Object.entries(V))test(row+' retains all native geometry, ownership, sockets and builder hooks; exact authored palette',()=>{
 const base=f.weaponModelSpec(spec.baseId),a=base.build(fresh()),b=spec.build(fresh()),c=base.build(fresh());
 for(const [k,v]of Object.entries(base))if(k!=='build'&&k!=='id')assert.equal(spec[k],v,k);
 const ga=channels(a),gb=channels(b),gc=channels(c);assert.deepEqual(Object.keys(gb),Object.keys(ga));
 const allowed=new Set([b.body,b.drumCaps,...Object.values(b.parts).filter(p=>p.mat==='body'&&!p.hidden).map(p=>p.src)]);
 const pairs=Object.entries(palettes[row]).map(([x,y])=>[new THREE.Color(x),new THREE.Color(y)]),hits=pairs.map(()=>0);let bytes=0,triangles=0;
 for(const [key,g]of Object.entries(ga)){
  assert.deepEqual(raw(gc[key]),raw(g),'subsequent base build unaffected');const actual=raw(gb[key]),expected=raw(g);
  if(allowed.has(gb[key]))for(let i=0;i<g.attributes.color.count;i++){
   const arr=g.attributes.color.array,j=pairs.findIndex(([x])=>Math.abs(arr[i*3]-x.r)<1e-6&&Math.abs(arr[i*3+1]-x.g)<1e-6&&Math.abs(arr[i*3+2]-x.b)<1e-6);
   if(j>=0){hits[j]++;const color=pairs[j][1].toArray();for(let k=0;k<3;k++)expected.attrs.color.array[i*3+k]=Math.fround(color[k]);}
  }
  for(let i=0;i<actual.attrs.color.array.length;i++)assert.equal(actual.attrs.color.array[i],expected.attrs.color.array[i],key+' color component '+i);assert.deepEqual(actual,expected,key);bytes+=Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength||0);triangles+=(g.index?.count||g.attributes.position.count)/3;
 }
 assert.ok(hits.every(n=>n>0));
 for(const key of Object.keys(a).filter(k=>!ga[k]&&k!=='parts'))assert.deepEqual(b[key],a[key],key);
 assert.deepEqual(Object.keys(b.parts),Object.keys(a.parts));for(const k of Object.keys(a.parts))for(const prop of Object.keys(a.parts[k]).filter(x=>x!=='src'))assert.deepEqual(b.parts[k][prop],a.parts[k][prop],k+'.'+prop);
 const candidateBytes=Object.values(gb).reduce((n,g)=>n+Object.values(g.attributes).reduce((m,a)=>m+a.array.byteLength,0)+(g.index?.array.byteLength||0),0),candidateTriangles=Object.values(gb).reduce((n,g)=>n+(g.index?.count||g.attributes.position.count)/3,0);assert.equal(candidateBytes,bytes);assert.equal(candidateTriangles,triangles);console.log(JSON.stringify({row,hits,triangles,geometryBytes:bytes,addedTriangles:candidateTriangles-triangles,addedBytes:candidateBytes-bytes,allAttributeBytesEqualExceptExactPalette:true}));
 for(const d of [a,b,c])for(const g of new Set(Object.values(channels(d))))g.dispose();
});

for(const [row,spec]of Object.entries(V))test(row+' official kit and row select the same distinct registered finish',()=>{
 const kit=f.ALTERNATE_WEAPON_KITS.find(k=>k.main===row);assert.ok(kit);assert.equal(f.weaponModelSpec(kit.id),spec);assert.notEqual(spec,f.weaponModelSpec(spec.baseId));
 const a=f.buildWeaponModel(kit.id,fresh()),b=f.buildWeaponModel(row,fresh());assert.equal(a.modelId,spec.baseId);assert.equal(a.modelVariantId,row);for(const [k,g]of Object.entries(channels(a)))assert.deepEqual(raw(g),raw(channels(b)[k]));
 for(const d of [a,b])for(const g of new Set(Object.values(channels(d))))g.dispose();
});
