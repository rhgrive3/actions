import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {exportNativeActorPacker} from './native-packer-export-fixture.mjs';

const DT=1/60,HP=10000,json=v=>JSON.parse(JSON.stringify(v));
const isHit=e=>e[1]==='ac'&&e[5]?.phase==='objectHit';

// A normal eight-actor roster: one local target owner, the remote host's
// source actor and six of its native Dualies bots. No proof records are
// fabricated; all main births come from Runner -> recProj -> _sendTick.
async function setup(t,kind,{spam=false,repeat=false}={}){
 const f=await fixture({productionComposition:true,transformSource:(rel,code)=>{
  code=exportNativeActorPacker(rel,code);
  if(process.env.INKWAVE_RETENTION_OLD==='1'&&rel.endsWith('patches/network-replication/combat-provenance.mjs')){
   const from='s.proofs.set(from,boundedProofs(nm,store,t))';assert.equal(code.split(from).length-1,2);
   code=code.replaceAll(from,'s.proofs.set(from,store.slice(-160))');
  }
  if(process.env.INKWAVE_RETENTION_OLD_USE==='1'&&rel.endsWith('patches/network-replication/special-device-contact-proof.mjs')){
   const guard=' if(canonicalUse&&use?.seq!==event?._netSeq)use=null;';assert.equal(code.split(guard).length-1,1);code=code.replace(guard,'');
   const start=code.indexOf('function useFor(nm,proof,record,actor){'),end=code.indexOf('\nexport function nativeSpecialDeviceSource',start);assert.ok(start>=0&&end>start);
   code=code.slice(0,start)+`function useFor(nm,proof,record,actor){
    if(record.use)return record.use;
    const use=nativeSpecialUseReceipt(nm,actor,proof.ts,proof.cause,record.life);
    if(use){record.use=use;record.source={weapon:use.sourceWeapon,s3:{abilityPoints:{specialPower:use.specialPowerAP}},team:record.source.team};}
    return use;
   }`+code.slice(end);
  }
  return code;
 }});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}}
 const make=(nid,owner,remote,team,weapon='shooter')=>{const a=new f.Actor({team,name:owner,weapon,CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,isLocal:!remote,grounded:true});a.aimYaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,30);a._integrate=()=>{};a._horizontal=()=>{};a._resolve=()=>{};return a;};
 const attacker=make(17,'peer',true,1),owner=make(7,'me',false,0);
 attacker.pos.set(0,0,0);attacker.weapon={...attacker.weapon,sub:'inkMine',special:'splattercolorScreen',specialCost:190};attacker.special=190;
 const gunners=Array.from({length:6},(_,i)=>{const a=make(20+i,'peer',true,i<3?0:1,'dualies');a.isBot=true;a.pos.set(100+i*12,0,0);a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0,1.05,30));return a;});
 const actors=[owner,attacker,...gunners],nm=f.makeNetMatch(f.makeSession('me','peer',[['me','Me'],['peer','Peer']]));
 const match=f.bind(nm,actors);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors});t.after(()=>nm.dispose());
 const floor=(a,b,h)=>{h.hit=a.y>=0&&b.y<=0;if(h.hit){h.point.copy(a).lerp(b,a.y/(a.y-b.y));h.normal.set(0,1,0);h.dist=a.distanceTo(h.point);h.face=0;}return h;};
 f.G.physics.segment=floor;f.G.physics.raycast=(a,d,r,h)=>floor(a,a.clone().addScaledVector(d,r),h);
 const initial=f.nativePackActor(attacker);initial[13]=190;initial[22]=0;
 nm.onMessage('peer',{k:'t',r:2,ts:1000,u:0,a:[initial],l:{17:0},e:[]});
 owner.pos.set(kind==='mine'?2:0,0,kind==='mine'?0:12);owner.weapon={...owner.weapon,sub:'beakon'};
 const target=f.projectiles.throwBomb(owner);assert.ok(target);Object.assign(target,{hp:HP,maxHp:HP,phase:'deployed',activeAt:Infinity,expireAt:Infinity});
 owner.pos.set(50,0,50);owner.invuln=Infinity;
 const packets=[];nm.s.tr.broadcast=p=>{if(p.k==='t')packets.push(json(p));return true;};
 attacker.remote=false;for(const a of gunners)a.remote=false;owner.remote=true;nm.myId='peer';nm.out.length=0;
 f.clock.set(1000.001);
 if(kind==='screen'){
  attacker.aimPitch=-.6;attacker.aimDir.set(0,Math.sin(-.6),Math.cos(-.6));attacker.aimPoint.set(0,-10,20);attacker._startSpecial();assert.ok(attacker.specialActive);
 }
 const unpaidUse=spam?json(nm.out.find(e=>e[1]==='ev'&&e[2]==='special:use')[3]):null;
 const frames=kind==='mine'?270:repeat?1140:360;
 for(let i=0;i<frames;i++){
  f.clock.set(1000+(i+1)*DT);f.G.time=(i+1)*DT;
  const firingFrame=i-(repeat?780:0);
  for(const a of gunners)a.weaponRunner.update(DT,{fire:firingFrame>=0&&firingFrame<210,firePressed:firingFrame===0,fireReleased:firingFrame===210,sub:false,subReleased:false});
  if(kind==='screen'){
   if(repeat&&i===780){assert.ok(!attacker.specialActive,'the first native throw animation finished');assert.equal(f.projectiles._s3AllSpecialObjects.filter(o=>o.owner===attacker).length,0,'the first native Screen reached its real source end');attacker.special=190;attacker._startSpecial();assert.ok(attacker.specialActive,'a newly funded native activation starts after source expiry');}
   attacker.intent.sub=i===0||repeat&&i===780;if(attacker.specialActive)attacker._updateSpecial(DT);
  }
  else{attacker.weaponRunner.update(DT,{fire:false,sub:i<3,subReleased:i===3});if(i===240)owner.pos.set(2,0,0);}
  if(unpaidUse&&i>=60&&i<180&&i%6===0)nm._rec(['ev','special:use',json(unpaidUse)]);
  f.projectiles.update(DT);if(i%3===2)nm._sendTick();
 }
 if(nm.out.length)nm._sendTick();
 const source=packets.flatMap(p=>p.e||[]),birth=source.find(e=>e[1]==='ac'&&(kind==='mine'?e[5]?.phase==='spawn'&&e[5]?.subId==='inkMine':e[5]?.action==='deploy'&&e[5]?.id==='splattercolorScreen'));
 const claims=source.filter(e=>isHit(e)&&e[5]?.targetSeq===target.seq),main=source.filter(e=>e[1]==='p'&&gunners.some(a=>a.nid===e[2]));
 assert.ok(birth,'native persistent device source was born');assert.ok(claims.length,'native persistent device emitted its objectHit');assert.ok(main.length>160,`native host/bot births exceed the old tail: ${main.length}`);
 for(const a of gunners)assert.ok(a.ink<100,'native main firing paid its source ink cost');
 // The fixture deliberately stubs PaintSystem. Exercise the native paint
 // serializer/owner tick directly for its independent proof-trimming branch.
 f.clock.set(1000+(frames+3)*DT);f.G.time=(frames+3)*DT;nm.recSplat(new f.THREE.Vector3(),1,attacker.team,{seed:1,normal:new f.THREE.Vector3(0,1,0),claimOwner:attacker});nm._sendTick();const paintPacket=packets.pop();
 f.clock.set(1000+(frames+3)*DT+(kind==='mine'?2:41));f.G.time=(frames+3)*DT+(kind==='mine'?2:41);nm._sendTick();const expiredPacket=packets.pop();
 attacker.remote=true;for(const a of gunners)a.remote=true;owner.remote=false;nm.myId='me';nm.out.length=0;
 owner.pos.set(50,0,50);target.hp=HP;target.dead=false;target.ghost=false;
 f.projectiles.list.length=0;f.projectiles.bombs.length=0;f.projectiles._s3SubObjects=[target];f.projectiles._s3AllSpecialObjects=[];
 const before=[],outcomes=[];let original=null,max=0,mainMax=0;
 function deliver(packet){
  f.clock.set(packet.ts);f.G.time=packet.ts-1000;
  if(kind==='mine'&&f.G.time>=241*DT)owner.pos.set(2,0,0);
  nm.onMessage('peer',json(packet));
  const peer=nm.peers.get('peer');peer.sim=packet.u;peer.tr=packet.ts;
  for(const e of peer.events.splice(0)){const hp=target.hp;nm._play('peer',e);outcomes.push({event:e,damage:hp-target.hp});}
  if(kind==='mine')for(let i=0;i<3;i++)f.projectiles.update(DT);
  const proofs=nm._combatProvenance?.proofs.get('peer')||[];
  original ||=proofs.find(p=>p.actor===attacker.nid&&p.kind===(kind==='mine'?'sub':'special'));
  max=Math.max(max,proofs.length);mainMax=Math.max(mainMax,proofs.filter(p=>p.kind==='main').length);
  before.push({time:packet.ts,nativeMain:proofs.filter(p=>p.kind==='main').length,retained:proofs.includes(original),hp:target.hp});
 }
 return{f,nm,attacker,owner,target,birth,claims,main,packets,paintPacket,expiredPacket,deliver,before,outcomes,
  get original(){return original;},get max(){return max;},get mainMax(){return mainMax;}};
}

