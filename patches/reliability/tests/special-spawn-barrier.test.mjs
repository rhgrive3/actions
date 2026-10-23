import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
import {fixture as sourceFixture} from '../../splatoon3/tests/source-fixture.mjs';
// Resolve the shipped source/patch namespace through the existing production fixture.
const {MAP_LAYOUTS,Level}=await sourceFixture({productionComposition:true,extraExports:"export {MAP_LAYOUTS} from './inkwave-public/src/world/maps.js';"});
const STEP=1/60;
async function rig(layout, {id='slam',extra=.05,barrier=true,angle=0}={}) {
 const f=await fixture({production:true}),a=f.make('shooter'),pad=new f.THREE.Vector3(...layout.spawnPads[1]),R=layout.spawnBarrier;
 // Keep every shipped pad/radius, but isolate the boundary from map routing.
 // Use native capsule resolution rather than a floor stub that bypasses the
 // production exclusion wrapper. This is a component test, not map traversal.
 f.G.level=new Level({bounds:{minX:pad.x-100,maxX:pad.x+100,minZ:pad.z-100,maxZ:pad.z+100},
  spawnPads:layout.spawnPads,spawnBarrier:barrier?R:0,half:[],
  single:[{kind:'box',min:[pad.x-100,pad.y-.5,pad.z-100],max:[pad.x+100,pad.y,pad.z+100]}]});
 f.G.physics=new f.Physics(f.G.level);
 a.weapon={...a.weapon,special:id};a.pos.copy(pad).add(new f.THREE.Vector3(Math.cos(angle)*(R+extra),0,Math.sin(angle)*(R+extra)));
 a.vel.set(0,0,0);a.intent.move.set(-Math.cos(angle),0,-Math.sin(angle));a.groundN.set(0,1,0);a.grounded=true;
 a._surface=()=>{};a._horizontal=()=>{};a._updateClimb=()=>{};
 a._resolve=f.Actor.prototype._resolve;
 let clamps=0;const clamp=f.Actor.prototype._spawnBarrier;
 a._spawnBarrier=function(){clamps++;if(barrier)return clamp.call(this);};
 const paint=[],hits=[],impacts=[];
 f.G.paint.splat=(p,r)=>{paint.push({p:p.clone(),r});return 0;};
 f.G.projectiles.applyHit=(owner,victim,damage,cause)=>hits.push({origin:owner.pos.clone(),victim,damage,cause});
 Object.assign(f.G.projectiles,{throwStorm(){},list:[],bombs:[],clouds:[],beams:[],sights:new Map()});f.G.actors=[a];f.on('special:slam',e=>impacts.push(e.pos.clone()));
 const distance=()=>Math.hypot(a.pos.x-pad.x,a.pos.z-pad.z);
 function tick(){f.G.time+=STEP;a.update(STEP);}
 return {...f,a,pad,R,edge:R+f.PLAYER.radius+.02,paint,hits,impacts,distance,tick,clamps:()=>clamps};
}
function throwStorm(h){
 h.a._startSpecial();assert.equal(h.a.specialActive.phase,'hold');h.a.intent.sub=true;h.tick();h.a.intent.sub=false;h.tick();assert.equal(h.a.specialActive.phase,'throw');
}
for(const [name,layout] of Object.entries(MAP_LAYOUTS))test(`#582 ${name}: native Slam remains outside spawn through all phases and impact`,async()=>{
 const h=await rig(layout);const victim=h.make('shooter');victim.team=1;victim.pos.copy(h.pad);victim.pos.x+=.2;victim.invuln=0;h.G.actors.push(victim);h.a._startSpecial();let ticks=0;
 while(h.a.specialActive&&ticks++<180){h.tick();if(h.a.pos.y>h.pad.y-1)assert.ok(h.distance()>=h.R-1e-12,`tick ${ticks}: ${h.distance()} < ${h.R}`);assert.equal(h.clamps(),ticks,'exactly one clamp per special movement');}
 assert.ok(ticks<180);assert.equal(h.impacts.length,1);assert.ok(Math.hypot(h.impacts[0].x-h.pad.x,h.impacts[0].z-h.pad.z)>=h.R-1e-12);
 assert.ok(Math.hypot(h.paint[0].p.x-h.pad.x,h.paint[0].p.z-h.pad.z)>=h.R-1e-12,'primary paint origin is bounded');
 assert.equal(h.hits.length,1);
 // Excluding the attacker is not damage immunity. Native R=2.5 pads put a
 // legal impact within the legacy 3.2 kill band; the old universal <max claim
 // already failed before exclusion. Compare to a direct stationary impact
 // at the resolved origin, and retain the original falloff claim where its
 // geometric precondition actually holds.
 const hit=h.hits[0],origin=h.impacts[0],d=origin.distanceTo(victim.pos),sp=h.SPECIALS.slam;
 assert.ok(h.distance()>=h.edge-1e-12,'production capsule boundary is enforced');
 h.hits.length=0;h.a.pos.copy(origin);h.a._slamImpact(sp);
 assert.equal(h.hits.length,1);assert.equal(hit.damage,h.hits[0].damage,'movement cannot promote damage above the same legal stationary attack');
 const near=sp.damageNearRadius??sp.killRadius;
 if(d>near)assert.ok(hit.damage<sp.damageMax,'victim beyond the actual near band still receives falloff');
 else assert.equal(hit.damage,sp.damageMax,'legal near-band attack retains its damage; boundary grants no immunity');
 for(const hit of h.hits)assert.ok(Math.hypot(hit.origin.x-h.pad.x,hit.origin.z-h.pad.z)>=h.R-1e-12,'authoritative hit origin is bounded');
});
test('#582 the five-tick inward rise reproduction reaches the barrier without crossing',async()=>{
 const h=await rig(MAP_LAYOUTS.tidewater);h.a._startSpecial();for(let i=0;i<5;i++)h.tick();assert.ok(Math.abs(h.distance()-h.edge)<1e-12);assert.equal(h.clamps(),5);
});
test('#582 Storm residual movement obeys the same barrier without changing its phase timer',async()=>{
 const h=await rig(MAP_LAYOUTS.tidewater,{id:'storm'});h.a.vel.set(-8,0,0);throwStorm(h);const before=h.clamps();let ticks=0;
 while(h.a.specialActive&&ticks++<60){h.tick();assert.ok(h.distance()>=h.R-1e-12);assert.equal(h.clamps(),before+ticks);}
 assert.ok(ticks<60);assert.equal(h.impacts.length,0);assert.equal(h.paint.length,0);
});
test('#582 fixed-step boundary histories agree at 30/60/120/144Hz rendering',async()=>{
 let expected;
 for(const hz of [30,60,120,144]){const h=await rig(MAP_LAYOUTS.tidewater),clock=new h.FixedClock(),rows=[];h.a._startSpecial();
  for(let frame=0;frame<hz*2;frame++)clock.advance(1/hz,()=>{if(h.a.specialActive){h.tick();rows.push([...h.a.pos.toArray(),...h.a.vel.toArray(),h.a.specialActive?.phase??'finished']);}});
  if(expected)assert.deepEqual(rows,expected);else expected=rows;
 }
});
test('#582 steering and phase timing outside spawn are byte-identical to an unclamped control',async()=>{
 for(const id of ['slam','storm']){const histories=[];for(const barrier of [false,true]){const h=await rig(MAP_LAYOUTS.kelpline,{id,extra:20,barrier,angle:.4}),rows=[];if(id==='storm')throwStorm(h);else h.a._startSpecial();let ticks=0;
  while(h.a.specialActive&&ticks++<180){h.tick();rows.push([...h.a.pos.toArray(),...h.a.vel.toArray(),h.a.specialActive?.phase??'finished']);}histories.push(rows);
 }assert.deepEqual(histories[0],histories[1],id);}
});
test('#582 ordinary run/swim now exclude enemies; allies and below-pad routes stay free',async()=>{
 for(const squid of [false,true]){const h=await rig(MAP_LAYOUTS.halyard);h.a._integrate=h.Actor.prototype._integrate;h.a.intent.squid=squid;h.a.vel.set(-8,0,0);h.tick();assert.ok(h.distance()>=h.edge-1e-12);assert.equal(h.clamps(),0,'ordinary movement uses the team-aware production wrapper');
  h.a.team=1;h.a.pos.copy(h.pad).add(new h.THREE.Vector3(h.R+.05,0,0));h.a.vel.set(-8,0,0);h.tick();assert.ok(h.distance()<h.R,'allied entry is not repelled');}
 const h=await rig(MAP_LAYOUTS.halyard,{id:'storm'});h.a.pos.y=h.pad.y-2;h.a.grounded=false;h.a._resolve=()=>{};h.a.vel.set(-8,0,0);throwStorm(h);const before=h.clamps();h.tick();assert.ok(h.distance()<h.R);assert.equal(h.clamps(),before+1);
});

