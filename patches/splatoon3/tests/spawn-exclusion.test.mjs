import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export {MAP_LAYOUTS} from './inkwave-public/src/world/maps.js';"});
const {G,Actor,THREE,Level,Physics,PLAYER}=f;
function arena() {
  G.level=new Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},
    spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:4.2,half:[],
    single:[{kind:'box',min:[-50,-.5,-50],max:[50,0,50]}]});
  G.physics=new Physics(G.level);G.actors=[];G.projectiles.clear();
  G.paint.sample=()=>1;
  G.match={playing:()=>true,canRespawn:()=>true};
}
const R=4.2+PLAYER.radius+.02;
function actor(team, distance=R+.1, angle=Math.PI) {
  const a=f.make();a.team=team;a.isLocal=true;
  a._integrate=Actor.prototype._integrate;
  const pad=G.level.spawnPads[1-team];
  a.spawnAt(new THREE.Vector3(pad.x+Math.cos(angle)*distance,pad.y,pad.z+Math.sin(angle)*distance),0);
  a.invuln=0;return a;
}
const distance=a=>a.pos.distanceTo(new THREE.Vector3(G.level.spawnPads[1-a.team].x,a.pos.y,G.level.spawnPads[1-a.team].z));
const step=(a,dt=1/60)=>{G.time+=dt;a.update(dt);};

for(const team of [0,1])for(const dt of [1/30,1/60,1/120,.1])test(`team ${team} normal walk/jump/bot cannot enter at dt=${dt}`,()=>{
  arena();const a=actor(team),pad=G.level.spawnPads[1-team];a.isBot=true;
  a.intent.move.set(1,0,0);a.intent.jump=true;
  for(let i=0;i<Math.ceil(2/dt);i++) {step(a,dt);assert(distance(a)>=R-1e-7,`entered ${distance(a)} at tick ${i}`);}
  assert(a.pos.x<pad.x);assert(Number.isFinite(a.vel.length()));
  a.intent.jump=false;a.intent.move.set(-1,0,0);
  for(let i=0;i<Math.ceil(1/dt);i++)step(a,dt);
  assert(distance(a)>R+1,'can move away after contact');
});

for(const team of [0,1])test(`team ${team} allied centre/respawn/exit and reset stay free`,()=>{
  arena();G.paint.sample=()=>team+1;const a=actor(team),pad=G.level.spawnPads[team];
  a.spawnAt(pad,0);assert(a.pos.distanceTo(pad)<1e-8);
  a.intent.move.set(team? -1:1,0,0);
  for(let i=0;i<180;i++)step(a);
  assert(a.pos.distanceTo(pad)>4.5,JSON.stringify(a.pos));assert(a.alive);
  a.respawn();assert(Math.hypot(a.pos.x-pad.x,a.pos.z-pad.z)<2);assert(a.pos.y>pad.y);
  a.reset();a.spawnAt(pad,0);step(a);assert(Math.hypot(a.pos.x-pad.x,a.pos.z-pad.z)<.1);
});

for(const team of [0,1])test(`team ${team} high-speed complete crossing and diagonal tangency`,()=>{
  arena();const a=actor(team,R+2),pad=G.level.spawnPads[1-team];
  a.vel.set(500,0,30);a._integrate(.05,false,false);
  assert(a.pos.x<pad.x,'cannot tunnel to the far side even with outside endpoint');
  assert(distance(a)>=R-1e-7);assert(a.pos.z>0,'tangent movement preserved');
  for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI*3/4,Math.PI,Math.PI*5/4,Math.PI*3/2,Math.PI*7/4]){
    const b=actor(team,R+.01,angle);b.vel.set(-Math.cos(angle)*8,0,-Math.sin(angle)*8);
    for(let i=0;i<20;i++)b._integrate(1/60,false,false);
    assert(distance(b)>=R-1e-7);assert(Math.hypot(b.vel.x,b.vel.z)<1e-6,'no reflected velocity/vibration');
  }
});

