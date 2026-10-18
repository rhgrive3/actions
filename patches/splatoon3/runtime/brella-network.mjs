// Optional 20Hz Brella presentation sidecar. Only accepted native owner/life
// snapshots can pose cloth. This never creates a gameplay canopy, HP or paint.
import { getWeaponDef } from '../../../src/game/character-weapons.js';
import { showDetachedCanopy, retireDetachedCanopy } from './brella-canopy-visual.mjs';
const TAG='inkwave.brella-view.v1', INSTALL=Symbol.for(TAG), HEADER=13, STRIDE=9, MAX_FLIGHTS=4;
const HELD_INTERRUPT=2|2048|8192|16384|32768;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const bounded=(n,lo,hi)=>Number.isFinite(n)&&n>=lo&&n<=hi;
const family=(a)=>a?.weapon?.catalogRecord?.family==='brella';
const rowIsBrella=(api,id)=>typeof id==='string'&&api.WEAPONS[id]?.catalogRecord?.family==='brella';
const clamp=v=>Math.max(0,Math.min(1,v));

function validPose(row,offset){
  for(let j=0;j<3;j++)if(!bounded(row[offset+j],-100000,100000)||!bounded(row[offset+3+j],-1.01,1.01))return false;
  const length=Math.hypot(row[offset+3],row[offset+4],row[offset+5]);return length>=.9&&length<=1.1;
}
function read(api,raw,actor,snap,tick){
  if(!Array.isArray(raw)||raw[0]!==TAG||raw[1]!==snap.life||!integer(raw[1])||raw[2]!==tick||!integer(tick)||
    (raw[3]!==actor.weapon?.catalogRecord?.id&&raw[3]!==null)||
    !Number.isInteger(raw[4])||raw[4]<0||raw[4]>2||!bounded(raw[5],0,60)||!validPose(raw,6)||
    !Number.isInteger(raw[12])||raw[12]<0||raw[12]>MAX_FLIGHTS||raw.length!==HEADER+STRIDE*raw[12])return null;
  if(raw[4]&&(!family(actor)||!(snap.f&1)||(snap.f&HELD_INTERRUPT)))return null;
  for(let i=0;i<raw[12];i++){
    const k=HEADER+i*STRIDE;
    if(!integer(raw[k])||!raw[k]||!rowIsBrella(api,raw[k+1])||!bounded(raw[k+2],0,10)||!validPose(raw,k+3))return null;
    for(let j=0;j<i;j++)if(raw[HEADER+j*STRIDE]===raw[k])return null;
  }
  // Accepted snapshots own immutable copies. Live send scratch / duplicate
  // packet objects can never mutate a previously buffered pose.
  return raw.slice();
}

function pose(target,row,k,next,q,other=0){
  target.pos.set(row[k]+(other?(next[other]-row[k])*q:0),row[k+1]+(other?(next[other+1]-row[k+1])*q:0),row[k+2]+(other?(next[other+2]-row[k+2])*q:0));
  target.dir.set(row[k+3]+(other?(next[other+3]-row[k+3])*q:0),row[k+4]+(other?(next[other+4]-row[k+4])*q:0),row[k+5]+(other?(next[other+5]-row[k+5])*q:0)).normalize();
}

