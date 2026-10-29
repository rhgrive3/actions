import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
// Modeled NetMatch below is NOT a native HP, physics, browser or Character test.
// Its admission predicates are the actual current composed source, not permissive stubs.
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const sourceRoot=new URL('../../',import.meta.url),built=process.env.INKWAVE_BUILT_SITE;
const runtimeRoot=built?pathToFileURL(path.resolve(built)+path.sep):sourceRoot;
const runtimePaths=['patches/network-replication/combat-provenance.mjs',
  'patches/network-replication/owner-tick-receipt.mjs',
  'patches/network-replication/snapshot-guard.mjs',
  'patches/network-replication/sub-birth-commit.mjs'];
if(built){
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const manifest=JSON.parse(fs.readFileSync(new URL('inkwave-build.json',runtimeRoot),'utf8'));
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
  for(const rel of runtimePaths){
    assert.equal(hash(fs.readFileSync(new URL(rel,runtimeRoot))),manifest.artifacts[rel],'actual emitted '+rel);
    assert.equal(hash(fs.readFileSync(new URL(rel,sourceRoot))),manifest.files[rel.slice('patches/'.length)],'matching runtime source '+rel);
  }
  for(const [key,rel] of [['upstream/src/net/netmatch.js','inkwave-public/src/net/netmatch.js'],
    ['upstream/src/config.js','inkwave-public/src/config.js'],
    ['patch/runtime/sub-special-fidelity.mjs','patches/splatoon3/runtime/sub-special-fidelity.mjs'],
    ['patch/runtime/final-damage.mjs','patches/splatoon3/runtime/final-damage.mjs']])
    assert.equal(hash(fs.readFileSync(new URL(rel,sourceRoot))),manifest.files[key],'matching modeled policy input '+key);
}
const {installCombatProvenance,combatAdmission,claimCeiling,sampleLocalHistory,victimVisible}=await import(new URL(runtimePaths[0],runtimeRoot));
// The actual receipt module must share the runtime's WeakMap in both source and
// emitted modes. Source-generated predicates below remain a modeled native gate.
const {commitOwnerTick}=await import(new URL(runtimePaths[1],runtimeRoot));
const {validActorSnapshotRow}=await import(new URL(runtimePaths[2],runtimeRoot));
const {stageAcceptedSubBirth,replayWithSubBirthCommit}=await import(new URL(runtimePaths[3],runtimeRoot));
function declaration(source, name) {
  const nodes=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.map(n=>n.declaration||n);
  const matches=nodes.filter(n=>n.id?.name===name || n.declarations?.some(d=>d.id.name===name));
  assert.equal(matches.length,1,'unique actual declaration '+name);
  const n=matches[0]; return source.slice(n.start,n.end);
}
const native=adaptBuildSource('src/net/netmatch.js',read('inkwave-public/src/net/netmatch.js'));
const fidelity=read('patches/splatoon3/runtime/sub-special-fidelity.mjs');
const finalDamage=read('patches/splatoon3/runtime/final-damage.mjs');
// Receipt uses only WEAPONS[id].kind. Project literal kinds from actual upstream
// data, without executing weapon/Game construction. These cases use base IDs.
const config=parse(read('inkwave-public/src/config.js'),{ecmaVersion:'latest',sourceType:'module'});
const weapons=config.body.flatMap(n=>(n.declaration||n).declarations||[]).find(n=>n.id.name==='WEAPONS');
assert.equal(weapons.init.type,'ObjectExpression');
const kinds=Object.fromEntries(weapons.init.properties.map(p=>{
  assert.equal(p.value.type,'ObjectExpression');
  const k=p.value.properties.find(p=>p.key.name==='kind');
  assert.equal(k.value.type,'Literal');return[p.key.name||p.key.value,{kind:k.value.value}];
}));
const names=['unpackActor','readHitAuthorityState','HIT_SEQUENCE_WINDOW','IW_HIT_MAX_DAMAGE','IW_HIT_CAUSES','IW_ANGLE_SHOOTER_HIT_MAX','IW_CATALOGUE_SUB_HIT_MAX','hitSafe','hitAuthorityRow','iwRemoteHitPayloadAllowed','iwRemoteHitReceiptAllowed','iwRemoteBossHitReceiptAllowed'];
const policySource=names.map(n=>declaration(native,n)).join('\n')+'\n'+
  ['BLASTER_KNOCKBACK','validBlasterKnockback'].map(n=>declaration(fidelity,n)).join('\n')+'\n'+
  declaration(finalDamage,'validDamageGroup')+'\nconst WEAPONS='+JSON.stringify(kinds)+';\n'+
  'const G={};\n({unpack:unpackActor,payload:iwRemoteHitPayloadAllowed,receipt:iwRemoteHitReceiptAllowed,bossReceipt(d,from){G.netm=this;return iwRemoteBossHitReceiptAllowed.call(this,d,from)},caps:IW_CATALOGUE_SUB_HIT_MAX})';
