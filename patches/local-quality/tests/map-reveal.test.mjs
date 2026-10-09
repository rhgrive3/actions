import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mapOpponentVisible, adaptMapReveal } from '../map-reveal.mjs';

const viewer = { alive:true, team:0 };
const enemy = (team=1) => ({ alive:true, team, anim:{form:'kid'}, s3:{} });
test('#710 an unmarked opponent never enters map payload merely from humanoid form',()=>{
  const o=enemy();
  for(const form of ['kid','swim','jump','shoot']) {
    o.anim.form=form;
    assert.equal(mapOpponentVisible(o, viewer, 30),false,form);
  }
  o.s3.mapMarkedUntil={0:31};
  assert.equal(mapOpponentVisible(o,viewer,30),true);
  assert.equal(mapOpponentVisible(o,viewer,31),false);
  assert.equal(mapOpponentVisible(o,{alive:true,team:2},30),false);
  o.alive=false;assert.equal(mapOpponentVisible(o,viewer,30),false);
});
test('#710 the composed map source checks explicit detection, not animation state',()=>{
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const transformed=adaptMapReveal('src/main.js',raw);
  assert.match(transformed,/!mapOpponentVisible\(o, a, G\.time\)/);
  assert.doesNotMatch(transformed,/if \(o\.anim\.form === 'swim'\) continue/);
  assert.equal(adaptMapReveal('src/game/actor.js',raw),raw);
});
