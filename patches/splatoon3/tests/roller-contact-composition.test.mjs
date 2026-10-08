import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { rollerBodyOverlap } from '../runtime/agent3-weapon-physics.mjs';

const rel='src/game/weapons.js';
const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url),'utf8');
test('#1109 Roller stage LOS, stick and Agent3 body geometry compose without breaking the site build',()=>{
  const code=adaptSource(rel,source);
  const expected='rollerStickActive(a) && rollerContactCandidate(a, e, w, PLAYER) && agent3RollerBodyContact(a, e, hs, true) && rollerContactClear(a, e, w, G.physics, PLAYER)';
  assert.equal(code.split(expected).length-1,1);
  assert.match(code,/if \(G\.boss && rollerStickActive\(a\)\)/);
  assert.throws(()=>adaptSource(rel,code),/patch conflict/);
});
test('#1109 valid small-speed contact still requires the real Agent3 collision shape',()=>{
  const drum={Radius:.4,WidthHalf:1.4};
  assert.equal(rollerBodyOverlap(.75,0,0,.001,drum,.35),false);
  assert.equal(rollerBodyOverlap(.75,0,0,.001,drum,.35,1,true),true);
  assert.equal(rollerBodyOverlap(2,0,0,.001,drum,.35,1,true),false);
  assert.equal(rollerBodyOverlap(.75,4,0,.001,drum,.35,1,true),false);
});
