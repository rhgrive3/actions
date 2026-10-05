import fs from 'node:fs';
import path from 'node:path';
import { SUB_SPECIAL_FIDELITY, fidelityThrowVelocity } from '../patches/splatoon3/runtime/sub-special-fidelity.mjs';
const OUT = process.argv[2] || 'reports/sub-special-ink-measurement.json';
const CSV = process.argv[3] || 'reports/sub-special-trajectory.csv';
const DT=1/60, GRAVITY=57.6, ORIGIN={x:0,y:1.35,z:0};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const rng=seed=>{let s=seed>>>0;return()=>{s|=0;s=(s+0x6D2B79F5)|0;let t=Math.imul(s^s>>>15,1|s);t=(t+Math.imul(t^t>>>7,61|t))^t;return((t^t>>>14)>>>0)/4294967296;}};
function baselineVelocity(a){const speed=67.2,pitch=clamp(a.aimPitch+.28,-.3,1.1),cp=Math.cos(pitch);return{x:Math.sin(a.aimYaw)*cp*speed+a.vel.x*.4,y:Math.sin(pitch)*speed+1.5,z:Math.cos(a.aimYaw)*cp*speed+a.vel.z*.4};}
function finalVelocity(a){const out={set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}};return fidelityThrowVelocity(a,'bomb',out);}
function trajectory(v0){const p={...ORIGIN},v={...v0},rows=[{t:0,...p,vx:v.x,vy:v.y,vz:v.z}];let apex=p.y,distance=0;for(let i=1;i<=600;i++){v.y-=GRAVITY*DT;p.x+=v.x*DT;p.y+=v.y*DT;p.z+=v.z*DT;apex=Math.max(apex,p.y);distance=Math.hypot(p.x-ORIGIN.x,p.z-ORIGIN.z);rows.push({t:i*DT,x:p.x,y:p.y,z:p.z,vx:v.x,vy:v.y,vz:v.z});if(p.y<=0)break;}return{rows,flightTime:rows.at(-1).t,maxDistance:distance,apex};}
const scenarios=[];for(const aimPitch of [-.6,0,.6])for(const[motion,vel]of Object.entries({standing:{x:0,y:0,z:0},runRight:{x:5.76,y:0,z:0},jumping:{x:0,y:8,z:0}})){const actor={aimYaw:0,aimPitch,vel};scenarios.push({aimPitch,motion,initialBefore:baselineVelocity(actor),initialAfter:finalVelocity(actor),before:trajectory(baselineVelocity(actor)),after:trajectory(finalVelocity(actor))});}
function paintPattern(kind,seed=12345){const r=rng(seed),circles=[{x:0,z:0,r:2.7}],count=kind==='before'?5:15;for(let i=0;i<count;i++){const a=r()*Math.PI*2,reach=2.7*(.6+r()*.4),radius=kind==='before'?.7+r()*.5:SUB_SPECIAL_FIDELITY.bomb.splashAroundPaintRadius;r();circles.push({x:Math.cos(a)*reach,z:Math.sin(a)*reach,r:radius});}return circles;}
function measurePaint(circles,cell=.05){const minX=Math.min(...circles.map(c=>c.x-c.r)),maxX=Math.max(...circles.map(c=>c.x+c.r)),minZ=Math.min(...circles.map(c=>c.z-c.r)),maxZ=Math.max(...circles.map(c=>c.z+c.r));const i0=Math.floor(minX/cell),i1=Math.ceil(maxX/cell),j0=Math.floor(minZ/cell),j1=Math.ceil(maxZ/cell);let painted=0,maxRadius=0;for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=(i+.5)*cell,z=(j+.5)*cell;if(!circles.some(c=>(x-c.x)**2+(z-c.z)**2<=c.r*c.r))continue;painted++;maxRadius=Math.max(maxRadius,Math.hypot(x,z));}return{cell,boundingBox:{minX,maxX,minZ,maxZ},maximumRadius:maxRadius,paintedCells:painted};}
const beforeCircles=paintPattern('before'),afterCircles=paintPattern('after');
const output={sourceWorkstreamBaseline:'5e28dbd16f7829aebd88052ff5f7fdf71f39fdad',referenceVersion:'11.3.0',dt:DT,origin:ORIGIN,gravity:GRAVITY,trajectory:scenarios,damage:{before:[[3.6,180],[7,30]],after:[[3.6,180],[7,30]],changed:false},paint:{seed:12345,before:{metrics:measurePaint(beforeCircles)},after:{metrics:measurePaint(afterCircles)}}};
fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(output,null,2)+'\n');
const csv=['aimPitch,motion,version,flightTime,maxDistance,apex,vx0,vy0,vz0'];for(const s of scenarios)for(const ver of ['before','after']){const q=s[ver],v=s[ver==='before'?'initialBefore':'initialAfter'];csv.push([s.aimPitch,s.motion,ver,q.flightTime,q.maxDistance,q.apex,v.x,v.y,v.z].join(','));}fs.writeFileSync(CSV,csv.join('\n')+'\n');
console.log(JSON.stringify({trajectoryCases:scenarios.length,paintBefore:output.paint.before.metrics,paintAfter:output.paint.after.metrics}));
