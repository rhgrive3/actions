import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './robustness-fixture.mjs';

const control=process.env.INKWAVE_COMBAT_RUNTIME_CONTROL;
if(control&&process.env.INKWAVE_BUILT_SITE)throw Error('Source negative control cannot replace an emitted runtime');
const controlSource=control?fs.readFileSync(control,'utf8'):null;

// Actual composed native flight and receiver damage owners. Character/muzzle,
// dry paint, flat terrain and stationary Boss state are explicit component
// inputs. These are not browser/socket or complete server-authority tests.
async function setup(t,{family='shooter',catalog=false}={}) {
  const f=await fixture({productionComposition:true,transformSource(rel,code){
    if(controlSource&&rel==='patches/network-replication/combat-provenance.mjs')return controlSource;
    return rel==='src/net/netmatch.js'?code+"\nexport { Boss } from '../boss/boss.js';\n":code;
  }});
  class Display {
    constructor(){this.root=new f.THREE.Group();}
    _owner(){return this.actor;} trigger(){} setVisible(){} setHurt(){} setWeapon(){}
    getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}
  }
  const weapon=catalog?Object.values(f.WEAPONS).find(w=>w.catalogRecord?.family===family):f.WEAPONS[family];
  assert.ok(weapon,'installed native weapon');
  const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
  const attacker=new f.Actor({team:1,name:'Attacker',weapon:weapon.id,CharacterClass:Display});
  attacker.character.actor=attacker;
  Object.assign(attacker,{nid:17,owner:'peer',netLife:0,remote:true,grounded:true});
  attacker.pos.set(0,0,0);attacker.aimPoint.set(0,1.05,3);
  const victims=[7,8].map((nid,index)=>{
    const a=new f.Actor({team:0,name:'Receiver '+nid,weapon:'shooter',CharacterClass:Display});
    a.character.actor=a;
    Object.assign(a,{nid,owner:'me',netLife:0,remote:false});a.pos.set(0,0,3+index*2);
    return a;
  });
  f.bind(nm,[...victims,attacker]);nm.bind(nm.match);
  Object.assign(f.G,{match:nm.match,actors:[...victims,attacker]});
  const boss=Object.assign(Object.create(f.Boss.prototype),{
    sim:true,dead:false,visible:true,invuln:false,pos:new f.THREE.Vector3(0,0,3),
    hp:1000,maxHp:1000,match:nm.match,flashN:0,weakN:0,log:{recv:0,recvDmg:0},
    crabs:new Map([[3,{id:3,x:0,y:0,z:5,hp:1000,dead:false}]]),
    model:{flash(){},hitShapes:[{active:true,weak:false,pos:new f.THREE.Vector3(0,1,3),r:1}]},
  });
  nm.match.boss=boss;f.clock.set(100);t.after(()=>nm.dispose());
  const hit=(v=7,h=1)=>nm.onMessage('peer',{k:'hit',m:nm.cfg.id,v,a:17,l:0,h,seq:h,d:10,w:weapon.id});
  const bossHit=(c=-1,q=1)=>nm.onMessage('peer',{k:'bhit',m:nm.cfg.id,a:17,l:0,q,d:10,w:c<0?weapon.id:'crab',c,weak:0});
  function fire(source='event',ts=1000) {
    const event=source==='event'?[ts,'ev','weapon:fire',{
      actor:{n:17},weapon:weapon.id,muzzle:[0,1.05,.3],dir:[0,0,1],
    }]:[ts,'p',17,'shot',weapon.id,0,1.05,.3,0,0,50];
    f.clock.set(100+ts-1000);
    nm.onMessage('peer',{k:'t',ts,u:60000+Math.round((ts-1000)*60),a:[f.packActor(attacker,{f:1})],l:{17:0},e:[event]});
    return nm._combatProvenance.proofs.get('peer').at(-1);
  }
  return {f,nm,attacker,victims,boss,weapon,fire,hit,bossHit};
}

for(const family of ['shooter','dualies','splatling'])for(const catalog of [false,true]) {
  const label=(catalog?'catalogue ':'legacy ')+family;
  test(`${label} native round retires after the first actual body contact`,async t=>{
    const x=await setup(t,{family,catalog}),{f,attacker}=x;
    attacker.remote=false;
    if(catalog) {
      for(let i=0;i<300&&!f.projectiles.list.length;i++) {
        f.G.time+=1/60;
        attacker.weaponRunner.update(1/60,{fire:i<130,firePressed:i===0,fireReleased:i===130,sub:false,subReleased:false});
      }
    } else f.projectiles[{shooter:'fireShooter',dualies:'fireDualies',splatling:'fireSplatling'}[family]](attacker,x.weapon,0,0);
    assert.equal(f.projectiles.list.length,1,'one actual native round, not a reported birth');
    const p=f.projectiles.list[0],contacts=[];
    f.projectiles.applyHit=(a,v,d,w)=>contacts.push({a,v,d,w});
    let retired=false;
    for(let i=0;i<300&&!retired;i++) {f.G.time+=1/60;retired=f.projectiles._step(p,1/60);}
    assert.equal(retired,true);assert.equal(contacts.length,1);
    assert.equal(contacts[0].v,x.victims[0]);assert.ok(contacts[0].d>0);
    assert.equal(x.victims[1].hp,100,'the rear body never receives this round');
  });

  for(const source of ['event','birth'])for(const queued of [false,true]) {
    test(`${label} ${source} ${queued?'queued':'direct'} proof cannot damage two local victims`,async t=>{
      const x=await setup(t,{family,catalog});
      let p;if(!queued)p=x.fire(source);
      x.hit(7,1);x.hit(8,2);
      if(queued)p=x.fire(source);
      assert.deepEqual(x.victims.map(v=>v.hp),[90,100]);
      assert.equal(p.uses,1);assert.equal(x.nm.peers.get('peer').lastHit,1);
      x.fire(source,1000.1);
      assert.deepEqual(x.victims.map(v=>v.hp),[90,90],'a distinct admitted round can deliver the deferred second claim');
      assert.equal(x.nm.peers.get('peer').lastHit,2);
    });
    test(`${label} ${source} ${queued?'queued':'direct'} proof cannot damage Boss and crablet`,async t=>{
      const x=await setup(t,{family,catalog});
      let p;if(!queued)p=x.fire(source);
      x.bossHit(-1,1);x.bossHit(3,2);
      if(queued)p=x.fire(source);
      assert.equal(x.boss.hp,990);assert.equal(x.boss.crabs.get(3).hp,1000);
      assert.equal(p.uses,1);assert.equal(x.nm.peers.get('peer').lastBossHit,1);
      x.fire(source,1000.1);
      assert.equal(x.boss.crabs.get(3).hp,990,'a distinct admitted round retains crablet damage');
      assert.equal(x.nm.peers.get('peer').lastBossHit,2);
    });
  }
}
