import test from 'node:test';
import assert from 'node:assert/strict';
import {loopback,pickup,release,realShotCount} from './rainmaker-release-completion-fixture.mjs';
const shots=r=>r.wire.flatMap(m=>m.from==='host'&&m.packet.k==='rkevent'?m.packet.events.filter(e=>e.kind==='rainmaker-shot'):[]);

test('completed native event0 reaches the real nonhost Wall owner through three isolated peers',async()=>{
 const r=await loopback({separateDeviceOwner:true});
 try{pickup(r);release(r);assert.equal(shots(r)[0].id,0);assert.equal(r.source.claims.length,2);
  assert.equal(r.deviceOwner.wall.hp,380);assert.equal(r.host.wall.hp,800);assert.equal(r.source.wall.hp,800);
 }finally{r.close();}
});

test('failed native release keeps its queue/local playback but never wire authority; the next native event1 still works',async()=>{
 const r=await loopback({separateDeviceOwner:true});
 try{
  pickup(r);for(let i=0;i<90;i++)r.step(true);
  const engine=r.host.match.ranked,native=engine.update,error=new Error('native release sentinel');let failed,caught;
  engine.update=function(...args){const result=native.apply(this,args),event=this.events.find(e=>e.kind==='rainmaker-shot');if(event){failed=event;throw error;}return result;};
  try{for(let i=0;i<90&&!failed;i++){try{r.step(false);}catch(e){caught=e;break;}}}finally{engine.update=native;}
  assert.equal(caught,error);assert.equal(failed.id,0);assert(engine.events.includes(failed));assert.equal(realShotCount(r),0);
  let played=false;const playback=r.host.match.playRankedEvents;
  r.host.match.playRankedEvents=function(events,...args){played ||= events.includes(failed);return playback.call(this,events,...args);};
  try{for(let i=0;i<90;i++)r.step(false);}finally{r.host.match.playRankedEvents=playback;}
  assert.equal(played,true,'native local event playback is retained, not quarantined visually');
  assert.equal(realShotCount(r),0);assert.equal(r.source.claims.length,0);assert.equal(r.deviceOwner.wall.hp,800);
  release(r);assert.deepEqual(shots(r).map(e=>e.id),[1]);
  assert.deepEqual(r.source.claims.map(e=>[e.sourceRankedShot,e.damage,e.cause]),[[1,60,'Gachihoko_Bullet'],[1,180,'Gachihoko_BombCore']]);
  assert.equal(r.deviceOwner.wall.hp,380);assert.equal(r.host.wall.hp,800);assert.equal(r.source.wall.hp,800);
 }finally{r.close();}
});