const policy=new vm.Script(policySource).runInNewContext(Object.create(null),{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}});

const actor=(kind='shooter',special='storm')=>({
  nid:1,owner:'peerA',remote:true,team:0,alive:true,
  weapon:{id:kind,kind,range:35,fireInterval:.12,damage:36,special,sub:'bomb'},
  pos:{x:0,y:0,z:0},net:{cur:{f:1}},weaponRunner:{rolling:false},specialActive:null,
});
const victim=()=>({nid:2,owner:'local',remote:false,team:1,alive:true,netLife:0,pos:{x:0,y:0,z:7}});
class Stub {
  constructor(){
    this.myId='local';this.cfg={id:'test-match'};
    this.byNid=new Map([[1,actor()],[2,victim()]]);
    this.peers=new Map([['peerA',{}]]);this.s={_members:new Map([['peerA',true]])};this.hitCalls=[];this.bossCalls=[];
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
    const peer=this.peers.get(from)||{};peer.lastTs=d.ts;this.peers.set(from,peer);
    // Model native acceptance before the provenance wrapper observes the row.
    const admitted=[];
    for(const row of d.a||[]){
      const a=this.byNid.get(row?.[0]);
      if(!validActorSnapshotRow(row,d.ts)||!a?.remote||a.owner!==from)continue;
      const snap=policy.unpack(row,d.ts);snap.life=d.l?.[a.nid];
      if(!Number.isSafeInteger(snap.life)||snap.life<0||snap.life<(a.net.lastLife??0))continue;
      a.net.buf=[snap];a.net.lastLife=snap.life;
      admitted.push({actor:a,nid:a.nid,owner:a.owner,x:snap.x,y:snap.y,z:snap.z});
    }
    for(const e of d.e||[])if(e[1]==='ac'&&e[2]==='sub'){
      const a=this.byNid.get(e[3]);if(!a)continue;
      Object.assign(e,{_netPeer:from,_netTick:e[6],_netSeq:e[7]});
      if(stageAcceptedSubBirth(this,from,e,d.ts,e[6]))replayWithSubBirthCommit(this,from,e,report=>{
        if(e[5].phase!=='spawn'||e[4]!==Math.max(a.netLife||0,a.net.lastLife||0)||e[5].subId!==a.weapon.sub)return false;
        report?.('created',{owner:a,seq:e[5].seq,sourceLife:e[4],subId:e[5].subId});return true;
      });
    }
    commitOwnerTick(this,from,d,d.e||[],admitted);
  }
  _hit(d,from){
    if(!policy.receipt.call(this,d,from))return false;
    if(this.hitCalls.some(x=>x.d.h===d.h))return false;
    this.hitCalls.push({d,from});const peer=this.peers.get(from);(peer.hitSequences||=new Set()).add(d.h);peer.lastHit=Math.max(peer.lastHit||0,d.h);return true;
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
installCombatProvenance(Stub,{hitPayloadAllowed:policy.payload,hitReceiptAllowed:policy.receipt,bossReceiptAllowed:policy.bossReceipt});
function snapshotRow(id=1,x=0,y=0,z=0,flags=1){
  const row=[id,x,y,z,0,0,0,0,0,0,flags,100,100,0,0,0,0,0,0,1,0];
  assert.equal(validActorSnapshotRow(row,100),true,'positive fixture is a legal native actor row');
  return row;
}
function ownerTick(nm,from,d){
  // Positive producer convenience only. Rejected-row/life tests call the
  // receiver directly or supply the malformed value explicitly.
  const l=d.l??Object.fromEntries((d.a||[]).map(row=>{
    const a=nm.byNid.get(row[0]);return[row[0],Math.max(a?.netLife??0,a?.net?.lastLife??0)];
  }));
  return nm._tick(from,{...d,l});
}
function fire(nm,{id=1,at=100,origin=[0,1,0],dir=[0,0,45],kind='shooter'}={}) {
  ownerTick(nm,'peerA',{k:'t',ts:at+.05,a:[snapshotRow(id)],
    e:[[at,'p',id,'shot',kind,...origin,...dir]]});
}
function observeRollerContact(nm,{from='peerA',flags=257,life=0,at=100,x=0}={}) {
  const a=nm.byNid.get(1);
  const row=[a.nid,x,0,0,0,0,0,0,0,0,flags,100,100,0,0,0,0,0,0,1,0];
  assert.equal(validActorSnapshotRow(row,at),true);
  ownerTick(nm,from,{k:'t',ts:at,a:[row],l:{[a.nid]:life},e:[]});
  return nm._combatProvenance?.contactSnapshots.get(a)?.at;
}
function rollingSnapshot(nm){
  const a=nm.byNid.get(1);
  const row=[a.nid,a.pos.x,a.pos.y,a.pos.z,0,0,0,0,0,0,257,100,100,0,0,0,0,0,0,1,0];
  assert.equal(validActorSnapshotRow(row,100),true);
  ownerTick(nm,'peerA',{k:'t',ts:100,a:[row],e:[]});
  return performance.now()/1000;
}
function hit(v=2,h=1,w='shooter'){return{k:'hit',m:'test-match',a:1,v,d:Math.min(36,policy.caps[w]??36),w,h,l:0}};
function boss(q=1,c=-1,weak=0,w='shooter',d=36){return{k:'bhit',m:'test-match',a:1,d,w,q,c,l:0,weak}};
test('fabricated owner hit without shot cannot change victim health',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',hit());
  assert.equal(nm.hitCalls.length,0);
  ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[]});
  assert.equal(nm.hitCalls.length,0);
});
test('short rejected actor row cannot create a modeled native attack receipt',()=>{
  const nm=new Stub();
  ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[[1,0,0,0]],
    e:[[100,'p',1,'shot','shooter',0,1,0,0,0,45]]});
  assert.equal(nm.byNid.get(1).net.buf,undefined);
  assert.equal(nm._combatProvenance.proofs.get('peerA')?.length??0,0);
  nm.onMessage('peerA',hit());assert.equal(nm.hitCalls.length,0);
});
test('missing native actor life sidecar cannot create proof; a later legal tick recovers',()=>{
  const nm=new Stub();
  nm._tick('peerA',{k:'t',ts:100.05,a:[snapshotRow()],
    e:[[100,'p',1,'shot','shooter',0,1,0,0,0,45]]});
  assert.equal(nm.byNid.get(1).net.buf,undefined);
  assert.equal(nm._combatProvenance.proofs.get('peerA')?.length??0,0);
  nm.onMessage('peerA',hit());assert.equal(nm.hitCalls.length,0);
  fire(nm,{at:100.1});assert.equal(nm.hitCalls.length,1);
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
  ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],
    e:[[100,'p',1,'shot','shooter',0,1,0,0,0,-45]]});
  assert.equal(nm.hitCalls.length,0);
  ownerTick(nm,'wrongPeer',{k:'t',ts:100.15,a:[snapshotRow()],
    e:[[100.1,'p',1,'shot','shooter',0,1,0,0,0,45]]});
  assert.equal(nm.hitCalls.length,0);
});
test('boss and crablet cannot be damaged without nearby matching owner shot',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',boss());
  nm.onMessage('peerA',boss(2,7));
  assert.equal(nm.bossCalls.length,0);
  fire(nm);
  assert.equal(nm.bossCalls.length,1,'the first nonpenetrating round cannot reach both objects');
  fire(nm,{at:100.1});
  assert.equal(nm.bossCalls.length,2);
});
test('fake weak point away from projectile trajectory fails, real weak shot passes',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',boss(1,-1,1));
  nm.match.boss.model.hitShapes[0].pos={x:20,y:1,z:12};
  fire(nm);
  assert.equal(nm.bossCalls.length,0);
  nm.match.boss.model.hitShapes[0].pos={x:0,y:1,z:12};
  ownerTick(nm,'peerA',{k:'t',ts:100.15,a:[snapshotRow()],
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
  assert.equal(combatAdmission(nm,'peerA',hit(2,99,'roller'),'pvp',performance.now()/1000),false,'raw render flags cannot mint contact');
  const t=rollingSnapshot(nm);
  assert.equal(combatAdmission(nm,'peerA',hit(2,1,'roller'),'pvp',t),true);
  assert.equal(combatAdmission(nm,'peerA',hit(2,2,'roller'),'pvp',t+.1),false);
  assert.equal(combatAdmission(nm,'peerA',hit(2,3,'roller'),'pvp',t+.6),true);
  nm.byNid.get(2).pos.z=20;
  assert.equal(combatAdmission(nm,'peerA',hit(2,4,'roller'),'pvp',t+1.3),false);
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
  ownerTick(nm,'peerA',{k:'t',ts:100.15,a:[snapshotRow()],
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
  ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],
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
  rollingSnapshot(nm);
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
test('native all:sub spawn proof admits legitimate Burst with owner life; deployment forgery does not',()=>{
  const nm=new Stub(),a=nm.byNid.get(1);a.weapon.sub='burst';a.netLife=0;
  nm.onMessage('peerA',hit(2,1,'burst'));
  const payload={v:1,phase:'spawn',subId:'burst',life:0,sourceLife:0,seq:1,x:0,y:1,z:0,vx:0,vy:0,vz:45};
  ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[[100,'ac','sub',1,0,payload,6000,1]]});
  assert.equal(nm.hitCalls.length,1);
  const wrong=new Stub();wrong.byNid.get(1).weapon.sub='burst';wrong.byNid.get(1).netLife=0;
  wrong.onMessage('peerA',hit(2,1,'burst'));
  ownerTick(wrong,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],
    e:[[100,'ac','sub',1,99,payload,6000,1]]});
  assert.equal(wrong.hitCalls.length,0);
  const deployed=new Stub();deployed.byNid.get(1).weapon.sub='burst';deployed.byNid.get(1).netLife=0;
  deployed.onMessage('peerA',hit(2,1,'burst'));
  ownerTick(deployed,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],
    e:[[100,'ac','sub',1,0,{...payload,phase:'deploy'},6000,1]]});
  assert.equal(deployed.hitCalls.length,0);
});
test('native life-bound Kraken Special activation admits contact, not absent attack proof',()=>{
  const nm=new Stub(),a=nm.byNid.get(1);a.weapon.special='krakenRoyale';
  nm.byNid.get(2).pos.z=3;
  const h={...hit(2,1,'krakenRoyale'),d:120};
  nm.onMessage('peerA',h);assert.equal(nm.hitCalls.length,0);
  ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],
    e:[[100,'ev','special:use',{actor:{n:1},id:'krakenRoyale',pos:[0,0,0]}]]});
  assert.equal(nm.hitCalls.length,1);
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

