import {exportNativeActorPacker} from './native-packer-export-fixture.mjs';
import {fixture} from './robustness-fixture.mjs';

// Retain the native support producer, packet admission, and receiver-owned flight.
// Only the scene/terrain/socket boundaries come from the shared fixture.
export async function supportNativeProducer(t){
  const f=await fixture({productionComposition:true,transformSource:exportNativeActorPacker});
  class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos);}}
  const make=(nid,owner,remote,team,weapon)=>{const a=new f.Actor({team,name:owner,weapon,CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,isLocal:!remote});a.pos.set(0,0,0);a.aimDir.set(0,-1,0);a.aimYaw=0;a.aimPitch=-.5;a._resolve=()=>{};return a;};
  const owner=make(7,'peer',true,0,'support'),victim=make(8,'me',false,1,'shooter');
  const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
  const match=f.bind(nm,[owner,victim]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[owner,victim]});t.after(()=>nm.dispose());
  let ts=1000,wire=1;
  function deliver(rows,ink=owner.ink,sp=owner.special,lag=0,{from=owner.owner,life=owner.netLife||0}={}){ts+=.05;f.G.time+=.05;f.clock.set(ts);
    // Encode the sender's life consistently in the native adoption/authority
    // fields, then restore the receiver proxy's possibly stale local counter.
    const localLife=owner.netLife;let snap;
    try{owner.netLife=life;snap=f.nativePackActor(owner);}finally{owner.netLife=localLife;}
    snap[12]=ink;snap[13]=sp;
    const events=structuredClone(rows).map(e=>{e[0]=ts-.001-lag;e[e.length-2]=Math.max(0,Math.round((f.G.time-lag)*60)-1);e[e.length-1]=wire++;return e;});
    nm.onMessage(from,{k:'t',r:2,ts,u:Math.round(f.G.time*60),a:[snap],l:{7:life},e:events});
    const peer=nm.peers.get(from);for(const e of peer?.events.splice(0)||[])nm._play(from,e);return events;
  }
  function produce(run){const remote=owner.remote;owner.remote=false;nm.out.length=0;f.clock.set(ts);run();const rows=structuredClone(nm.out);nm.out.length=0;owner.remote=remote;return rows;}
  function step(n=1){for(let i=0;i<n;i++){f.G.time+=1/60;f.projectiles.update(1/60);}}
  return {f,nm,owner,victim,deliver,produce,step};
}
