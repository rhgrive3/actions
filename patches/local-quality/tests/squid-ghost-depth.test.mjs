import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
test('submerged squid suppresses the depth ghost and body hierarchy at every source LOD',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4}),a=await f.make(),c=a.character,T=f.THREE;
 a.form='squid';a.submerged=true;a.grounded=a.ground.hit=true;
 for(const lod of ['hero','game','far']){
  c.setLod(lod);for(let i=0;i<60;i++){f.G.time+=1/60;a.vel.set(0,0,-6);a._finishFrame(1/60);}
  const g=c.squid.ghost,b=c.squid.body,m=g.material;
  assert.equal(g.visible,false,'submerged ghost disabled');assert.equal(c.squid.body.visible,false,'no protruding body');assert.equal(c.squid.eyes.visible,false,'no eyes');assert.equal(m.transparent,false,'ghost is in opaque render queue');assert.equal(m.blending,T.CustomBlending,'alpha blending retained');assert.equal(m.blendSrc,T.SrcAlphaFactor);assert.equal(m.blendDst,T.OneMinusSrcAlphaFactor);assert.equal(m.blendSrcAlpha,T.OneFactor);assert.equal(m.blendDstAlpha,T.OneMinusSrcAlphaFactor);assert.equal(m.depthFunc,T.GreaterDepth);assert.equal(m.depthWrite,false);assert.equal(m.opacity,.42);
  assert(g.renderOrder>1,'after ordinary world and painted props');assert(g.renderOrder<b.renderOrder);assert(b.renderOrder<c.squid.dark.renderOrder);assert(b.renderOrder<c.squid.eyes.renderOrder);assert.equal(b.material.transparent,false);
 }
 c.isLocal=false;for(let i=0;i<3;i++){f.G.time+=1/60;a._finishFrame(1/60);}assert.equal(c.squid.ghost.visible,false,'remote submerged visibility unchanged');c.isLocal=true;
 a.submerged=false;for(let i=0;i<30;i++){f.G.time+=1/60;a._finishFrame(1/60);}assert.equal(c.squid.ghost.visible,false,'dry form unchanged');f.reset();
});
