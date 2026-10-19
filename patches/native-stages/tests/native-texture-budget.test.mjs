import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeStageTextureLimit, nativeStageTextureCaps } from '../runtime/native-texture-budget.mjs';

const manifest = (materialCount, mapsPerMaterial = true, vertices = 150001) => ({
  geometry: { vertices },
  materials: Object.fromEntries(Array.from({length:materialCount}, (_,i)=> [
    'm'+i, {
      albedo: 'a'+i+'.png',
      maps: mapsPerMaterial ? {normal:'n'+i+'.png',roughness:'r'+i+'.png',
        emissive:'e'+i+'.png',opacity:'o'+i+'.png'} : {}
    }
  ]))
});

test('desktop high keeps full 4K on modest stages and 2K on large stages', () => {
  assert.equal(nativeStageTextureLimit(manifest(2,true,1000),'high'),4096);
  assert.equal(nativeStageTextureLimit(manifest(40),'high'),2048);
  assert.equal(nativeStageTextureLimit(manifest(40),'high',{deviceMemoryGB:16}),2048);
  assert.equal(nativeStageTextureLimit(manifest(40),'high',{deviceMemoryGB:4}),1024);
  assert.equal(nativeStageTextureLimit(manifest(40),'high',{deviceMemoryGB:8}),1024);
});
test('low and medium retain existing caps, high mobile never silently increases', () => {
  const large=manifest(40);
  assert.equal(nativeStageTextureLimit(large,'balanced'),1024);
  assert.equal(nativeStageTextureLimit(large,'low'),512);
  assert.equal(nativeStageTextureLimit(large,'high',{mobile:true}),1024);
  assert.equal(nativeStageTextureLimit(large,'high',{mobile:true,deviceMemoryGB:2}),512);
  assert.equal(nativeStageTextureLimit(manifest(3,true,1000),'high',{mobile:true}),1024);
  assert.equal(nativeStageTextureLimit(large,'high',{maxTextureSize:1536}),1536);
  assert.equal(nativeStageTextureLimit(large,'high',{maxTextureSize:512}),512);
});
test('repeated references count once and missing metadata never crashes', () => {
  const reused=manifest(40);
  for (const m of Object.values(reused.materials)) {
    m.albedo='same.png';
    m.maps={normal:'same-normal.png'};
  }
  assert.equal(nativeStageTextureLimit(reused,'high',{deviceMemoryGB:4}),2048);
  assert.equal(nativeStageTextureLimit(null,'high'),4096);
});

test('large scenes preserve colour, cutout and signage textures ahead of fine PBR detail', () => {
  const dense=manifest(40);
  const mobile=nativeStageTextureCaps(dense,'high',{mobile:true});
  assert.equal(mobile.maxDimension,1024);
  assert.equal(mobile.perRole.normal,512);
  assert.equal(mobile.perRole.roughness,512);
  assert.equal(mobile.perRole.albedo,undefined);
  assert.equal(mobile.perRole.opacity,undefined);
  assert.equal(mobile.perRole.emissive,undefined);
  const desktop=nativeStageTextureCaps(dense,'high',{deviceMemoryGB:16});
  assert.equal(desktop.maxDimension,2048);
  assert.equal(desktop.perRole.roughness,1024);
  assert.equal(desktop.perRole.normal,undefined);
  assert.equal(nativeStageTextureCaps(manifest(2,true,1000),'high').maxDimension,4096);
});
