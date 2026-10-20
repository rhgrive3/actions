import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { calibratedChargerStamps, chargerCalibrationReceipt } from '../lib/charger-calibration-oracle.mjs';

const bytes=fs.readFileSync(new URL('../fixtures/weapons-physical-bf9a8a92.json',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'07bcfd60ef35aacd055144413f27ef20e13b8e4e95435dc703bc0aa183719dc3');
const archive=JSON.parse(bytes), snapshot=JSON.stringify(archive);
// Independent scalar predictions from the frozen physical archive for the
// restored common source-unit width. These are INKWAVE grid results, not S3
// metrology; the previous 0.2-width receipts remain a negative control below.
for(const [charge,width,area,maxZ] of [[0,.78,19.4375,11.875],[.25,.885,23.3125,13.875],[.5,1.11,34.9375,17.875],[.75,1.335,51.5,21.875],[1,1.56,75.0625,26.625]]) {
  test('Charger '+charge+' calibration predicts every cell without measuring production',()=>{
    const prior=archive.cases['charger-'+charge], receipt=chargerCalibrationReceipt(prior);
    assert.equal(receipt.area,area);assert.equal(receipt.maxZ,maxZ);
    assert.equal(receipt.cellsXZ.length,area/.0625);
    assert.equal(receipt.paintPoints.length,prior.paintPoints.length);
    assert.equal(receipt.paintPoints.reduce((sum,p)=>sum+p.area,0),area);
    for(let i=0;i<receipt.paintPoints.length;i++){
      const stamp=receipt.paintPoints[i],old=prior.paintPoints[i];
      for(const key of ['time','seed','team','kind','cosmetic'])assert.deepEqual(stamp[key],old[key],key);
      assert.deepEqual(stamp.stretch,old.stretch);
      if(i)assert.ok(Math.abs(stamp.radius-width*(i===receipt.paintPoints.length-1?1.5:1))<1e-12,'source charge width owns every forward stamp');
      else assert.equal(stamp.radius,1.2,'feet-only radius stays unchanged');
    }
    assert.equal(JSON.stringify(archive),snapshot,'immutable physical archive');
  });
}
test('first forward stamp uses restored charge width, with independent source depth',()=>{
  const tap=calibratedChargerStamps(archive.cases['charger-0']);
  assert.ok(Math.abs(tap[1].radius-.78)<1e-12);
  assert.ok(Math.abs(tap[2].radius-.78)<1e-12);
  assert.ok(Math.abs(tap.at(-1).radius-1.17)<1e-12);
  assert.ok(tap[1].stretchAmt>tap.at(-1).stretchAmt,'terminal width preserves the same depth');
  assert.equal(tap[1].center[1],.015);
  assert.notEqual(tap[1].center[2],1.5,'sourced ellipse is centred on its travel point');
});

test('the previous fivefold-narrowing oracle remains a rejected counterfactual',()=>{
 for(const [q,area,maxZ] of [[0,7.6875,10.625],[.25,8.25,13.125],[.5,10.5625,17.625],[.75,13.6875,21.375],[1,17.0625,25.625]]){
  const prior=archive.cases['charger-'+q],narrow=chargerCalibrationReceipt(prior,.2),restored=chargerCalibrationReceipt(prior);
  assert.equal(narrow.area,area);assert.equal(narrow.maxZ,maxZ);
  assert.notDeepEqual(narrow.cellsXZ,restored.cellsXZ);
 }
});
