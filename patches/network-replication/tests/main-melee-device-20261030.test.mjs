import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';

async function setup(t,weapon='s3-saber-normal',charged=false,kind='beakon'){
 const f=await fixture({productionComposition:true});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}}
 const make=(nid,owner,remote,team,id)=>{const a=new f.Actor({team,name:owner,weapon:id,CharacterClass:Display});a.character.actor=a;
  Object.assign(a,{nid,owner,remote,netLife:0,isLocal:!remote,grounded:true});a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,3);a._resolve=()=>{};return a;};
 const attacker=make(17,'peer',true,1,weapon),owner=make(7,'me',false,0,'shooter');owner.pos.x=10;
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
 const match=f.bind(nm,[owner,attacker]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[owner,attacker]});t.after(()=>nm.dispose());
 let target;
 if(kind==='wave'){
  owner.weapon={...owner.weapon,special:'waveBreaker',specialCost:100};owner.special=100;owner._startSpecial();
  owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;owner._updateSpecial(1/60);
  for(let i=0;i<16&&owner.specialActive;i++)owner._updateSpecial(1/60);
  target=f.projectiles._s3AllSpecialObjects.find(o=>o.kind==='wave');assert.ok(target);
 }else{owner.weapon={...owner.weapon,sub:kind};target=f.projectiles.throwBomb(owner);assert.equal(target.subId,kind);}
 target.pos.set(0,.9,1);Object.assign(target,{hp:1000,ghost:false,dead:false,phase:'deployed',activeAt:Infinity,expireAt:Infinity});
 if(kind==='splashWall'){target.pos.set(2.7,0,1);target.yaw=0;}
 const authority={remote:attacker.remote,ownerRemote:owner.remote,id:nm.myId,ghost:target.ghost};
 attacker.remote=false;owner.remote=true;nm.myId='peer';target.ghost=true;attacker.ink=100;attacker.weaponRunner.reset();nm.out.length=0;
 const hold=charged?130:1,swing=attacker.weapon.catalogRecord.parameters.spl__WeaponSaberParam.SwingParam;
 const tail=(charged?swing.ChargeSwingShotSlashFrame:swing.WeakSwingShotSlashFrame)+5;
 try{for(let i=0;i<hold+tail;i++){
  f.G.time+=1/60;f.clock.set(1000+f.G.time);
  attacker.weaponRunner.update(1/60,{fire:i<hold,firePressed:i===0,fireReleased:i===hold,sub:false});
 }}finally{attacker.remote=authority.remote;owner.remote=authority.ownerRemote;nm.myId=authority.id;target.ghost=authority.ghost;}
 const rows=structuredClone(nm.out),frames=rows.filter(e=>e[1]==='ev'&&e[2]==='weapon:melee');
 const claims=rows.filter(e=>e[1]==='ac'&&(e[5]?.phase==='objectHit'||e[5]?.action==='objectHit'));
 assert.equal(frames.length,4,'actual native slash publishes exactly its four active source frames');
 assert.deepEqual(frames.map(e=>e[3].frame),[0,1,2,3]);assert.ok(attacker.ink<100,'real Runner paid main ink');
 assert.equal(claims.length,1,'real source device API emits once per swing');
 assert.ok(claims[0][0]>=frames[0][0]&&claims[0][0]<=frames[3][0]);
 assert.equal(target.hp,1000,'producer emitted an owner proposal rather than mutating remote HP');
 nm.out.length=0;let ts=f.clock.now()+.01,seq=1000,u=Math.round(f.G.time*60)+1;
 function deliver(events,{life=0,from='peer'}={}){
  ts+=.05;u+=3;f.clock.set(ts);
  const copy=structuredClone(events).map(e=>{e[e.length-2]=Math.min(e[e.length-2],u);e[e.length-1]=seq++;return e;});
  nm.onMessage(from,{k:'t',r:2,ts,u,a:[f.packActor(attacker,{f:1})],l:{17:life},e:copy});
  for(const e of nm.peers.get(from)?.events.splice(0)||[])nm._play(from,e);
 }
 return {f,nm,attacker,owner,target,rows,frames,claims,deliver};
}

