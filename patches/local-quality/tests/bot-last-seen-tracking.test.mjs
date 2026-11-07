// A Bot works from where it last saw its target, not from the target's live position behind cover.
// Actual composed BotBrain + Actor. Perception and steering are controlled so only the tracking decision is measured.
// Headless Bot-logic checks, not a Splatoon 3 retail measurement (Bots have no Splatoon 3 counterpart).
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

async function setup() {
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export { BotBrain } from './inkwave-public/src/game/bots.js';"});
 f.G.paint.sample=()=>1;
 f.G.paint.regionStats=(_x,_y,_z,_r,_team,out)=>Object.assign(out||{},{own:1,enemy:0,empty:0,n:1});
 f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
 return f;
}
function scenario(f,{enemyAt=[0,0,6]}={}) {
 f.G.actors=[]; f.G.projectiles.clear(); f.G.time=0;
 const a=f.make('shooter');a.isBot=true;a.groundTeam=1;a.ink=100;a.hp=f.PLAYER.hp;a.lastDamage=99;a.lastFire=99;a.pos.set(0,0,0);
 const e=f.make('shooter');e.team=1;e.pos.set(...enemyAt);
 f.G.actors=[a,e];
 const b=a.bot=new f.BotBrain(a,'normal');
 const paths=[];
 b._perceive=()=>{};b._pickPaintGoal=()=>{b.goalTimer=1;b.path=null;};b._pickRefill=()=>{b.repath=1;b.path=null;};
 b._steer=()=>new f.THREE.Vector3(0,0,0);
 b._pathTo=(p)=>{paths.push([p.x,p.y,p.z]);b.repath=0.5;return false;};
 b.target=e;b.react=0;b.seeTimer=1.2;
 return {a,b,e,paths,step(n=1,dt=1/60){for(let i=0;i<n;i++){f.G.time+=dt;b.update(dt);}}};
}

test('an enemy in sight is tracked at its live position and recorded as last seen',async()=>{
 const f=await setup(),s=scenario(f);s.step(3);
 assert.equal(s.b.hasLastSeen,true);
 assert.deepEqual([s.b.lastSeenPos.x,s.b.lastSeenPos.z],[0,6]);
 assert.equal(s.b._targetHidden(),false);
 assert.equal(s.b._trackedTarget(),s.e,'in sight: the live actor');
 s.e.pos.set(3,0,6);s.step(3);
 assert.deepEqual([s.b.lastSeenPos.x,s.b.lastSeenPos.z],[3,6],'follows the enemy while the latest perception tick sees it');
 assert.ok(s.paths.length>0&&s.paths.every(p=>p[2]===6),'pursuit uses the live enemy while it is visible');
});

test('after cover breaks sight the Bot aims and paths to the last seen spot, not the live enemy',async()=>{
 const f=await setup(),s=scenario(f);s.step(3);
 s.paths.length=0;
 // latest perception tick found nothing (seeTimer 1.2 -> 1.0) and the enemy slips away behind a wall
 s.b.seeTimer=1.0;s.e.pos.set(14,0,-10);s.e.vel.set(5,0,-5);
 assert.equal(s.b._targetHidden(),true);
 const ghost=s.b._trackedTarget();
 assert.notEqual(ghost,s.e);
 assert.deepEqual([ghost.pos.x,ghost.pos.z,ghost.vel.x,ghost.vel.z],[0,6,0,0],'no see-through position or velocity');
 s.step(45);
 assert.ok(s.paths.length>0,'still pursues');
 assert.ok(s.paths.every(p=>p[0]===0&&p[2]===6),'route goal is the last seen spot: '+JSON.stringify(s.paths));
 assert.ok(Math.abs(s.b.aimYaw)<0.35,'aim turns toward the last seen spot (yaw 0), not the live enemy (yaw '+Math.atan2(14,-10).toFixed(2)+'): '+s.b.aimYaw);
 assert.equal(s.a.intent.fire,false,'never fires on a target that is out of sight');
});

test('the Bot gives up the target once it reaches the empty last seen spot',async()=>{
 const f=await setup(),s=scenario(f);s.step(3);
 s.b.seeTimer=1.0;s.e.pos.set(14,0,-10);
 s.a.pos.set(0,0,5);   // 1 m from the last seen spot
 s.step(1);
 assert.equal(s.b.target,null);
 assert.equal(s.b.hasLastSeen,false);
 assert.equal(s.b.mode,'paint');
 assert.equal(s.b.seeTimer,0);
});

test('without a sighting record the original live-position behaviour is kept',async()=>{
 const f=await setup(),s=scenario(f);
 s.b.seeTimer=0.4;s.b.hasLastSeen=false;   // e.g. a target assigned by a mode script before any perception tick
 assert.equal(s.b._targetHidden(),false);
 s.step(2);
 assert.ok(s.paths.length>0&&s.paths.every(p=>p[0]===0&&p[2]===6),'paths to the live position as before');
});

test('death and reset clear the sighting record',async()=>{
 const f=await setup(),s=scenario(f);s.step(2);
 assert.equal(s.b.hasLastSeen,true);
 s.a.alive=false;s.step(1);
 assert.equal(s.b.hasLastSeen,false);
 s.b.hasLastSeen=true;s.b.reset();
 assert.equal(s.b.hasLastSeen,false);
 assert.deepEqual([s.b.lastSeenPos.x,s.b.lastSeenPos.y,s.b.lastSeenPos.z],[0,0,0]);
});
