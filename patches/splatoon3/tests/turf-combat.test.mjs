import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {installTurfCombatGate,turfCombatAllowed} from '../runtime/turf-combat.mjs';
async function rig(){const f=await fixture();installTurfCombatGate(f);const a=f.make(),v=f.make();a.team=0;v.team=1;v.invuln=0;a.invuln=0;f.G.actors=[a,v];f.G.match={mode:'turf',state:'playing',time:1,playing(){return this.state==='playing';}};f.G.camera={position:new f.THREE.Vector3(0,4,4)};return {...f,a,v};}
test('#976 all damage sources and direct splat refuse post-deadline HP/death/stat mutations',async()=>{
 const f=await rig(),{a,v}=f;f.G.match.state='finish';f.G.match.time=0;
 const before=JSON.stringify([v.hp,v.alive,v.stats,a.stats]);let events=0;f.on('damage',()=>events++);f.on('splatted',()=>events++);
 for(const source of ['shooter','bomb','storm','roller','trizooka','ink']){v.damage(1000,a,source);f.Projectiles.prototype.applyHit.call({},a,v,1000,source);}
 v.splat(null,'water');f.tick(v,120);
 assert.equal(JSON.stringify([v.hp,v.alive,v.stats,a.stats]),before);assert.equal(events,0);
});
test('#976 final legal interval still applies exactly once; later hit cannot kill',async()=>{
 const f=await rig();f.G.match.time=0;f.G.match.s3DeadlineStep=true;f.v.damage(20,f.a,'shooter');assert.equal(f.v.hp,80);
 f.G.match.s3DeadlineStep=false;f.v.damage(200,f.a,'bomb');assert.equal(f.v.hp,80);assert.equal(f.v.alive,true);
 f.G.match.state='finish';f.v.lastDamage=10;f.updateResources(f.v,1);assert.equal(f.v.hp,80,'finish does not silently heal either');
});
test('#976 real bomb/cloud presentation continues without damage after TIME UP',async()=>{
 const f=await rig(),ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;f.G.match.state='finish';f.G.match.time=0;
 let paint=0;f.G.paint.splat=()=>{paint++;return 1;};f.v.pos.set(0,0,0);f.a.pos.set(10,0,0);
 const b={owner:f.a,team:0,pos:new f.THREE.Vector3(0,.1,0)};
 ps._explodeBomb(b);ps._spawnCloud({...b,dir:new f.THREE.Vector3(0,0,1)});
 for(let i=0;i<30;i++)ps._updateClouds(1/60);
 assert.ok(paint>0,'visual paint/FX still advances');assert.equal(f.v.hp,100);assert.equal(f.v.alive,true);assert.equal(f.v.stats.deaths,0);assert.ok(ps.clouds.length>0);ps.clear();
});
test('#976 authoritative wrappers block late network splats/hits but preserve Boss/range/attract',async()=>{
 const f=await rig();f.G.match.state='finish';f.G.match.time=0;
 f.NetMatch.prototype._remoteSplat.call({},f.v,f.a,'shooter');f.NetMatch.prototype._hit.call({},{});assert.equal(f.v.alive,true);
 for(const override of [{bossMode:{}},{mode:'range'},{attract:true}]){const m=f.G.match;Object.assign(m,override);assert.equal(turfCombatAllowed(f.G),true);for(const k of Object.keys(override))delete m[k];m.mode='turf';}
 f.G.match.bossMode={};f.v.damage(20,f.a);assert.equal(f.v.hp,80);
});
test('#976 legacy callers without a Turf state retain normal damage',async()=>{const f=await rig();f.G.match={playing:()=>true};f.v.damage(20,f.a);assert.equal(f.v.hp,80);});
