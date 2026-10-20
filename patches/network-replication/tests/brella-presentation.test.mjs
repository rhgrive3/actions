import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

async function world(id='s3-shelter-focus'){
 let time=1000;const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmPerformance:{now:()=>time},
  extraExports:"export {animateWeapon} from './inkwave-public/src/game/character-weapons.js';"});
 const instances=[];const {G,THREE}=f;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.level.spawnPads=[new THREE.Vector3(),new THREE.Vector3()];G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const make=(local,weapon=id,nid=1,team=0)=>{const a=new f.Actor({team,name:'Brella view',weapon,isLocal:local,CharacterClass:f.Character,style:{hair:0}});a.nid=nid;a.owner=local?'owner':'owner';a.netLife=0;a.form='kid';a.grounded=true;a.ink=100;a.invuln=0;a.character.actor=a;a.character.onEvent=null;a._nearCamera=()=>false;a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);G.scene.add(a.character.root);instances.push(a);return a;};
 const owner=make(true),remote=make(false),packets=[],hits=[],attackTicks=[],members=new Set(['owner','viewer']);
 const sender=new f.NetMatch({myId:'owner',hostId:'owner',isHost:true,_members:members,tr:{broadcast:m=>packets.push(JSON.parse(JSON.stringify(m))),sendTo(){return true;}}},{id:'brella-view'});
 const receiver=new f.NetMatch({myId:'viewer',hostId:'owner',isHost:false,_members:members,tr:{broadcast:m=>{attackTicks.push(JSON.parse(JSON.stringify(m)));return true;},sendTo:(to,m)=>{hits.push({to,packet:JSON.parse(JSON.stringify(m))});return true;}}},{id:'brella-view'});
 sender.bind({actors:[owner],state:'playing',time:180});receiver.bind({actors:[remote],state:'playing',time:180});
 const advance=(frames,fire=true)=>{G.netm=sender;owner.intent.fire=fire;for(let i=0;i<frames;i++){G.time+=1/60;time+=1000/60;owner.weaponRunner.update(1/60,{fire,firePressed:i===0});}};
 const send=()=>{G.netm=sender;time+=50;G.time+=.05;sender._sendTick();return packets.at(-1);};
 const receive=packet=>{G.netm=receiver;receiver.onMessage('owner',packet);const peer=receiver._peer('owner');peer.tr=packet.ts;receiver._sample(remote,peer.tr,1/60);receiver.applyRemote(remote,1/60);};
 const animate=()=>{for(let i=0;i<45;i++)f.animateWeapon(remote.character.weapon,{dt:1/60,near:true,color:remote.color,runner:remote.weaponRunner});};
 return {f,owner,remote,sender,receiver,packets,hits,attackTicks,make,advance,send,receive,animate,close(){receiver.dispose();sender.dispose();G.projectiles.clear();for(const a of instances)a.character.dispose();}};
}