test('actual payload caps reject overflow without reserving modeled hit IDs',()=>{
 for(const [cause,cap] of [['shooter',220],['angleShooter',40],['burst',policy.caps.burst]]){
  assert.equal(policy.payload({...hit(2,1,cause),d:cap}),true);
  assert.equal(policy.payload({...hit(2,1,cause),d:cap+.01}),false);
 }
 const nm=new Stub();fire(nm);nm.onMessage('peerA',{...hit(),d:221});
 assert.equal(nm.hitCalls.length,0);assert.equal(nm.peers.get('peerA').hitSequences,undefined);
 nm.onMessage('peerA',hit());assert.equal(nm.hitCalls.length,1);
});
test('actual receipt rejects foreign peer, stale life and exhausted authority revision',()=>{
 const nm=new Stub(),v=nm.byNid.get(2),d=hit();
 assert.equal(policy.receipt.call(nm,d,'peerA'),true);
 assert.equal(policy.receipt.call(nm,d,'wrongPeer'),false);
 assert.equal(policy.receipt.call(nm,{...d,l:1},'peerA'),false);
 assert.equal(policy.receipt.call(nm,{...d,m:'old-match'},'peerA'),false);
 v.net={_hitAuthority:['local',0,Number.MAX_SAFE_INTEGER]};
 assert.equal(policy.receipt.call(nm,d,'peerA'),false);
 v.net._hitAuthority=['local',0,3];assert.equal(policy.receipt.call(nm,d,'peerA'),true);
});
test('actual receipt preserves duplicate and aged-window rejection',()=>{
 const nm=new Stub(),peer=nm.peers.get('peerA');
 peer.hitSequences=new Set([1]);assert.equal(policy.receipt.call(nm,hit(),'peerA'),false);
 peer.hitSequences.clear();peer.lastHit=65537;
 assert.equal(policy.receipt.call(nm,hit(),'peerA'),false);
 assert.equal(policy.receipt.call(nm,hit(2,2),'peerA'),true);
});
test('raw catalogue sub without creation commit cannot mint modeled proof',()=>{
 const nm=new Stub();nm.byNid.get(1).weapon.sub='burst';
 // Wrong sourceLife fails the actual staging helper even though raw birth
 // coordinates and the currently equipped sub would have satisfied the old fixture.
 const p={v:1,phase:'spawn',subId:'burst',life:0,sourceLife:1,seq:1,x:0,y:1,z:0,vx:0,vy:0,vz:45};
 nm.onMessage('peerA',hit(2,1,'burst'));
 ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[[100,'ac','sub',1,0,p,6000,1]]});
 assert.equal(nm.hitCalls.length,0);
 assert.equal(nm._combatProvenance.proofs.get('peerA')?.length||0,0);
});

