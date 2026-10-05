import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function world(){
 const f=await fixture({match:true}),m=new f.Match({});f.G.physics.groundProbe=(_x,_y,_z,_r,_d,_foot,h)=>{h.hit=false;return h;};m.actors=Array.from({length:8},(_,i)=>{const a=f.make();a.team=i>>2;a.pos.set(i*4,0,0);a.update=()=>{};return a;});m.local=m.actors[0];f.G.match=m;f.G.actors=m.actors;f.G.mode='match';f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];m.start();m.setState('playing');const events=[];f.on('team:wipeout',e=>events.push(e));
 const fp=a=>a.s3.flow.score*100/f.profile.flow.threshold;
 return {...f,m,events,fp,tick:()=>m.update(1/60),wipe(team){m.actors.filter(a=>a.team===team).forEach(a=>a.alive=false);}};
}
test('#505 native final splat plus Match transition gives each teammate a separate ten fp',async()=>{
 const f=await world(),[killer,helper,other,dead]=f.m.actors;dead.alive=false;
 f.m.actors[4].splat(killer,'weapon');f.tick();assert.equal(f.events.length,0);near(f.fp(helper),0);
 f.m.actors[5].alive=f.m.actors[6].alive=false;const victim=f.m.actors[7];victim.invuln=0;victim.damage(1,helper,'shooter');
 const before=new Map(f.m.actors.slice(0,4).map(a=>[a,f.fp(a)]));victim.splat(killer,'weapon');const afterSplat=new Map(f.m.actors.slice(0,4).map(a=>[a,f.fp(a)]));
 f.tick();assert.equal(f.events.length,1);for(const a of [killer,helper,other,dead])near(f.fp(a)-afterSplat.get(a),10);
 assert.ok(afterSplat.get(killer)>before.get(killer));assert.ok(afterSplat.get(helper)>before.get(helper));assert.equal(dead.alive,false);near(dead.s3.flow.idleTime,0);
});
test('#505 duplicate and stale sequences cannot multiply a team award, but respawn rearms the next wipe',async()=>{
 const f=await world();f.wipe(1);f.tick();const first=f.events[0];for(let i=0;i<10;i++){f.emit('team:wipeout',first);f.tick();}near(f.fp(f.m.local),10);
 const a=f.m.actors[4];a.respawn();a.update=()=>{};f.tick();a.splat(f.m.local,'weapon');const before=f.fp(f.m.local);f.tick();near(f.fp(f.m.local)-before,10);assert.equal(new Set(f.events.map(e=>e.sequence)).size,2);f.emit('team:wipeout',first);near(f.fp(f.m.local)-before,10);
});
test('#505 foreign, premature, paused, finished, attract and partial-roster events do not award',async()=>{
 for(const mode of ['foreign','alive','pause','finish','attract','partial','badseq']){const f=await world();f.wipe(1);const event={match:f.m,team:1,sequence:1};if(mode==='foreign')event.match={...f.m};if(mode==='alive')f.m.actors[4].alive=true;if(mode==='pause')f.m.paused=true;if(mode==='finish')f.m.state='finish';if(mode==='attract')f.m.attract=true;if(mode==='partial')f.m.actors.pop();if(mode==='badseq')event.sequence=NaN;f.emit('team:wipeout',event);near(f.fp(f.m.local),0);}
});
test('#505 simultaneous wipes award both teams once; active Flow neither extends nor bursts',async()=>{
 const f=await world();f.m.local.s3.flow.active=true;f.m.local.s3.flow.remaining=12;let bursts=0;f.G.paint.splat=()=>bursts++;f.wipe(0);f.wipe(1);f.tick();assert.equal(f.events.length,2);for(const a of f.m.actors.slice(1))near(f.fp(a),10);near(f.m.local.s3.flow.remaining,12);near(f.fp(f.m.local),0);assert.equal(bursts,0);
});
test('#505 duplicate installs still award once and a reused Match intro resets its sequence scope',async()=>{
 const f=await world();f.installFlow(f,f.profile);f.wipe(1);f.tick();near(f.fp(f.m.local),10);
 f.m.actors.forEach(a=>a.alive=true);f.m.start();f.m.setState('playing');f.wipe(1);f.tick();near(f.fp(f.m.local),20);
});
test('#505 a held wipeout produces the same one bonus at 30/60/120/144Hz',async()=>{
 for(const hz of [30,60,120,144]){const f=await world();f.wipe(1);for(let i=0;i<hz;i++)f.m.update(1/hz);assert.equal(f.events.length,1);for(const a of f.m.actors.slice(0,4))near(f.fp(a),10);}
});
test('#505 team bonus remains progress-only at the activation threshold',async()=>{
 const f=await world();f.m.local.s3.flow.score=f.profile.flow.threshold*.95;f.wipe(1);f.tick();near(f.fp(f.m.local),105);assert.equal(f.m.local.s3.flow.active,false);near(f.m.local.s3.flow.remaining,0);
});
test('#505 unconfirmed client-side online wipes cannot award progression',async()=>{
 const f=await world();f.G.netm={match:f.m};f.wipe(1);f.tick();assert.equal(f.events.length,1);for(const a of f.m.actors.slice(0,4))near(f.fp(a),0);f.emit('team:wipeout',f.events[0]);near(f.fp(f.m.local),0);
});
