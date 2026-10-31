import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {objectDamageRow} from '../../splatoon3/runtime/sub-resistance.mjs';

async function setup(t,id,{kind='sub',hold=3}={}){
 const f=await fixture({productionComposition:true});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}}
 function make(nid,owner,remote,team){const a=new f.Actor({team,name:owner,weapon:'shooter',CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,grounded:true});a.pos.set(0,0,0);a.aimYaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.35,10);a._resolve=()=>{};return a;}
 const attacker=make(17,'peer',true,1),owner=make(7,'me',false,0);attacker.weapon={...attacker.weapon,sub:id};attacker.weaponRunner.reset();owner.pos.x=100;
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
 const match=f.bind(nm,[owner,attacker]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[owner,attacker]});t.after(()=>nm.dispose());
 const floor=(a,b,h)=>{h.hit=a.y>=0&&b.y<=0;if(h.hit){h.point.copy(a).lerp(b,a.y/(a.y-b.y));h.normal.set(0,1,0);h.dist=a.distanceTo(h.point);h.face=0;}return h;};
 f.G.physics.segment=floor;f.G.physics.raycast=(a,d,r,h)=>floor(a,a.clone().addScaledVector(d,r),h);
 // Sample the real local paid producer; then replay its wire into the remote
 // role. No fabricated birth or private proof is inserted by this fixture.
 attacker.remote=false;attacker.owner='me';attacker.ink=100;
 for(let i=0;i<hold;i++)attacker.weaponRunner.update(1/60,{sub:true,subReleased:false});
 for(let i=0;i<30&&!f.projectiles._s3SubObjects?.length&&!f.projectiles.bombs.length;i++)attacker.weaponRunner.update(1/60,{sub:false,subReleased:i===0});
 const birth=structuredClone(nm.out.find(e=>e[1]==='b'||e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn'));
 assert.ok(birth,`${id} native producer`);assert(attacker.ink<100,`${id} native ink payment`);
 const source=f.projectiles._s3SubObjects?.find(o=>o.owner===attacker)||f.projectiles.bombs.find(o=>o.owner===attacker);
 const sourceResolved=source.s3Resolved&&{...source.s3Resolved};
 const bursts=[];f.G.fx={explosion(p){bursts.push({point:p.clone(),age:source.age,elapsed:f.G.time});},burst(){}};
 let at,age;
 if(id==='angleShooter'){f.projectiles.update(1/60);at=source.pos.clone();age=1/60;}
 else if(id==='inkMine'){at=source.pos.clone();age=source.spec.armSeconds;}
 else{for(let i=0;i<600&&bursts.length<(id==='fizzy'?source.popLimit:1);i++){f.G.time+=1/60;f.projectiles.update(1/60);}assert.ok(bursts.length,`${id} real native collision/fuse`);at=bursts[0].point.clone();age=bursts[0].age;}
 attacker.remote=true;attacker.owner='peer';nm.out.length=0;f.projectiles.clear();f.G.fx=null;f.G.time=0;
 let target;
 if(kind==='sub'){owner.weapon={...owner.weapon,sub:'beakon'};target=f.projectiles.throwBomb(owner);}
 else if(kind==='special'){owner.weapon={...owner.weapon,special:'waveBreaker',specialCost:100};owner.special=100;owner._startSpecial();owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;owner._updateSpecial(1/60);for(let i=0;i<16&&owner.specialActive;i++)owner._updateSpecial(1/60);target=f.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');}
 else{owner.weapon={...owner.weapon,special:'tripleSplashdown',specialCost:100};owner.special=100;owner._startSpecial();target=f.projectiles._catalogueFists[0];}
 assert.ok(target);target.pos.copy(at);if(id!=='angleShooter')target.pos.x+=2;if(kind==='sub'&&id!=='angleShooter')target.pos.y-=.7;
 target.hp=10000;target.ghost=false;target.dead=false;
 if(kind==='sub'){target.phase='deployed';target.activeAt=Infinity;target.expireAt=Infinity;}
 let time=1000,seq=1,proposal=1;
 function deliver(events=[],dt=.05,eventTimes=[]){time+=dt;f.clock.set(100+time-1000);const rows=structuredClone(events).map((e,i)=>{e[0]=eventTimes[i]??time-.001;e[e.length-2]=60000+Math.round((time-1000)*60)-1;e[e.length-1]=seq++;return e;});
  nm.onMessage('peer',{k:'t',r:2,ts:time,u:60000+Math.round((time-1000)*60),a:[f.packActor(attacker,{f:1})],l:{17:Math.max(attacker.netLife||0,attacker.net?.lastLife||0)},e:rows});
  for(const e of nm.peers.get('peer').events.splice(0))nm._play('peer',e);
 }
 function claim(damage,cause=objectDamageRow(attacker,id)){
  const life=Math.max(attacker.netLife||0,attacker.net?.lastLife||0);
  const p=kind==='sub'?{v:1,phase:'objectHit',subId:id,seq:0,eventSeq:proposal++,targetOwnerId:owner.nid,targetLife:0,targetOwnerLife:0,targetSeq:target.seq,targetSubId:target.subId,life,damage,cause,objectShredder:false,x:target.pos.x,y:target.pos.y,z:target.pos.z}:
   {id:kind==='fist'?'tripleSplashdown':target.id,action:'objectHit',activation:target.activation,pos:target.pos.toArray(),target:target.pos.toArray(),seed:target.seed>>>0,object:target.serial||0,index:target.index||0,ownerNid:owner.nid,ownerLife:0,attackerLife:life,damage,cause,objectShredder:false,tick:proposal++};
  return [time,'ac',kind==='sub'?'sub':'special',attacker.nid,life,p,0,1];
 }
 return{f,nm,attacker,owner,target,birth,source,sourceResolved,at,age,bursts,deliver,claim,get time(){return time;}};
}

for(const [id,amount]of [['burst',35],['fizzy',35],['torpedo',60],['angleShooter',40]])test(`${id}: actual paid native birth/contact accepts exact device damage and rejects unfired, far, inflated, occluded and duplicate claims`,async t=>{
 const x=await setup(t,id),{f,nm,target}=x,initial=target.hp;
 x.deliver([x.claim(amount)]);assert.equal(target.hp,initial,'unfired');
 x.deliver([x.birth]);x.deliver([],Math.max(.05,x.age));
 x.deliver([x.claim(10000)]);assert.equal(target.hp,initial,'inflated');
 const pos=target.pos.clone();target.pos.x+=500;x.deliver([x.claim(amount)]);assert.equal(target.hp,initial,'far target');target.pos.copy(pos);
 let effects=0,paints=0,callbacks=0;f.G.fx={explosion(){effects++;},burst(){effects++;}};f.G.paint.splat=()=>{paints++;return 0;};
 const base=f.projectiles.kitDefenseCandidate;f.projectiles.kitDefenseCandidate=function(...args){const c=base.apply(this,args);if(c)c.onHit=()=>{callbacks++;throw Error('live device callback from probe');};return c;};
 const segment=f.G.physics.segment;f.G.physics.segment=(a,b,h)=>{h.hit=true;h.point.copy(a);h.normal.set(0,0,-1);h.dist=0;return h;};
 f.G.physics.los=()=>false;x.deliver([x.claim(amount)]);assert.equal(target.hp,initial,'terrain/LOS');f.G.physics.segment=segment;f.G.physics.los=()=>true;
 x.deliver([x.claim(amount)]);
 assert.ok(target.hp<initial,`${id} native positive; proofs=${nm._combatProvenance?.proofs.get('peer')?.length}`);
 const after=target.hp;x.deliver([x.claim(amount)]);assert.equal(target.hp,after,'new event sequence cannot reuse the same source contact');
 assert.equal(effects,0);assert.equal(paints,0);assert.equal(callbacks,0);
});

for(const kind of ['special','fist'])test(`native Angle Shooter contact reaches ${kind} device consumer`,async t=>{
 const x=await setup(t,'angleShooter',{kind}),initial=x.target.hp;
 x.deliver([x.birth]);x.deliver([x.claim(40)]);assert.ok(x.target.hp<initial);
 const after=x.target.hp;x.deliver([x.claim(40)]);assert.equal(x.target.hp,after);
});

for(const id of ['bomb','suction','curling','autobomb'])test(`${id}: native FIFO-created bomb and actual receiver explosion settle a delayed device claim once`,async t=>{
 const x=await setup(t,id),{f,nm,target}=x,initial=target.hp;
 const cause=id==='suction'?'Bomb_Suction':'Bomb';
 const r=x.sourceResolved;const amount=r&&Number.isFinite(r.damageInnerDistance)?(2<=r.damageInnerDistance?r.damageMax:r.damageMin):180;
 x.deliver([x.claim(amount,cause)]);assert.equal(target.hp,initial);
 x.deliver([x.birth]);const bomb=f.projectiles.bombs.find(b=>b.owner===x.attacker);assert.ok(bomb,'actual native receiver birth');
 assert.equal(nm._combatProvenance.proofs.get('peer')?.length,1,'only completed native creation mints one proof');
 x.deliver([x.claim(10000,cause)]);assert.equal(target.hp,initial);
 x.deliver([x.claim(amount,cause)],Math.max(.05,x.age));assert.equal(target.hp,initial,'claim waits for native fuse/terrain');
 const peer=nm.peers.get('peer');peer.sim=60000+Math.ceil((x.time-1000)*60)+3;
 for(let i=0;i<5&&f.projectiles.bombs.includes(bomb);i++)f.projectiles._updateBombs(1/60);
 assert.ok(target.hp<initial,`${id} native positive, age=${bomb.age} proofs=${nm._combatProvenance.proofs.get('peer')?.length}`);
 const after=target.hp;x.deliver([x.claim(amount,cause)]);assert.equal(target.hp,after,'native explosion is spent once per device');
});

test('three native Fizzy bursts have distinct bounded contacts; a new event ID never repeats a spent pop',async t=>{
 const x=await setup(t,'fizzy',{hold:120}),{target}=x;assert.equal(x.bursts.length,3);
 x.deliver([x.birth]);const born=x.time-.001;
 for(let i=0;i<3;i++){
  const b=x.bursts[i];target.pos.copy(b.point);target.pos.x+=2;target.pos.y-=.7;
  const amount=i===2?50:35,before=target.hp;
  x.deliver([x.claim(amount)],Math.max(.02,born+b.elapsed+.03-x.time));assert.ok(target.hp<before,`native pop ${i}`);
  const after=target.hp;x.deliver([x.claim(amount)],.02);assert.equal(target.hp,after,`spent native pop ${i}`);
 }
});

test('long-lived accepted mine keeps only its native trigger across respawn, and no wire burst can trigger it',async t=>{
 const x=await setup(t,'inkMine'),{f,nm,target,attacker,owner}=x,initial=target.hp;
 x.deliver([x.birth]);const mine=f.projectiles._s3SubObjects.find(o=>o.owner===attacker);assert.equal(mine.phase,'deployed');
 const fake=structuredClone(x.birth);fake[5].phase='burst';fake[5].eventSeq+=100;fake[5].x=target.pos.x;fake[5].z=target.pos.z;
 x.deliver([fake,x.claim(45)]);assert.equal(target.hp,initial,'self-authored burst is not a native trigger');
 // Separate case keeps the real mine alive; the preceding fabricated phase
 // may retire its cosmetic copy, but cannot become a damage receipt.
 const y=await setup(t,'inkMine'),start=y.target.hp;y.deliver([y.birth]);
 y.attacker.netLife=1;y.deliver([],30);y.f.G.time=30;
 y.deliver([y.claim(45)]);assert.equal(y.target.hp,start,'no enemy in the mine sensor');
 y.owner.pos.set(2,0,0);y.f.projectiles.update(1/60);
 assert.ok(y.target.hp<start,'accepted old-life placement plus receiver-native armed sensor trigger');
 const after=y.target.hp;y.deliver([y.claim(45)]);assert.equal(y.target.hp,after);
});

test('a spent native direct sub cannot pass through its destroyed first device to damage another',async t=>{
 const x=await setup(t,'angleShooter'),{f,target,owner}=x;
 const second=f.projectiles.throwBomb(owner);second.pos.copy(target.pos);second.pos.z+=5;second.hp=1000;second.activeAt=Infinity;second.expireAt=Infinity;
 target.hp=1;x.deliver([x.birth]);x.deliver([x.claim(40)]);assert.equal(target.dead,true);
 const row=x.claim(40),p=row[5];p.targetSeq=second.seq;p.targetSubId=second.subId;p.x=second.pos.x;p.y=second.pos.y;p.z=second.pos.z;
 x.deliver([row]);assert.equal(second.hp,1000,'first interception is sealed across targets and fresh transport/event IDs');
});

test('an older accepted birth can settle a waiting sub claim, but a later birth and an expired wait cannot',async t=>{
 const older=await setup(t,'angleShooter'),start=older.target.hp;
 older.deliver([older.claim(40)]);assert.equal(older.target.hp,start);
 older.deliver([older.birth],.05,[1000.02]);assert.ok(older.target.hp<start);
 const future=await setup(t,'angleShooter'),unchanged=future.target.hp;
 future.deliver([future.claim(40)]);future.deliver([future.birth],.05,[1000.099]);assert.equal(future.target.hp,unchanged);
 const expired=await setup(t,'angleShooter'),initial=expired.target.hp;
 expired.deliver([expired.claim(40)]);expired.deliver([expired.birth],1.1,[1000.02]);assert.equal(expired.target.hp,initial);
});

test('native sub birth remains bound to its session, actor object, peer owner and match epoch',async t=>{
 for(const boundary of ['session','epoch','peer','actor']){
  const x=await setup(t,'angleShooter'),{nm,attacker,target}=x,initial=target.hp;x.deliver([x.birth]);
  if(boundary==='session')nm.s={...nm.s};
  if(boundary==='epoch')nm.cfg={...nm.cfg,id:'new-match'};
  if(boundary==='peer')nm.peers.set('peer',{...nm.peers.get('peer')});
  if(boundary==='actor')attacker.net={...attacker.net,buf:attacker.net.buf.slice()};
  x.deliver([x.claim(40)]);assert.equal(target.hp,initial,boundary);
 }
});
