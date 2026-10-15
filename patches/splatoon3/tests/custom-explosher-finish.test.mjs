import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
if (process.env.INKWAVE_BUILT_SITE) {
 const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 const sourceHash=sha(fs.readFileSync(new URL('../runtime/weapon-models/custom-explosher-finish.mjs',import.meta.url)));
 const registryHash=sha(fs.readFileSync(path.join(site,'patches/splatoon3/runtime/weapon-models/registry.mjs')));
 assert.equal(manifest.files['patch/runtime/weapon-models/custom-explosher-finish.mjs'],sourceHash);
 assert.equal(manifest.artifacts['patches/splatoon3/runtime/weapon-models/registry.mjs'],registryHash);
 console.log('CUSTOM_EXPLOSHER_EMITTED_REGISTRY_RECEIPT',JSON.stringify({contentHash:manifest.contentHash,inputHash:manifest.inputHash,sourceHash,registryHash}));
}
const f=await fixture({extraExports:`export {weaponModelSpec,registeredWeaponVariantModels,buildWeaponModel} from './patches/splatoon3/runtime/weapon-models/registry.mjs';export {ALTERNATE_WEAPON_KITS} from './patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';`});
const baseSpec=f.weaponModelSpec('s3-slosher-washtub'),spec=f.weaponModelSpec('Slosher_Washtub_01');
assert.ok(baseSpec);assert.ok(spec);assert.notEqual(spec,baseSpec,'explicit variant must not silently fall back');
const fresh=()=>({kind:'native',parts:{}});
const snap=g=>g?{attributes:Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,Array.from(a.array)])),index:Array.from(g.index?.array||[])}:null;
const dispose=d=>{for(const g of [d.body,d.ink,d.glow,...Object.values(d.parts).map(p=>p.src)])g?.dispose();};
test('Custom Explosher restores only the two authored can colors with no geometry or anchor changes',()=>{
 const base=baseSpec.build(fresh()),d=spec.build(fresh());
 const before=snap(base.body),after=snap(d.body);delete before.attributes.color;delete after.attributes.color;assert.deepEqual(after,before);
 const a=base.body.attributes.color,b=d.body.attributes.color,pairs=[['#59632f','#c3b38d'],['#435128','#978762']].map(p=>p.map(x=>new f.THREE.Color(x))),counts=[0,0];
 for(let i=0;i<a.count;i++){
  const n=pairs.findIndex(([c])=>Math.abs(a.getX(i)-c.r)<1e-6&&Math.abs(a.getY(i)-c.g)<1e-6&&Math.abs(a.getZ(i)-c.b)<1e-6);
  const expected=n<0?[a.getX(i),a.getY(i),a.getZ(i)]:pairs[n][1].toArray();if(n>=0)counts[n]++;
  for(let k=0;k<3;k++)assert.ok(Math.abs(b.array[i*3+k]-expected[k])<1e-6,`vertex ${i} channel ${k}`);
 }
 assert.deepEqual(counts,[598,296],'actual can and recessed-panel regions');
 for(const key of ['muzzle','gripR','gripL'])assert.deepEqual(d[key],base[key]);
 assert.deepEqual(snap(d.ink),snap(base.ink));assert.deepEqual(Object.keys(d.parts),Object.keys(base.parts));
 for(const key of Object.keys(base.parts)){assert.deepEqual(snap(d.parts[key].src),snap(base.parts[key].src));assert.deepEqual(d.parts[key].pivot,base.parts[key].pivot);assert.equal(d.parts[key].mat,base.parts[key].mat);}
 dispose(base);dispose(d);
});
test('finish does not leak into later base builds or share color buffers',()=>{
 const before=baseSpec.build(fresh()),d=spec.build(fresh()),after=baseSpec.build(fresh());
 assert.deepEqual(snap(before.body),snap(after.body));assert.notEqual(d.body.attributes.color.array,after.body.attributes.color.array);
 dispose(before);dispose(d);dispose(after);
});

test('single followup row inherits native model contracts and applies the finish after build',()=>{
 const base=baseSpec;
 assert.equal(spec.sourceRow,'Slosher_Washtub_01');assert.equal(spec.baseId,'s3-slosher-washtub');
 for(const key of Object.keys(base))if(key!=='build'&&key!=='id')assert.equal(spec[key],base[key],key);
 assert.equal(spec.id,'Slosher_Washtub_01');
 assert.ok(f.registeredWeaponVariantModels().includes('Slosher_Washtub_01'));
 const kit=f.ALTERNATE_WEAPON_KITS.find(k=>k.main==='Slosher_Washtub_01');assert.ok(kit);
 assert.equal(f.weaponModelSpec(kit.id),spec);
 const actual=f.buildWeaponModel(kit.id,fresh()),expected=f.buildWeaponModel('Slosher_Washtub_01',fresh());
 assert.equal(actual.modelId,'s3-slosher-washtub');assert.equal(actual.modelVariantId,'Slosher_Washtub_01');
 assert.deepEqual(snap(actual.body),snap(expected.body));assert.deepEqual(snap(actual.ink),snap(expected.ink));
 dispose(actual);dispose(expected);
});