test('actual local canopy snapshot opens remote cloth without creating a gameplay canopy',async()=>{
 const x=await world();try{const {owner,remote}=x;x.advance(30);assert.ok(owner.weaponRunner.catalogState.canopy?.open);const packet=x.send();x.receive(packet);x.animate();
  assert.equal(remote.character.s3BrellaPresentation?.canopy?.open,true);
  assert.ok(remote.character.weapon.parts.canopy.scale.x>10,'production cloth opens');
  assert.equal(remote.weaponRunner.catalogState?.canopy??null,null,'view is separate from the authoritative canopy');
  const {f,sender,receiver}=x,opening=JSON.parse(JSON.stringify(packet)),view=remote.character.s3BrellaPresentation;
  const actorHp=remote.hp,actorInk=remote.ink;let unexpectedPaint=0;f.G.paint.splat=()=>{unexpectedPaint++;return 0;};
  packet.bc[1][4]=0;receiver.applyRemote(remote,1/60);assert.equal(view.canopy.open,true,'accepted snapshot owns an immutable sidecar copy');
  assert.equal(remote.hp,actorHp);assert.equal(remote.ink,actorInk);

  // A visible remote guard cannot consume the attacker's locally fired round.
  // The real owner-routed hit packet, including collision segment, must arrive
  // at the victim owner, whose actual gameplay shield spends its own HP.
  const shooter=x.make(true,'shooter',2,1),attackProxy=x.make(false,'shooter',2,1);
  shooter.owner=attackProxy.owner='viewer';
  // These participants join after the initial bind: initialize their actual network proxies.
  receiver._setupActor(shooter);sender._setupActor(attackProxy);
  receiver.byNid.set(2,shooter);sender.byNid.set(2,attackProxy);
  assert.ok(shooter.net?.buf&&attackProxy.net?.buf,'late-added actors receive native transport buffers');
  shooter.pos.copy(remote.pos).add(new f.THREE.Vector3(0,0,4));shooter.aimDir.set(0,0,-1);shooter.aimPoint.copy(remote.pos).y+=1.05;
  shooter.character.getMuzzle=out=>out.copy(shooter.pos).add(new f.THREE.Vector3(0,1.05,-.3));
  f.G.actors=[shooter,remote];f.G.netm=receiver;f.G.projectiles.list.length=0;
  const hp=owner.hp,shieldHp=owner.weaponRunner.catalogState.canopy.hp;
  f.G.projectiles.fireShooter(shooter,shooter.weapon,0);
  for(let i=0;i<8;i++)f.G.projectiles.update(1/60);
  const proposal=x.hits.find(h=>h.packet.k==='hit');assert.ok(proposal,'remote visual cloth never retires the attack-side projectile');
  assert.equal(proposal.to,'owner');assert.ok(proposal.packet.bg?.length===7);
  assert.equal(remote.weaponRunner.catalogState?.canopy??null,null);
  // The shooter already produced real projectile births during fireShooter.
  // Forward its authenticated 20Hz owner tick before the independently
  // addressed damage proposal, rather than accepting an unproved hit.
  f.G.netm=receiver;receiver._sendTick();
  const attackTick=x.attackTicks.at(-1);
  assert.ok(attackTick?.e?.some(e=>e[1]==='p'||e[1]==='ev'),
    'native owner projectile/fire evidence is present on the actor tick');
  f.G.actors=[owner,attackProxy];f.G.netm=sender;
  sender.onMessage('viewer',attackTick);
  sender.onMessage('viewer',proposal.packet);
  assert.equal(owner.hp,hp,'victim owner adjudicates the actual intercepted segment');
  assert.ok(owner.weaponRunner.catalogState.canopy.hp<shieldHp);
  f.G.actors=[owner,remote];f.G.projectiles.list.length=0;

  x.advance(40,false);const folded=x.send();x.receive(folded);x.animate();assert.equal(view.canopy,null);assert.ok(remote.character.weapon.parts.canopy.scale.x<1.01);
  receiver.onMessage('owner',opening);receiver.applyRemote(remote,1/60);assert.equal(view.canopy,null,'reordered old opening cannot restore a folded canopy');
  const beforeBad=remote.hp,bad=x.send();bad.bc[1][6]=Infinity;x.receive(bad);assert.equal(view.canopy,null);assert.equal(remote.hp,beforeBad,'malformed optional view does not invent damage');
  owner.weaponRunner.reset();x.advance(2);const preparing=x.send();x.receive(preparing);assert.equal(view.canopy?.preparing,true);assert.equal(view.canopy.open,false);
  x.advance(50);assert.equal(owner.weaponRunner.catalogState.canopy,null,'actual local purge has launched');
  for(let i=0;i<8;i++)f.G.projectiles.update(1/60);
  const purge=x.send();assert.equal(purge.bc[1][12],1);x.receive(purge);x.animate();
  assert.equal(view.canopy,null);assert.ok(view.naked>0);assert.equal(remote.character.weapon.parts.canopy.visible,false,'held cloth hides while naked');
  assert.equal(view.flights.size,1);const flight=view.flights.values().next().value,raw=purge.bc[1];
  assert.ok(flight.mesh?.userData.networkRemoteCanopy);assert.ok(flight.pos.distanceTo(new f.THREE.Vector3(raw[16],raw[17],raw[18]))<1e-9);
  const firstPosition=flight.pos.clone();receiver.onMessage('owner',purge);receiver.applyRemote(remote,1/60);assert.equal(view.flights.size,1);assert.ok(flight.pos.equals(firstPosition),'duplicate pose creates no extra canopy');
  for(let i=0;i<6;i++)f.G.projectiles.update(1/60);
  const moved=x.send();x.receive(moved);assert.ok(flight.pos.distanceTo(firstPosition)>0,'detached mesh follows owner world pose');
  assert.equal(unexpectedPaint,0,'sidecar/replay does not paint; no support floor exists in this scene');
  for(const corrupt of [r=>r[12]=5,r=>r[14]='shooter',r=>r[15]=-1,r=>r[16]=100001,r=>{r[19]=r[20]=r[21]=0;}]){
    const invalid=x.send();corrupt(invalid.bc[1]);x.receive(invalid);assert.equal(view.flights.size,0,'malformed optional purge pose cannot create a mesh');
    const valid=x.send();x.receive(valid);assert.equal(view.flights.size,1,'rejected view cannot poison later valid actor samples');
  }


  receiver._remoteSplat(remote,null,'shooter');assert.equal(view.canopy,null);assert.equal(view.flights.size,0,'death invalidates the previously sampled pose');
  owner.alive=false;const dead=x.send();x.receive(dead);assert.equal(view.canopy,null);assert.equal(view.flights.size,1,'an explicit newer owner snapshot still shows its world-owned surviving purge');
  receiver._remoteRespawn(remote);owner.netLife=1;owner.netTp=(owner.netTp||0)+1;owner.stats.deaths=1;owner.alive=true;owner.hp=100;owner.form='kid';owner.weaponRunner.reset();x.advance(30);
  const nextLife=x.send();x.receive(nextLife);assert.equal(remote.net.lastLife,1);assert.equal(view.canopy?.open,true,'new life can admit a fresh held canopy');
  const lateOld=JSON.parse(JSON.stringify(opening));lateOld.ts=nextLife.ts+.05;receiver.onMessage('owner',lateOld);receiver.applyRemote(remote,1/60);
  assert.equal(remote.net.lastLife,1);assert.equal(view.canopy?.open,true,'old-life packet cannot replace the new-life presentation');
  remote.owner='other-owner';receiver.applyRemote(remote,1/60);assert.equal(view.canopy,null);assert.equal(view.flights.size,0,'ownership change cannot inherit old owner cloth');

 }finally{x.close();}
});
