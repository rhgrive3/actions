import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './weapon-edgecases-fixture.mjs';

// Production path: Projectiles.fireShooter draws the outer/inner choice from the
// shooter's ShooterAccuracy state, then samples the round at the chosen deviation.
// The angle is measured against an identical zero-deviation round from the same aim.
async function setup(){
 const f=await fixture(),{G,THREE}=f;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.actors=[];G.boss=null;G.netm=null;
 G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};G.physics=new f.Physics(G.level);
 const ps=G.projectiles=new f.Projectiles(G.scene);
 let queue=[];f.setRandom(()=>queue.length?queue.shift():.5);
 const actor=(grounded)=>{const a=f.make('shooter');a.grounded=grounded;a.aimPoint.set(0,1.05,100);a.aimDir.set(0,0,1);return a;};
 // One round consumes: outer/inner draw, radius draw (.999999 -> full deviation), azimuth draw.
 const dirOf=(a,deg,draws)=>{queue=draws;ps.fireShooter(a,a.weapon,deg);return ps.list.at(-1).vel.clone().normalize();};
 const base=dirOf(actor(true),0,[.5]);
 const angle=(dir)=>Math.acos(Math.min(1,Math.max(-1,dir.dot(base))))*180/Math.PI;
 return {f,ps,actor,dirOf,angle};
}

test('#198 grounded Splattershot draws outer/inner from the 1%->25% state',async()=>{
 const {actor,dirOf,angle}=await setup();
 const a=actor(true),outer=4.86,inner=outer*.45;
 const shot=(draw)=>angle(dirOf(a,outer,[draw,.999999,.5]));
 const near=(x,y)=>assert.ok(Math.abs(x-y)<0.01,`${x} != ${y}`);
 near(shot(.0101),inner);   // round 1: 1% outer chance, draw above it -> inner
 near(shot(.0199),outer);   // round 2: 2% outer chance -> outer
 near(shot(.0301),inner);   // round 3: 3% outer chance -> inner
 for(let k=4;k<=24;k++) near(shot(.9),inner); // rounds 4..24 never reach the outer draw
 near(shot(.2499),outer);   // round 25: 25% cap reached after 24 increments
 near(shot(.255),inner);    // round 26: a draw in [25%,26%) must not reach outer (cap holds)
});

test('#198 airborne Splattershot uses the 40% outer chance and the air envelope',async()=>{
 const {actor,dirOf,angle}=await setup();
 const a=actor(false),outer=11.66,inner=outer*.45;
 const near=(x,y)=>assert.ok(Math.abs(x-y)<0.01,`${x} != ${y}`);
 near(angle(dirOf(a,outer,[.39,.999999,.5])),outer); // 40% outer chance -> outer air envelope
 near(angle(dirOf(actor(false),outer,[.41,.999999,.5])),inner); // above 40% -> inner
});
