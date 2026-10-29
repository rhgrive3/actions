import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import { fixture } from './robustness-fixture.mjs';

// Diagnostic for the still-open owner-forgery gap, deliberately not a green
// security regression. Exit 1 means the self-authored owner stream still
// reaches real native HP without any actual local launch/contact.
const rows = [];
const control=process.env.INKWAVE_COMBAT_RUNTIME_CONTROL;
if(control&&process.env.INKWAVE_BUILT_SITE)throw Error('Source control cannot replace emitted runtime');
const controlSource=control?fs.readFileSync(control,'utf8'):null;
// Copy a complete independently recorded native row to expose the remaining
// valid-birth forgery; this probe itself never invokes the sender's weapon.
const recorded=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../splatoon3/tests/fixtures/native-action-trace-035.json.gz',import.meta.url))));
const nativeBirth=recorded.traces.find(t=>t.id==='shooter').packets.flatMap(p=>p.e||[]).find(e=>e[1]==='p');
for (const target of ['pvp', 'boss', 'crablet']) for (const event of ['absent', 'foreign', 'owner-authored', 'owner-authored-birth']) {
  const f = await fixture({productionComposition:true,transformSource(rel,code){
    if(controlSource&&rel==='patches/network-replication/combat-provenance.mjs')return controlSource;
    return rel === 'src/net/netmatch.js' ? code + "\nexport { Boss } from '../boss/boss.js';\n" : code;
  }});
  class Display {
    constructor(){this.root=new f.THREE.Group();}
    trigger(){} setVisible(){} setHurt(){} setWeapon(){} _owner(){return null;}
  }
  const s=f.makeSession('me','me',[['me','Me'],['peer','Peer'],['third','Third']]);
  const nm=f.makeNetMatch(s);
  const victim=new f.Actor({team:0,name:'Receiver',isLocal:true,weapon:'shooter',CharacterClass:Display});
  Object.assign(victim,{nid:7,owner:'me',netLife:0,remote:false});victim.pos.set(0,0,7);
  const attacker=f.makeActor({nid:17,owner:'peer',remote:true,team:1,roller:false});
  attacker.pos.set(0,0,0);attacker.netLife=0;
  f.bind(nm,[victim,attacker]);f.G.match=nm.match;f.G.actors=[victim,attacker];
  const boss=Object.assign(Object.create(f.Boss.prototype),{
    sim:true,dead:false,visible:true,invuln:false,pos:new f.THREE.Vector3(0,0,7),hp:1000,maxHp:1000,
    match:nm.match,flashN:0,weakN:0,log:{recv:0,recvDmg:0},
    crabs:new Map([[3,{id:3,x:0,y:0,z:7,hp:100,dead:false}]]),
    model:{flash(){},hitShapes:[{active:true,weak:false,pos:new f.THREE.Vector3(0,1,7),r:1}]},
  });
  nm.match.boss=boss;
  f.clock.set(100);
  const birth=structuredClone(nativeBirth);birth[0]=1000;birth[2]=17;
  const e=event==='absent'?[]:event==='owner-authored-birth'?[birth]:[[1000,'ev','weapon:fire',{
    actor:{n:17},weapon:attacker.weapon.id,muzzle:[0,1,0],dir:[0,0,1],
  }]];
  nm.onMessage(event==='foreign'?'third':'peer',{
    k:'t',ts:1000,u:60000,a:[f.packActor(attacker,{f:1})],l:{17:0},e,
  });
  const before={hp:victim.hp,bossHp:boss.hp,crabHp:boss.crabs.get(3).hp,projectiles:f.projectiles.list.length};
  if(target==='pvp')nm.onMessage('peer',{k:'hit',m:nm.cfg.id,v:7,a:17,l:0,h:1,seq:1,d:36,w:'shooter'});
  else nm.onMessage('peer',{k:'bhit',m:nm.cfg.id,a:17,l:0,q:1,d:36,w:target==='crablet'?'crab':'shooter',c:target==='crablet'?3:-1,weak:0});
  const after={hp:victim.hp,bossHp:boss.hp,crabHp:boss.crabs.get(3).hp,projectiles:f.projectiles.list.length};
  const affected=target==='pvp'?'hp':target==='boss'?'bossHp':'crabHp';
  if(!event.startsWith('owner-authored'))assert.equal(before[affected]-after[affected],0);
  const unauthorizedDamage=event.startsWith('owner-authored')?before[affected]-after[affected]:0;
  assert.equal(before.projectiles,0);assert.equal(after.projectiles,0);
  rows.push({target,event,before,after,unauthorizedDamage,actualSenderWeaponInvocations:0,actualReceiverProjectileContacts:0,
    boundary:'real composed NetMatch and native Actor/Boss damage; display/flat world and Boss state stubbed; no socket/browser'});
  nm.dispose();
}
const source=new URL('../combat-provenance.mjs',import.meta.url);
const result={runtimeSourceSHA256:createHash('sha256').update(controlSource||fs.readFileSync(source)).digest('hex'),sourceControl:control||null,
  emittedSite:process.env.INKWAVE_BUILT_SITE||null,
  presentationFallbackBlocked:rows.filter(r=>r.event==='owner-authored').every(r=>r.unauthorizedDamage===0),
  securityAcceptancePassed:rows.every(r=>r.unauthorizedDamage===0),rows};
const json=JSON.stringify(result,null,2)+'\n';
if(process.argv[2])fs.writeFileSync(process.argv[2],json);else process.stdout.write(json);
if(!result.securityAcceptancePassed)process.exitCode=1;
