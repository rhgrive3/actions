// Bounds mirror all-specials' local world-device producers, including their
// q3 lifetime / q2 radius wire rounding. These are protocol admission limits;
// they do not change the local source clocks, geometry or ownership checks.
const WORLD_KINDS=Object.freeze({
  splattercolorScreen:['screen'],waveBreaker:['wave','waveFront'],
  superChump:['decoy'],tripleInkstrike:['marker','strike'],booyahBomb:['booyahBlast'],
});
const LIMITS=Object.freeze({
  screen:{duration:680/60,radius:15,hp:0},
  wave:{duration:390/60,radius:27,hp:480},waveFront:{duration:216/60,radius:27,hp:0},
  decoy:{duration:318/60,radius:7.2,hp:60},
  marker:{duration:133/60,radius:7.7,hp:0},strike:{duration:51/60,radius:7.7,hp:0},
  booyahBlast:{duration:80/60,radius:12.6,hp:0},
});
const finite=Number.isFinite;
function optionalRange(event,key,min,max){const value=event[key];return value===undefined||typeof value==='number'&&finite(value)&&value>=min&&value<=max;}
export function validSpecialWorldPayload(event){
  if(!Number.isSafeInteger(event?.object)||event.object<=0||event.action==='objectHit')return true;
  const kinds=WORLD_KINDS[event.id];
  if(!kinds)return event.kind===undefined;
  const kind=event.kind===undefined?kinds[0]:event.kind;
  if(!kinds.includes(kind))return false;
  const limits=LIMITS[kind];
  if(!optionalRange(event,'duration',0,limits.duration+.0005)||
     !optionalRange(event,'radius',0,limits.radius+.005)||!optionalRange(event,'hp',0,limits.hp)||
     !optionalRange(event,'specialPowerAP',0,57)||!optionalRange(event,'waveFrame',0,216/60))return false;
  if(kind==='screen'&&((event.width!==undefined&&event.width!==15)||(event.height!==undefined&&event.height!==9)))return false;
  if(!optionalRange(event,'vx',-500,500)||!optionalRange(event,'vy',-500,500)||!optionalRange(event,'vz',-500,500)||
     !optionalRange(event,'gravity',0,1000)||!optionalRange(event,'airResist',0,1-Number.EPSILON))return false;
  return true;
}
// A bounded replay working set, separate from source-authored device counts.
// One actor can retain several complete 12-decoy volleys before this guard.
export const REMOTE_WORLD_OBJECTS_PER_ACTOR=64;
export const REMOTE_WORLD_OBJECTS_TOTAL=512;
export function admitsRemoteWorldBirth(objects,actor,event){
  if(!['deploy','device','screen','balloon','marker'].includes(event.action)||!Number.isSafeInteger(event.object)||event.object<=0)return true;
  let owned=0,total=0;
  for(const o of objects){
    if(o.dead)continue;
    if(o.owner===actor&&o.activation===event.activation&&o.serial===event.object&&o.id===event.id)return true;
    if(o.remote||o.owner?.remote){total++;if(o.owner===actor)owned++;}
  }
  return owned<REMOTE_WORLD_OBJECTS_PER_ACTOR&&total<REMOTE_WORLD_OBJECTS_TOTAL;
}