test('a legal Slam retains inner/falloff/range, friendly and LOS rules with exclusion enabled or disabled',async()=>{
 const traces=[];
 for(const barrier of [false,true]){
  const h=await rig(MAP_LAYOUTS.tidewater,{extra:20,barrier}),sp=h.SPECIALS.slam;
  const near=sp.damageNearRadius??sp.killRadius,far=sp.damageRadius??sp.radius;
  const rows=[['inner',near/2,1,true],['falloff',(near+far)/2,1,true],['range',far+.1,1,true],['ally',1,0,true],['occluded',.7,1,false]];
  const victims=rows.map(([name,d,team,visible])=>{const a=h.make('shooter');a.team=team;a.name=name;a.pos.copy(h.a.pos);a.pos.x+=d;a.visible=visible;return a;});
  h.G.actors=[h.a,...victims];h.G.physics.los=(_from,to)=>victims.find(v=>v.pos.x===to.x)?.visible!==false;
  h.a._slamImpact(sp);
  assert.deepEqual(h.hits.map(x=>x.victim.name),['inner','falloff']);
  assert.equal(h.hits[0].damage,sp.damageMax);assert.ok(h.hits[1].damage>sp.damageMin&&h.hits[1].damage<sp.damageMax);
  traces.push(h.hits.map(x=>[x.victim.name,x.damage,...x.origin.toArray()]));
 }
 assert.deepEqual(traces[0],traces[1],'spawn exclusion leaves ordinary attacks outside protection unchanged');
});