for(const id of ['s3-saber-lite','s3-saber-normal','s3-saber-heavy'])for(const charged of [false,true])test(`${id} ${charged?'charged':'horizontal'} native melee frame reaches a local device once without a projectile proof`,async t=>{
 const x=await setup(t,id,charged);
 x.deliver([...x.frames,...x.claims].sort((a,b)=>a[0]-b[0]));assert.ok(x.target.hp<1000,'native slash-only source is admitted');
 const hp=x.target.hp;x.deliver([...x.frames,...x.claims]);assert.equal(x.target.hp,hp,'fresh envelopes cannot replay a swing');
 assert.equal(x.nm._combatProvenance?.proofs.get('peer')?.length||0,0,'device-only frames grant no generic PvP/Boss proof');
});

for(const kind of ['beakon','splashWall','wave'])test(`Saber ${kind}: raw playback, unfired claims, wrong amounts and source-frame expiry do not grant device damage`,async t=>{
 const x=await setup(t,'s3-saber-normal',false,kind),initial=x.target.hp;
 for(const e of [...x.frames,...x.claims])x.nm._play('peer',structuredClone(e));assert.equal(x.target.hp,initial,'raw playback cannot mint accepted source authority');
 const bad=structuredClone(x.claims);bad[0][5].damage=10000;x.deliver([...x.frames,...bad]);assert.equal(x.target.hp,initial,'self-declared amount rejected');
 x.deliver(x.claims);assert.ok(x.target.hp<initial,'earlier accepted native frame settles its legal original claim');
});

test('Saber captures each accepted native frame geometry; later relocation, malformed frame and changed life cannot reuse it',async t=>{
 const x=await setup(t),at=x.target.pos.clone();x.target.pos.x=200;
 x.deliver(x.frames);x.target.pos.copy(at);x.deliver(x.claims);assert.equal(x.target.hp,1000,'moving into an already received historical slash does not create contact');
 const changed=structuredClone(x.frames);for(const e of changed){e[3].serial+=1;e[3].frame+=4;}
 x.deliver([...changed,...x.claims]);assert.equal(x.target.hp,1000,'fifth frame and later are expired source shapes');
 x.attacker.netLife=1;x.attacker.net.lastLife=1;x.deliver([...x.frames,...x.claims],{life:1});assert.equal(x.target.hp,1000,'old-life native slash and claims cannot affect a new life');
});

test('Saber accepted frame respects native shape and contact-point LOS without FX or live damage callbacks',async t=>{
 const x=await setup(t);let effects=0,paint=0,live=0;
 x.f.G.fx={burst(){effects++;},explosion(){effects++;}};x.f.G.paint.splat=()=>{paint++;return 0;};
 x.f.projectiles.applyHit=()=>{live++;};x.f.G.physics.los=()=>false;
 x.deliver([...x.frames,...x.claims]);assert.equal(x.target.hp,1000);assert.equal(effects,0);assert.equal(paint,0);assert.equal(live,0);
});

test('Saber delayed native frame settles its original claim but a later frame cannot authorize an earlier hit',async t=>{
 const x=await setup(t);x.deliver(x.claims);assert.equal(x.target.hp,1000,'unfired claim waits without damage');
 x.deliver(x.frames.slice(1));assert.equal(x.target.hp,1000,'later native active frames do not authorize the earlier claim');
 x.deliver([x.frames[0]]);assert.ok(x.target.hp<1000,'the delayed original active frame settles the same claim');
});

test('Saber pending claim retains its original local target geometry until a delayed native source arrives',async t=>{
 const x=await setup(t),at=x.target.pos.clone();x.target.pos.x=200;x.deliver(x.claims);assert.equal(x.target.hp,1000);
 x.target.pos.copy(at);x.deliver(x.frames);assert.equal(x.target.hp,1000,'pending far claim cannot acquire the new in-range target position');
});
