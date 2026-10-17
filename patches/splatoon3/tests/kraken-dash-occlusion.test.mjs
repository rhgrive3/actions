import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
function world(walls=[]) {
 f.G.netm=null;f.G.net=null;f.G.mode='match';f.G.time=0;f.G.actors=[];
 f.G.match={mode:'turf',state:'playing',time:100,playing:()=>true,canRespawn:()=>false};
 f.G.paint={sample:()=>0,splat:()=>0};
 f.G.level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[-10,0,0],[10,0,0]],spawnBarrier:0,single:[{kind:'box',min:[-20,-.5,-20],max:[20,0,20]},...walls],half:[]});
 f.G.physics=new f.Physics(f.G.level);
}
const wall=(z=1.5,xmin=-5,xmax=5)=>({kind:'box',min:[xmin,0,z],max:[xmax,5,z+.5]});
function dash(a=f.make()){
 a._integrate=f.Actor.prototype._integrate; // Retain native squid ground/grate/gravity collision.
 a.pos.set(0,0,1);a.team=0;a.aimYaw=a.yaw=0;a.aimPitch=0;a.weapon={...a.weapon,special:'krakenRoyale',specialCost:100};a.special=100;a.remote=false;a.intent.move.set(0,0,0);
 a._prevIntent||={};Object.assign(a._prevIntent,{fire:false,sub:false,jump:false,squid:false,booyah:false});
 a._startSpecial();assert.ok(a.specialActive);for(let i=0;i<61;i++){f.G.time+=1/60;a._updateSpecial(1/60);}a.intent.fire=true;a._updateSpecial(1/60);for(let i=0;i<36;i++)a._updateSpecial(1/60);a.intent.fire=false;a._updateSpecial(1/60);assert.equal(a._s3AllSpecialState.phase,'dash');return a;
}
function victim(x=0,y=0,z=3.5){const v=f.make();v.pos.set(x,y,z);v.team=1;v.hp=100;v.invuln=0;return v;}
for(const hz of [30,60,120]){
 test(`native wall stops body and occludes dash at ${hz}Hz`,()=>{world([wall()]);const a=dash(),v=victim();a._updateSpecial(1/hz);assert.equal(a.contacts.wall,true);assert.ok(a.pos.z<1.5);assert.equal(v.hp,100);assert.equal(a._s3AllSpecialState.dashHits.has(v),false);});
 test(`clear path retains source reach at ${hz}Hz`,()=>{world();const a=dash(),v=victim();a._updateSpecial(1/hz);assert.equal(v.hp,-20);assert.equal(a._s3AllSpecialState.dashHits.has(v),true);});
}
test('capsule height exclusion remains',()=>{world();const a=dash(),v=victim(0,3);a._updateSpecial(1/60);assert.equal(v.hp,100);});
test('capsule width exclusion remains',()=>{world();const a=dash(),v=victim(3);a._updateSpecial(1/60);assert.equal(v.hp,100);});
test('wall beyond victim does not block contact',()=>{world([wall(6)]);const a=dash(),v=victim();a._updateSpecial(1/60);assert.equal(v.hp,-20);});
test('side wall outside line does not block contact',()=>{world([wall(1.5,2,3)]);const a=dash(),v=victim();a._updateSpecial(1/60);assert.equal(v.hp,-20);});
test('nearest wall wins independently of solid ordering',()=>{world([wall(7),wall()]);const a=dash(),v=victim();a._updateSpecial(1/60);assert.equal(v.hp,100);});
test('end of a longer resolved sweep remains reachable',()=>{world();const a=dash(),v=victim(0,0,6.5);a._updateSpecial(1/15);assert.equal(v.hp,-20);});
test('wall occludes the endpoint of a longer resolved sweep',()=>{world([wall(2.8)]);const a=dash(),v=victim(0,0,4.7);a._updateSpecial(1/15);assert.equal(v.hp,100);});
test('multiple clear victims remain eligible in either array order',()=>{for(const reverse of [false,true]){world();const a=dash(),v=victim(-.3),w=victim(.3);if(reverse)f.G.actors.reverse();a._updateSpecial(1/60);assert.equal(v.hp,-20);assert.equal(w.hp,-20);}});
test('occluded victim does not consume its later clear contact',()=>{world([wall()]);const a=dash(),v=victim();a._updateSpecial(1/60);assert.equal(v.hp,100);f.G.level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[-10,0,0],[10,0,0]],spawnBarrier:0,single:[{kind:'box',min:[-20,-.5,-20],max:[20,0,20]}],half:[]});f.G.physics=new f.Physics(f.G.level);a._updateSpecial(1/60);assert.equal(v.hp,-20);});
test('visible victim beside a wall edge retains contact',()=>{world([wall(1.5,-5,.1)]);const a=dash(),v=victim(1.2);a._updateSpecial(1/60);assert.equal(v.hp,-20);});
test('victim just occluded by the wider wall edge receives no contact',()=>{world([wall(1.5,-5,.4)]);const a=dash(),v=victim(1.2);a._updateSpecial(1/60);assert.equal(v.hp,100);});