for(const kind of ['mine','screen'])test(`${kind}: actual native device contacts survive more than 160 host-owned Main births`,async t=>{
 const x=await setup(t,kind);
 for(const packet of x.packets)x.deliver(packet);
 t.diagnostic(JSON.stringify({nativeMainBirths:x.main.length,nativeDeviceClaims:x.claims.length,mainTail:x.mainMax,totalProofs:x.max,deviceDamage:HP-x.target.hp}));
 assert.ok(x.mainMax===160,'receiver admitted enough native main births to fill the old tail');
 const sourceDamage=x.claims.reduce((n,e)=>n+e[5].damage,0);
 assert.ok(x.target.hp<HP,'native persistent source still reaches the receiver-owned device after Main pressure');
 if(kind==='screen')assert.equal(x.outcomes.filter(o=>o.damage>0&&isHit(o.event)).length,x.claims.length,'every native Screen contact remains payable');
 else assert.ok(HP-x.target.hp>=sourceDamage,'the native armed Mine damages its real target');
 assert.ok(x.before.some(row=>row.nativeMain===160&&row.retained),'the original private persistent proof coexists with the bounded ordinary tail');
 assert.ok(x.max<=161,'one canonical persistent source adds only one slot to the 160 ordinary proofs');
 assert.ok(x.paintPacket.e.length&&x.paintPacket.e.every(e=>e[1]==='s'),'actual sender produced the dedicated paint-only packet');
 x.deliver(x.paintPacket);assert.ok(x.nm._combatProvenance.proofs.get('peer')?.includes(x.original),'paint-only traffic preserves the same private source');
 x.deliver(x.expiredPacket);assert.ok(!x.nm._combatProvenance.proofs.get('peer')?.includes(x.original),'dead native Mine/contact grace or expired paid Screen is pruned');
});

