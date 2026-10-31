import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {nativeMainBirth} from './native-main-birth-fixture.mjs';
import {objectDamageRow} from '../../splatoon3/runtime/sub-resistance.mjs';

async function setup(t,kind,weapon='shooter'){
 const f=await fixture({productionComposition:true,transformSource(rel,code){if(process.env.INKWAVE_DEVICE_TARGET_GEOMETRY_CONTROL&&rel==='patches/network-replication/combat-provenance.mjs'){const guard='  if(payload&&!bindNativeDeviceHitTarget(nm,actor,target,payload))return null;';assert.equal(code.split(guard).length,2);return code.replace(guard,'');}return code;}});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}}
 const make=(nid,owner,remote,team,id='shooter')=>{const a=new f.Actor({team,name:owner,weapon:id,CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,grounded:true});a.pos.set(0,0,0);a.aimPoint.set(0,1.05,3);a._resolve=()=>{};return a;};
 const attacker=make(17,'peer',true,1,weapon),owner=make(7,'me',false,0);
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
 const match=f.bind(nm,[owner,attacker]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[owner,attacker]});t.after(()=>nm.dispose());
 let birth,probe;
 if(weapon==='charger'){
  attacker.remote=false;attacker.weaponRunner.chargeT=1;f.projectiles.fireCharger(attacker,attacker.weapon,1);attacker.remote=true;
  birth=structuredClone(nm.out.find(e=>e[1]==='ev'&&e[2]==='weapon:fire'));assert.ok(birth);nm.out.length=0;f.projectiles.clear();
  probe=f.projectiles.makeDeviceChargerProbe({beamCharge:birth[3].charge,beamLength:birth[3].len,reach:100,origin:birth[3].muzzle,unit:birth[3].dir},attacker);
  const row=probe.path[1];probe.prev.set(row[0],row[1],row[2]);probe.pos.set(row[3],row[4],row[5]);
 }else{
  birth=nativeMainBirth(f,nm,attacker,attacker.weapon,1000);probe=f.projectiles.makeCrabletCombatProbe(attacker,birth);assert.ok(probe);
  f.projectiles.stepCrabletCombatProbe(probe);f.projectiles.stepCrabletCombatProbe(probe);
 }
 const at=probe.pos.clone(),cause=objectDamageRow(probe);
 owner.pos.x=10;
 let target;
 if(kind==='sub'||kind==='torpedo'){owner.weapon={...owner.weapon,sub:kind==='torpedo'?'torpedo':'beakon'};target=f.projectiles.throwBomb(owner);assert.equal(target.subId,owner.weapon.sub);}
 if(kind==='special'){
  owner.weapon={...owner.weapon,special:'waveBreaker',specialCost:100};owner.special=100;owner._startSpecial();owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;owner._updateSpecial(1/60);
  for(let i=0;i<16&&owner.specialActive;i++)owner._updateSpecial(1/60);
  target=f.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(target);
 }
 if(kind==='fist'){owner.weapon={...owner.weapon,special:'tripleSplashdown',specialCost:100};owner.special=100;owner._startSpecial();target=f.projectiles._catalogueFists?.[0];assert.ok(target);}
 target.pos.copy(at);target.hp=1000;target.ghost=false;target.dead=false;
 if(kind==='sub'){target.phase='deployed';target.activeAt=Infinity;target.expireAt=Infinity;}
 if(kind==='torpedo'){target.phase='chase';target.chasedTarget=true;}
 let time=1000,seq=1,proposal=1;
 const nativeDamage=f.projectiles.deviceCombatProbeDamage(probe,target,0);
 function payload(damage=nativeDamage){
  if(kind==='sub'||kind==='torpedo')return {v:1,phase:'objectHit',subId:attacker.weapon.id,seq:0,eventSeq:proposal++,targetOwnerId:owner.nid,targetLife:0,targetOwnerLife:0,targetSeq:target.seq,targetSubId:target.subId,life:0,damage,cause,objectShredder:false,x:target.pos.x,y:target.pos.y,z:target.pos.z};
  return {id:kind==='fist'?'tripleSplashdown':target.id,action:'objectHit',activation:target.activation,pos:target.pos.toArray(),target:target.pos.toArray(),seed:target.seed>>>0,object:target.serial||0,index:target.index||0,ownerNid:owner.nid,ownerLife:0,attackerLife:0,damage,cause,objectShredder:false,tick:proposal++};
 }
 function deliver(events,{eventTimes=[]}={}){time+=.05;f.clock.set(100+time-1000);const rows=structuredClone(events).map((e,i)=>{e[0]=eventTimes[i]??time-.001;e[e.length-2]=60000+Math.round((time-1000)*60)-1;e[e.length-1]=seq++;return e;});
  nm.onMessage('peer',{k:'t',r:2,ts:time,u:60000+Math.round((time-1000)*60),a:[f.packActor(attacker,{f:1})],l:{17:0},e:rows});
  for(const e of nm.peers.get('peer').events.splice(0))nm._play('peer',e);
 }
 const claim=p=>[time,'ac',kind==='sub'||kind==='torpedo'?'sub':'special',attacker.nid,0,p,0,1];
 return {f,nm,make,attacker,owner,target,at,birth,payload,deliver,claim};
}

// A real delayed native round is useful to its original receiver target only.
// The source/control pair differs solely in the new private target binding.
for(const kind of ['sub','special','fist'])test(`${kind}: a deferred off-path claim cannot acquire a later target position`,async t=>{
 const x=await setup(t,kind),initial=x.target.hp;
 x.target.pos.x+=500;
 x.deliver([x.claim(x.payload())],{eventTimes:[1000.049]});
 assert.equal(x.target.hp,initial,'source birth has not arrived');
 x.target.pos.copy(x.at);
 x.deliver([x.birth],{eventTimes:[1000.02]});
 assert.equal(x.target.hp,initial,'old off-path payload cannot move with its target when the genuine birth arrives');
 x.deliver([x.claim(x.payload())]);
 assert.ok(x.target.hp<initial,'fresh native contact remains legal because invalid deferred claim did not spend the round');
 const after=x.target.hp;
 x.deliver([x.claim(x.payload())]);
 assert.equal(x.target.hp,after,'the valid contact consumes the one native round');
});