// Transport is an explicit JSON-copy fixture; admission, routing, sequence and
// life checks remain the actual Projectiles/NetMatch/Actor implementation.
function networkRoom(id){
 world();const a=f.make(),v=victim();
 Object.assign(a,{nid:7,owner:'S',netLife:2,team:0,remote:id!=='S'});
 Object.assign(v,{nid:4,owner:'V',netLife:5,remote:id!=='V'});
 a.net={...(a.net||{}),lastLife:2};v.net={...(v.net||{}),lastLife:5};
 a.pos.set(0,0,1);f.G.actors=[a,v];
 const sent=[],session={myId:id,isHost:id==='S',hostId:'S',_members:new Set(['S','V']),tr:{
  sendTo(to,d){sent.push({to,d:JSON.parse(JSON.stringify(d))});return true;},
  broadcast(d){sent.push({to:'*',d:JSON.parse(JSON.stringify(d))});return true;}}};
 const nm=new f.NetMatch(session,{id:'kraken-occlusion-match',map:'tidewater'});
 nm.byNid=new Map([[7,a],[4,v]]);nm.match=f.G.match;f.G.netm=nm;f.G.net=session;
 return {a,v,nm,sent,session};
}
function sentHit({guest=false,blocked=false}={}){
 const x=networkRoom('S');if(guest){x.session.isHost=false;x.session.hostId='V';}
 if(blocked){f.G.level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[-10,0,0],[10,0,0]],spawnBarrier:0,single:[{kind:'box',min:[-20,-.5,-20],max:[20,0,20]},wall()],half:[]});f.G.physics=new f.Physics(f.G.level);}
 dash(x.a);x.a._updateSpecial(1/60);const hits=x.sent.filter(x=>x.d.k==='hit');
 assert.equal(x.v.hp,100,'sender never directly damages remote victim');
 assert.equal(hits.length,blocked?0:1);if(blocked)return null;
 const packet=hits[0].d;assert.equal(packet.w,'krakenRoyale');assert.equal(packet.d,120);assert.equal(packet.m,'kraken-occlusion-match');assert.equal(packet.l,5);return packet;
}
for(const guest of [false,true]){
 test(`${guest?'guest':'host'} owner routes visible contact to victim authority`,()=>sentHit({guest}));
 test(`${guest?'guest':'host'} owner sends no contact through wall`,()=>sentHit({guest,blocked:true}));
}
for(const mode of ['valid','duplicate','wrong-match','wrong-owner','future-victim-life','attacker-life-change-keeps-committed-hit','remote-recipient']){
 test(`native receiver: ${mode}`,()=>{
  const packet=sentHit(),x=networkRoom('V');let from='S';
  if(mode==='wrong-match')packet.m='old-match';if(mode==='wrong-owner')from='X';
  if(mode==='future-victim-life')x.v.netLife=6;
  if(mode==='attacker-life-change-keeps-committed-hit'){x.a.netLife=3;x.a.net.lastLife=3;}
  if(mode==='remote-recipient'){x.v.owner='S';x.v.remote=true;}
  let calls=0;const native=x.v.damage;x.v.damage=function(...args){calls++;return native.apply(this,args);};
  x.nm.onMessage(from,packet);if(mode==='duplicate')x.nm.onMessage(from,packet);
  const admitted=['valid','duplicate','attacker-life-change-keeps-committed-hit'].includes(mode);
  assert.equal(calls,admitted?1:0);assert.equal(x.v.hp,admitted?-20:100);
 });
}
for(const mode of ['remote','dead'])test(`${mode} owner cannot emit a local dash contact`,()=>{
 const x=networkRoom('S');dash(x.a);const before=x.a.pos.toArray();
 if(mode==='remote')x.a.remote=true;else x.a.alive=false;
 x.a._updateSpecial(1/60);assert.equal(x.sent.filter(y=>y.d.k==='hit').length,0);
 assert.equal(x.v.hp,100);assert.deepEqual(x.a.pos.toArray(),before);
});
