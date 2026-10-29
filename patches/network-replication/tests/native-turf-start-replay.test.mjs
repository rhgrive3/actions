// Independent native cold-start / initial Squid Spawn / first charge test.
// Node VM and a software scene use actual production-composed or emitted
// Match, Actor, Physics, Character, NetMatch and WeaponRunner. The floor is a
// simple test stage; relay transport is a recording sink, not an actual socket.
// No owner body, life or resource state is assigned from a wire snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativeTurfProbe,privateNativeRealm} from './native-turf-replay-fixture.mjs';

const plain=x=>JSON.parse(JSON.stringify(x));
const close=(a,b,label,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${label}: ${a} vs ${b}`);
const command=(actor,row)=>({nid:actor.nid,owner:actor.owner,life:row.life,input:{
 fire:!!(row.bits&1),squid:!!(row.bits&2),sub:!!(row.bits&4),jump:!!(row.bits&8),special:!!(row.bits&16),move:row.move},
 aim:row.aim,aimPoint:row.aimPoint});
test('native initial spawn and first Charger launch are replayed from uninterrupted requests',async()=>{
 const p=await nativeTurfProbe('charger'),q=await privateNativeRealm();
 const {f}=q,orig=p.actor, actor=orig, owners=new Map([[orig.nid,orig.owner]]), authorization={epoch:p.net.cfg.id,owners};let initialized=0, token,peer,maxPoseGap=0;
 try{
  token=f.createTrustedNativeReplay(f,{isolatedRealm:true,epoch:p.net.cfg.id,seed:1,time:f.G.time,
   world:{level:f.G.level,physics:f.G.physics,paint:f.G.paint,match:q.match,camera:null,initializeActor(a){initialized++;assert.equal(f.beginInitialSquidSpawn(a),true);}},
   roster:[{nid:actor.nid,owner:actor.owner,life:actor.netLife,team:actor.team,slot:actor.slot,name:actor.name,isLocal:actor.isLocal,isBot:actor.isBot,weapon:actor.weapon.id,position:actor.pos.toArray(),yaw:actor.yaw,style:{hair:0,skin:2,outfit:0,eyes:0}}],CharacterClass:f.Character});
  assert.equal(initialized,1);let replay=f.inspectTrustedNativeReplay(token);assert.equal(replay.actors[0].life,orig.netLife);assert.deepEqual(plain(replay.actors[0].position),plain(orig.pos.toArray()));
  // This is a negotiated experimental sibling constructed by the fixture;
  // production NetMatch does not currently send it. The room and receiver
  // clock below are trusted test scheduler inputs, not owner packet fields.
  const policy=f.createNativeCommandRoomPolicy({epoch:p.net.cfg.id,build:'native-vm-fixture',seed:1,roster:[{nid:orig.nid,owner:orig.owner,life:orig.netLife}]});
  const admitted=f.admitNativeCommandPeer(policy,{from:orig.owner,capability:f.nativeCommandCapability(policy),at:performance.now()/1000});
  assert.equal(admitted.ok,true);peer=admitted.peer;
  // Validation must not advance the trusted frame or alter the native actor.
  // Pace fixed simulation against the unmodified monotonic clock. A burst of
  // hundreds of synthetic frames would make owner ticks advance faster than
  // the transport clock and would not be a legal live packet trace.
  let nextTick=performance.now()+1000/60;
  const pace=async()=>{const delay=nextTick-performance.now();if(delay>0)await new Promise(r=>setTimeout(r,Math.ceil(delay)));nextTick=performance.now()+1000/60;};
  await pace();p.step();q.step();let row=p.rows[0],valid=command(orig,row);
  for(const bad of [{...valid,owner:'other'},{...valid,life:row.life+1},{...valid,ink:100},{...valid,position:row.position},{...valid,input:{...valid.input,move:[2,0]}}]){
   assert.equal(f.advanceTrustedNativeReplay(token,{tick:1,dt:row.dt,commands:[bad]},authorization).ok,false);
   assert.equal(f.inspectTrustedNativeReplay(token).tick,0);
  }
  assert.equal(f.advanceTrustedNativeReplay(token,{tick:1,dt:row.dt,commands:[valid]},{epoch:p.net.cfg.id,owners:new Map([[actor.nid,'other']])}).ok,false,'wire owner cannot substitute authenticated principal');
  assert.equal(f.advanceTrustedNativeReplay(token,{tick:1,dt:row.dt,commands:[valid]},{epoch:p.net.cfg.id+'-old',owners}).ok,false,'stale match epoch cannot authorize an otherwise valid command');
  for(const frame of [{tick:0,dt:row.dt,commands:[valid]},{tick:2,dt:row.dt,commands:[valid]},{tick:1,dt:0,commands:[valid]},{tick:1,dt:row.dt,commands:[valid,valid]}])
   assert.equal(f.advanceTrustedNativeReplay(token,frame,authorization).ok,false,'malformed frame does not advance');
  assert.equal(f.inspectTrustedNativeReplay(token).tick,0);
  const snapshots=[],wireRows=[];
  const packetAt=label=>{assert.equal(p.net._sendTick(),true);const packet=p.wire.findLast(x=>x.k==='t');assert.ok(packet);snapshots.push({label,packet:plain(packet)});return packet;};
  packetAt('initial-aim');nextTick=performance.now()+1000/60;
  function consume(r){
   assert.equal(p.net._sendTick(),true);
   const publicPacket=p.wire.findLast(x=>x.k==='t');
   const envelope=f.attachNativeCommandEnvelope(publicPacket,policy,{from:orig.owner,sequence:r.tick,frames:[{tick:r.tick,dt:r.dt,sourceTime:r.time,commands:[command(orig,r)]}]});
   assert.equal(f.prepareNativeCommandEnvelope(peer,envelope,{from:'other',at:performance.now()/1000}).ok,false,'foreign authenticated sender rejected');
   if(r.tick===1){
    assert.equal(f.prepareNativeCommandEnvelope(peer,publicPacket,{from:orig.owner,at:performance.now()/1000}).ok,false,'missing sibling cannot downgrade a negotiated peer');
    const stale=plain(envelope);stale.nc.epoch+='-old';
    assert.equal(f.prepareNativeCommandEnvelope(peer,stale,{from:orig.owner,at:performance.now()/1000}).ok,false,'stale envelope epoch rejected');
   }
   const prepared=f.prepareNativeCommandEnvelope(peer,envelope,{from:orig.owner,at:performance.now()/1000});assert.equal(prepared.ok,true,JSON.stringify(prepared));
   const decoded=prepared.frames[0];
   const result=f.advanceTrustedNativeReplay(token,{tick:decoded.tick,dt:decoded.dt,commands:decoded.commands},authorization);assert.equal(result.ok,true,JSON.stringify(result));
   assert.equal(f.commitNativeCommandEnvelope(peer,prepared.token),true);
   assert.equal(f.commitNativeCommandEnvelope(peer,prepared.token),false,'prepared command commits only once');
   if(r.tick===1){const repeat=f.prepareNativeCommandEnvelope(peer,envelope,{from:orig.owner,at:performance.now()/1000});assert.equal(repeat.duplicate,true);assert.equal(repeat.frames.length,0);}
   wireRows.push({packet:plain(publicPacket),nc:plain(envelope.nc)});
   const a=f.inspectTrustedNativeReplay(token).actors[0];assert.equal(a.life,r.life);assert.equal(a.form,r.form);
   for(let i=0;i<3;i++)close(a.position[i],r.position[i],`tick ${r.tick} position ${i}`);
   for(let i=0;i<3;i++)close(a.velocity[i],r.velocity[i],`tick ${r.tick} velocity ${i}`);
   close(a.ink,r.ink,`tick ${r.tick} ink`);close(a.charge,r.charge,`tick ${r.tick} charge`);
   for(const [name,source] of Object.entries(r.pose)){
    assert.ok(a.pose[name],`tick ${r.tick} ${name} is a real native bone`);
    const actual=[...a.pose[name].position,...a.pose[name].quaternion];
    for(let i=0;i<source.length;i++){maxPoseGap=Math.max(maxPoseGap,Math.abs(actual[i]-source[i]));close(actual[i],source[i],`tick ${r.tick} ${name} component ${i}`);}
   }
  }
  consume(row);
  assert.equal(f.advanceTrustedNativeReplay(token,{tick:1,dt:row.dt,commands:[valid]},authorization).ok,false,'duplicate tick rejected');
  const advance=async()=>{await pace();p.step();q.step();consume(p.rows.at(-1));};
  for(let i=1;i<260;i++)await advance();assert.equal(p.match.state,'playing');assert.equal(p.actor.s3.squidSpawn.phase,'aim');
  p.actor.intent.fire=true;await advance();p.actor.intent.fire=false;
  assert.equal(p.actor.s3.squidSpawn.phase,'flight');packetAt('launch');
  p.actor.intent.move.set(.25,0,0);
  for(let i=0;i<120&&p.actor.s3.squidSpawn;i++)await advance();
  assert.equal(p.actor.s3.squidSpawn,undefined);assert.equal(p.actor.grounded,true);assert.equal(p.actor.ground.hit,true);packetAt('landed');
  p.actor.intent.move.set(0,0,0);
  p.actor.intent.fire=true;for(let i=0;i<65;i++)await advance();p.actor.intent.fire=false;
  for(let i=0;i<12;i++)await advance();
  assert.equal(p.births.length,1,'real Charger launch');replay=f.inspectTrustedNativeReplay(token);
  assert.equal(replay.launches.length,1,'private native launch');assert.equal(replay.launches[0].weapon,'charger');close(replay.launches[0].charge,p.births[0].charge,'launch charge');
  assert.ok(p.rows.some(r=>r.phaseBefore==='aim'&&r.resources===0&&r.effective===null));
  assert.ok(p.rows.some(r=>r.phaseBefore==='flight'&&r.resources===0&&r.effective===null));
  assert.ok(p.rows.some(r=>r.phaseBefore==='landed'&&r.resources===1&&r.effective!==null));
  const packet=packetAt('first-fire');assert.equal(packet.l[orig.nid],orig.netLife);assert.equal(packet.u,Math.round(p.f.G.time*60));
  const spawnRow=s=>s.packet.a[0][23]?.[10];
  assert.equal(spawnRow(snapshots[0])?.[0],'inkwave-squidspawn-v1');assert.equal(spawnRow(snapshots[0])?.[1],0);
  assert.equal(spawnRow(snapshots[1])?.[1],1);assert.equal(spawnRow(snapshots[2]),undefined);
  const firePacket=p.wire.findLast(x=>x.k==='t'&&x.e?.some(e=>e[1]==='ev'&&e[2]==='weapon:fire'));
  const fireEvent=firePacket?.e.find(e=>e[1]==='ev'&&e[2]==='weapon:fire');assert.ok(fireEvent,'wire contains actual first launch event');
  const realMuzzle=fireEvent[3].muzzle,privateMuzzle=replay.launches[0].muzzle;
  assert.ok(realMuzzle?.length===3&&privateMuzzle?.length===3);
  const muzzleGap=Math.hypot(...realMuzzle.map((x,i)=>x-privateMuzzle[i]));
  assert.ok(muzzleGap<=1e-7,`first native muzzle gap ${muzzleGap}`);
  for(const s of snapshots){assert.equal(s.packet.l[orig.nid],orig.netLife);assert.equal(s.packet.ci,undefined,'public owner packet does not contain the experimental exact input stream');}
  for(let i=1;i<snapshots.length;i++){
   const a=snapshots[i-1].packet,b=snapshots[i].packet;
   assert.ok(b.ts>a.ts && (b.u-a.u)/60 <= b.ts-a.ts+.025,`source tick Δ${b.u-a.u} exceeds real clock Δ${b.ts-a.ts}`);
  }
  const receipt={scope:'two independent native VM realms, flat Physics, camera=null, simulated relay socket and no renderer; locally captured requests are encoded in a fixture-created experimental sibling, not supplied by public NetMatch',rows:p.rows.length,first:p.rows[0],lastSpawn:p.rows.find(r=>r.phaseBefore==='flight'&&r.phaseAfter==='landed'),birth:p.births[0],maxPoseGap,muzzle:{source:realMuzzle,private:privateMuzzle,gap:muzzleGap},snapshots};
  if(process.env.INKWAVE_TURF_TRACE)fs.writeFileSync(process.env.INKWAVE_TURF_TRACE,JSON.stringify({...receipt,frames:p.rows,wireRows},null,2)+'\n');
  console.log(JSON.stringify(receipt));
 }finally{if(peer)f.retireNativeCommandPeer(peer);if(token)f.disposeTrustedNativeReplay(token);p.dispose();q.dispose();}
});
