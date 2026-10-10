import test from 'node:test';
import assert from 'node:assert/strict';
import { bossWorld } from './boss-hit-fixture.mjs';

async function setup({negative=false}={}) {
  const f=await bossWorld(true,{adapt(rel,code){
    if(!negative||rel!=='src/boss/boss.js')return code;
    const routed='(d.c === -1 && (this.invuln || !this.visible))';
    assert.equal(code.split(routed).length,2,'negative control removes only target-specific shell eligibility');
    return code.replace(routed,'this.invuln || !this.visible');
  }});
  const crab={id:7,hp:200,dead:false};f.boss.crabs.set(crab.id,crab);
  return {...f,crab};
}

for(const state of ['invuln','hidden','both']) {
  test(`#1179 ${state} shell leaves actual guest crablet admission equivalent to native local hit`,async()=>{
    for(const negative of [true,false]){
      const f=await setup({negative});f.boss.invuln=state!=='hidden';f.boss.visible=state==='invuln';
      f.actor.remote=false;f.boss.hit(f.actor,30,f.crab,'shooter',null);assert.equal(f.crab.hp,170);
      f.crab.hp=200;f.actor.remote=true;
      const packet=f.hit({c:f.crab.id});f.nm.onMessage('guest',JSON.parse(JSON.stringify(packet)));
      assert.equal(f.crab.hp,negative?200:170);assert.equal(f.boss.hp,10000);
      assert.equal(f.boss.log.recv,negative?0:1);
      f.nm.onMessage('guest',packet);assert.equal(f.crab.hp,negative?200:170,'transport replay remains deduplicated');
      f.nm.onMessage('guest',f.hit({q:2}));assert.equal(f.boss.hp,10000,'same shell still rejects body damage');
      assert.equal(f.boss.log.recv,negative?0:1);
    }
  });
}

test('#1179 shell independence does not bypass dead, malformed, owner or match guards',async()=>{
  for(const reason of ['dead-boss','dead-crab','dead-attacker','non-playing','bad-damage','bad-id','spoof','old-life','old-match']){
    const f=await setup();f.boss.invuln=true;f.boss.visible=false;
    let from='guest',packet=f.hit({c:f.crab.id});
    if(reason==='dead-boss')f.boss.dead=true;
    if(reason==='dead-crab')f.crab.dead=true;
    if(reason==='dead-attacker')f.actor.alive=false;
    if(reason==='non-playing')f.boss.match.state='finish';
    if(reason==='bad-damage')packet.d=-Infinity;
    if(reason==='bad-id')packet.c=999;
    if(reason==='spoof')from='other';
    if(reason==='old-life')packet.l=1;
    if(reason==='old-match')packet.m='retired';
    f.nm.onMessage(from,packet);
    assert.equal(f.crab.hp,200,reason);assert.equal(f.boss.hp,10000,reason);assert.equal(f.boss.log.recv,0,reason);
    assert.equal(f.actor.stats.splats,0,reason);
  }
});
