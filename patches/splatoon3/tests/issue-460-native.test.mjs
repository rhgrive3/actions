import test from 'node:test';
import assert from 'node:assert/strict';
import { combatWorld } from '../../reliability/tests/combat-integration-fixture.mjs';
import { findArrivalGauge } from '../issue-460-gauge.mjs';

test('actual native owner flight and JSON-replicated remote flight render ordered arrival gauges', async () => {
 const A=await combatWorld('A'),B=await combatWorld('B');
 try {
  for(const w of [A,B])w.G.scene=new w.THREE.Scene();
  const a=A.attacker,b=B.attacker,dur=2,to=new A.THREE.Vector3(8,0,4);
  a.superJumpState={phase:'flight',t:0,dur,from:a.pos.clone(),to,marker:0};
  A.emit('superjump',{actor:a,phase:'flight',to,dur});
  A.net._sendTick(); const packet=A.wire.find(x=>x.data.k==='t').data;
  B.deliver('A',packet); B.net._sample(b,0,0);
  for(const fraction of [.25,.5,.75]) {
   a._updateSuperJump(.5); B.net.applyRemote(b,.5);
   const ga=findArrivalGauge(A.G.scene),gb=findArrivalGauge(B.G.scene);
   assert.ok(ga&&gb,'actual scene geometry exists on both owners');
   const arc=g=>g.children.find(c=>c.userData.issue460Arc);
   assert.equal(arc(ga).material.uniforms.uProgress.value,1-fraction);
   assert.equal(arc(gb).material.uniforms.uProgress.value,1-fraction);
   assert.equal(b.net.sjMarker460.label,b.name);
   if(fraction===.5) {
    B.net._playEvent('superjump',{actor:{n:b.nid},phase:'flight',to:[8,0,4],dur});
    assert.equal(b.net.sjT460,1,'duplicate flight notification cannot rewind countdown');
   }
  }
  a._resolve=()=>{a.grounded=true;}; a._updateSuperJump(.5);
  assert.equal(findArrivalGauge(A.G.scene),null,'native landing clears owner gauge');
  B.net._playEvent('superjump:land',{actor:{n:b.nid},pos:[8,0,4]});
  assert.equal(findArrivalGauge(B.G.scene),null,'native land event clears remote gauge');
  assert.equal(a.superJumpState,null);
 } finally {A.dispose();B.dispose();}
});