test('screen: raw use spam cannot replace or multiply one canonical private paid-use slot',async t=>{
 const x=await setup(t,'screen',{spam:true});
 assert.equal(x.packets.flatMap(p=>p.e||[]).filter(e=>e[1]==='ev'&&e[2]==='special:use').length,21,'one paid use plus twenty intentionally unpaid duplicates');
 for(const packet of x.packets)x.deliver(packet);
 t.diagnostic(JSON.stringify({nativeMainBirths:x.main.length,unpaidUses:20,totalProofs:x.max,deviceDamage:HP-x.target.hp}));
 assert.ok(x.max<=161,'unpaid duplicates stay inside the ordinary 160 tail');
 assert.ok(x.nm._combatProvenance.proofs.get('peer')?.includes(x.original),'raw later use events cannot replace the original paid source');
 assert.ok(x.target.hp<HP,'the original native Screen still reaches its real device');
});

test('screen: a second native paid activation keeps its own receipt after the previous source expires',async t=>{
 const x=await setup(t,'screen',{repeat:true});
 assert.equal(x.packets.flatMap(p=>p.e||[]).filter(e=>e[1]==='ev'&&e[2]==='special:use').length,2,'both activation rows come from the native paid state machine');
 assert.equal(x.claims.length,2,'each independent native Screen produces its real device contact');
 for(const packet of x.packets)x.deliver(packet);
 t.diagnostic(JSON.stringify({nativeMainBirths:x.main.length,nativeDeviceClaims:x.claims.length,totalProofs:x.max,deviceDamage:HP-x.target.hp}));
 assert.equal(x.outcomes.filter(o=>o.damage>0&&isHit(o.event)).length,2,'the second paid use cannot remain aliased to the first cached receipt');
 assert.ok(x.max<=162,'two canonical paid sources plus the ordinary tail remain bounded');
});
