// Keep placed subs in the contacted native OBB's local frame. This copies the
// stage's existing transform; it does not infer platform velocity or motion.
const FRAME_KEYS=Object.freeze(['normal','tangent','bitangent']);
const HEADING_SCRATCH=new WeakMap();
const finite=v=>{const vector=v?.isVector3;if(!vector)return vector;const x=v.x,y=v.y,z=v.z;return Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z);};
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
  if(a.heading){
    let scratch=HEADING_SCRATCH.get(a);
    // Each attachment owns its vector. Recursive custom vector callbacks use
    // a temporary clone rather than overwriting an in-progress direction.
    if(!scratch||scratch.ctor!==object.pos.constructor){scratch={vector:object.pos.clone(),ctor:object.pos.constructor,busy:false};HEADING_SCRATCH.set(a,scratch);}
    const h=scratch.busy?object.pos.clone():scratch.vector,owned=!scratch.busy;
    if(owned)scratch.busy=true;
    try{world(h,a.heading,b,true);object.yaw=Math.atan2(h.x,h.z);}finally{if(owned)scratch.busy=false;}
  }
  if(frame)for(const key of FRAME_KEYS)if(a[key]&&finite(frame[key]))world(frame[key],a[key],b,true).normalize();
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
