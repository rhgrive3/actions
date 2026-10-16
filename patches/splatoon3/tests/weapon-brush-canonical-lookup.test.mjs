import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const {FAMILY_POSE,brushMotionSnapshot}=await fixture({extraExports:"export {FAMILY_POSE,brushMotionSnapshot} from './patches/splatoon3/runtime/weapon-models/brushes.mjs';"});
const C={ANC:0,ANCR:3,IKR:6,IKL:7,HIPS:8,HIPS_P:11,SPINE:14,CHEST:17};
const run=fields=>{const ch={P:new Float64Array(32),kidForm:true,grounded:true,...fields};FAMILY_POSE(ch,1/60,{},C);assert.ok(ch.P.every(Number.isFinite));return {state:brushMotionSnapshot(ch),pose:Array.from(ch.P)};};
const bases=['s3-brush-mini','s3-brush-normal','s3-brush-heavy'];
test('legacy valid bases preserve pose with no, empty or unrecognized definition',()=>{for(const id of bases){const a=run({weaponModel:id});assert.ok(a.state);assert.ok(a.pose.some(v=>v!==0));for(const def of [{},{modelId:'unknown'}])assert.deepEqual(run({weaponModel:id,weapon:{def}}),a);}});
test('recognized def wins and canonical variants receive the exact base pose',()=>{for(const base of bases){const a=run({weaponModel:base});for(const row of ['Brush_Heavy_01','Brush_Heavy_02','s3-brush-normal'])assert.deepEqual(run({weaponModel:row,weapon:{def:{modelId:base}}}),a);}});
test('unknown configurations stay inert without creating motion state',()=>{for(const ch of [{weaponModel:'unknown'},{weaponModel:'Brush_Heavy_01',weapon:{def:{modelId:'unknown'}}}]){const x=run(ch);assert.equal(x.state,null);assert.ok(x.pose.every(v=>v===0));}});
