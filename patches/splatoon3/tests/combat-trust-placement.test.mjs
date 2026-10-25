import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../../scripts/check-inkwave-combat-trust.mjs',import.meta.url),'utf8');
const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url)));
class Vector {set(x,y,z){Object.assign(this,{x,y,z});return this;}normalize(){const n=Math.hypot(this.x,this.y,this.z);this.x/=n;this.y/=n;this.z/=n;return this;}}
const setup=()=>{const actors=[{pos:new Vector(),aimDir:new Vector(),aimPoint:new Vector()},{pos:new Vector()}];let cleared=0;const c={G:{actors,projectiles:{clear(){cleared++;}}}};vm.runInNewContext(source.match(/globalThis\.place=([^\n]+);/)[0],c);return {c,actors,cleared:()=>cleared};};
test('default placement remains the same straight-ahead negative control',()=>{const {c,actors,cleared}=setup();c.place();assert.deepEqual({...actors[1].pos},{x:0,y:0,z:10});assert.deepEqual({...actors[0].aimDir},{x:0,y:0,z:1});assert.equal(cleared(),1);assert.ok(source.includes('await reset();\n  await guest.evaluate(()=>{wall=true;});'));assert.ok(source.includes("100,'occluded straight-fire claim is rejected'"));});
test('positive placement aims through the visible gap inside the actual shooter profile reach',()=>{const {c,actors}=setup();c.place(5,7);const [a,v]=actors;assert.deepEqual({...v.pos},{x:5,y:0,z:7});assert.equal(a.aimPoint.z,7);assert.ok(Math.abs(a.aimDir.x/a.aimDir.z-5/7)<1e-12);assert.ok(6*a.aimDir.x/a.aimDir.z>4);assert.ok(Math.hypot(v.pos.x,1,v.pos.z)<profile.weapons.shooter.combatRange);assert.ok(Math.hypot(9,1,10)>profile.weapons.shooter.range);assert.ok(source.includes('await reset(5,7);'));assert.ok(source.includes("64,'visible victim takes the legal 36'"));assert.ok(source.includes("true,'positive control is not behind the controlled wall'"));});
