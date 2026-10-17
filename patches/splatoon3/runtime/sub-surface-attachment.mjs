// Keep placed subs in the contacted native OBB's local frame. This copies the
// stage's existing transform; it does not infer platform velocity or motion.
const finite=v=>v?.isVector3&&[v.x,v.y,v.z].every(Number.isFinite);
const valid=b=>finite(b?.center)&&Array.isArray(b.axes)&&b.axes.length===3&&b.axes.every(finite);
const local=(v,b,direction=false)=>{const p=v.clone();if(!direction)p.sub(b.center);return b.axes.map(a=>p.dot(a));};
function world(out,values,b,direction=false){out.set(0,0,0);if(!direction)out.copy(b.center);for(let i=0;i<3;i++)out.addScaledVector(b.axes[i],values[i]);return out;}
export function captureSubAttachment(G,object,blockId,{towerOnly=false,normal=null,tangent=null,bitangent=null}={}){
  const b=G.level?.blocks?.[blockId];
  if(!valid(b)||!finite(object?.pos)||towerOnly&&(G.match?.mode!=='tower'||G.match.rankedWorld?.towerBlock!==b))return null;
  const a={block:b,blockId,position:local(object.pos,b)};
  if(finite(normal))a.normal=local(normal,b,true);
  if(finite(tangent))a.tangent=local(tangent,b,true);
  if(finite(bitangent))a.bitangent=local(bitangent,b,true);
  if(Number.isFinite(object.yaw))a.heading=local(object.pos.clone().set(Math.sin(object.yaw),0,Math.cos(object.yaw)),b,true);
  return a;
}
export function syncSubAttachment(G,object,a,frame=null){
  const b=a?.block;
  if(!valid(b)||G.level?.blocks?.[a.blockId]!==b)return false;
  world(object.pos,a.position,b);
  if(a.heading){const h=world(object.pos.clone(),a.heading,b,true);object.yaw=Math.atan2(h.x,h.z);}
  if(frame)for(const key of ['normal','tangent','bitangent'])if(a[key]&&finite(frame[key]))world(frame[key],a[key],b,true).normalize();
  return true;
}
export function towerAttachmentFields(G,a){
  return a?.block&&a.block===G.match?.rankedWorld?.towerBlock?{support:1,supportX:a.position[0],supportY:a.position[1],supportZ:a.position[2],
    ...(a.heading?{supportYaw:Math.atan2(a.heading[0],a.heading[2])}:{})}:{};
}
export function replayTowerAttachment(G,object,event){
  const b=G.match?.mode==='tower'&&G.match.rankedWorld?.towerBlock;
  const p=[event.supportX,event.supportY,event.supportZ];
  if(event.support!==1||!valid(b)||!finite(b.half)||!p.every(Number.isFinite)||
    p.some((v,i)=>Math.abs(v)>[b.half.x,b.half.y,b.half.z][i]+.3))return null;
  const a={block:b,blockId:b.id,position:p};
  if(Number.isFinite(event.supportYaw))a.heading=[Math.sin(event.supportYaw),0,Math.cos(event.supportYaw)];
  syncSubAttachment(G,object,a);return a;
}
