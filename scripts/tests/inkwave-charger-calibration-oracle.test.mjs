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
for(const [charge,width,area,maxZ] of [[0,.78,16.1875,10.375],[.25,.885,21.125,12.625],[.5,1.11,32.875,17.125],[.75,1.335,51.5,21.875],[1,1.56,75.0625,26.625]]) {
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
  assert.ok(tap[1].stretchAmt>0,'travel stamps keep the source depth');
  assert.equal(tap.at(-1).stretchAmt,0,'the terminal stamp is round on its stopping point');
  assert.equal(tap[1].center[1],.015);
  assert.notEqual(tap[1].center[2],1.5,'sourced ellipse is centred on its travel point');
});

test('the previous fivefold-narrowing oracle remains a rejected counterfactual',()=>{
 for(const [q,area,maxZ] of [[0,6.25,9.375],[.25,7.6875,11.375],[.5,9.0625,15.875],[.75,12.8125,20.375],[1,15.625,24.625]]){
  const prior=archive.cases['charger-'+q],narrow=chargerCalibrationReceipt(prior,.2),restored=chargerCalibrationReceipt(prior);
  assert.equal(narrow.area,area);assert.equal(narrow.maxZ,maxZ);
  assert.notDeepEqual(narrow.cellsXZ,restored.cellsXZ);
 }
});
