import test from 'node:test';
import assert from 'node:assert/strict';
import { installCombatProvenance,combatAdmission } from '../../patches/network-replication/combat-provenance.mjs';
const actor=(kind='shooter',special='storm')=>({
  nid:1,owner:'peerA',remote:true,team:0,alive:true,
  weapon:{id:kind,kind,range:35,fireInterval:.12,damage:36,special,sub:'bomb'},
  pos:{x:0,y:0,z:0},net:{cur:{f:1}},weaponRunner:{rolling:false},specialActive:null,
});
const victim=()=>({nid:2,owner:'local',remote:false,team:1,alive:true,pos:{x:0,y:0,z:7}});
class Stub {
  constructor(){
    this.myId='local';this.cfg={id:'test-match'};
    this.byNid=new Map([[1,actor()],[2,victim()]]);
    this.peers=new Map();this.hitCalls=[];this.bossCalls=[];
    this.isHost=true;this._disposed=false;
    const self=this;
    this.match={state:'playing',boss:{sim:true,dead:false,pos:{x:0,y:0,z:12},invuln:false,
      crabs:new Map([[7,{x:0,y:0,z:8,dead:false}]]),
      model:{hitShapes:[{active:true,weak:true,pos:{x:0,y:1,z:12},r:.9}]},
      remoteHit(d){self.bossCalls.push(d);}}};
    this._bossSeq=0;
  }
  _tick(from,d){
    if(this.peers.get(from)?.lastTs>=d.ts)return;
    this.peers.set(from,{lastTs:d.ts});
  }
  _hit(d,from){
    if(this.byNid.get(d.v)?.remote || this.byNid.get(d.a)?.owner!==from)return false;
    if(this.hitCalls.some(x=>x.d.h===d.h))return false;
    this.hitCalls.push({d,from});return true;
  }
  onMessage(from,d){
    if(d.k==='hit')return this._hit(d,from);
    if(d.k==='bhit' && this._acceptBossHit(from,d))return this.match.boss.remoteHit(d);
  }
  _acceptBossHit(from,d){
    if(this.byNid.get(d.a)?.owner!==from || d.m!==this.cfg.id || d.q<=this._bossSeq)return false;
    this._bossSeq=d.q;return true;
  }
  onLeave(){} dispose(){} bind(){}
}
installCombatProvenance(Stub,{});
function fire(nm,{id=1,at=100,origin=[0,1,0],dir=[0,0,45],kind='shooter'}={}) {
  nm._tick('peerA',{k:'t',ts:at+.05,a:[[id,0,0,0]],
    e:[[at,'p',id,'shot',kind,...origin,...dir]]});
}
function hit(v=2,h=1,w='shooter'){return{k:'hit',m:'test-match',a:1,v,d:36,w,h,l:0}};
function boss(q=1,c=-1,weak=0,w='shooter',d=36){return{k:'bhit',m:'test-match',a:1,d,w,q,c,l:0,weak}};
test('fabricated owner hit without shot cannot change victim health',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',hit());
  assert.equal(nm.hitCalls.length,0);
  nm._tick('peerA',{k:'t',ts:100.05,a:[[1,0,0,0]],e:[]});
  assert.equal(nm.hitCalls.length,0);
});
test('legitimate hit queued before next 20Hz shot event is applied exactly once',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',hit());
  fire(nm);
  assert.equal(nm.hitCalls.length,1);
  nm.onMessage('peerA',hit());
  assert.equal(nm.hitCalls.length,1,'duplicate hit sequence remains blocked');
});
test('wrong peer event or off-axis projectile cannot mint plausible shot',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',hit());
  nm._tick('peerA',{k:'t',ts:100.05,a:[[1,0,0,0]],
    e:[[100,'p',1,'shot','shooter',0,1,0,0,0,-45]]});
  assert.equal(nm.hitCalls.length,0);
  nm._tick('wrongPeer',{k:'t',ts:100.15,a:[[1,0,0,0]],
    e:[[100.1,'p',1,'shot','shooter',0,1,0,0,0,45]]});
  assert.equal(nm.hitCalls.length,0);
});
test('boss and crablet cannot be damaged without nearby matching owner shot',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',boss());
  nm.onMessage('peerA',boss(2,7));
  assert.equal(nm.bossCalls.length,0);
  fire(nm);
  assert.equal(nm.bossCalls.length,2);
});
test('fake weak point away from projectile trajectory fails, real weak shot passes',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',boss(1,-1,1));
  nm.match.boss.model.hitShapes[0].pos={x:20,y:1,z:12};
  fire(nm);
  assert.equal(nm.bossCalls.length,0);
  nm.match.boss.model.hitShapes[0].pos={x:0,y:1,z:12};
  nm._tick('peerA',{k:'t',ts:100.15,a:[[1,0,0,0]],
    e:[[100.1,'p',1,'shot','shooter',0,1,0,0,0,45]]});
  assert.equal(nm.bossCalls.length,1);
});
test('wrong equipped weapon and inflated boss claim are rejected',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',boss(1,-1,0,'otherWeapon'));
  nm.onMessage('peerA',boss(2,-1,0,'shooter',900));
  fire(nm);
  assert.equal(nm.bossCalls.length,0);
});
test('roller damage uses a short observed contact gate and target range',()=>{
  const nm=new Stub(),a=nm.byNid.get(1);
  a.weapon.id='roller';a.weapon.kind='roller';a.net.cur.f=256;
  nm.byNid.get(2).pos.z=1.1;
  assert.equal(combatAdmission(nm,'peerA',hit(2,1,'roller'),'pvp',5),true);
  assert.equal(combatAdmission(nm,'peerA',hit(2,2,'roller'),'pvp',5.1),false);
  assert.equal(combatAdmission(nm,'peerA',hit(2,3,'roller'),'pvp',5.6),true);
  nm.byNid.get(2).pos.z=20;
  assert.equal(combatAdmission(nm,'peerA',hit(2,4,'roller'),'pvp',6.3),false);
});
test('occluded projectile segment is checked with engine Vector3 inputs',()=>{
  const nm=new Stub();
  class V3 {
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this}
  }
  nm._combatProvenanceTHREE={Vector3:V3};
  let calls=0,allow=false;
  nm._combatProvenancePhysics={los(a,b){
    assert.equal(typeof a.x,'number');assert.equal(typeof b.z,'number');
    calls++;return allow;
  }};
  const d={...hit(),bg:[0,1,0,0,1,7,.2]};
  nm.onMessage('peerA',d);
  fire(nm);
  assert.equal(calls,1);
  assert.equal(nm.hitCalls.length,0,'blocked shot cannot authorize HP change');
  allow=true;
  nm._tick('peerA',{k:'t',ts:100.15,a:[[1,0,0,0]],
    e:[[100.1,'p',1,'shot','shooter',0,1,0,0,0,45]]});
  assert.equal(nm.hitCalls.length,1);
});
test('equipped damage-dealing sub projectile uses its own wire cause',()=>{
  const nm=new Stub(),attacker=nm.byNid.get(1);
  attacker.weapon.sub='angleShooter';
  nm.onMessage('peerA',hit(2,1,'angleShooter'));
  fire(nm,{kind:'angleShooter'});
  assert.equal(nm.hitCalls.length,1,'Angle Shooter shot must survive proof gate');
});
test('explosive sub birth with generic bomb visual still admits its real equipped kind',()=>{
  const nm=new Stub(),attacker=nm.byNid.get(1);
  attacker.weapon.sub='burst';
  nm.onMessage('peerA',hit(2,1,'burst'));
  nm._tick('peerA',{k:'t',ts:100.05,a:[[1,0,0,0]],
    e:[[100,'b',1,'bomb',0,1,0,0,0,45]]});
  assert.equal(nm.hitCalls.length,1);
});
test('wrong sub cause cannot spoof a different equipped weapon',()=>{
  const nm=new Stub();nm.byNid.get(1).weapon.sub='bomb';
  nm.onMessage('peerA',hit(2,1,'angleShooter'));
  fire(nm,{kind:'angleShooter'});
  assert.equal(nm.hitCalls.length,0);
});
test('rolling into a crablet uses contact proof despite generic crab damage marker',()=>{
  const nm=new Stub(),a=nm.byNid.get(1);
  a.weapon.id='roller';a.weapon.kind='roller';a.net.cur.f=256;
  nm.match.boss.crabs.get(7).z=1;
  nm.onMessage('peerA',boss(1,7,0,'crab',140));
  assert.equal(nm.bossCalls.length,1);
  nm.onMessage('peerA',boss(2,7,0,'crab',140));
  assert.equal(nm.bossCalls.length,1,'roller contact is throttled');
});
test('persistent 6.5-second Ink Storm remains eligible after action animation ends',()=>{
  const nm=new Stub(),attack=nm.byNid.get(1);
  attack.specialActive=null;
  nm._combatProvenance={
    proofs:new Map([['peerA',[{actor:1,kind:'special',cause:'storm',at:0,
      origin:[0,1,0],unit:[0,0,1],reach:30,uses:0,maxUses:24,key:'storm'}]]]),
    pending:new Map(),contacts:new Map()
  };
  assert.equal(combatAdmission(nm,'peerA',boss(1,-1,0,'storm',30),'boss',7),true);
  assert.equal(combatAdmission(nm,'peerA',boss(2,-1,0,'storm',30),'boss',11),false);
});
test('pending hit proof queue retains no arbitrary network baggage',()=>{
  const nm=new Stub();
  const payload={...hit(),padding:'x'.repeat(30000)};
  nm.onMessage('peerA',payload);
  const pending=nm._combatProvenance.pending.get('peerA');
  assert.equal(pending.length,1);
  assert.equal(Object.hasOwn(pending[0].d,'padding'),false);
  assert.equal(JSON.stringify(pending[0]).length<400,true);
});
test('long lived tabs still admit timestamps above 2000s',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',hit());
  fire(nm,{at:3600});
  assert.equal(nm.hitCalls.length,1);
});
test('stale existing proofs are cleared on host migration/owner leave',()=>{
  const nm=new Stub();
  fire(nm);
  nm.onLeave('peerA',true);
  nm.onMessage('peerA',hit());
  assert.equal(nm.hitCalls.length,0);
  nm.dispose();
  assert.equal(nm._combatProvenance,null);
});
test('local owner handoff hit remains under original host authority path',()=>{
  const nm=new Stub();
  nm.myId='peerA';
  nm._hit(hit(),'peerA');
  assert.equal(nm.hitCalls.length,1);
});
