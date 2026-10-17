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
test('actual Splatling launch applies the source rate once to every charge-dependent base',async()=>{
 const {f,a}=await rig();
 // The endpoints are +/-12%; the first/third quartiles are +/-12% * .2.
 // These independent quantiles reject the earlier absolute +/-7.2 WU/s law.
 for(const [charge,base] of [[0,63],[.25,86.625],[2/3,126],[1,126]])for(const [u,ratio] of [[0,.88],[.25,.976],[.5,1],[.75,1.024],[1,1.12]]){
  const p=launch(f,a,charge,u);close(p.vel.length(),base*ratio);
  close(p.fidelityPlayerCollision.initRadius,.225);close(p.fidelityFieldCollision.initRadius,.2);
 }
});
test('negative old uniform layer compounds the dedicated sampler and violates both full-charge bounds',async()=>{
 const {f,a}=await rig();
 close(launch(f,a,1,0,{oldDouble:true}).vel.length(),97.5744);
 close(launch(f,a,1,1,{oldDouble:true}).vel.length(),158.0544);
 assert.ok(97.5744<110.88&&158.0544>141.12);
});
test('native recorder captures the sampled birth velocity and ghosts preserve it without a second sample',async t=>{
 const {f,a}=await rig(true);
 const nm=f.G.netm=new f.NetMatch({myId:'owner'},{});t.after(()=>nm.dispose());
 const p=launch(f,a,1,.25),packet=nm.out[0];assert.equal(nm.out.length,1);
 for(const [axis,i] of [['x',8],['y',9],['z',10]])close(packet[i],p.vel[axis]);
 f.context.Math.random=()=>1;f.projectiles.ghostProjectile(a,packet);const ghost=f.projectiles.list.at(-1);
 assert.equal(ghost.ghost,true);for(const [axis,i] of [['x',8],['y',9],['z',10]])close(ghost.vel[axis],packet[i]);
 assert.equal(nm.out.length,1);assert.equal(ghost.damage,0);
});
