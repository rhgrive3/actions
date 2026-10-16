import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {validateManualFrames} from './manual-capture-contract.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./source-frames.json',import.meta.url)));
test('actual source twenty frames satisfy exact manual tuple and native pair gates',()=>assert.equal(validateManualFrames(rows).length,20));
test('missing and duplicate frames reject',()=>{assert.throws(()=>validateManualFrames(rows.slice(1)));const x=structuredClone(rows);x[19]=structuredClone(x[0]);assert.throws(()=>validateManualFrames(x));});
test('invisible, clipped, invalid pose and pair drift reject',()=>{for(const mutate of [f=>f.animationTime=0,f=>f.kidTime=10,f=>f.foregroundPixels=0,f=>f.quantizedColors=1,f=>f.pose=[NaN],f=>f.projectedBounds.max[0]=1.1,f=>f.camera.position[0]+=1,f=>f.births=1,f=>f.variantId='wrong',f=>f.restored=false]){const x=structuredClone(rows);mutate(x.find(f=>f.role==='variant'));assert.throws(()=>validateManualFrames(x));}});

test("dual wield cannot lose the left hand or either trigger matrix",()=>{for(const mutate of [f=>f.hands.pop(),f=>f.partMatrices.pop(),f=>delete f.partMatrices[1].trigger]){const x=structuredClone(rows);mutate(x.find(f=>f.role==="variant"&&f.id.startsWith("Maneuver_")));assert.throws(()=>validateManualFrames(x));}});
