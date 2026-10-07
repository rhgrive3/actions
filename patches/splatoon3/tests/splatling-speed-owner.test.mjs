import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const options={site:process.env.INKWAVE_SPEED_SITE||`${ROOT}.speed-source`,fidelity:true};
async function rig(network=false){const f=await fixture({...options,network});const a=f.make('splatling');a.nid=42;f.G.actors=[a];return {f,a};}
function launch(f,a,charge,u,{oldDouble=false}={}){
 a.weaponRunner.fidelitySplatlingCharge=charge;f.context.Math.random=()=>u;
 const original=f.projectiles._fireRound;
 if(oldDouble)f.projectiles._fireRound=function(actor,w,...args){const rate=f.profile.weaponsFidelityCompletion.weapons.splatling.MoveParam.SpawnSpeedRandomRate;return original.call(this,actor,{...w,projSpeed:w.projSpeed*(1+(u*2-1)*rate)},...args);};
 try{f.projectiles.fireSplatling(a,{...a.weapon,spreadPitchGround:0},0);}finally{f.projectiles._fireRound=original;}
 return f.projectiles.list.at(-1);
}
test('actual Splatling launch samples the absolute speed envelope once at each charge base',async()=>{
 const {f,a}=await rig();
 for(const [charge,base] of [[0,63],[.25,86.625],[2/3,126],[1,126]])for(const [u,offset] of [[0,-7.2],[.25,-1.44],[.5,0],[.75,1.44],[1,7.2]]){
  const p=launch(f,a,charge,u);close(p.vel.length(),base+offset);
  close(p.fidelityPlayerCollision.initRadius,.225);close(p.fidelityFieldCollision.initRadius,.2);
 }
});
test('negative old uniform layer compounds the dedicated sampler and violates both full-charge bounds',async()=>{
 const {f,a}=await rig();
 close(launch(f,a,1,0,{oldDouble:true}).vel.length(),103.68);
 close(launch(f,a,1,1,{oldDouble:true}).vel.length(),148.32);
 assert.ok(103.68<118.8&&148.32>133.2);
});
test('native recorder captures the sampled birth velocity and ghosts preserve it without a second sample',async()=>{
 const {f,a}=await rig(true);
 const nm={mute:0,out:[],_rec:f.NetMatch.prototype._rec,recProj:f.NetMatch.prototype.recProj,recSplat(){},shouldApplyHit:f.NetMatch.prototype.shouldApplyHit};f.G.netm=nm;
 const p=launch(f,a,1,.25),packet=nm.out[0];assert.equal(nm.out.length,1);
 for(const [axis,i] of [['x',8],['y',9],['z',10]])close(packet[i],p.vel[axis]);
 f.context.Math.random=()=>1;f.projectiles.ghostProjectile(a,packet);const ghost=f.projectiles.list.at(-1);
 assert.equal(ghost.ghost,true);for(const [axis,i] of [['x',8],['y',9],['z',10]])close(ghost.vel[axis],packet[i]);
 assert.equal(nm.out.length,1);assert.equal(ghost.damage,0);
});
