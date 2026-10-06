import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

async function rig(hz=60) {
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'p2',remote:true,roller:false});
 a.weapon=f.WEAPONS.charger;f.bind(nm,[a]);
 const packet=(ts,active,e,life=0,from='p2',alive=true)=>nm.onMessage(from,JSON.parse(JSON.stringify({k:'t',ts,r:2,u:Math.round(ts*60),l:{0:life},a:[f.packActor(a,{f:(alive?1:0)|(active?8192:0)})],...(e?{e}:{})})));
 f.clock.set(1000);packet(999.8,false);nm.update(1/hz);nm.applyRemote(a,1/hz);
 const use=(tick=60000,seq=1)=>[1000,'ev','special:use',{actor:{n:0},id:'storm'},tick,seq];
 const birth=(tick=60000,seq=2)=>[1000,'b',0,'storm',0,3,0,0,5,10,tick,seq];
 const run=()=>{for(let i=0;i<hz;i++){f.clock.advance(1/hz);nm.update(1/hz);nm.applyRemote(a,1/hz);}};
 return {f,nm,a,packet,use,birth,run};
}
for(const hz of [30,60,120])for(const phase of [0,1/60,2/60])test(`${hz}Hz native update admits instantaneous Storm before actor presentation, send phase ${phase}`,async()=>{
 const r=await rig(hz);r.f.clock.set(1000.2+phase);r.packet(1000+phase,true,[r.use(),r.birth()]);
 assert.equal(r.a.specialActive,null,'no manual specialActive fixture');r.run();
 assert.equal(r.f.projectiles.bombs.length,1);assert.equal(r.a.net._stormBirthAuth.used,true);
});
for(const kind of ['inactive','wrong-owner','missing-snapshot','stale-tick','old-tick','duplicate','duplicate-use','ended','new-life','dead','forged-proof'])test(`native timeline rejects ${kind} Storm authority`,async()=>{
 const r=await rig();r.f.clock.set(1000.2);
 if(kind==='missing-snapshot'||kind==='forged-proof') {
  const events=[r.use(),r.birth()];for(const e of events)e._stormSnapshot={owner:'p2',life:0,at:1000,tick:60000};
  r.nm.onMessage('p2',{k:'t',ts:1000,r:2,u:60000,e:events});
 } else {
  const events=[r.use(kind==='old-tick'?59900:60000),r.birth(kind==='stale-tick'?60001:kind==='old-tick'?59900:60000)];
  if(kind==='duplicate')events.push(r.birth(60000,3));
  if(kind==='duplicate-use')events.push(r.use(60000,3),r.birth(60000,4));
  r.packet(1000,kind!=='inactive',events,0,kind==='wrong-owner'?'p3':'p2');
  if(kind==='ended'||kind==='new-life'||kind==='dead')r.packet(1000.1,kind==='new-life',undefined,kind==='new-life'?1:0,'p2',kind!=='dead');
 }
 r.run();assert.equal(r.f.projectiles.bombs.length,kind.startsWith('duplicate')?1:0);
});

test('native respawn retires an unused authority before its later birth',async()=>{
 const r=await rig();r.f.clock.set(1000.2);r.packet(1000,true,[r.use()]);r.run();
 assert.equal(r.a.net._stormBirthAuth.used,false);
 r.nm._remoteRespawn(r.a);assert.equal(r.a.net._stormBirthAuth,null);
 r.packet(1000+1/60,true,[r.birth()]);r.run();
 assert.equal(r.f.projectiles.bombs.length,0);
});

test('old active presentation cannot authorize an accepted inactive snapshot or its stale replacement',async()=>{
 const r=await rig();r.f.clock.set(1000.2);r.packet(1000,true);r.run();
 assert.equal(r.a.specialActive?.id,'storm');
 r.packet(1000.1,false,[r.use(),r.birth()]);
 r.packet(1000.05,true,[r.use(60000,3),r.birth(60000,4)]);
 assert.equal(r.a.specialActive?.id,'storm','presentation has not yet applied the new inactive sample');
 r.run();assert.equal(r.f.projectiles.bombs.length,0);assert.equal(r.a.specialActive,null);
});
