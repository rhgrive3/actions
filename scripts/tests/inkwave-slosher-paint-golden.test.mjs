import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { slosherPaintReceipt as receipt } from '../lib/slosher-paint-receipt.mjs';

// The pre-profile archive remains byte-for-byte intact and is still executed
// through circle-only and generic-mask controls. A separate receipt describes
// the reviewed silhouette; its independent edge oracle is not its own raster.
const baselineBytes=fs.readFileSync(new URL('../fixtures/slosher-paint-9c070329.json',import.meta.url));
assert.equal(createHash('sha256').update(baselineBytes).digest('hex'),'d5efddda50f4b97553e67685fd08fc75e273ae0562ce0177780aa3608e32ffad');
const baseline=JSON.parse(baselineBytes);
const currentBytes=fs.readFileSync(new URL('../fixtures/slosher-paint-main-20261017.json',import.meta.url));
assert.equal(createHash('sha256').update(currentBytes).digest('hex'),'979d7699778d6eada4f35e3a1fbbd460d403c0294908bf4dd30b863e7906975a');
const currentBaseline=JSON.parse(currentBytes).cases;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const physical=stamps=>stamps.map(({kind,area,footprint,...stamp})=>stamp);
function assertReceipt(key,row,{archived=false}={}) {
  const {cellsXZ,...paint}=row.paint;
  const stamps=archived?row.stamps.map(({footprint,...stamp})=>stamp):row.stamps;
  assert.deepEqual({paint,cellsHash:digest(cellsXZ),stampsHash:digest(stamps),impactsHash:digest(row.impacts)},
    (archived?baseline:currentBaseline)[key],key+': exact cells, source dimensions, stamps, impacts and seeds');
}

const modes=[
  ['current',{},'generic',17.375,73.0625],
  ['legacyScale',{legacyScale:true},'genericLegacyScale',14.875,16.375],
  ['legacyDepth',{legacyDepth:true},'genericLegacyDepth',21.375,100.125],
];

test('Slosher silhouette keeps source dimensions and rejects stale scale and double-counted depth',async()=>{
  const rows=[];
  for(const [key,options,,maxZ,area] of modes) {
    const row=await receipt(options);rows.push(row);assertReceipt(key,row);
    assert.equal(row.paint.bounds.maxZ,maxZ);assert.equal(row.paint.area,area);
    assert.ok(row.stamps.every(p=>p.footprint==='ink-slosh'),'all original nineteen stamps select the reviewed silhouette');
  }
  for(const changed of rows.slice(1)) {
    assert.notEqual(rows[0].paint.bounds.maxZ,changed.paint.bounds.maxZ);
    assert.notEqual(rows[0].paint.area,changed.paint.area);
    assert.deepEqual(rows[0].impacts,changed.impacts,'negative projection controls retain native source-owned physical landings');
  }
});

test('removing only the silhouette restores every archived source-circle and generic-mask cell',async()=>{
  for(const [key,options,genericKey] of modes) {
    const current=await receipt(options);
    const circle=await receipt({...options,legacyCircle:true});
    const generic=await receipt({...options,legacyMask:true});
    assertReceipt(key,circle,{archived:true});
    assertReceipt(genericKey,generic,{archived:true});
    for(const control of [circle,generic]) {
      assert.deepEqual(control.impacts,current.impacts);
      assert.deepEqual(physical(control.stamps),physical(current.stamps),
        'only kind/profile and credited area differ; every width, depth, seed, owner landing and frame stays fixed');
      assert.notDeepEqual(control.paint.cellsXZ,current.paint.cellsXZ);
    }
  }
});

test('emitted Slosher profile retains the complete source receipt and independent scoring oracle',
  {skip:!process.env.INKWAVE_BUILT_SITE},async()=>{
    const source=await receipt(),emitted=await receipt({site:process.env.INKWAVE_BUILT_SITE});
    assertReceipt('current',source);assertReceipt('current',emitted);
    assert.deepEqual(emitted,source);
  });
