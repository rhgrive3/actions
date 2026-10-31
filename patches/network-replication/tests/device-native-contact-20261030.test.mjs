import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {nativeMainBirth} from './native-main-birth-fixture.mjs';
import {objectDamageRow} from '../../splatoon3/runtime/sub-resistance.mjs';

async function setup(t,kind,weapon='shooter'){
 const f=await fixture({productionComposition:true});
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
for(const [kind,weapon] of [['sub','shooter'],['special','shooter'],['fist','shooter'],['torpedo','shooter'],['sub','dualies'],['sub','splatling'],['sub','s3-charger-long'],['sub','charger'],['sub','s3-blaster-short'],['sub','s3-roller-compact'],['sub','s3-brush-mini'],['sub','s3-slosher-diffusion'],['sub','s3-shelter-normal'],['sub','s3-stringer-normal'],['sub','s3-saber-normal'],['sub','blaster'],['sub','roller'],['sub','slosher']])test(`${weapon} ${kind} production objectHit requires one native round and receiver contact; unfired/far/10000/replay rejected`,async t=>{
 const x=await setup(t,kind,weapon),{target}=x,initial=target.hp;
 x.deliver([x.claim(x.payload())]);assert.equal(target.hp,initial,'unfired proposal');
 x.deliver([x.birth,x.claim(x.payload(10000))]);assert.equal(target.hp,initial,'self-declared damage is not a native hit');
 target.pos.x+=500;x.deliver([x.claim(x.payload())]);assert.equal(target.hp,initial,'sender target coordinates cannot redirect flight');target.pos.copy(x.at);
 const segment=x.f.G.physics.segment;x.f.G.physics.segment=(a,b,h)=>{h.hit=true;h.point.copy(a);h.normal.set(0,0,-1);h.dist=0;return h;};
 x.deliver([x.claim(x.payload())]);assert.equal(target.hp,initial,'native terrain wins before contact');x.f.G.physics.segment=segment;
 x.deliver([x.claim(x.payload())]);assert.ok(target.hp<initial,'real native round reaches receiver-owned target');
 const after=target.hp;x.deliver([x.claim(x.payload())]);assert.equal(target.hp,after,'fresh event ID cannot spend one round twice');
});

for(const kind of ['sub','special','fist'])test(`${kind}: accepted native hit waits for an older delayed birth and cannot borrow a later shot`,async t=>{
 const x=await setup(t,kind),initial=x.target.hp;
 x.deliver([x.claim(x.payload())],{eventTimes:[1000.049]});assert.equal(x.target.hp,initial);
 x.deliver([x.birth],{eventTimes:[1000.02]});assert.ok(x.target.hp<initial,'out-of-order transport settles the original native contact');
 const after=x.target.hp;x.deliver([x.claim(x.payload())]);assert.equal(x.target.hp,after,'retry consumed one round once');
 const y=await setup(t,kind),untouched=y.target.hp;
 y.deliver([y.claim(y.payload())],{eventTimes:[1000.049]});y.deliver([y.birth],{eventTimes:[1000.099]});
 assert.equal(y.target.hp,untouched,'unfired earlier claim cannot acquire proof from a future attack');
});

test('catalogue native terminal blast admits its sourced device band without paint, FX or live callbacks',async t=>{
 const x=await setup(t,'sub','s3-blaster-short'),{f,target,attacker}=x;
 const p=f.projectiles.makeCrabletCombatProbe(attacker,x.birth);
 while(p.age+1e-9<p.life)f.projectiles.stepCrabletCombatProbe(p);
 target.pos.copy(p.pos);target.pos.x+=1.3;target.pos.y-=.7;
 const descriptor=p.catalog.descriptor.b.BlastParam,bands=descriptor.DistanceDamage;
 const d=1.3;let amount;
 if(d<=bands[0].Distance)amount=bands[0].Damage/10;
 else for(let i=1;i<bands.length;i++)if(d<=bands[i].Distance){const a=bands[i-1],b=bands[i];amount=(a.Damage+(b.Damage-a.Damage)*(d-a.Distance)/(b.Distance-a.Distance))/10;break;}
 assert.ok(amount>0,'source blast covers off-axis receiver-owned device');
 x.deliver([x.birth]);for(let i=0;i<10;i++)x.deliver([]);
 const initial=target.hp;let effects=0,paint=0,callbacks=0;
 f.G.fx={explosion(){effects++;},burst(){effects++;}};f.G.paint.splat=()=>{paint++;return 0;};
 const candidate=f.projectiles.kitDefenseCandidate;
 f.projectiles.kitDefenseCandidate=function(...args){const c=candidate.apply(this,args);if(c)c.onHit=()=>{callbacks++;throw Error('probe invoked live callback');};return c;};
 const claim=x.payload(amount);claim.cause=objectDamageRow({...p,type:'area'});
 f.G.physics.los=()=>false;x.deliver([x.claim(claim)]);assert.equal(target.hp,initial,'source blast LOS blocks the claim');
 f.G.physics.los=()=>true;claim.eventSeq++;x.deliver([x.claim(claim)]);assert.ok(target.hp<initial,'native terminal burst is a legal source attack');
 assert.equal(effects,0);assert.equal(paint,0);assert.equal(callbacks,0);
});

test('native catalogue probe respects nearer Actor and Boss blockers and releases private state on exceptions',async t=>{
 const x=await setup(t,'sub','s3-shelter-normal'),{f,target,owner}=x,initial=target.hp;
 x.deliver([x.birth]);owner.pos.copy(x.at);owner.pos.z-=.2;owner.pos.y-=.7;
 x.deliver([x.claim(x.payload())]);assert.equal(target.hp,initial,'native Actor capsule wins before device');owner.pos.x=10;
 f.G.boss={segHit:(from,to)=>({point:from.clone(),dist:0,target:{}})};
 x.deliver([x.claim(x.payload())]);assert.equal(target.hp,initial,'native Boss blocks before device');f.G.boss=null;
 const segment=f.G.physics.segment;f.G.physics.segment=()=>{throw Error('terrain temporarily unavailable');};
 assert.doesNotThrow(()=>x.deliver([x.claim(x.payload())]));assert.equal(target.hp,initial);
 f.G.physics.segment=segment;x.deliver([x.claim(x.payload())]);assert.ok(target.hp<initial,'failed probe neither consumes proof nor leaks active context');
});

for(const weapon of ['shooter','s3-shelter-normal','blaster'])test(`${weapon}: a consumed native round cannot fly through its destroyed first device`,async t=>{
 const x=await setup(t,'sub',weapon),{f,target,owner}=x;
 const behind=f.projectiles.throwBomb(owner);behind.pos.copy(x.at);behind.pos.z+=1;
 Object.assign(behind,{hp:1000,ghost:false,dead:false,phase:'deployed',activeAt:Infinity,expireAt:Infinity});
 target.hp=1;x.deliver([x.birth,x.claim(x.payload())]);assert.equal(target.dead,true,'real first device destroyed');
 const proposal=x.payload();proposal.targetSeq=behind.seq;proposal.x=behind.pos.x;proposal.y=behind.pos.y;proposal.z=behind.pos.z;
 x.deliver([x.claim(proposal)]);assert.equal(behind.hp,1000,'one birth does not re-simulate past the removed first blocker');
});

for(const weapon of ['s3-blaster-short','blaster'])test(`${weapon}: one native terminal area seals all eight contacts and excludes devices entering afterwards`,async t=>{
 const x=await setup(t,'sub',weapon),{f,nm,target,owner,attacker}=x;
 const p=f.projectiles.makeCrabletCombatProbe(attacker,x.birth);
 while(p.age+1e-9<p.life)f.projectiles.stepCrabletCombatProbe(p);
 const center=p.pos.clone(),targets=[target];
 target.pos.copy(center);target.pos.x+=1.3;target.pos.y-=.7;
 const owners=[owner];
 for(let j=0;j<2;j++){
   const a=x.make(30+j,'me',false,0);a.pos.x=20;a.weapon={...a.weapon,sub:'beakon'};
   nm.byNid.set(a.nid,a);f.G.actors.push(a);owners.push(a);
 }
 for(let i=1;i<9;i++){
   const a=owners[Math.floor(i/3)],o=f.projectiles.throwBomb(a);assert.ok(o,'native target producer');
   o.pos.copy(target.pos);if(i===8)o.pos.x+=200;
   Object.assign(o,{hp:1000,ghost:false,dead:false,phase:'deployed',activeAt:Infinity,expireAt:Infinity});targets.push(o);
 }
 assert.ok(targets.every(o=>!o.dead),'all native target lifetimes retained');
 const bands=p.catalog?p.catalog.descriptor.b.BlastParam.DistanceDamage.map(b=>[b.Distance,b.Damage/10]):p.s3Weapon.damageBands;
 const amount=f.distanceDamage(bands,1.3);assert.ok(amount>0);
 x.deliver([x.birth]);for(let i=0;i<10;i++)x.deliver([]);
 const proposal=o=>({...x.payload(amount),cause:objectDamageRow(p.catalog?{...p,type:'area'}:p),targetOwnerId:o.owner.nid,targetSeq:o.seq,
   x:o.pos.x,y:o.pos.y,z:o.pos.z});
 target.hp=1;x.deliver([x.claim(proposal(target))]);assert.equal(target.dead,true,'first accepted burst recipient destroyed');
 targets[8].pos.copy(target.pos);
 for(const o of targets.slice(1,8)){x.deliver([x.claim(proposal(o))]);assert.ok(o.hp<1000,'every target in the native burst is admitted, beyond the old six-use heuristic');}
 x.deliver([x.claim(proposal(targets[8]))]);assert.equal(targets[8].hp,1000,'a new device in the old area cannot acquire a sealed burst');
});
