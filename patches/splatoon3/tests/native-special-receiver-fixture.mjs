import assert from 'node:assert/strict';
import { fixture } from '../../network-replication/tests/robustness-fixture.mjs';
import { exportNativeActorPacker } from '../../network-replication/tests/native-packer-export-fixture.mjs';
import { specialNativeProducer } from '../../network-replication/tests/special-native-producer-fixture.mjs';

// Real paid special/controller -> native 20Hz packets -> independent receiver
// realm and native onMessage/_play admission. No receipt/capability is injected.
// Display and flat terrain stay controlled boundaries, as in the producer.
export async function nativeSpecialReceiver(t,id,options) {
  const sent=await specialNativeProducer(t,id,options);
  const f=await fixture({productionComposition:true,transformSource(rel,code){
    code=exportNativeActorPacker(rel,code);
    return rel==='src/net/netmatch.js'?code+"\nexport {tacticoolerGaugeLocked} from '../../patches/splatoon3/runtime/tacticooler-gauge.mjs';\n":code;
  }});
  class Display {
    constructor(){this.root=new f.THREE.Group();}
    _owner(){return this.actor;} trigger(){} update(){} setVisible(){} setHurt(){} setWeapon(){}
    getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}
  }
  const make=(nid,owner,remote,team)=>{
    const a=new f.Actor({team,name:owner,weapon:'shooter',CharacterClass:Display});a.character.actor=a;
    Object.assign(a,{nid,owner,remote,netLife:0,isLocal:!remote,grounded:true});
    a.pos.set(0,0,0);a.aimYaw=0;a.aimPitch=-.5;a.aimDir.set(0,Math.sin(-.5),Math.cos(-.5));a._resolve=()=>{};
    return a;
  };
  const a=make(17,'peer',true,1),local=make(7,'me',false,0);
  a.weapon={...a.weapon,special:id,specialCost:sent.attacker.weapon.specialCost};a.special=a.specialCost();local.pos.set(500,0,500);
  const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
  const match=f.bind(nm,[local,a]);Object.assign(match,{playing:()=>match.state==='playing',canRespawn:()=>false});
  nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[local,a]});t.after(()=>nm.dispose());
  f.G.physics.segment=(start,end,h)=>{h.hit=false;if(start.y>=0&&end.y<0){const u=start.y/(start.y-end.y);h.hit=true;h.point.copy(start).lerp(end,u);h.normal.set(0,1,0);h.dist=start.distanceTo(h.point);}return h;};
  const initial=f.nativePackActor(a);initial[13]=a.specialCost();initial[22]=0;
  nm.onMessage('peer',{k:'t',r:2,ts:1000,u:0,a:[initial],l:{17:0},e:[]});
  const deliver=packet=>{
    const p=JSON.parse(JSON.stringify(packet));f.clock.set(p.ts);f.G.time=p.u/60;nm.onMessage('peer',p);
    const events=nm.peers.get('peer')?.events.splice(0)||[];
    for(const event of events)nm._play('peer',event);
    return events;
  };
  const step=()=>{f.G.time+=1/60;f.projectiles.update(1/60);};
  assert.ok(sent.events.some(e=>e[1]==='ev'&&e[2]==='special:use'),'real paid producer publishes native use');
  return {f,G:f.G,nm,match,a,local,packets:sent.packets,deliver,step};
}