// #1665/#1666: per-equipped-slot hit ceilings. The table is generated from the
// production definitions; these cases compare it with Splatoon 3 Ver.11.3.0
// parameter values (Leanny/splat3 data/parameter/1130, source / 10).
import { COMBAT_HIT_CEILINGS } from '../../patches/network-replication/combat-hit-ceilings-data.mjs';
import { renderCombatHitCeilings, computeCombatHitCeilings, bossMultipliers } from '../../patches/network-replication/tools/combat-hit-ceilings.mjs';
import { MAIN_WEAPON_CATALOG } from '../../patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
test('shipped hit ceiling table is regenerated from the current production definitions',()=>{
  assert.equal(read('patches/network-replication/combat-hit-ceilings-data.mjs'),renderCombatHitCeilings());
  assert.deepEqual(COMBAT_HIT_CEILINGS,computeCombatHitCeilings());
});
test('hit ceilings match pinned 11.3.0 single-hit maxima',()=>{
  const {main,sub,special,boss}=COMBAT_HIT_CEILINGS;
  for(const [id,want] of [['shooter',36],['s3-shooter-heavy',62],['s3-shooter-gravity',52],['charger',160],
    ['s3-charger-long',180],['s3-charger-pencil',68],['roller',150],['s3-roller-heavy',180],['blaster',125],
    ['s3-blaster-lightshort',60],['slosher',70],['s3-slosher-bathtub',32],['splatling',30],['s3-spinner-hyper',40],
    ['dualies',30],['s3-maneuver-gallon',52.5],['s3-shelter-wide',119],['s3-stringer-short',45],['s3-saber-heavy',160]])
    assert.equal(main[id],want,id);
  for(const [id,want] of [['bomb',180],['suction',180],['burst',35],['angleShooter',40],['torpedo',60],
    ['torpedo-splash',12],['inkMine',45],['fizzy',50],['sprinkler',20],['toxicMist',0],['pointSensor',0],['beakon',0]])
    assert.equal(sub[id],want,id);
  assert.equal(special.trizooka,220);assert.equal(special.storm,null,'no authored damage field keeps existing policy');
  assert.deepEqual(boss,{weak:2.5,stunned:1.25});
  assert.throws(()=>bossMultipliers('const BOSS={};'),/identity mismatch/);
});
test('every catalogue main keeps its builder damage values under its ceiling',()=>{
  for(const r of MAIN_WEAPON_CATALOG.records){
    const p=r.parameters,c=COMBAT_HIT_CEILINGS.main[r.id];
    for(const v of [p.DamageParam?.ValueFullCharge,p.DamageParam?.ValueMax,p.DamageParam?.ValueFullChargeMax,
      p.BodyParam?.Damage,p.spl__BulletShelterCanopyParam?.CanopyDamage,p.BulletSaberSlashVerticalParam?.DamageParam?.DamageValue,
      p.spl__BulletStringerParam?.DamageParam?.DirectHitDamageMax,...(p.BlastParam?.DistanceDamage||[]).map(b=>b.Damage)])
      if(Number.isFinite(v))assert.ok(v/10<=c,r.id+' '+v);
  }
});
test('lethal 220 claim from a Splattershot owner is rejected before proof or hit ID use',()=>{
  const nm=new Stub();fire(nm);
  nm.onMessage('peerA',{...hit(),d:220});
  assert.equal(nm.hitCalls.length,0);
  assert.equal(nm._combatProvenance.pending.get('peerA')?.length||0,0,'never queued');
  assert.equal(nm.peers.get('peerA').hitSequences,undefined,'hit ID not reserved');
  nm.onMessage('peerA',{...hit(),d:36});
  assert.equal(nm.hitCalls.length,1,'genuine 36 with the same ID is still admitted');
});
test('main ceiling boundary: r2 rounding of the maximum passes, the next step does not',()=>{
  const nm=new Stub();fire(nm);
  assert.equal(combatAdmission(nm,'peerA',{...hit(2,1),d:36.01},'pvp'),true);
  fire(nm,{at:100.2});
  assert.equal(combatAdmission(nm,'peerA',{...hit(2,2),d:36.02},'pvp'),false);
  assert.equal(combatAdmission(nm,'peerA',{...hit(2,3),d:36},'pvp'),true,'rejection came from the ceiling, not proof exhaustion');
});
test('catalogue weapon ceiling comes from its own record even under a kit ID',()=>{
  const nm=new Stub(),a=nm.byNid.get(1),r=MAIN_WEAPON_CATALOG.records.find(r=>r.id==='s3-shooter-heavy');
  a.weapon={...a.weapon,id:'kit-variant-not-in-table',kind:'shooter',damage:62,catalogRecord:r};
  assert.equal(claimCeiling(a,{w:'shot'},'pvp'),62);
  fire(nm,{kind:'kit-variant-not-in-table'});
  assert.equal(combatAdmission(nm,'peerA',{...hit(2,1,'shot'),d:62},'pvp'),true);
  fire(nm,{at:100.2,kind:'kit-variant-not-in-table'});
  assert.equal(combatAdmission(nm,'peerA',{...hit(2,2,'shot'),d:62.5},'pvp'),false);
  assert.equal(combatAdmission(nm,'peerA',{...hit(2,3,'shot'),d:62},'pvp'),true);
});
test('sub ceilings follow the equipped sub, including generic bomb and Torpedo splash causes',()=>{
  const a=actor();
  a.weapon.sub='burst';
  assert.equal(claimCeiling(a,{w:'burst'},'pvp'),35);assert.equal(claimCeiling(a,{w:'bomb'},'pvp'),35);
  a.weapon.sub='suction';assert.equal(claimCeiling(a,{w:'bomb'},'pvp'),180);
  a.weapon.sub='torpedo';assert.equal(claimCeiling(a,{w:'torpedo-splash'},'pvp'),12);
  a.weapon.sub='toxicMist';assert.equal(claimCeiling(a,{w:'toxicMist'},'pvp'),0);
  a.weapon.sub='unknownSub';assert.equal(claimCeiling(a,{w:'unknownSub'},'pvp'),-1,'unknown definitions fail closed');
  const nm=new Stub();nm.byNid.get(1).weapon.sub='burst';
  ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[[100,'b',1,'bomb',0,1,0,0,0,45]]});
  nm.onMessage('peerA',{...hit(2,1,'burst'),d:35.5});
  assert.equal(nm.hitCalls.length,0,'Burst Bomb cannot deliver a Splat Bomb sized hit');
});
test('Special ceiling applies when authored, otherwise the existing Special policy decides',()=>{
  const a=actor('shooter','trizooka');
  assert.equal(claimCeiling(a,{w:'trizooka'},'pvp'),220);
  const b=actor('shooter','storm');
  assert.equal(claimCeiling(b,{w:'storm'},'pvp'),Infinity);
});
test('Boss body ceiling includes only the guest-side weak-point and stunned multipliers',()=>{
  const nm=new Stub();
  nm.onMessage('peerA',boss(1,-1,0,'shooter',45));
  nm.onMessage('peerA',boss(2,-1,0,'shooter',45.5));
  fire(nm);
  assert.equal(nm.bossCalls.length,1);assert.equal(nm.bossCalls[0].d,45,'36 x stunned 1.25');
  const weak=new Stub();
  weak.onMessage('peerA',boss(1,-1,1,'shooter',112.5));
  weak.onMessage('peerA',boss(2,-1,1,'shooter',113));
  fire(weak);
  assert.equal(weak.bossCalls.length,1);assert.equal(weak.bossCalls[0].d,112.5,'36 x weak 2.5 x stunned 1.25');
});
test('crablet marker is bounded by the largest equipped slot',()=>{
  const nm=new Stub(),a=nm.byNid.get(1);a.weapon.special='trizooka';
  assert.equal(claimCeiling(a,{w:'crab',c:7},'boss'),220);
  a.weapon.special='storm';
  assert.equal(claimCeiling(a,{w:'crab',c:7},'boss'),Infinity,'unauthored Special damage keeps its existing policy');
  a.weapon.special=undefined;
  assert.equal(claimCeiling(a,{w:'crab',c:7},'boss'),180,'Splat Bomb is the largest remaining slot');
  nm.onMessage('peerA',boss(1,7,0,'crab',181));
  fire(nm);
  assert.equal(nm.bossCalls.length,0);
});

