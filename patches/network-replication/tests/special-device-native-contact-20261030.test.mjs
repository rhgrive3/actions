import test from 'node:test';
import {exportNativeActorPacker} from './native-packer-export-fixture.mjs';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';

async function setup(t,id,kind='sub'){
 const f=await fixture({productionComposition:true,transformSource:exportNativeActorPacker});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}}
 const make=(nid,owner,remote,team)=>{const a=new f.Actor({team,name:owner,weapon:'shooter',CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,isLocal:!remote,grounded:true});a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimYaw=0;a.aimPitch=0;a.aimPoint.set(0,1.05,20);a._resolve=()=>{};return a;};
 const attacker=make(17,'peer',true,1),owner=make(7,'me',false,0);
 attacker.weapon={...attacker.weapon,special:id,specialCost:100};
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
 const match=f.bind(nm,[owner,attacker]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[owner,attacker]});t.after(()=>nm.dispose());
 let time=1000,seq=1,proposal=1;
 function deliver(events,{times=[]}={}){time+=.05;f.G.time+=.05;f.clock.set(time);const rows=structuredClone(events).map((e,i)=>{const claim=e[1]==='ac'&&(e[5]?.phase==='objectHit'||e[5]?.action==='objectHit');e[0]=times[i]??(claim?time-.001:e[0]);if(claim)e[e.length-2]=Math.max(0,Math.round(f.G.time*60)-1);e[e.length-1]=seq++;return e;});
  nm.onMessage('peer',{k:'t',r:2,ts:time,u:Math.round(f.G.time*60),a:[f.nativePackActor(attacker)],l:{17:attacker.netLife||0},e:rows});
  for(const e of nm.peers.get('peer').events.splice(0))nm._play('peer',e);
 }
 attacker.special=100;deliver([]);
 attacker.remote=false;nm.myId='peer';owner.pos.set(id==='tentaMissiles'?0:10,0,id==='tentaMissiles'?20:0);nm.out.length=0;attacker._startSpecial();attacker.intent.fire=true;
 if(id==='inkVac')f.projectiles.fireInkVacExhale(attacker,{charge:0});
 else for(let i=0;i<700&&!nm.out.some(e=>e[1]==='p');i++){
  f.G.time+=1/60;f.clock.set(time+(i+1)/60);
  if(id==='ultraStamp'){attacker.intent.sub=i===0;attacker.intent.fire=false;}
  attacker._updateSpecial(1/60);f.projectiles.update(1/60);
 }
 time=f.clock.now();
 const events=structuredClone(nm.out),birth=events.find(e=>e[1]==='p');assert.ok(birth,`${id}: actual native producer published its projectile`);
 assert.ok(events.some(e=>e[1]==='ev'&&e[2]==='special:use'),`${id}: actual native activation`);
 attacker.remote=true;nm.myId='me';nm.out.length=0;f.projectiles.clear();
 const probe=f.projectiles.makeCrabletCombatProbe(attacker,birth);assert.ok(probe,`${id}: source probe restored`);
 f.projectiles.stepCrabletCombatProbe(probe);f.projectiles.stepCrabletCombatProbe(probe);
 owner.pos.set(id==='tentaMissiles'?0:10,0,id==='tentaMissiles'?20:0);let target;
 if(kind==='sub'){owner.weapon={...owner.weapon,sub:'beakon'};target=f.projectiles.throwBomb(owner);target.phase='deployed';target.activeAt=Infinity;target.expireAt=Infinity;}
 if(kind==='special'){owner.weapon={...owner.weapon,special:'waveBreaker',specialCost:100};owner.special=100;owner._startSpecial();owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;for(let i=0;i<20&&owner.specialActive;i++)owner._updateSpecial(1/60);target=f.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');}
 if(kind==='fist'){owner.weapon={...owner.weapon,special:'tripleSplashdown',specialCost:100};owner.special=100;owner._startSpecial();target=f.projectiles._catalogueFists?.[0];}
 assert.ok(target);target.pos.copy(probe.pos);target.hp=1000;target.ghost=false;target.dead=false;
 const at=target.pos.clone(),damage=probe.damage,cause=f.projectiles.nativeSpecialProjectileCause(probe);
 function payload(amount=damage,device=target){
  if(kind==='sub')return {v:1,phase:'objectHit',subId:id,seq:0,eventSeq:proposal++,targetOwnerId:owner.nid,targetLife:0,targetOwnerLife:0,targetSeq:device.seq,targetSubId:device.subId,life:0,damage:amount,cause,objectShredder:false,x:device.pos.x,y:device.pos.y,z:device.pos.z};
  return {id:kind==='fist'?'tripleSplashdown':target.id,action:'objectHit',activation:target.activation,pos:target.pos.toArray(),target:target.pos.toArray(),seed:target.seed>>>0,object:target.serial||0,index:target.index||0,ownerNid:owner.nid,ownerLife:0,attackerLife:0,damage:amount,cause,objectShredder:false,tick:proposal++};
 }
 const claim=p=>[time,'ac',kind==='sub'?'sub':'special',attacker.nid,attacker.netLife||0,p,0,1];
 return {f,nm,attacker,owner,target,at,birth,events,probe,payload,claim,deliver};
}
for(const [id,kind] of [['tentaMissiles','sub'],['inkjet','sub'],['ultraStamp','sub'],['crabTank','sub'],['trizooka','sub'],['inkVac','sub'],['inkjet','special'],['inkjet','fist']])test(`${id} ${kind}: actual paid native use and projectile contact replace generic special-range authority`,async t=>{
 const unpaid=await setup(t,id,kind),unpaidHp=unpaid.target.hp;
 unpaid.deliver([unpaid.birth,unpaid.claim(unpaid.payload())]);assert.equal(unpaid.target.hp,unpaidHp,'unpaid projectile has no special authority');
 const x=await setup(t,id,kind),{target}=x,initial=target.hp;
 x.deliver(x.events);x.deliver([x.claim(x.payload(10000))]);assert.equal(target.hp,initial,'wire damage is not the native source damage');
 target.pos.x+=500;x.deliver([x.claim(x.payload())]);assert.equal(target.hp,initial,'no off-path source contact');target.pos.copy(x.at);
 const segment=x.f.G.physics.segment;x.f.G.physics.segment=(a,b,h)=>{h.hit=true;h.point.copy(a);h.normal.set(0,0,-1);h.dist=0;return h;};
 x.deliver([x.claim(x.payload())]);assert.equal(target.hp,initial,'source terrain blocks a direct damage claim');x.f.G.physics.segment=segment;
 x.deliver([x.claim(x.payload())]);assert.ok(target.hp<initial,`${id}: legitimate native direct hit`);
 // A Trizooka native action contains three separately identified lobes.
 // Exhaust that real cardinality before testing an extra ambiguous claim.
 if(id==='trizooka')for(let i=0;i<2;i++)x.deliver([x.claim(x.payload())]);
 const after=target.hp;x.deliver([x.claim(x.payload())]);assert.equal(target.hp,after,'native source cardinality cannot be spent twice');
});
test('an admitted native projectile waits for a reordered earlier paid-use receipt without inventing a new birth',async t=>{
 const x=await setup(t,'inkjet'),initial=x.target.hp;
 x.deliver([x.birth,x.claim(x.payload())]);assert.equal(x.target.hp,initial);
 x.deliver(x.events);assert.ok(x.target.hp<initial,'same original native timestamp/id is recovered when its earlier use arrives');
});
test('an already admitted native special projectile keeps its paid source after owner respawn/loadout change',async t=>{
 const x=await setup(t,'inkjet'),initial=x.target.hp;x.deliver(x.events);
 x.attacker.netLife=1;x.attacker.net.lastLife=1;x.attacker.weapon={...x.attacker.weapon,special:'reefslider'};
 const payload=x.payload();payload.life=1;x.deliver([x.claim(payload)]);
 assert.ok(x.target.hp<initial,'existing source birth retains its original Inkjet source through receiver life transition');
});
test('a native projectile first received after respawn cannot borrow a paid-use from the previous life',async t=>{
 const x=await setup(t,'inkjet'),initial=x.target.hp;x.deliver(x.events.filter(e=>e[1]!=='p'));
 x.attacker.netLife=1;x.attacker.net.lastLife=1;
 const payload=x.payload();payload.life=1;x.deliver([x.birth,x.claim(payload)]);
 assert.equal(x.target.hp,initial,'unreceived birth has no private old-life admission');
});
function replacementBirthId(x,wire,id){
 for(let i=27;i<wire.length-2;i++){const e=structuredClone(wire);e[i]=id;if(x.f.projectiles.crabletCombatBirthId(e)===id)return e;}
 assert.fail('actual native projectile identity field is present');
}
for(const id of ['inkjet','ultraStamp','crabTank'])test(`${id}: accepted terminal and native action slot cannot move to a second device after destruction`,async t=>{
 const x=await setup(t,id),{f,target,owner,attacker}=x;target.hp=1e8;
 x.deliver(x.events);x.deliver([x.claim(x.payload())]);assert.ok(target.hp<1e8,'first native source contact succeeds');
 target.dead=true;target.hp=0;
 const next=f.projectiles.throwBomb(owner);assert.ok(next);next.phase='deployed';next.activeAt=Infinity;next.expireAt=Infinity;next.hp=1e8;
 const ahead=f.projectiles.makeCrabletCombatProbe(attacker,x.birth);for(let i=0;i<6;i++)f.projectiles.stepCrabletCombatProbe(ahead);next.pos.copy(ahead.pos);
 x.deliver([x.claim(x.payload(ahead.damage,next))]);assert.equal(next.hp,1e8,'destroying the first target cannot extend the same native trajectory');
 const duplicate=replacementBirthId(x,x.birth,5001);x.deliver([duplicate,x.claim(x.payload(ahead.damage,next))]);
 assert.equal(next.hp,1e8,'a fresh projectile id cannot spend one native fire slot twice');
 const faster=replacementBirthId(x,x.birth,5002);faster[8]*=1.2;faster[9]*=1.2;faster[10]*=1.2;
 x.deliver([faster,x.claim(x.payload(ahead.damage,next))]);assert.equal(next.hp,1e8,'wire velocity cannot invent a different source launch');
});
