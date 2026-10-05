#!/usr/bin/env node
// Native before/after replay. Both flights execute the actual Projectiles._step;
// packets pass through actual _sendTick/onMessage/_playEvents and JSON encoding.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import {fixture} from '../patches/network-replication/tests/robustness-fixture.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const i=process.argv.indexOf('--evidence-dir'),evidence=path.resolve(i>=0?process.argv[i+1]:path.join(ROOT,'.ci-scratch/network-comparison'));
const physical=p=>fs.existsSync(p)?fs.realpathSync(p):path.join(physical(path.dirname(p)),path.basename(p));
assert(!['/tmp','/var/tmp','/dev/shm'].some(p=>physical(evidence)===p||physical(evidence).startsWith(p+'/')),'Persistent evidence required');fs.mkdirSync(evidence,{recursive:true});
let sourceSha=null;
if(process.argv.includes('--exact-source')){
 sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
 assert(!process.env.INKWAVE_UPSTREAM_SOURCE || path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE)===path.join(ROOT,'inkwave-public'),'Exact replay uses this committed checkout');
 execFileSync('git',['diff','--quiet','HEAD','--','inkwave-public','patches','scripts/check-inkwave-network-comparison.mjs'],{cwd:ROOT});
}
const DT=1/60,distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const scenarios=['horizontal','vertical','shooter','dualies','blaster','splatling','slosher','bomb','storm','charger','charger_half','charger_full','charger_oblique_partial','charger_oblique_full'];
export async function replay(network,kind){
 const owner=await fixture({network}),receiver=await fixture({network});
 const draws=[0,0];
 for(const [j,f]of[[0,owner],[1,receiver]]){
  Object.assign(f.SUB.bomb,f.profile.bomb);for(const [id,data]of Object.entries(f.profile.specials||{}))Object.assign(f.SPECIALS[id],data);
  let state=0x1badc0de;const global=f.Projectiles.constructor('return globalThis')();
  global.Math.random=()=>{draws[j]++;state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
 }

 for(const f of [owner,receiver]) f.installSubSpecialFidelity(f,f.profile);
 assert.equal(owner.SPECIALS.storm.dps,24);assert.equal(owner.SPECIALS.storm.duration,8);
 const os=owner.makeSession('me','me'),rs=receiver.makeSession('p2','me');
 const onm=owner.makeNetMatch(os),rnm=receiver.makeNetMatch(rs);
 const oa=owner.makeActor({nid:0,owner:'me',remote:false,vertical:kind==='vertical'}),ra=receiver.makeActor({nid:0,owner:'me',remote:true});
 const weapon=['horizontal','vertical'].includes(kind)?'roller':kind==='bomb'?'shooter':kind==='storm'?'charger':kind.startsWith('charger')?'charger':kind;
 oa.weapon=owner.WEAPONS[weapon];ra.weapon=receiver.WEAPONS[weapon];
 for(const [f,a]of[[owner,oa],[receiver,ra]]){a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));a.weaponRunner=new f.WeaponRunner(a);a.weaponRunner.s3FlickVertical=kind==='vertical';}
 if(kind.startsWith('charger_oblique')){oa.aimPoint.set(17.53,11.24,49.67);ra.aimPoint.copy(oa.aimPoint);}
 owner.bind(onm,[oa]);receiver.bind(rnm,[ra]);
 onm.unsubs.push(owner.on('weapon:fire',e=>onm._onLocalEvent('weapon:fire',e)));
 const paint=[[],[]],traces=[[],[]],births=[[],[]],ids=[new WeakMap(),new WeakMap()];let next=0,projectileAllocations=[0,0];
 for(const [j,f,nm]of[[0,owner,onm],[1,receiver,rnm]]){
  f.G.paint={sample:()=>1,splat(c,r,t,o={}){if(nm.mute)return 0;if(!nm.applying)nm.recSplat(c,r,t,o);paint[j].push({pos:c.toArray(),radius:r,team:t,seed:o.seed});return Math.PI*r*r;}};
  const fresh=f.projectiles._new.bind(f.projectiles);f.projectiles._new=()=>{if(!f.projectiles.pool.length)projectileAllocations[j]++;return fresh();};
  const step=f.projectiles._step.bind(f.projectiles);f.projectiles._step=(p,dt)=>{const dead=step(p,dt);traces[j].push({id:ids[j].get(p),age:p.age,pos:p.pos.toArray(),velocity:p.vel.toArray(),dead});return dead;};
 }
 const push=owner.projectiles._push.bind(owner.projectiles);owner.projectiles._push=p=>{push(p);const id=next++;ids[0].set(p,id);births[0].push({id,spawn:p.start.toArray(),velocity:p.vel.toArray(),life:p.life,straight:p.straight,delay:p.delay,grav:p.grav,drag:p.drag,vertical:p.s3Vertical});};
 let incoming=0;const ghost=receiver.projectiles.ghostProjectile.bind(receiver.projectiles);receiver.projectiles.ghostProjectile=(a,e)=>{const p=ghost(a,e)||receiver.projectiles.list.at(-1),id=incoming++;ids[1].set(p,id);births[1].push({id,spawn:p.start.toArray(),velocity:p.vel.toArray(),life:p.life,straight:p.straight,delay:p.delay,grav:p.grav,drag:p.drag,vertical:p.s3Vertical});return p;};
 owner.G.time=1000;receiver.G.time=1000;
 const P=owner.projectiles,w=oa.weapon;
 switch(kind){case'horizontal':case'vertical':P.fireFlick(oa,w);break;case'shooter':P.fireShooter(oa,w,0);break;case'dualies':P.fireDualies(oa,w,0,1);break;case'blaster':P.fireBlaster(oa,w,0);break;case'splatling':P.fireSplatling(oa,w,0);break;case'slosher':P.fireSlosh(oa,w);break;case'bomb':P.throwBomb(oa);break;case'storm':oa.special=oa.specialCost();oa._startSpecial();break;case'charger':case'charger_half':case'charger_full':case'charger_oblique_partial':case'charger_oblique_full':P.fireCharger(oa,w,kind.endsWith('_full')?1:kind.endsWith('_partial')?.3764321:kind==='charger_half'?.5:0);break;}
 const beam=f=>{const b=f.projectiles.beams[0];return{age:b.t,len:b.mesh.scale.z,life:b.life,charge:b.mesh.material.uniforms.uCharge.value,width:b.th,spawn:b.mesh.position.toArray(),end:new f.THREE.Vector3(0,0,b.mesh.scale.z).applyQuaternion(b.mesh.quaternion).add(b.mesh.position).toArray()};};
 const packets=[];os.tr.broadcast=m=>packets.push(JSON.parse(JSON.stringify(m)));
 let bytes=0,packetCount=0,eventCount=0,maxLocal=0,maxRemote=0,sourceBomb=[],remoteBomb=[],sourceCloud=[],remoteCloud=[],sourceBeam=[],remoteBeam=[];
 for(let frame=0;frame<750;frame++){
  const t=1000+frame*DT;owner.clock.set(t);receiver.clock.set(t);owner.G.time=t;receiver.G.time=t;
  P.update(DT);maxLocal=Math.max(maxLocal,P.list.length);
  if(frame%3===0){onm._sendTick();for(const packet of packets.splice(0)){bytes+=Buffer.byteLength('b|'+JSON.stringify(packet));packetCount++;eventCount+=packet.e?.length||0;rnm.onMessage('me',packet);}}
  const peer=rnm.peers.get('me');if(peer){peer.tr=t;peer.sim=peer.physicsPoints?.at(-1);rnm._playEvents();}receiver.projectiles.update(DT);maxRemote=Math.max(maxRemote,receiver.projectiles.list.length);
  if(P.bombs[0])sourceBomb.push({age:P.bombs[0].age,pos:P.bombs[0].pos.toArray()});if(receiver.projectiles.bombs[0])remoteBomb.push({age:receiver.projectiles.bombs[0].age,pos:receiver.projectiles.bombs[0].pos.toArray()});
  if(P.beams[0])sourceBeam.push(beam(owner));if(receiver.projectiles.beams[0])remoteBeam.push(beam(receiver));
  if(P.clouds[0])sourceCloud.push({age:P.clouds[0].t,pos:P.clouds[0].group.position.toArray()});if(receiver.projectiles.clouds[0])remoteCloud.push({age:receiver.projectiles.clouds[0].t,pos:receiver.projectiles.clouds[0].group.position.toArray()});
 }
 const result={kind,network,beamFrames:[sourceBeam.length,remoteBeam.length],beamEndpointError:0,beamSpawnError:0,beamChargeError:0,birthCount:births[0].length,remoteBirthCount:births[1].length,spawnError:0,velocityError:0,maxPositionError:0,comparedSteps:0,localDistance:0,remoteDistance:0,localLifetime:0,remoteLifetime:0,paintCount:paint[0].length,remotePaintCount:paint[1].length,paintLandingError:0,projectileAllocations,eventCount,randomDraws:draws,packetBytes:bytes,packetCount,packetsPerSecond:packetCount/12.5,maxLocal,maxRemote,remaining:{local:P.list.length,remote:receiver.projectiles.list.length,bombs:receiver.projectiles.bombs.length,clouds:receiver.projectiles.clouds.length,beams:receiver.projectiles.beams.length}};
 for(let k=0;k<births[0].length;k++){
  const a=births[0][k],b=births[1][k];assert(b,'missing birth');result.spawnError=Math.max(result.spawnError,distance(a.spawn,b.spawn));result.velocityError=Math.max(result.velocityError,distance(a.velocity,b.velocity));
  if(network)for(const f of ['life','straight','delay','grav','drag','vertical'])assert.equal(b[f],a[f],kind+': '+f);
  const aa=traces[0].filter(s=>s.id===k),bb=traces[1].filter(s=>s.id===k);assert(aa.length&&bb.length);if(network)assert.equal(bb.length,aa.length,kind+': lifetime/physics step count');
  result.localLifetime=Math.max(result.localLifetime,aa.at(-1).age);result.remoteLifetime=Math.max(result.remoteLifetime,bb.at(-1).age);
  result.localDistance=Math.max(result.localDistance,Math.hypot(aa.at(-1).pos[0]-a.spawn[0],aa.at(-1).pos[2]-a.spawn[2]));result.remoteDistance=Math.max(result.remoteDistance,Math.hypot(bb.at(-1).pos[0]-b.spawn[0],bb.at(-1).pos[2]-b.spawn[2]));
  for(const s of bb){const l=aa.find(l=>Math.abs(l.age-s.age)<1e-8);if(network)assert(l,kind+': missing authoritative projectile age '+s.age);if(!l)continue;result.comparedSteps++;result.maxPositionError=Math.max(result.maxPositionError,distance(l.pos,s.pos));}
 }
 if(kind.startsWith('charger')){assert(sourceBeam.length&&remoteBeam.length,'charger beam was not exercised');for(const s of remoteBeam){const l=sourceBeam.find(l=>Math.abs(l.age-s.age)<.00051);if(network)assert(l,'missing native beam timestamp');if(!l)continue;result.beamEndpointError=Math.max(result.beamEndpointError,distance(s.end,l.end));result.beamSpawnError=Math.max(result.beamSpawnError,distance(s.spawn,l.spawn));result.beamChargeError=Math.max(result.beamChargeError,Math.abs(s.charge-l.charge));if(network){assert.equal(s.len,l.len);assert.equal(s.life,l.life);assert.equal(s.charge,l.charge);assert.equal(s.width,l.width);}result.comparedSteps++;}}
 for(const s of remoteBomb){const l=sourceBomb.find(l=>Math.abs(l.age-s.age)<1e-8);if(network)assert(l,kind+': missing authoritative bomb/cloud age '+s.age);if(l){result.comparedSteps++;result.maxPositionError=Math.max(result.maxPositionError,distance(l.pos,s.pos));}}
 for(const s of remoteCloud){const l=sourceCloud.find(l=>Math.abs(l.age-s.age)<1e-8);if(network)assert(l,kind+': missing authoritative bomb/cloud age '+s.age);if(l){result.comparedSteps++;result.maxPositionError=Math.max(result.maxPositionError,distance(l.pos,s.pos));}}
 for(let k=0;k<paint[0].length;k++){const a=paint[0][k],b=paint[1][k];assert(b,'missing authoritative paint');result.paintLandingError=Math.max(result.paintLandingError,distance(a.pos,b.pos));if(network)assert.equal(b.seed,a.seed,'paint seed');}
 if(network&&kind==='bomb'){assert.equal(result.paintCount,16,'authoritative Bomb paint must be 1+15');assert.equal(result.remotePaintCount,16,'remote Bomb must replay exactly owner paint once');}\n if(network&&kind==='storm'){assert(sourceCloud.length>0,'authoritative Storm cloud was not exercised');assert(remoteCloud.length>0,'admitted remote Storm cloud was not reconstructed');}
 if(network){assert(result.beamEndpointError<.001,kind+': native beam endpoint divergence '+result.beamEndpointError);assert(result.maxPositionError<.08,kind+': native trajectory divergence '+result.maxPositionError);assert.equal(births[0].length,births[1].length);assert.equal(paint[0].length,paint[1].length);assert(result.paintLandingError<.01);for(const count of Object.values(result.remaining))assert.equal(count,0,'entity residue');}
 onm.dispose();rnm.dispose();return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const results=[];try{for(const network of[false,true])for(const kind of scenarios){results.push(await replay(network,kind));}const report={status:'passed',sourceSha,harnessHash:crypto.createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),integrator:'actual native Projectiles._step and update; no shadow physics',results};const f=path.join(evidence,'comparison-metrics.json');fs.writeFileSync(f+'.pending',JSON.stringify(report,null,2)+'\n');fs.renameSync(f+'.pending',f);console.log(JSON.stringify({status:report.status,cases:results.length,maxFixedPositionError:Math.max(...results.filter(r=>r.network).map(r=>r.maxPositionError)),evidence}));}catch(error){fs.writeFileSync(path.join(evidence,'comparison-failure.json'),JSON.stringify({status:'failed',results,error:error.stack},null,2));throw error;}
}