// #1665/#1666: trusted receiver geometry. A modeled wall occupies the plane
// z=3.5 for |x|<10 and y<5; the collision world is the engine LOS interface.
class Vec { set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} }
function walled(nm,{wallZ=3.5,half=10,top=5}={}) {
  let calls=0;
  nm._combatProvenanceTHREE={Vector3:Vec};
  nm._combatProvenancePhysics={los(a,b){
    calls++;
    if((a.z-wallZ)*(b.z-wallZ)>=0)return true;
    const k=(wallZ-a.z)/(b.z-a.z),x=a.x+(b.x-a.x)*k,y=a.y+(b.y-a.y)*k;
    return !(Math.abs(x)<half&&y<top);
  }};
  return ()=>calls;
}
const nowS=()=>performance.now()/1000;
test('straight-fire hit on a victim hidden behind a wall is rejected without any bg segment',()=>{
  const open=new Stub();fire(open);open.onMessage('peerA',hit());
  assert.equal(open.hitCalls.length,1,'negative control: without a collision world the old gate admits it');
  const nm=new Stub();walled(nm);fire(nm);
  nm.onMessage('peerA',hit());
  assert.equal(nm.hitCalls.length,0);
  assert.equal(nm._combatProvenance.pending.get('peerA').length,1,'stays pending, not consumed');
});
test('lag compensation admits a victim that was visible inside the 1.2 s window',()=>{
  for(const hz of [10,20,60]){
    const nm=new Stub();walled(nm,{half:2});const v=nm.byNid.get(2),t=nowS();
    v.pos={x:5,y:0,z:7};                        // stepped out past the pillar
    for(let k=Math.round(.9*hz);k>=Math.round(.5*hz);k--)sampleLocalHistory(nm,t-k/hz);
    v.pos={x:0,y:0,z:7};                        // back behind it on this screen
    ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[[100,'p',1,'shot','shooter',0,1,0,5,0,7]]});
    nm.onMessage('peerA',hit());
    assert.equal(nm.hitCalls.length,1,hz+'Hz history sampling');
  }
});
test('a pose older than the lag window cannot authorize the hit',()=>{
  const nm=new Stub();walled(nm,{half:2});const v=nm.byNid.get(2),t=nowS();
  v.pos={x:5,y:0,z:7};sampleLocalHistory(nm,t-1.5);
  v.pos={x:0,y:0,z:7};
  ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[[100,'p',1,'shot','shooter',0,1,0,5,0,7]]});
  nm.onMessage('peerA',hit());
  assert.equal(nm.hitCalls.length,0);
});
test('a claimed muzzle on the far side of a wall from the attacker body is rejected',()=>{
  const nm=new Stub();walled(nm);
  nm.byNid.get(1).pos={x:0,y:0,z:2.5};nm.byNid.get(2).pos={x:0,y:0,z:9};
  ownerTick(nm,'peerA',{k:'t',ts:100.05,a:[snapshotRow(1,0,0,2.5)],e:[[100,'p',1,'shot','shooter',0,1,5,0,0,45]]});
  nm.onMessage('peerA',hit());
  assert.equal(nm.hitCalls.length,0);
  const ok=new Stub();walled(ok);
  ok.byNid.get(1).pos={x:0,y:0,z:4};ok.byNid.get(2).pos={x:0,y:0,z:9};
  ownerTick(ok,'peerA',{k:'t',ts:100.05,a:[snapshotRow(1,0,0,4)],e:[[100,'p',1,'shot','shooter',0,1,5,0,0,45]]});
  ok.onMessage('peerA',hit());
  assert.equal(ok.hitCalls.length,1,'positive control: same muzzle in view of the attacker');
});
test('area-burst Blaster round near cover keeps the existing ray gate',()=>{
  // Blaster bursts damage around their detonation point, not along a line.
  const nm=new Stub();walled(nm);const a=nm.byNid.get(1);
  a.weapon={...a.weapon,id:'blaster',kind:'blaster',damage:125};
  fire(nm,{kind:'blaster'});
  nm.onMessage('peerA',{...hit(2,1,'blaster'),d:70});
  assert.equal(nm.hitCalls.length,1);
});
test('LOS work per claim is bounded and cached per proof',()=>{
  const nm=new Stub(),calls=walled(nm),t=nowS();
  for(let k=40;k>0;k--)sampleLocalHistory(nm,t-k/40);
  fire(nm);
  const p=nm._combatProvenance.proofs.get('peerA')[0];
  victimVisible(nm,p,nm.byNid.get(2),t);
  const first=calls();
  assert.ok(first<=3+9*(1+8),'at most attacker anchors + 9 samples x (current + 8 history poses): '+first);
  victimVisible(nm,p,nm.byNid.get(2),t+.05);
  assert.equal(calls(),first,'cached inside 0.1 s');
});
test('one shot no longer mints both a projectile and a fire-event proof',()=>{
  const shot=(nm,at)=>ownerTick(nm,'peerA',{k:'t',ts:at+.05,a:[snapshotRow()],e:[
    [at,'p',1,'shot','shooter',0,1,0,0,0,45],
    [at+.001,'ev','weapon:fire',{actor:{n:1},weapon:'shooter',muzzle:[0,1,0],dir:[0,0,1]}]]});
  const nm=new Stub();shot(nm,100);
  assert.equal(nm._combatProvenance.proofs.get('peerA').length,1);
  for(let h=1;h<=4;h++)nm.onMessage('peerA',hit(2,h));
  assert.equal(nm.hitCalls.length,1,'one round lands once on its victim (previously four claims passed)');
  const charger=new Stub(),c=charger.byNid.get(1);c.weapon={...c.weapon,id:'charger',kind:'charger',damage:160};
  ownerTick(charger,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[[100,'ev','weapon:fire',{actor:{n:1},weapon:'charger',muzzle:[0,1,0],dir:[0,0,1]}]]});
  charger.onMessage('peerA',{...hit(2,1,'charger'),d:160});
  assert.equal(charger.hitCalls.length,1,'hitscan fire events still prove Charger shots');
});
test('Boss body behind cover rejects straight fire; crablets keep the ray gate',()=>{
  const nm=new Stub();walled(nm);
  nm.onMessage('peerA',boss(1,-1,0,'shooter',36));
  fire(nm);
  assert.equal(nm.bossCalls.length,0);
  const seen=new Stub();walled(seen,{wallZ:20});
  seen.onMessage('peerA',boss(1,-1,0,'shooter',36));
  fire(seen);
  assert.equal(seen.bossCalls.length,1);
  const crab=new Stub();walled(crab);
  crab.onMessage('peerA',boss(1,7,0,'crab',36));
  fire(crab);
  assert.equal(crab.bossCalls.length,1);
});
test('nonpenetrating proof lands once; Charger and area retain their separate target capacity',()=>{
  const nm=new Stub();fire(nm);
  nm.onMessage('peerA',hit(2,1));nm.onMessage('peerA',hit(2,2));
  assert.equal(nm.hitCalls.length,1,'second claim from the same round on the same victim is rejected');
  const bots=new Stub();bots.byNid.set(3,{...victim(),nid:3,pos:{x:.5,y:0,z:7}});
  fire(bots);
  bots.onMessage('peerA',hit(2,1));bots.onMessage('peerA',hit(3,2));
  assert.equal(bots.hitCalls.length,1,'a nonpenetrating round retires at its first local victim');
  const charger=new Stub();charger.byNid.get(1).weapon={...charger.byNid.get(1).weapon,id:'charger',kind:'charger',damage:160};
  charger.byNid.set(3,{...victim(),nid:3,pos:{x:.5,y:0,z:7}});
  fire(charger,{kind:'charger'});
  charger.onMessage('peerA',hit(2,1,'charger'));charger.onMessage('peerA',hit(3,2,'charger'));
  assert.equal(charger.hitCalls.length,2,'a penetrating Charger keeps separate local victims');
  const area=new Stub(),a=area.byNid.get(1);a.weapon={...a.weapon,id:'blaster',kind:'blaster',damage:125};
  fire(area,{kind:'blaster'});
  area.onMessage('peerA',{...hit(2,1,'blaster'),d:30});area.onMessage('peerA',{...hit(2,2,'blaster'),d:30});
  assert.equal(area.hitCalls.length,2,'area families keep their existing per-proof uses');
});
test('shot pairing uses the muzzle, not a load-dependent millisecond gap',()=>{
  const ev=(t,m)=>[t,'ev','weapon:fire',{actor:{n:1},weapon:'shooter',muzzle:m,dir:[0,0,1]}];
  const slow=new Stub();
  ownerTick(slow,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[[100,'p',1,'shot','shooter',0,1,0,0,0,45],ev(100.005,[0,1,0])]});
  assert.equal(slow._combatProvenance.proofs.get('peerA').length,1,'5 ms apart on a loaded device is still one shot');
  const burst=new Stub();
  ownerTick(burst,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[
    [100,'p',1,'shot','shooter',0,1,0,0,0,45],ev(100.001,[0,1,0]),
    [100.002,'p',1,'shot','shooter',.3,1,0,0,0,45],ev(100.003,[.3,1,0])]});
  assert.equal(burst._combatProvenance.proofs.get('peerA').length,2,'two rounds in one frame stay two proofs');
  const other=new Stub();
  ownerTick(other,'peerA',{k:'t',ts:100.05,a:[snapshotRow()],e:[[100,'p',1,'shot','shooter',0,1,0,0,0,45],ev(100.001,[1.5,1,0])]});
  assert.equal(other._combatProvenance.proofs.get('peerA').length,2,'a fire event at another muzzle is not that birth');
});

