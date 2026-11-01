import test from 'node:test';
import assert from 'node:assert/strict';
import {loopback,pickup,realShotCount} from './rainmaker-release-completion-fixture.mjs';
for(const transition of ['phase-return','host-role-ABA'])test(`failed native event0 cannot gain completion after ${transition}`,async()=>{
 const r=await loopback({separateDeviceOwner:true});
 try{
  pickup(r);for(let i=0;i<90;i++)r.step(true);
  const engine=r.host.match.ranked,native=engine.update,error=new Error('failed release '+transition);let failed,caught;
  engine.update=function(...args){const result=native.apply(this,args),event=this.events.find(e=>e.kind==='rainmaker-shot');if(event){failed=event;throw error;}return result;};
  try{for(let i=0;i<90&&!failed;i++){try{r.step(false);}catch(e){caught=e;break;}}}finally{engine.update=native;}
  assert.equal(caught,error);assert.equal(failed.id,0);assert.equal(realShotCount(r),0);
  const peers=[r.host,r.source,r.deviceOwner];
  if(transition==='phase-return'){
   for(const p of peers)p.match.setState('finish');r.deliver();for(let i=0;i<10;i++)r.step(false);
   assert(engine.events.includes(failed));for(const p of peers)p.match.setState('playing');r.deliver();
  }else{
   // Existing host-change hooks and actual native ownership transitions;
   // this is a role-ABA failure negative, not a full reconnect positive.
   for(const [from,to]of [['host','defender'],['defender','host']]){
    for(const p of peers){p.nm.s._members.delete(from);p.nm.s._members.set(to,{});p.nm.s.hostId=to;p.nm.s.isHost=p.id===to;p.match.follower=!p.nm.isHost;p.nm.onLeave(from,true);}
    r.deliver();
   }
   assert(engine.events.includes(failed));
  }
  for(let i=0;i<90;i++)r.step(false);
  assert.equal(realShotCount(r),0);assert.equal(r.source.claims.length,0);for(const p of peers)assert.equal(p.wall.hp,800);
 }finally{r.close();}
});
