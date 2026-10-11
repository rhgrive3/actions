import { fidelitySlosherPaintBirth, fidelitySlosherImpactPaint } from '../splatoon3/runtime/weapons-fidelity.mjs';
export const SLOSHER_IMPACT_TAG='inkwave-slosher-impact-v1';
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const r2=n=>Math.round(n*100)/100;
export function slosherPaintMetaValid(m){return Array.isArray(m)&&m.length===10&&m[0]===SLOSHER_IMPACT_TAG&&typeof m[1]==='string'&&safe(m[2])&&safe(m[3])&&safe(m[4])&&m[4]>0&&safe(m[5])&&m[5]>0&&vec(m[6])&&vec(m[7])&&vec(m[8])&&vec(m[9]);}
export function slosherBirthInkMeta(nm,p){
 if(p.type!=='slosh'||p.wid!=='slosher'||p.ghost||p.owner?.remote)return p.inkMeta||null;
 return {...p.inkMeta,s3SlosherPaintBirth:['inkwave-slosher-birth-v1',nm.cfg?.id??'',p.owner?.netLife??0]};
}
export function recordSlosherPaintBirth(nm,p,event){
 const birth=fidelitySlosherPaintBirth(event);
 p._s3SlosherPaintBirth=null;
 if(!birth||p.ghost||p.owner?.remote||!safe(event?._netSeq)||event._netSeq<1)return;
 p._s3SlosherPaintBirth=[SLOSHER_IMPACT_TAG,birth.epoch,p.owner.nid,birth.life,event._netSeq,birth.projectileId];
}
export function slosherImpactMetadata(p,hit){
 const m=p?._s3SlosherPaintBirth;
 if(!m||p.ghost||p.owner?.remote||p._netId!==m[5]||p.owner?.nid!==m[2]||p.wid!=='slosher')return null;
 return [...m,[p.start.x,p.start.y,p.start.z],[hit.point.x,hit.point.y,hit.point.z],[hit.normal.x,hit.normal.y,hit.normal.z],[p.vel.x,p.vel.y,p.vel.z]];
}
export function slosherPaintBirth(event){return fidelitySlosherPaintBirth(event);}
export function slosherImpactMatches(b,e){
 const m=e[15];if(!slosherPaintMetaValid(m)||m[5]!==b.projectileId)return false;
 const [origin,point,normal]=m.slice(6);
 if(origin.some((v,i)=>r2(v)!==[b.start.x,b.start.y,b.start.z][i])
   ||Math.abs(Math.hypot(...normal)-1)>1e-6||e[7]!==b.seed
   ||(e[8]!==0&&e[8]!==undefined)||(e[13]!==-1&&e[13]!==undefined))return false;
 if(point.some((v,i)=>v+normal[i]*.14!==e[2+i]))return false;
 // Match the native normalize -> flatten -> near-vertical fallback exactly.
 // Gravity/braking changes slope, but may not invent another horizontal heading.
 const velocity=m[9],speed2=velocity.reduce((sum,v)=>sum+v*v,0);
 if(!Number.isFinite(speed2))return false;
 const horizontal=Math.hypot(velocity[0],velocity[2]),launchHorizontal=Math.hypot(b.heading.x,b.heading.z);
 if(horizontal>0&&(launchHorizontal===0||Math.abs(velocity[0]/horizontal-b.heading.x/launchHorizontal)>1e-9||Math.abs(velocity[2]/horizontal-b.heading.z/launchHorizontal)>1e-9))return false;
 const invSpeed=1/(Math.sqrt(speed2)||1),nx=velocity[0]*invSpeed,nz=velocity[2]*invSpeed;
 const flat2=nx*nx+nz*nz,fallback=flat2<1e-4,invFlat=1/(Math.sqrt(flat2)||1);
 const dx=fallback?0:nx*invFlat,dz=fallback?1:nz*invFlat;
 if(e[10]!==0||Math.abs(e[9]-dx)>1e-9||Math.abs(e[11]-dz)>1e-9)return false;
 const paint=fidelitySlosherImpactPaint({start:{x:origin[0],y:origin[1],z:origin[2]},fidelitySloshUnit:b.unit,fidelitySloshIndex:b.index},{x:point[0],y:point[1],z:point[2]});
 return !!paint&&paint.radius===e[5]&&paint.stretchAmt===e[12];
}
