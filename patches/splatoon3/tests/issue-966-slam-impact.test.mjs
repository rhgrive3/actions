import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
const adapt=(rel,src)=>adaptRange(rel,adaptNetworkSource(rel,adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,src))))));

async function makeFlatSlam(){
  const f=await fixture({ adapt, adaptRuntime: adapt }),a=f.make('shooter');
  a.pos.y=0;a.grounded=false;
  f.G.physics.collideBody=(_p,_r,_l,_h,contacts)=>{contacts.ground=false;contacts.wall=false;contacts.ceiling=false;return contacts;};
  f.G.physics.groundProbe=(_x,y,_z,up,down,_radius,out)=>{
    out.hit=0<=y+up && 0>=y-down;
    if(out.hit){out.y=0;out.normal.set(0,1,0);out.block=-1;out.face=-1;out.u=out.v=0;out.center=true;out.grate=false;}
    return out;
  };
  const hits=[];a._slamImpact=()=>hits.push({t:f.G.time,phase:a.specialActive?.phase,gauge:a.special});
  a.special=a.specialCost();a._startSpecial();
  return {f,a,hits};
}

test('#966 Tidal Slam 60Hz real phase/ground-contact impact aligns with the 70F window',async()=>{
  const {f,a,hits}=await makeFlatSlam();
  assert.equal(f.SPECIALS.slam.hang,0.5);
  let n=0;
  while(a.specialActive && n<180){f.tick(a);n++;}
  assert.ok(n>=68 && n<=72,`impact tick was ${n}, expected ~70F`);
  assert.equal(hits.length,1);
  assert.equal(hits[0].phase,'fall');
  assert.ok(a.special > 0 && a.special < a.specialCost());
});

test('#966 render cadence cannot change the fixed-tick Slam impact',async()=>{
  const traces=[];
  for(const hz of [30,60,120]){
    const {f,a,hits}=await makeFlatSlam(),clock=new FixedClock();
    let ticks=0;
    for(let i=0;i<hz*3 && a.specialActive;i++){
      clock.advance(1/hz,dt=>{f.G.time+=dt;a.update(dt);ticks++;});
    }
    assert.equal(hits.length,1);
    traces.push(ticks);
  }
  assert.deepEqual(traces,[traces[0],traces[0],traces[0]]);
});
