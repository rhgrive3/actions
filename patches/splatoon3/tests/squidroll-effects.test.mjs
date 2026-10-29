import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installSquidrollEffects } from '../runtime/squidroll-effects.mjs';

async function setup() {
  let randomDraws = 0;
  const f = await fixture({ fullRuntime: true, productionComposition: true,
    vmMathRandom: () => { randomDraws++; return .53; },
    extraExports: "export { FX } from './inkwave-public/src/fx/fx.js';" });
  f.FX.prototype.loadInkVolume = async () => ({});
  const scene = new f.THREE.Scene(), fx = new f.FX(scene, {quality:.25});
  f.G.fx = fx; f.G.camera = null;
  const a = f.make(); a.pos.set(0, 1, 0); a.form = 'squid'; a.submerged = true;
  a.vel.set(0, 0, 11); a.intent.squid = true; a.intent.move.set(0, 0, -1); a.intent.jump = true;
  f.tick(a);
  assert(a.s3.actions.roll, 'real movement admission launches the roll');
  return {f,fx,a,scene,randomDraws:()=>randomDraws};
}
function state(a) {
  return JSON.stringify({pos:a.pos,vel:a.vel,ink:a.ink,hp:a.hp,actions:a.s3.actions,anim:a.anim,events:a.character.events});
}
test('production roll emits launch spray and armor light without writing gameplay, animation or RNG', async t => {
  const {f,fx,a,scene,randomDraws} = await setup(); t.after(()=>fx.dispose());
  const before = state(a), resources = scene.children.length, draws = randomDraws();
  fx.update(1/60);
  assert(fx.glows.n > 0); assert(fx.dN > 0);
  assert.equal(state(a), before); assert.equal(randomDraws(), draws);
  assert.equal(scene.children.length, resources, 'reuse existing GPU pools');
  for(let i=0;i<fx.dN;i++) assert.equal(fx.dA[i*8+7],12,'spray has no paint/collision/ripple');
  const count = fx.dN;
  installSquidrollEffects({FX:f.FX,G:f.G,THREE:f.THREE},f.profile);
  fx.update(1/60); assert.equal(fx.dN,count,'cross-realm reinstallation and repeated frames cannot replay launch');
  a.s3.actions.roll.armorHP = 0;
  for(let i=0;i<9;i++)fx.update(1/60);
  assert.equal(fx.glows.n,0,'broken armor stops the continuing glow');
  a.s3.actions.roll = {...a.s3.actions.roll,time:.25,armorHP:30,armorTime:.3};
  fx.update(1/60); assert(fx.dN > count,'chained action gets a new launch');
});
test('pause, cancellation, hidden bodies, distance, remote age and disposal bound the effects', async t => {
  const {f,fx,a} = await setup(); t.after(()=>fx.dispose());
  fx.update(0); assert.equal(fx.glows.n,0);assert.equal(fx.dN,0);
  f.G.match.paused=true;fx.update(1/60);assert.equal(fx.glows.n,0);f.G.match.paused=false;
  a.character.root.visible=false;fx.update(1/60);assert.equal(fx.glows.n,0);a.character.root.visible=true;
  const camera=new f.THREE.PerspectiveCamera();camera.position.set(100,0,0);
  fx.update(1/60,camera);assert.equal(fx.dN,0);camera.position.set(0,2,4);
  fx.update(1/60,camera);assert(fx.glows.n>0);assert.equal(fx.dN,0,'entering view does not replay a missed launch');
  a.alive=false;for(let i=0;i<8;i++)fx.update(1/60,camera);assert.equal(fx.glows.n,0);
  a.alive=true;a.remote=true;a.remoteSquidrollVisual={remaining:.12,vx:2,vz:0};
  fx.update(1/60,camera);assert(fx.glows.n>0);assert.equal(fx.dN,0,'late remote snapshot gets ongoing light only');
  a.remoteSquidrollVisual=null;for(let i=0;i<8;i++)fx.update(1/60,camera);assert.equal(fx.glows.n,0);
  fx.dispose();const n=fx.glows.n;fx.update(1/60,camera);assert.equal(fx.glows.n,n);
});
test('30/60/120Hz retain visible light and finite capped pool records', async t => {
  for(const hz of [30,60,120]) {
    const {fx,a}=await setup();t.after(()=>fx.dispose());
    for(let frame=0;frame<hz*.2;frame++) {
      a.s3.actions.roll.time=.25-frame/hz;
      fx.update(1/hz);assert(fx.glows.n>0,hz+'Hz light');
      assert(fx.glows.n<=fx.glows.cap);assert(fx.dN<=fx.dCap);
      assert(Array.from(fx.glows.X.subarray(0,fx.glows.n*14)).every(Number.isFinite));
    }
    a.s3.actions.roll=null;for(let i=0;i<hz*.3;i++)fx.update(1/hz);
    assert.equal(fx.glows.n,0);assert.equal(fx.dN,0);
  }
});
