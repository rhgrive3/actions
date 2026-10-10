import test from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../../../scripts/check-inkwave-network-comparison.mjs';
import { fixture } from './robustness-fixture.mjs';

test('seed13 Roller flight preserves the brake/free boundary over native floor and wire',async()=>{
  for(const kind of ['horizontal','vertical']){
    const r=await replay(true,kind,{seed:13,realFloor:true});
    assert(r.maxPositionError<.01,'only existing position quantization remains');
    assert.equal(r.velocityError,0,'birth velocity remains exact through JSON');
    assert(r.comparedSteps>0);
  }
});

test('projectile recorder preserves all three velocity components exactly',async()=>{
  const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me'});
  f.bind(nm,[a]);f.projectiles.fireFlick(a,a.weapon);
  const p=f.projectiles.list[0];p.vel.set(12.345678901,-.000123456789,98.765432109);
  const previousSequence=nm._eventSeq;nm.out=[];nm.recProj(p);
  const e=JSON.parse(JSON.stringify(nm.out[0]));
  assert.deepEqual(e.slice(8,11),Array.from(p.vel.toArray()));
  assert.equal(e.length,36,'retain the current Kit and Roller-unit envelope');
  assert.equal(e[33],p.fidelityRollerUnitIndex ?? -1,'Roller unit preserves the actual projectile owner record');
  assert.equal(e[34],Math.round(f.G.time*60),'owner tick follows the unit field');
  assert.equal(e[35],previousSequence+1,'event sequence stays last');
  nm.dispose();
});
