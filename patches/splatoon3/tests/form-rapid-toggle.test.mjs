import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';

for(const sourced of [true,false])test(`eight squid presses per second reach both forms and return to supported idle (${sourced?'source':'fallback'})`,async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4}),traces=[];
 try{for(const hz of [30,60,120]){
  const a=await f.make(),c=a.character;c.onEvent=null;if(!sourced)c.sourceMotion.setEnabled(false);
  const step=form=>{a.form=form;f.G.time+=1/60;a._finishFrame(1/60);c.root.updateMatrixWorld(true);};
  const soles=()=>['L','R'].map(side=>{
   const foot=c.bones['foot'+side],q=foot.getWorldQuaternion(new f.THREE.Quaternion()),p=foot.getWorldPosition(new f.THREE.Vector3());
   return Math.min(...[-.065,.11].map(z=>new f.THREE.Vector3(0,-c.rest['foot'+side].y,z).multiplyScalar(c.kid.scale.x).applyQuaternion(q).add(p).y));
  });
  for(let i=0;i<90;i++)step('kid');
  const idleSoles=soles();
  const trace=[],clock=new FixedClock();let tick=0,completed=0;
  for(let i=0;i<hz*2;i++)clock.advance(1/hz,()=>{
   const form=Math.floor(tick*16/60)%2?'kid':'squid';step(form);
   trace.push([form,c.kidScale,c.sqScale]);
   if(Math.floor((tick+1)*16/60)!==Math.floor(tick*16/60)){
    assert.equal(c.kidScale,form==='kid'?1:0,`tick ${tick}: visible form completes before the next edge`);
    assert.equal(c.sqScale,form==='kid'?0:1);completed++;
   }tick++;
  });assert.equal(completed,32);
  for(let i=0;i<60;i++)step('kid');
  assert.equal(c.kidScale,1);assert.equal(c.sqScale,0);
  if(sourced){assert.equal(c.sourceMotion.state,'idle');assert.equal(c.sourceMotion.debug.groundMode,'plant');
   soles().forEach((y,i)=>assert(Math.abs(y-idleSoles[i])<.01,`foot ${i} returns to its standing support instead of retaining the transform lift`));
  }
  assert([...c.P].every(Number.isFinite));traces.push(trace);f.reset();
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
 }finally{f.reset();}
});