test('centre recovery is finite; disabled/absent radii and below-pad routes are untouched',()=>{
  arena();const a=actor(0),pad=G.level.spawnPads[1];
  a.spawnAt(pad,0);assert(distance(a)>=R-1e-7);assert(Number.isFinite(a.pos.length()));
  a.spawnAt(pad.clone().setY(-2),0);assert.equal(a.pos.x,pad.x);
  G.level.spawnBarrier=0;a.spawnAt(pad,0);assert.equal(a.pos.x,pad.x);step(a);assert.equal(a.pos.x,pad.x);
  delete G.level.spawnBarrier;a.spawnAt(pad,0);assert.equal(a.pos.x,pad.x);
});

test('temporary protection/damage/resources and movement away from both pads are unchanged',()=>{
  arena();const a=actor(0);a.spawnAt(new THREE.Vector3(0,0,15),0);a.invuln=.8;
  const hp=a.hp,ink=a.ink;a.intent.move.set(0,0,1);step(a);
  assert.equal(a.invuln,.8-1/60);assert.equal(a.hp,hp);assert.equal(a.ink,ink);assert(a.pos.z>15);
});

test('high jump and rising through the lower height cannot bypass the volume',()=>{
  arena();const a=actor(0),pad=G.level.spawnPads[1];
  a.pos.y=pad.y+30;a.vel.set(600,0,0);a._integrate(.05,false,false);
  assert(a.pos.x<pad.x);assert(distance(a)>=R-1e-7);
  G.level.blocks[0].solid=false; // an actual unobstructed lower route, not through the floor slab
  a.spawnAt(pad.clone().add(new THREE.Vector3(-R-2,-2,0)),0);
  a.grounded=false;a.vel.set(300,30,0);a._integrate(.05,false,false);
  assert(a.pos.y>pad.y-1);assert(a.pos.x<pad.x);assert(distance(a)>=R-1e-7);
});

test('a correction never replaces ordinary wall collision with an overlapping capsule',()=>{
  arena();G.level=new Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:4.2,half:[],
    single:[{kind:'box',min:[-50,-.5,-50],max:[50,0,50]},{kind:'box',min:[15,0,-2],max:[15.8,5,2]}]});
  G.physics=new Physics(G.level);const a=actor(0,R+2);a.vel.set(80,0,0);a._integrate(.1,false,false);
  assert(G.physics.bodyFits(a.pos,PLAYER.radius,PLAYER.stepUp,PLAYER.height));assert(distance(a)>=R-1e-7);
});

test('real NetMatch remote application keeps interpolation outside without changing snapshot/correction',()=>{
  arena();const a=actor(0),pad=G.level.spawnPads[1];a.remote=true;
  const S={x:pad.x,y:0,z:0,vx:2,vy:0,vz:0,yaw:0,aimYaw:0,aimPitch:0,f:0,ink:100,hp:100,sp:0,ch:0,lock:0,turf:0};
  a.net={ready:true,cur:S,err:new THREE.Vector3(),prev:{},loops:{},buf:[]};
  // The native pose tail needs Character/UI methods; stop at its existing
  // finish hook after applying a real network sample, without replaying data.
  a.character.update=()=>{};a.character.setSquid=()=>{};
  const nm=Object.create(f.NetMatch.prototype);nm.peers=new Map();
  f.NetMatch.prototype.applyRemote.call(nm,a,1/60);
  assert(distance(a)>=R-1e-7);assert.equal(S.x,pad.x);assert.equal(a.net.err.lengthSq(),0);
});

for(const id of ['tidewater','kelpline','halyard','cargo'])for(const team of [0,1])test(`${id} team ${team}: real stage collision and opposing pad volume agree`,()=>{
  arena();G.level=new Level(f.MAP_LAYOUTS[id]);G.physics=new Physics(G.level);
  const pad=G.level.spawnPads[1-team];let checked=0;
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*3/2]){
    const p=pad.clone().add(new THREE.Vector3(Math.cos(angle)*(R+.2),0,Math.sin(angle)*(R+.2)));
    if(!G.physics.bodyFits(p,PLAYER.radius,PLAYER.stepUp,PLAYER.height))continue;
    const a=actor(team,R+.2,angle);a.intent.move.set(-Math.cos(angle),0,-Math.sin(angle));
    for(let i=0;i<90;i++){step(a);if(a.pos.y>pad.y-1)assert(distance(a)>=R-1e-7);assert(Number.isFinite(a.pos.length()));}
    checked++;
  }
  assert(checked>0,'at least one actual capsule-clear spawn approach');
});
