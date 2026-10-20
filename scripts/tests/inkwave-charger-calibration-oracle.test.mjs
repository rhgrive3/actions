import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { calibratedChargerStamps, chargerCalibrationReceipt } from '../lib/charger-calibration-oracle.mjs';

const bytes=fs.readFileSync(new URL('../fixtures/weapons-physical-bf9a8a92.json',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'07bcfd60ef35aacd055144413f27ef20e13b8e4e95435dc703bc0aa183719dc3');
const archive=JSON.parse(bytes), snapshot=JSON.stringify(archive);
// Independent scalar predictions, also observed by exact-head Validate
// #39381947767 on 29f78510. These are INKWAVE grid results, not S3 metrology.
for(const [charge,area,maxZ] of [[0,7.6875,10.625],[.25,8.25,13.125],[.5,10.5625,17.625],[.75,13.6875,21.375],[1,17.0625,25.625]]) {
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
      if(i)assert.ok(stamp.radius<old.radius,'forward width is calibrated');
      else assert.equal(stamp.radius,1.2,'feet-only radius stays unchanged');
    }
    assert.equal(JSON.stringify(archive),snapshot,'immutable physical archive');
  });
}
test('first forward stamp uses charge width, with source depth independent of narrowed radius',()=>{
  const tap=calibratedChargerStamps(archive.cases['charger-0']);
  assert.equal(tap[1].radius,.156);
  assert.equal(tap[2].radius,.156);
  assert.ok(Math.abs(tap.at(-1).radius-.234)<1e-12);
  assert.ok(tap[1].stretchAmt>tap.at(-1).stretchAmt,'terminal width preserves the same depth');
  assert.equal(tap[1].center[1],.015);
  assert.notEqual(tap[1].center[2],1.5,'sourced ellipse is centred on its travel point');
});
