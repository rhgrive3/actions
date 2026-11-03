import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {nativeMainBirth} from './native-main-birth-fixture.mjs';
import {objectDamageRow} from '../../splatoon3/runtime/sub-resistance.mjs';
import {OBJECT_SHREDDER_FLAG,OBJECT_SHREDDER_RATES} from '../../splatoon3/runtime/object-gear.mjs';

// Object Shredder on receiver-owned devices after #1975: the attacker's real
// native round must reach the device on the receiver, the proposal carries raw
// damage only, and the receiver applies the fixed target-column rate exactly
// once from the attacker's accepted snapshot gear, never from the wire flag.
async function setup(t,id,shredder){
 const f=await fixture({productionComposition:true});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}}
 const make=(nid,owner,remote,team)=>{const a=new f.Actor({team,name:owner,weapon:'shooter',CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,grounded:true});a.pos.set(0,0,0);a.aimPoint.set(0,1.05,3);a._resolve=()=>{};return a;};
 const attacker=make(17,'peer',true,1),owner=make(7,'me',false,0);
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
 const match=f.bind(nm,[owner,attacker]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[owner,attacker]});t.after(()=>nm.dispose());
 const birth=nativeMainBirth(f,nm,attacker,attacker.weapon,1000),probe=f.projectiles.makeCrabletCombatProbe(attacker,birth);assert.ok(probe);
 f.projectiles.stepCrabletCombatProbe(probe);f.projectiles.stepCrabletCombatProbe(probe);
 const at=probe.pos.clone(),cause=objectDamageRow(probe);owner.pos.x=10;
 let target,kind;
 if(['beakon','splashWall','torpedo'].includes(id)){
  kind='sub';owner.weapon={...owner.weapon,sub:id};target=f.projectiles.throwBomb(owner);assert.equal(target?.subId,id);
 }else{
  kind='special';owner.weapon={...owner.weapon,special:id,specialCost:100};owner.special=100;owner._startSpecial();
  owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;owner._updateSpecial(1/60);
  for(let i=0;i<240&&!f.projectiles._s3AllSpecialObjects?.some(o=>o.id===id&&o.kind===(id==='waveBreaker'?'wave':'decoy'));i++){
   // Super Chump aims then releases its decoys; both use ordinary native frames.
   owner.intent.fire=id==='superChump'&&i===20;f.G.time+=1/60;owner._updateSpecial(1/60);f.projectiles.update(1/60);}
  owner.intent.fire=false;
  target=f.projectiles._s3AllSpecialObjects.find(o=>o.id===id&&o.kind===(id==='waveBreaker'?'wave':'decoy'));assert.ok(target,'native special device');
 }
 target.pos.copy(at);target.hp=1000;target.ghost=false;target.dead=false;
 if(id==='torpedo'){target.phase='chase';target.chasedTarget=true;}
 else if(kind==='sub'){target.phase='deployed';target.activeAt=Infinity;target.expireAt=Infinity;}
 else if(target.phase==='flight'){target.phase='active';target.vel=null;}
 let time=1000,seq=1,proposal=1;
 const flags=1|(shredder?OBJECT_SHREDDER_FLAG:0);
 const payload=(wireFlag)=>kind==='sub'
  ?{v:1,phase:'objectHit',subId:attacker.weapon.id,seq:0,eventSeq:proposal++,targetOwnerId:owner.nid,targetLife:0,targetOwnerLife:0,targetSeq:target.seq,targetSubId:target.subId,life:0,damage:f.projectiles.deviceCombatProbeDamage(probe,target,0),cause,objectShredder:wireFlag,x:target.pos.x,y:target.pos.y,z:target.pos.z}
  :{id:target.id,action:'objectHit',activation:target.activation,pos:target.pos.toArray(),target:target.pos.toArray(),seed:target.seed>>>0,object:target.serial||0,index:target.index||0,ownerNid:owner.nid,ownerLife:0,attackerLife:0,damage:f.projectiles.deviceCombatProbeDamage(probe,target,0),cause,objectShredder:wireFlag,tick:proposal++};
 const deliver=events=>{time+=.05;f.clock.set(100+time-1000);const rows=structuredClone(events).map(e=>{e[0]=time-.001;e[e.length-2]=60000+Math.round((time-1000)*60)-1;e[e.length-1]=seq++;return e;});
  nm.onMessage('peer',{k:'t',r:2,ts:time,u:60000+Math.round((time-1000)*60),a:[f.packActor(attacker,{f:flags})],l:{17:0},e:rows});
  for(const e of nm.peers.get('peer').events.splice(0))nm._play('peer',e);};
 const claim=p=>[time,'ac',kind,attacker.nid,0,p,0,1];
 return {target,birth,payload,deliver,claim};
}

for(const id of ['waveBreaker','superChump','splashWall','beakon','torpedo'])test(`${id}: native round with accepted Object Shredder applies the fixed target rate once`,async t=>{
 const drops=[];
 for(const shredder of [false,true]){
  // The wire flag is deliberately the opposite of the accepted gear.
  const x=await setup(t,id,shredder),initial=x.target.hp;
  x.deliver([x.birth,x.claim(x.payload(!shredder))]);
  const drop=initial-x.target.hp;assert.ok(drop>0,'real native round reaches the receiver-owned device');
  x.deliver([x.claim(x.payload(!shredder))]);assert.equal(initial-x.target.hp,drop,'one round, one HP application');
  drops.push(drop);
 }
 assert.ok(Math.abs(drops[1]/drops[0]-OBJECT_SHREDDER_RATES[id])<1e-9,`${id}: ${drops}`);
});
