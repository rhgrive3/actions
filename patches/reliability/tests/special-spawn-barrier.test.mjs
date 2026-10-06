import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
import {MAP_LAYOUTS} from '../../../inkwave-public/src/world/maps.js';
const STEP=1/60;
async function rig(layout, {id='slam',extra=.05,barrier=true,angle=0}={}) {
 const f=await fixture(),a=f.make('shooter'),pad=new f.THREE.Vector3(...layout.spawnPads[1]),R=layout.spawnBarrier;
 f.G.level={...f.G.level,spawnPads:layout.spawnPads.map(p=>new f.THREE.Vector3(...p)),spawnBarrier:R};
 a.weapon={...a.weapon,special:id};a.pos.copy(pad).add(new f.THREE.Vector3(Math.cos(angle)*(R+extra),0,Math.sin(angle)*(R+extra)));
 a.vel.set(0,0,0);a.intent.move.set(-Math.cos(angle),0,-Math.sin(angle));a.groundN.set(0,1,0);a.grounded=true;
 a._surface=()=>{};a._horizontal=()=>{};a._updateClimb=()=>{};
 a._resolve=()=>{if(a.pos.y<=pad.y){a.pos.y=pad.y;a.vel.y=0;a.grounded=true;}};
 let clamps=0;const clamp=f.Actor.prototype._spawnBarrier;
 a._spawnBarrier=function(){clamps++;if(barrier)return clamp.call(this);};
 const paint=[],hits=[],impacts=[];
 f.G.paint.splat=(p,r)=>{paint.push({p:p.clone(),r});return 0;};
 f.G.projectiles.applyHit=(owner,victim,damage,cause)=>hits.push({origin:owner.pos.clone(),victim,damage,cause});
 Object.assign(f.G.projectiles,{throwStorm(){},list:[],bombs:[],clouds:[],beams:[],sights:new Map()});f.G.actors=[a];f.on('special:slam',e=>impacts.push(e.pos.clone()));
 const distance=()=>Math.hypot(a.pos.x-pad.x,a.pos.z-pad.z);
 function tick(){f.G.time+=STEP;a.update(STEP);}
 return {...f,a,pad,R,paint,hits,impacts,distance,tick,clamps:()=>clamps};
}
function throwStorm(h){
 h.a._startSpecial();assert.equal(h.a.specialActive.phase,'hold');h.a.intent.sub=true;h.tick();h.a.intent.sub=false;h.tick();assert.equal(h.a.specialActive.phase,'throw');
}
for(const [name,layout] of Object.entries(MAP_LAYOUTS))test(`#582 ${name}: native Slam remains outside spawn through all phases and impact`,async()=>{
 const h=await rig(layout);const victim=h.make('shooter');victim.team=1;victim.pos.copy(h.pad);victim.pos.x+=.2;victim.invuln=0;h.G.actors.push(victim);h.a._startSpecial();let ticks=0;
 while(h.a.specialActive&&ticks++<180){h.tick();if(h.a.pos.y>h.pad.y-1)assert.ok(h.distance()>=h.R-1e-12,`tick ${ticks}: ${h.distance()} < ${h.R}`);assert.equal(h.clamps(),ticks,'exactly one clamp per special movement');}
 assert.ok(ticks<180);assert.equal(h.impacts.length,1);assert.ok(Math.hypot(h.impacts[0].x-h.pad.x,h.impacts[0].z-h.pad.z)>=h.R-1e-12);
 assert.ok(Math.hypot(h.paint[0].p.x-h.pad.x,h.paint[0].p.z-h.pad.z)>=h.R-1e-12,'primary paint origin is bounded');
 assert.equal(h.hits.length,1);assert.ok(h.hits[0].damage<h.SPECIALS.slam.damageMax,'crossing cannot turn the protected-side victim into an inner-band hit');
 for(const hit of h.hits)assert.ok(Math.hypot(hit.origin.x-h.pad.x,hit.origin.z-h.pad.z)>=h.R-1e-12,'authoritative hit origin is bounded');
});
test('#582 the five-tick inward rise reproduction reaches the barrier without crossing',async()=>{
 const h=await rig(MAP_LAYOUTS.tidewater);h.a._startSpecial();for(let i=0;i<5;i++)h.tick();assert.ok(Math.abs(h.distance()-h.R)<1e-12);assert.equal(h.clamps(),5);
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
test('#582 ordinary run/swim retain current geometry-only movement and preserve the below-pad exception',async()=>{
 for(const squid of [false,true]){const h=await rig(MAP_LAYOUTS.halyard);h.a._integrate=h.Actor.prototype._integrate;h.a.intent.squid=squid;h.a.vel.set(-8,0,0);h.tick();assert.ok(h.distance()<h.R);assert.equal(h.clamps(),0,'current S3 adapter retires universal radial clamp');}
 const h=await rig(MAP_LAYOUTS.halyard,{id:'storm'});h.a.pos.y=h.pad.y-2;h.a.grounded=false;h.a._resolve=()=>{};h.a.vel.set(-8,0,0);throwStorm(h);const before=h.clamps();h.tick();assert.ok(h.distance()<h.R);assert.equal(h.clamps(),before+1);
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
