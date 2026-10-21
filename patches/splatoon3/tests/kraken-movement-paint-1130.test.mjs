import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const extraExports="export {KRAKEN_MOVEMENT,krakenMoveSpeed} from './patches/splatoon3/runtime/all-specials.mjs';";
async function setup(){
 const f=await fixture({fullRuntime:true,productionComposition:true,extraExports});
 const a=f.make(); a.weapon={...a.weapon,special:'krakenRoyale',specialCost:100};a.special=100;
 a._surface=()=>{};a._updateClimb=()=>{};a._resolve=()=>{};
 a._integrate=(dt)=>a.pos.addScaledVector(a.vel,dt);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,30);
 f.G.physics.raycast=(from,dir,length,out)=>Object.assign(out,{hit:from.y>=0&&from.y<=length,point:new f.THREE.Vector3(from.x,0,from.z),normal:new f.THREE.Vector3(0,1,0),face:0});
 a._startSpecial();for(let i=0;i<60;i++)a._updateSpecial(1/60);
 a.pos.set(0,0,0);a.vel.set(0,0,0);return {f,a};
}
test('Kraken source velocity caps share the existing player distance convention',async()=>{
 const {f}=await setup();assert.equal(f.KRAKEN_MOVEMENT.speed,f.PLAYER.swimSpeed);
 assert.equal(f.KRAKEN_MOVEMENT.dashSpeed,18);
 assert.equal(f.krakenMoveSpeed('charge',0),2.304);
 assert.equal(f.krakenMoveSpeed('charge',35/60),1.152);
});
test('Kraken active movement approaches 11.52 at 30/60/120Hz without diagonal boost',async()=>{
 for(const hz of [30,60,120]){
  const {a}=await setup();a.intent.move.set(1,0,1);
  for(let i=0;i<hz;i++)a._updateSpecial(1/hz);
  assert.ok(Math.abs(Math.hypot(a.vel.x,a.vel.z)-11.52*(1-Math.exp(-8)))<1e-8);
  assert.ok(Math.hypot(a.pos.x,a.pos.z)>10&&Math.hypot(a.pos.x,a.pos.z)<10.4);
 }
});
test('Kraken paints grounded normal travel at four-frame cadence, with no special recharge',async()=>{
 const {f,a}=await setup(),paints=[];let turf=0;
 a.addTurfNoSpecial=n=>{turf+=n;};a.addTurf=()=>assert.fail('special paint must not refill special');
 f.G.paint.splat=(p,r,team,o)=>{paints.push({p:p.clone(),r,team,o:{...o}});return 1;};
 a.intent.move.set(0,0,1);
 for(let i=0;i<60;i++)a._updateSpecial(1/60);
 assert.equal(paints.length,15);assert.equal(turf,15);
 for(const p of paints){assert.equal(p.r,1.2);assert.equal(p.o.kind,'source-splash');assert.equal(p.o.claimMode,'no-special');assert.equal(p.o.face,0);assert.ok(Math.abs(p.o.stretchAmt-.2)<1e-9);}
 a.grounded=false;for(let i=0;i<30;i++)a._updateSpecial(1/60);assert.equal(paints.length,15,'air does not project paint to lower floor');
 a._s3AllSpecialState.jumpAttack=true;
 for(let i=0;i<30;i++)a._updateSpecial(1/60);assert.equal(paints.length,15,'airborne jump attack cannot bypass local contact paint');
 a.grounded=true;f.G.physics.raycast=(_a,_b,_c,out)=>Object.assign(out,{hit:false});
 for(let i=0;i<30;i++)a._updateSpecial(1/60);assert.equal(paints.length,15,'missing contact does not paint distant floor');
});

test('Kraken charge requires release and grounded dash paints without an airborne spin bypass',async()=>{
 const {f,a}=await setup(),paints=[];f.G.paint.splat=(p,r,team,o)=>{paints.push({p:p.clone(),o});return 0;};
 a.intent.move.set(0,0,1);a.intent.fire=true;a._updateSpecial(1/60);
 assert.equal(a._s3AllSpecialState.phase,'charge');
 for(let i=0;i<40;i++)a._updateSpecial(1/60);
 assert.equal(a._s3AllSpecialState.phase,'charge','holding beyond full charge must not auto-dash');
 a.intent.fire=false;a._updateSpecial(1/60);assert.equal(a._s3AllSpecialState.phase,'dash');
 const before=a.pos.clone(),count=paints.length;
 for(let i=0;i<4;i++)a._updateSpecial(1/60);
 assert.ok(Math.abs(a.pos.z-before.z-18*4/60)<1e-8);assert.equal(paints.length,count+1);
 a.grounded=false;const airCount=paints.length;a._updateSpecial(1/60);
 assert.equal(a._s3AllSpecialState.phase,'active');assert.equal(a._s3AllSpecialState.jumpAttack,true);
 for(let i=0;i<10;i++)a._updateSpecial(1/60);assert.equal(paints.length,airCount);
});
test('Kraken expiry interrupts charging and dash before any new damage or travel ink',async()=>{
 for(const phase of ['charge','dash']){
  const {f,a}=await setup(),state=a._s3AllSpecialState;let paints=0,hits=0;
  f.G.paint.splat=()=>{paints++;return 0;};f.G.projectiles.applyHit=()=>{hits++;};
  state.phase=phase;state.t=state.duration-1/60;state.direction.set(0,0,1);state.dashT=0;
  a.intent.fire=true;a._updateSpecial(1/60);
  assert.equal(state.phase,'finish');assert.equal(a.specialActive.armor,false);
  assert.equal(paints,0);assert.equal(hits,0);
  for(let i=0;i<60;i++)a._updateSpecial(1/60);
  assert.equal(a.specialActive,null);assert.equal(a._s3AllSpecialState,null);assert.equal(a.form,'kid');
  assert.equal(paints,0);assert.equal(hits,0);
 }
});
