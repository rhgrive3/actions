import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CANONICAL_KITS} from '../runtime/canonical-kits-data.mjs';
import {gearCurve} from '../runtime/gear.mjs';
import {restoreAdoptedGearGauge} from '../runtime/gear-loadout-network.mjs';
const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url)));
// This is the numeric curve domain, including AP values not expressible by
// ordinary 10/3 slots. Legal real-Actor loadouts are tested separately.
test('all 65 kit costs at 0–57 AP retain full versus near-full adoption boundaries',()=>{
 assert.equal(Object.keys(CANONICAL_KITS).length,65);let cases=0;
 for(const[id,kit]of Object.entries(CANONICAL_KITS))for(let ap=0;ap<=57;ap++)for(const ready of [false,true]){
  const cost=kit.specialCost/gearCurve(ap,...profile.gear.specialCharge),points=cost-(ready?0:.01);
  const actor={alive:true,remote:false,net:{lastLife:1},weapon:{specialCost:cost},special:Math.round(points)};
  const transfer={latest:{life:1,gear:{}},snapshot:{life:1,spCost:cost,sp:Math.round(points),f:ready?1:0}};
  assert.equal(restoreAdoptedGearGauge(actor,transfer,1,2),true,`${id}/${ap}`);
  assert.equal(actor.special>=cost,ready,`${id}/${ap}/${ready}`);assert.ok(actor.special<=cost);cases++;
 }
 assert.equal(cases,7540);
});