test('the fully installed gameplay profile permits a legal near-band Slam into either allied pad',async()=>{
 const f=await sourceFixture({productionComposition:true,fullRuntime:true});
 const {G,THREE,PLAYER,SPECIALS}=f,edge=4.2+PLAYER.radius+.02,sp=SPECIALS.slam;
 assert.equal(sp.damageMax,f.profile.specials.slam.damageMax);
 assert.equal(sp.damageNearRadius,f.profile.specials.slam.damageNearRadius);
 assert.ok(edge-.2<sp.damageNearRadius,'legal pad-edge origin is inside the installed near band');
 for(const team of [0,1]){
  G.level={spawnPads:[new THREE.Vector3(-20,0,0),new THREE.Vector3(20,0,0)],spawnBarrier:4.2};
  const attacker=f.make(),defender=f.make(),ally=f.make(),pad=G.level.spawnPads[1-team];
  attacker.team=ally.team=team;defender.team=1-team;
  attacker.spawnAt(pad.clone().add(new THREE.Vector3(-edge,0,0)),0);
  defender.pos.copy(pad);defender.pos.x-=.2;ally.pos.copy(defender.pos);
  G.actors=[attacker,defender,ally];G.physics.los=()=>true;
  const hits=[];G.projectiles.applyHit=(_owner,victim,damage)=>hits.push([victim,damage]);
  attacker._slamImpact(sp);
  assert.equal(hits.length,1);assert.equal(hits[0][0],defender);assert.equal(hits[0][1],sp.damageMax);
  assert.ok(Math.hypot(attacker.pos.x-pad.x,attacker.pos.z-pad.z)>=edge-1e-12);
 }
});
test('#582 native owner packet and remote pose carry the bounded special position',async()=>{
 const h=await rig(MAP_LAYOUTS.tidewater),g=await rig(MAP_LAYOUTS.tidewater),wire=[];
 const session=(id)=>({myId:id,hostId:'A',isHost:false,_members:new Map([['A','A'],['B','B']]),tr:{broadcast:data=>wire.push(JSON.parse(JSON.stringify(data)))}});
 h.a.nid=g.a.nid=7;h.a.owner=g.a.owner='A';h.a.isLocal=true;
 const owner=new h.NetMatch(session('A'),{map:'tidewater'}),remote=new g.NetMatch(session('B'),{map:'tidewater'});
 try{owner.bind({actors:[h.a],state:'playing',time:180});remote.bind({actors:[g.a],state:'playing',time:180});h.a._startSpecial();for(let i=0;i<5;i++)h.tick();owner._sendTick();const packet=wire.at(-1);
  assert.equal(packet.a.length,1);assert.equal(packet.a[0][1],Math.round(h.a.pos.x*100)/100);assert.equal(packet.a[0][3],Math.round(h.a.pos.z*100)/100);
  remote.onMessage('A',packet);remote.peers.get('A').tr=packet.ts;remote._sample(g.a,packet.ts,STEP);remote.applyRemote(g.a,STEP);
  assert.equal(g.a.pos.x,packet.a[0][1]);assert.equal(g.a.pos.z,packet.a[0][3]);assert.ok(g.distance()>=g.R-1e-12);
 }finally{owner.dispose();remote.dispose();}
});

// #648 must preserve #582's native boundary owner through the full build order.
test('Slam boundary composes with the action-owned gauge exactly once before forecast and impact', async () => {
 const { adaptSource } = await import('../../splatoon3/adapter.mjs');
 const { adaptSpecialBarrier } = await import('../special-barrier-adapter.mjs');
 const fs = await import('node:fs');
 const source = fs.readFileSync(new URL('../../../inkwave-public/src/game/actor.js', import.meta.url), 'utf8');
 const composed = adaptSpecialBarrier('src/game/actor.js', adaptSource('src/game/actor.js', source));
 const boundary = "    this._resolve(false, py, false);\n    this._spawnBarrier();\n    updateTidalSlamGauge(this, s, sp, dt, G, PLAYER);\n    if (s.phase === 'fall'";
 assert.equal(composed.split(boundary).length - 1, 1);
 assert.throws(() => adaptSpecialBarrier('src/game/actor.js', composed), /expected exactly one connection/);
});
