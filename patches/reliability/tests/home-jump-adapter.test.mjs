import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability, reliabilityIdentity } from '../adapter.mjs';
import { adaptHomeJump } from '../home-jump-adapter.mjs';

test('#779 home selector adapter is identity-bound and rejects missing/duplicate application',()=>{
  for(const rel of ['src/game/player.js','src/ui/diorama.js']) {
    const raw=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
    const code=adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw)));
    assert.match(code,/homeSuperJumpPoints/);
    assert.throws(()=>adaptHomeJump(rel,''),/conflict/);
    assert.throws(()=>adaptHomeJump(rel,code),/conflict/);
  }
  assert.equal(adaptHomeJump('src/game/actor.js','unchanged'),'unchanged');
  assert.ok(reliabilityIdentity()['home-jump-adapter.mjs']);
});