test('roller contact cannot be minted from pose flags without a fresh matching accepted snapshot',()=>{
  for(const scenario of ['absent','dead','notRolling','wrongOwner','oldLife','stale','future','farSnapshot','replayedTick']){
    const nm=new Stub(),a=nm.byNid.get(1);
    a.weapon.id='roller';a.weapon.kind='roller';a.net.cur.f=257;
    nm.byNid.get(2).pos.z=1;nm.match.boss.crabs.get(7).z=1;
    const opts={flags:scenario==='dead'?256:scenario==='notRolling'?1:257,
      from:scenario==='wrongOwner'?'otherPeer':'peerA',x:scenario==='farSnapshot'?20:0};
    let t=performance.now()/1000;
    if(scenario!=='absent')t=observeRollerContact(nm,opts)??t;
    if(scenario==='oldLife')a.netLife=1;
    if(scenario==='stale')t+=10;
    if(scenario==='future')t-=1;
    if(scenario==='replayedTick'){
      // A duplicate packet cannot refresh the receipt's receive time.
      const receipt=nm._combatProvenance.contactSnapshots.get(a);
      const before={at:receipt.at,origin:[...receipt.origin]};
      observeRollerContact(nm,{at:100,x:20});
      assert.equal(receipt.at,before.at,'duplicate cannot refresh receive time');
      assert.deepEqual(receipt.origin,before.origin,'changed duplicate row cannot replace receipt origin');
      t+=10;
    }
    assert.equal(combatAdmission(nm,'peerA',hit(2,1,'roller'),'pvp',t),false,scenario);
    assert.equal(combatAdmission(nm,'peerA',boss(1,7,0,'crab',140),'boss',t),false,'crablet '+scenario);
    assert.equal(nm.hitCalls.length,0,scenario);
    assert.equal(nm.bossCalls.length,0,scenario);
  }
});
