import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {nativeMainBirth} from './native-main-birth-fixture.mjs';

// Actual composed receiver, native Actor/Boss damage and native producer rows.
// Fixed display/muzzle, flat world and stationary Boss are component inputs;
// this does not turn the owner's otherwise-valid action stream into authority.
async function setup(t) {
  const f=await fixture({productionComposition:true,transformSource:(rel,code)=>
    rel==='src/net/netmatch.js'?code+"\nexport { Boss } from '../boss/boss.js';\n":code});
  class Display {
    constructor(){this.root=new f.THREE.Group();}
    _owner(){return this.actor;} trigger(){} setVisible(){} setHurt(){} setWeapon(){}
    getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}
  }
  const actor=(nid,owner,remote,team)=>{
    const a=new f.Actor({team,name:owner,weapon:'shooter',CharacterClass:Display});a.character.actor=a;
    Object.assign(a,{nid,owner,remote,netLife:0,grounded:true});a.pos.set(0,0,remote?0:7);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,40);return a;
  };
  const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']])),victim=actor(7,'me',false,0),attacker=actor(17,'peer',true,1);
  f.bind(nm,[victim,attacker]);nm.bind(nm.match);Object.assign(f.G,{match:nm.match,actors:[victim,attacker]});
  const boss=Object.assign(Object.create(f.Boss.prototype),{
    sim:true,dead:false,visible:true,invuln:false,pos:new f.THREE.Vector3(0,0,7),hp:1000,maxHp:1000,
    match:nm.match,flashN:0,weakN:0,log:{recv:0,recvDmg:0},
    crabs:new Map([[3,{id:3,x:0,y:0,z:7,hp:100,dead:false}]]),
    model:{flash(){},hitShapes:[{active:true,weak:false,pos:new f.THREE.Vector3(0,1,7),r:1}]},
  });nm.match.boss=boss;t.after(()=>nm.dispose());
  const birth=(ts=1000)=>nativeMainBirth(f,nm,attacker,attacker.weapon,ts);
  const receive=(events,ts=1000)=>{f.clock.set(100+ts-1000);nm.onMessage('peer',{k:'t',ts,u:Math.max(...events.map(e=>e.at(-2))),
    a:[f.packActor(attacker,{f:1})],l:{17:0},e:events});};
  const play=()=>{const events=nm.peers.get('peer').events;while(events.length)nm._play('peer',events.shift());};
  const proof=()=>nm._combatProvenance?.proofs.get('peer')||[];
  const hp=target=>target==='pvp'?victim.hp:target==='boss'?boss.hp:boss.crabs.get(3).hp;
  const hit=target=>nm.onMessage('peer',target==='pvp'?{k:'hit',m:nm.cfg.id,v:7,a:17,l:0,h:1,seq:1,d:36,w:'shooter'}:
    {k:'bhit',m:nm.cfg.id,a:17,l:0,q:1,d:36,w:target==='crablet'?'crab':'shooter',c:target==='crablet'?3:-1,weak:0});
  return {f,nm,attacker,victim,boss,birth,receive,play,proof,hp,hit};
}
const faults=['zero-life','negative-delay','missing-timing','nonfinite-straight','nonfinite-radius','nonfinite-size','nonfinite-gravity','nonfinite-drag','bad-unit','bad-marker'];
for(const target of ['pvp','boss','crablet'])for(const fault of faults)
test(`${target} rejects ${fault} native birth before FIFO/proof/nonce, then accepts the real producer`,async t=>{
  const x=await setup(t),invalid=x.birth();
  if(fault==='zero-life')invalid[12]=0;
  else if(fault==='negative-delay')invalid[11]=-.01;
  else if(fault==='missing-timing')invalid.length=11;
  else if(fault.startsWith('nonfinite-'))invalid[{straight:13,radius:14,size:15,gravity:16,drag:17}[fault.slice(10)]]=null;
  else if(fault==='bad-unit'){
    assert.equal(invalid.at(-3),-1,'actual ordinary native producer unit precedes tick/sequence');invalid[invalid.length-3]=999;
  }else invalid.splice(invalid.length-2,0,true); // depleted marker is invalid for native Shooter
  // Legacy envelope avoids inventing R2 counters for the deliberately short row.
  const before=x.hp(target);x.receive([invalid]);
  assert.equal(x.nm.peers.get('peer').events.length,0,'native-rejected birth must not enter FIFO');
  assert.equal(x.proof().length,0,'native-rejected birth must not mint combat proof');
  x.play();assert.equal(x.f.projectiles.list.length,0,'native playback creates no projectile from that row');
  x.hit(target);assert.equal(x.hp(target),before,'actual native HP is unchanged');
  const peer=x.nm.peers.get('peer');assert.equal(peer.lastHit,undefined);assert.equal(peer.lastBossHit,undefined);
  const valid=x.birth(1000.1);x.receive([valid],1000.1);
  assert.equal(x.proof().length,1,'actual native producer remains admitted');
  assert.equal(x.hp(target),before-36,'the same fresh pending claim can use the genuinely admitted producer');
  assert.equal(x.proof()[0].uses,1);assert.equal(target==='pvp'?peer.lastHit:peer.lastBossHit,1);
  x.play();assert.ok(x.f.projectiles.list.some(p=>p.ghost),'unchanged native playback accepts the real row');
});

test('mixed R2 rejection preserves unrelated valid birth and leaves the rejected sequence reusable',async t=>{
  const x=await setup(t),valid=x.birth(),invalid=structuredClone(valid);
  valid[valid.length-1]=1;invalid[invalid.length-1]=2;invalid[0]-=.001;invalid[12]=0;
  const receive=(events,ts)=>{x.f.clock.set(100+ts-1000);x.nm.onMessage('peer',{k:'t',ts,r:2,u:events.at(-1).at(-2),
    a:[x.f.packActor(x.attacker,{f:1})],l:{17:0},e:events});};
  receive([invalid,valid],1000);
  const peer=x.nm.peers.get('peer');assert.equal(peer.events.length,1);assert.equal(peer.events[0]._netSeq,1);
  assert.equal(x.proof().length,1);assert.equal(x.proof()[0].ts,valid[0]);assert.equal(x.proof()[0].uses,0);
  assert.equal(x.nm._combatProvenance.pending.get('peer')?.length||0,0);x.play();assert.equal(peer._lastEventSeq,1);
  const next=x.birth(1000.1);next[next.length-1]=2;receive([next],1000.1);
  assert.equal(peer.events.length,1);assert.equal(x.proof().length,2);x.play();assert.equal(peer._lastEventSeq,2);
});
