// Diagnostic only: observes the actual native shot path in two isolated realms.
// Does not modify actor, animation, clock, life or socket state.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativeTurfProbe,privateNativeRealm} from './native-turf-replay-fixture.mjs';
const command=(a,r)=>({nid:a.nid,owner:a.owner,life:r.life,input:{fire:!!(r.bits&1),squid:!!(r.bits&2),sub:!!(r.bits&4),jump:!!(r.bits&8),special:!!(r.bits&16),move:r.move},aim:r.aim,aimPoint:r.aimPoint});
const node=o=>o&&({name:o.name,type:o.type,position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),matrix:o.matrix.toArray(),matrixWorld:o.matrixWorld.toArray(),visible:o.visible});
const scalar=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>typeof v==='number'||typeof v==='boolean'||typeof v==='string'));
function capture(a,G){
 const c=a.character,chain=[];for(let o=c.weapon?.muzzle;o;o=o.parent)chain.push(node(o));
 const bones=Object.fromEntries(c.boneList.map(b=>[b.name,node(b)]));
 const s=c.sourceMotion;
 return {isLocal:a.isLocal,remote:a.remote,pos:a.pos.toArray(),vel:a.vel.toArray(),yaw:a.yaw,aimYaw:a.aimYaw,aimPitch:a.aimPitch,aimDir:a.aimDir.toArray(),aimPoint:a.aimPoint.toArray(),grounded:a.grounded,smoothY:a.smoothY,smoothYV:a.smoothYV,
  root:node(c.root),kid:node(c.kid),P:Array.from(c.P),sp:Array.from(c.sp),bones,chain,form:c.form,weapon:c.weapon.def.id,aimReady:c.aimReady(),camera:G.camera?node(G.camera):null,local:G.local?.nid??null,actorScalars:scalar(a),characterScalars:scalar(c),animScalars:scalar(a.anim),
  source:s&&{status:s.status,state:s.state,active:s.active,time:s.time,formTime:s.formTime,formDuration:s.formDuration,formKid:s.formKid,variant:s.variant}};
}
function observe(projectiles,actor,G,rows){
 const original=projectiles._muzzle;
 projectiles._muzzle=function(a,out,...args){if(a!==actor)return original.call(this,a,out,...args);const before=capture(a,G);const result=original.call(this,a,out,...args);rows.push({before,after:capture(a,G),muzzle:out.toArray(),stack:new Error().stack});return result;};
 return ()=>{projectiles._muzzle=original;};
}
test('diagnose first native Charger muzzle using unmodified source and private actors',async()=>{
 const p=await nativeTurfProbe('charger'),q=await privateNativeRealm(), f=q.f, a=p.actor, owners=new Map([[a.nid,a.owner]]),auth={epoch:p.net.cfg.id,owners}, observed={source:[],private:[]}, samples=[];
 let token,privateActor,restoreSource,restorePrivate,firstMismatch=null;
 try{
  // A construction-only control: pass the same native name supplied by the
  // trusted Match roster, without assigning seed, RNG, pose or actor state.
  const CharacterClass=process.env.INKWAVE_MUZZLE_NAME==='1' ? class extends f.Character { constructor(opts){super({...opts,name:a.name});} } : f.Character;
  const beforeActors=(_actors,_dt,api)=>{if(process.env.INKWAVE_MUZZLE_NO_CAMERA==='1')api.G.camera=null;};
  token=f.createTrustedNativeReplay(f,{isolatedRealm:true,epoch:p.net.cfg.id,seed:1,time:f.G.time,world:{level:f.G.level,physics:f.G.physics,paint:f.G.paint,match:q.match,beforeActors,initializeActor(actor){privateActor=actor;assert.equal(f.beginInitialSquidSpawn(actor),true);restorePrivate=observe(f.G.projectiles,actor,f.G,observed.private);}},roster:[{nid:a.nid,owner:a.owner,life:a.netLife,team:a.team,slot:a.slot,weapon:a.weapon.id,position:a.pos.toArray(),yaw:a.yaw,style:{hair:0,skin:2,outfit:0,eyes:0}}],CharacterClass});
  if(process.env.INKWAVE_MUZZLE_READY==='1'){await privateActor.character._sourceMotionLoader;if(privateActor.character.sourceMotion?.ready)await privateActor.character.sourceMotion.ready;}
  restoreSource=observe(p.f.G.projectiles,a,p.f.G,observed.source);
  let next=performance.now()+1000/60;
  async function step(){const delay=next-performance.now();if(delay>0)await new Promise(r=>setTimeout(r,Math.ceil(delay)));next=performance.now()+1000/60;const pre=p.rows.length>=374?{source:capture(a,p.f.G),private:capture(privateActor,f.G)}:null;p.step();q.step();const r=p.rows.at(-1);const result=f.advanceTrustedNativeReplay(token,{tick:r.tick,dt:r.dt,commands:[command(a,r)]},auth);assert.equal(result.ok,true,JSON.stringify(result));const pa=a.character.P,pb=privateActor.character.P;let delta=0;for(let i=0;i<pa.length;i++)delta=Math.max(delta,Math.abs(pa[i]-pb[i]));if(!firstMismatch&&delta>1e-7)firstMismatch={tick:r.tick,delta,source:capture(a,p.f.G),private:capture(privateActor,f.G)};if(pre)samples.push({tick:r.tick,pre,post:{source:capture(a,p.f.G),private:capture(privateActor,f.G)}});}
  for(let i=0;i<260;i++)await step();a.intent.fire=true;await step();a.intent.fire=false;a.intent.move.set(.25,0,0);
  for(let i=0;i<120&&a.s3.squidSpawn;i++)await step();assert.equal(a.s3.squidSpawn,undefined);a.intent.move.set(0,0,0);a.intent.fire=true;for(let i=0;i<65;i++)await step();a.intent.fire=false;for(let i=0;i<12;i++)await step();
  assert.equal(p.births.length,1);assert.equal(f.inspectTrustedNativeReplay(token).launches.length,1);assert.ok(observed.source.length&&observed.private.length);
  const origin=observed.source.at(-1),replayed=observed.private.at(-1),delta=Math.hypot(...origin.muzzle.map((v,i)=>v-replayed.muzzle[i]));
  assert.equal(origin.before.source.status,'ready');assert.equal(replayed.before.source.status,'ready');
  if(process.env.INKWAVE_MUZZLE_NAME==='1'&&process.env.INKWAVE_MUZZLE_NO_CAMERA==='1'){
   assert.deepEqual([...origin.muzzle],[...replayed.muzzle],'trusted matching initialization restores exact native muzzle');
   assert.equal(firstMismatch,null,'all native pose arrays stay within 1e-7 each tick');
   for(let i=0;i<origin.after.chain.length;i++)assert.deepEqual([...origin.after.chain[i].matrixWorld],[...replayed.after.chain[i].matrixWorld],'socket ancestry world matrix '+i);
  }else{assert.ok(delta>1e-7,'historical non-matching initialization produces a measurable muzzle gap');assert.ok(firstMismatch);}
  if(process.env.INKWAVE_MUZZLE_PROBE)fs.writeFileSync(process.env.INKWAVE_MUZZLE_PROBE,JSON.stringify({samples,observed,firstMismatch},null,2));
  console.log(JSON.stringify({sourceCalls:observed.source.length,privateCalls:observed.private.length,source:origin.muzzle,private:replayed.muzzle,delta,firstMismatchTick:firstMismatch?.tick}));
 }finally{restoreSource?.();if(token)f.disposeTrustedNativeReplay(token);restorePrivate?.();p.dispose();q.dispose();}
});
