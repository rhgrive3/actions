// Independent review reproduction promoted to a permanent full-install regression.
// Native Actor.damage and next-phase splat remain installed; no HP stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
for(const mode of ['unshielded','far','friendly','remote-victim','future-life','invulnerable','blocked-los','owned-outside','owned-inside','replica-outside','replica-inside']) test('installed bomb victim authority: '+mode,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>1000e3},extraExports:"export {tickBigBubblers,bigBubblerDomes,clearBigBubblers,bigBubblerSnapshot,bigBubblerRemoteDomes,replayBigBubbler} from './patches/splatoon3/runtime/kit-big-bubbler.mjs';"});
 f.G.scene=new f.THREE.Scene();f.G.camera={position:new f.THREE.Vector3(0,3,10)};f.G.projectiles=new f.Projectiles(f.G.scene);
 const shieldOwner=f.make('roller');Object.assign(shieldOwner,{team:1,nid:3,owner:'me'});shieldOwner.weapon={...shieldOwner.weapon,special:'bubbler',specialCost:180};
 const attacker=f.make('shooter');Object.assign(attacker,{team:0,nid:37,owner:'p5',remote:true});attacker.weapon={...attacker.weapon,sub:'bomb'};
 const victim=f.make('shooter');Object.assign(victim,{team:mode==='friendly'?0:1,nid:2,owner:mode==='remote-victim'?'p3':'me',remote:mode==='remote-victim',invuln:mode==='invulnerable'?1:0});
 const sent=[],broadcast=[],proposals=[],damageEvents=[];
 const session={myId:'me',hostId:'me',isHost:true,_members:new Map([['me','Me'],['p5','P5'],['p3','P3']]),tr:{broadcast:(...a)=>broadcast.push(a),sendTo:(...a)=>sent.push(a)}};
 const nm=new f.NetMatch(session,{id:'independent-full-bomb',map:'map'});f.G.netm=nm;
 const match={actors:[shieldOwner,attacker,victim],state:'playing',playing:()=>true,canRespawn:()=>false};f.G.match=match;nm.bind(match);
 victim._netLifeStartedAt=mode==='future-life'?1002:999;
 // Preserve the actual Actor.damage and splat methods; observe native events.
 f.on('damage',e=>{if(e.victim===victim)damageEvents.push(e.amount);});
 f.on('kit:bubbler:damage-proposal',e=>proposals.push(e));
 let dome,center=new f.THREE.Vector3(0,0,0),radius=0;
 if(mode.startsWith('owned')||mode.startsWith('replica')){
  shieldOwner.special=180;shieldOwner._startSpecial();f.tickBigBubblers(1);dome=f.bigBubblerDomes()[0];assert.ok(dome,'real Actor deploy');center.copy(dome.pos);radius=dome.radius;
  if(mode.startsWith('replica')){
   const payload={e:'deploy',domeId:dome.id,serial:dome.serial,team:dome.team,pos:dome.pos.toArray(),hp:dome.hp,fieldHp:dome.fieldHp,t:dome.t};
   f.clearBigBubblers();shieldOwner.remote=true;shieldOwner.owner='p3';
   const receipt=f.replayBigBubbler('deploy',shieldOwner,JSON.parse(JSON.stringify(payload)));assert.equal(receipt.ok,true,JSON.stringify(receipt));
  }
 }
 victim.pos.copy(center);victim.pos.z+=mode.endsWith('outside')?radius-.25:mode==='far'?100:mode.includes('inside')?0:2;
 const origin=center.clone();origin.y+=.6;if(mode.endsWith('outside'))origin.z+=radius+1;
 f.G.actors=[victim];f.G.physics.los=()=>mode!=='blocked-los';
 try{
  const peer=nm._peer('p5');Object.assign(peer,{tr:1000,sim:60000,off:0});
  const birth=[1000,'b',37,'bomb',origin.x,origin.y,origin.z,0,0,0,60000,1];
  nm.onMessage('p5',JSON.parse(JSON.stringify({k:'t',ts:1000,r:2,u:60000,l:{37:0},e:[birth]})));
  Object.assign(peer,{tr:1000,lastTs:1000,sim:60000,off:0});nm._playEvents();
  const bomb=f.G.projectiles.bombs.find(b=>b.owner===attacker);assert.ok(bomb,mode+' authenticated NetMatch bomb birth');assert.equal(bomb.ghost,true);assert.equal(bomb._netBornLocal,1000);bomb.age=1;
  const objectSnapshot=()=>JSON.stringify([...f.bigBubblerDomes(),...f.bigBubblerRemoteDomes()].map(d=>({id:d.id,hp:d.hp,fieldHp:d.fieldHp,remote:d.remote})));const objectBefore=objectSnapshot();const originalDamage=victim.damage;
  f.G.projectiles._explodeBomb(bomb);
  assert.equal(victim.damage,originalDamage,'actual Actor receiver stays installed');
  assert.equal(objectSnapshot(),objectBefore,mode+' object snapshots unchanged');assert.equal(proposals.length,0,mode+' no replica object damage proposal');assert.equal(sent.length,0,mode+' no shooter-owned damage packet');assert.equal(f.G.projectiles.s3ExplosionDefense,undefined);
  const shouldDamage=['unshielded','owned-inside','replica-inside'].includes(mode);
  assert.equal(victim.hp<100,shouldDamage,mode+' native HP outcome');
  if(shouldDamage){assert.ok(damageEvents.length>0);assert.ok(victim.lastDamage===0);}
  const result={mode,hp:victim.hp,alive:victim.alive,deaths:victim.stats.deaths,damageEvents:[...damageEvents],proposalCount:proposals.length,sentCount:sent.length};
  if(mode.endsWith('outside')){
   f.clearBigBubblers();f.G.projectiles._explodeBomb(bomb);result.afterShieldRemoval=victim.hp;
   assert.equal(victim.hp<100,true,mode+' same blast damages only after shield removal');result.afterShieldRemovalDamageEvents=[...damageEvents];
  }
  if(victim.hp<=0){assert.equal(victim.alive,true,'native lethal is deferred until next actor phase');f.tick(victim);assert.equal(victim.alive,false,'next native Actor update commits lethal');assert.equal(victim.hp,0);assert.equal(victim.stats.deaths,1);result.nextActorPhase={hp:victim.hp,alive:victim.alive,deaths:victim.stats.deaths};}

 }finally{nm.dispose();f.clearBigBubblers();f.G.projectiles.clear();}
});