export function installBrellaNetwork(api){
  const {NetMatch,Actor,Projectiles,THREE,G}=api,P=NetMatch?.prototype;
  if(!P)throw Error('Brella presentation requires native NetMatch');
  if(Object.hasOwn(P,INSTALL))return;
  Object.defineProperty(P,INSTALL,{value:true});
  const localRows=new WeakMap();
  function pack(actor,message){
    if(actor.remote||!integer(actor.nid))return null;
    let row=localRows.get(actor);
    if(!row){row=new Array(HEADER);localRows.set(actor,row);}
    const s=actor.weaponRunner?.catalogState,c=s?.canopy;
    row[0]=TAG;row[1]=actor.netLife??0;row[2]=message.u;row[3]=family(actor)?actor.weapon.catalogRecord.id:null;
    row[4]=family(actor)&&actor.alive&&actor.form==='kid'&&!actor.specialActive&&!actor.superJumpState&&!actor.weaponRunner?.aimingSub
      ? c?.open?2:c?.preparing?1:0 : 0;
    row[5]=family(actor)&&Number.isFinite(s?.naked)?Math.max(0,s.naked):0;
    const pos=c?.pos,dir=c?.dir;
    row[6]=pos?.x??0;row[7]=pos?.y??0;row[8]=pos?.z??0;
    row[9]=dir?.x??0;row[10]=dir?.y??0;row[11]=dir?.z??1;
    row[12]=G.projectiles?.s3WriteBrellaCanopyPresentation?.(actor,row,HEADER,MAX_FLIGHTS)||0;
    row.length=HEADER+STRIDE*row[12];
    return family(actor)||row[12]?row:null;
  }
  function retireFlights(view){if(view)for(const flight of view.flights.values())retireDetachedCanopy(flight);view?.flights.clear();}
  function clear(actor,watermark=false,ownerChanged=false){
    if(!actor?.remote)return;
    const view=actor.character?.s3BrellaPresentation;
    if(view){view.canopy=null;view.naked=0;retireFlights(view);}
    if(watermark&&actor.net){
      const n=actor.net,latest=Math.max(n.buf?.at(-1)?.t??-Infinity,n.cur?.t??-Infinity);
      n.s3BrellaInvalidAt=Math.max(n.s3BrellaInvalidAt??-Infinity,latest);
      if(ownerChanged){n.s3BrellaInvalidAt=undefined;if(view)view.owner=null;}
    }
  }
  function updateView(match,actor){
    if(!actor?.remote||!actor.character)return;
    const n=actor.net,S=n?.ready?n.cur:null,row=S?.s3Brella;
    let view=actor.character.s3BrellaPresentation;
    const waiting=n?.spawnPending&&S?.tp===n.deathTp;
    if(!row||S.s3BrellaOwner!==actor.owner||row[1]!==n.lastLife||waiting){clear(actor);return;}
    let source=null,next=null;
    for(let i=0;i<n.buf.length;i++)if(n.buf[i].s3Brella===row){source=n.buf[i];next=n.buf[i+1]||null;break;}
    if(!source||source.t<=(n.s3BrellaInvalidAt??-Infinity)){clear(actor);return;}
    if(!view){view={networkRemote:true,owner:actor.owner,life:row[1],canopy:null,naked:0,held:{pos:new THREE.Vector3(),dir:new THREE.Vector3()},flights:new Map()};actor.character.s3BrellaPresentation=view;}
    if(view.owner!==actor.owner||view.life!==row[1])retireFlights(view);
    view.owner=actor.owner;view.life=row[1];
    const nextRow=next?.s3Brella;
    const compatible=nextRow&&nextRow[1]===row[1]&&next.s3BrellaOwner===actor.owner&&next.tp===source.tp;
    const q=compatible&&next.t>source.t?clamp((S.t-source.t)/(next.t-source.t)):0;
    const held=!!row[4]&&actor.alive&&(S.f&1)&&!(S.f&HELD_INTERRUPT);
    view.naked=row[5];
    if(held){
      pose(view.held,row,6,nextRow,q,compatible&&nextRow[4]===row[4]?6:0);view.held.pos.add(n.err);
      view.held.open=row[4]===2;view.held.preparing=row[4]===1;view.held.launched=false;view.canopy=view.held;
    }else view.canopy=null;
    const age=Math.max(0,(match.peers.get(actor.owner)?.tr??S.t)-source.t);
    for(const flight of view.flights.values())flight.seen=false;
    for(let i=0;i<row[12];i++){
      const k=HEADER+i*STRIDE,id=row[k];if(row[k+2]<=age)continue;
      let flight=view.flights.get(id);
      if(!flight){flight={pos:new THREE.Vector3(),dir:new THREE.Vector3(),visualSource:getWeaponDef(row[k+1])};view.flights.set(id,flight);}
      let other=0;
      if(compatible)for(let j=0;j<nextRow[12];j++)if(nextRow[HEADER+j*STRIDE]===id&&nextRow[HEADER+j*STRIDE+1]===row[k+1]){other=HEADER+j*STRIDE+3;break;}
      pose(flight,row,k+3,nextRow,q,other);flight.seen=true;
      showDetachedCanopy(api,actor,flight,api.WEAPONS[row[k+1]].catalogRecord.id);
      if(flight.mesh)flight.mesh.userData.networkRemoteCanopy=true;
    }
    for(const [id,flight]of view.flights)if(!flight.seen){retireDetachedCanopy(flight);view.flights.delete(id);}
  }
  const send=P._sendTick;
  P._sendTick=function(...args){
    const session=this.s,transport=session?.tr;
    if(!transport||typeof transport.broadcast!=='function')return send.apply(this,args);
    if(this._s3BrellaTransport!==transport){
      this._s3BrellaTransport=transport;const wrapped=Object.create(transport),match=this;
      wrapped.broadcast=function(message,...rest){
        if(message?.k==='t'&&Array.isArray(message.a)){
          const rows=match._s3BrellaSidecar||(match._s3BrellaSidecar=Object.create(null));
          for(const key in rows)delete rows[key];let count=0;
          for(const sample of message.a){const actor=match.byNid.get(sample?.[0]);if(!actor)continue;const row=pack(actor,message);if(row){rows[actor.nid]=row;count++;}}
          if(count)message.bc=rows;
        }
        // Native Transport.broadcast serializes synchronously with JSON.stringify;
        // the optional row/map scratch is reused on the next network tick.
        return transport.broadcast.call(transport,message,...rest);
      };this._s3BrellaWrappedTransport=wrapped;
    }
    const wrapped=this._s3BrellaWrappedTransport;session.tr=wrapped;
    try{return send.apply(this,args);}finally{if(session.tr===wrapped)session.tr=transport;}
  };
  const tick=P._tick;
  P._tick=function(from,packet,...args){
    const result=tick.call(this,from,packet,...args);
    if(!Array.isArray(packet?.a)||packet.a.length>128)return result;
    const points=this.peers.get(from)?.physicsPoints;
    const acceptedTick=points?.length>=2&&points[points.length-2]===packet.ts&&points[points.length-1]===packet.u;
    for(const row of packet.a){
      const actor=this.byNid.get(row?.[0]),snap=actor?.net?.buf?.at(-1);
      if(!actor?.remote||actor.owner!==from||!snap||snap.t!==packet.ts||Object.hasOwn(snap,'s3Brella'))continue;
      snap.s3BrellaOwner=from;snap.s3Brella=null;
      const raw=packet.bc&&typeof packet.bc==='object'&&!Array.isArray(packet.bc)&&Object.hasOwn(packet.bc,actor.nid)?packet.bc[actor.nid]:null;
      if(acceptedTick)snap.s3Brella=read(api,raw,actor,snap,packet.u);
    }return result;
  };
  const apply=P.applyRemote;
  P.applyRemote=function(actor,...args){updateView(this,actor);return apply.call(this,actor,...args);};
  for(const name of ['_remoteSplat','_remoteRespawn','_adopt','_remove']){
    const method=P[name];P[name]=function(actor,...args){clear(actor,true,name==='_adopt'||name==='_remove');return method.call(this,actor,...args);};
  }
  const leave=P.onLeave;
  P.onLeave=function(id,...args){for(const actor of this.byNid.values())if(actor.owner===id)clear(actor,true,true);return leave.call(this,id,...args);};
  const dispose=P.dispose;
  P.dispose=function(...args){for(const actor of this.byNid.values())clear(actor,true,true);return dispose.apply(this,args);};
  const setWeapon=Actor.prototype.setWeapon;
  Actor.prototype.setWeapon=function(...args){clear(this,true);return setWeapon.apply(this,args);};
  const clearProjectiles=Projectiles.prototype.clear;
  Projectiles.prototype.clear=function(...args){for(const actor of G.actors||[])clear(actor,true);return clearProjectiles.apply(this,args);};
}
