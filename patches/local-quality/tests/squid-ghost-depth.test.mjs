import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
test('local squid ghost blends against world depth before visible body at every source LOD',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4}),a=await f.make(),c=a.character,T=f.THREE;
 a.form='squid';a.submerged=true;a.grounded=a.ground.hit=true;
 for(const lod of ['hero','game','far']){
  c.setLod(lod);for(let i=0;i<60;i++){f.G.time+=1/60;a.vel.set(0,0,-6);a._finishFrame(1/60);}
  const g=c.squid.ghost,b=c.squid.body,m=g.material;
  assert(g.visible,'local submerged indicator retained');assert.equal(m.transparent,false,'ghost is in opaque render queue');assert.equal(m.blending,T.CustomBlending,'alpha blending retained');assert.equal(m.blendSrc,T.SrcAlphaFactor);assert.equal(m.blendDst,T.OneMinusSrcAlphaFactor);assert.equal(m.blendSrcAlpha,T.OneFactor);assert.equal(m.blendDstAlpha,T.OneMinusSrcAlphaFactor);assert.equal(m.depthFunc,T.GreaterDepth);assert.equal(m.depthWrite,false);assert.equal(m.opacity,.42);
  assert(g.renderOrder>1,'after ordinary world and painted props');assert(g.renderOrder<b.renderOrder);assert(b.renderOrder<c.squid.dark.renderOrder);assert(b.renderOrder<c.squid.eyes.renderOrder);assert.equal(b.material.transparent,false);
 }
 // Simple depth outcomes: visible body covers ghost, while world-occluded ghost remains.
 const depth=(world,body,hidden)=>{let z=world,color='world';if(hidden>z)color='ghost';if(body<=z){color='body';z=body;}return color;};
 assert.equal(depth(1,.3,.4),'body');assert.equal(depth(.2,.3,.4),'ghost');
 c.isLocal=false;for(let i=0;i<3;i++){f.G.time+=1/60;a._finishFrame(1/60);}assert.equal(c.squid.ghost.visible,false,'remote submerged visibility unchanged');c.isLocal=true;
 a.submerged=false;for(let i=0;i<30;i++){f.G.time+=1/60;a._finishFrame(1/60);}assert.equal(c.squid.ghost.visible,false,'dry form unchanged');f.reset();
});
