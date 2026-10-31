import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {exportNativeActorPacker} from './native-packer-export-fixture.mjs';

function expose(rel,code){
 const out=exportNativeActorPacker(rel,code);
 return rel==='src/net/netmatch.js'?out+"\nexport {kitBombContact} from '../../patches/splatoon3/runtime/kit-subs.mjs';\n":out;
}
// Real native constructors, source updates, packet writer and owner consumer.
// The scene is flat and the target's placement is a controlled fixture input;
// for area sources it follows the source until the first real proposal, then
// stays at that exact location throughout receiver replay.
export async function nativeSprinklerSource(t,{kind='main',id='shooter',frames=30,shredder=false,mainShots=1,
 mainShotSpacing=1,configure,step,afterStep,fullActor=false,transformSource=null}={}){
 assert.ok(Number.isSafeInteger(mainShots)&&mainShots>=1&&mainShots<=4096,'bounded native emitter stress count');
 assert.ok(Number.isSafeInteger(mainShotSpacing)&&mainShotSpacing>=1,'native emitter source frame spacing');
 const f=await fixture({productionComposition:true,transformSource:(rel,code)=>{const value=expose(rel,code);return transformSource?transformSource(rel,value):value;},randomSeed:7});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}update(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}}
 const make=(nid,owner,remote,team,weapon='shooter')=>{const a=new f.Actor({team,name:owner,weapon,CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,grounded:true,isLocal:!remote});a.pos.set(0,0,0);a.aimYaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,25);a._integrate=()=>{};a._horizontal=()=>{};a._resolve=()=>{};return a;};
 const owner=make(7,'me',false,0),attacker=make(17,'peer',true,1,kind==='main'?id:'shooter');
 attacker.s3.loadout[2].main=shredder?'objectShredder':'runSpeed';
 if(kind==='sub')attacker.weapon={...attacker.weapon,sub:id};
 if(kind==='special')attacker.weapon={...attacker.weapon,special:id,specialCost:190};
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']])),match=f.bind(nm,[owner,attacker]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[owner,attacker]});t.after(()=>nm.dispose());
 const floor=(a,b,h)=>{h.hit=a.y>=0&&b.y<=0;if(h.hit){h.point.copy(a).lerp(b,a.y/(a.y-b.y));h.normal.set(0,1,0);h.dist=a.distanceTo(h.point);h.face=0;}return h;};
 f.G.physics.segment=floor;f.G.physics.raycast=(a,d,r,h)=>floor(a,a.clone().addScaledVector(d,r),h);f.G.physics.los=()=>true;
 const initial=f.nativePackActor(attacker);initial[13]=190;initial[22]=0;
 nm.onMessage('peer',{k:'t',r:2,ts:1000,u:0,a:[initial],l:{17:0},e:[]});
 owner.weapon={...owner.weapon,sub:'sprinkler'};owner.weaponRunner.reset();owner.ink=100;
 for(let i=0;i<4;i++)owner.weaponRunner.update(1/60,{sub:true,subReleased:false});
 for(let i=0;i<30&&!f.projectiles.bombs.some(b=>b.owner===owner);i++)owner.weaponRunner.update(1/60,{sub:false,subReleased:i===0});
 const target=f.projectiles.bombs.find(b=>b.owner===owner);assert.ok(target,'real paid native Sprinkler throw');assert.ok(owner.ink<100);assert.ok(target.s3DeviceBirth);
 const targetBirth=structuredClone(nm.out.find(e=>e[1]==='b'&&e[2]===owner.nid));assert.ok(targetBirth);
 f.kitBombContact(f.SUB,target,{hit:true,point:new f.THREE.Vector3(0,1.05,3),normal:new f.THREE.Vector3(0,1,0)});assert.equal(target.s3Mode,'sprinkling');assert.equal(target.s3DeviceHP,120);
 owner.pos.x=100;
 const packets=[],sourceContacts=[];nm.s.tr.broadcast=p=>{if(p.k==='t')packets.push(JSON.parse(JSON.stringify(p)));return true;};
 let at=null;const off=f.on('all:sub',e=>{if(e.actor===attacker&&e.phase==='nativeObjectHit'&&e.targetSeq===target.s3DeviceBirth.seq){at||=target.pos.clone();sourceContacts.push(e);}});t.after(off);
 const x={f,nm,owner,attacker,target,targetBirth,packets,sourceContacts};configure?.(x);
 attacker.remote=false;owner.remote=true;target.ghost=true;nm.myId='peer';nm.out.length=0;attacker.weaponRunner.reset();attacker.ink=100;attacker.special=190;
 if(kind==='special'){f.clock.set(1000.001);attacker._startSpecial();assert.ok(attacker.specialActive,id+': native paid special use');}
 for(let i=0;i<frames;i++){
  f.clock.set(1000+(i+1)/60);f.G.time=(i+1)/60;
  if(kind==='main'){
   if(attacker.weapon.catalogRecord)attacker.weaponRunner.update(1/60,{fire:i<mainShots,firePressed:i===0,fireReleased:i===mainShots,sub:false});
   else if(i%mainShotSpacing===0&&i/mainShotSpacing<mainShots){const method={shooter:'fireShooter',blaster:'fireBlaster'}[attacker.weapon.kind];assert.ok(method);f.projectiles[method](attacker,attacker.weapon,0,0);}
  }
  if(kind==='sub')attacker.weaponRunner.update(1/60,{sub:i<4,subReleased:i===4,fire:false});
  if(kind==='special')attacker.intent.fire=true;
  step?.(x,i);
  if(kind==='special'){if(fullActor)attacker.update(1/60);else if(attacker.specialActive)attacker._updateSpecial(1/60);}
  if(!at&&kind==='sub'){
   const source=f.projectiles._s3SubObjects?.find(o=>o.owner===attacker)||f.projectiles.bombs.find(o=>o.owner===attacker);
   if(source)target.pos.copy(source.pos).add(new f.THREE.Vector3(2,-.45,0));
  }
  if(!at&&kind==='special'){
   const source=f.projectiles._s3AllSpecialObjects?.find(o=>o.owner===attacker&&o.kind==='decoy');
   if(source)target.pos.copy(source.target);
  }
  f.projectiles.update(1/60);
  afterStep?.(x,i);
  if(i%3===2)nm._sendTick();
 }
 if(nm.out.length)nm._sendTick();
 const events=packets.flatMap(p=>p.e||[]),claims=events.filter(e=>e[1]==='ac'&&e[5]?.phase==='nativeObjectHit'&&e[5]?.targetSeq===target.s3DeviceBirth.seq);
 assert.ok(claims.length,kind+': real native source must emit a Sprinkler contact');assert.ok(at);target.pos.copy(at);
 attacker.remote=true;owner.remote=false;target.ghost=false;nm.myId='me';nm.out.length=0;assert.equal(target.s3DeviceHP,120,'source peer never owns target HP');
 let seq=1;
 function deliver(packet,mutate=null,{advanceBombs=kind==='sub',freshSequences=true,advanceProjectiles=false}={}){
  const p=JSON.parse(JSON.stringify(packet));if(mutate)p.e=mutate(p.e||[]);if(freshSequences)for(const e of p.e||[])e[e.length-1]=seq++;
  f.clock.set(p.ts);f.G.time=p.u/60;nm.onMessage('peer',p);const rows=[];
  for(const e of nm.peers.get('peer').events.splice(0)){const before=target.s3DeviceHP;nm._play('peer',e);rows.push({event:e,before,after:target.s3DeviceHP});}
  if(advanceBombs){const peer=nm.peers.get('peer');peer.sim=Math.max(peer.sim||0,p.u+3);for(let i=0;i<3;i++)f.projectiles._updateBombs(1/60);}
  if(advanceProjectiles){const peer=nm.peers.get('peer');peer.sim=Math.max(peer.sim||0,p.u+3);for(let i=0;i<3;i++)f.projectiles.update(1/60);}
  return rows;
 }
 return {...x,events,claims,at,deliver};
}
