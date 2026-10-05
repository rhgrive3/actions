import {test} from 'node:test';
import assert from 'node:assert/strict';
import {character} from './real-character-fixture.mjs';
// Gait alternation, side steps and direction changes on the complete skinned
// Character. Thresholds reject visible regressions in INKWAVE units; they are
// not Switch measurements or Nintendo joint curves.
const TAU=Math.PI*2,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// segments: [ticks, dx, dz, speed, yaw?] with world travel (dx,dz); yaw is the body
// yaw to turn toward (rad, limited turn rate) and stays fixed when omitted. The
// root velocity changes at the public ground acceleration (config accelGround).
function drive(api,ch,state,segments,{turnRate=9}={}){
 ch.root.position.set(0,0,0);ch.root.rotation.y=0;ch.rootInit=false;ch.feetValid=false;ch.replant=true;
 Object.assign(state,{speed:0,localMove:{x:0,z:0},grounded:true,form:'kid',firing:false});
 for(let i=0;i<60;i++)ch.update(1/60,state);
 const C=api.CHARACTER_CHANNELS,rows=[],prev=[true,true],last=[null,null],accel=42/60;let tick=0,vx=0,vz=0;
 for(const [n,dx,dz,speed,yaw] of segments)for(let k=0;k<n;k++,tick++){
  const ex=dx*speed-vx,ez=dz*speed-vz,e=Math.hypot(ex,ez),k=e>accel?accel/e:1;vx+=ex*k;vz+=ez*k;const v=Math.hypot(vx,vz);
  if(yaw!==undefined){const d=wrap(yaw-ch.root.rotation.y);ch.root.rotation.y+=Math.max(-turnRate/60,Math.min(turnRate/60,d));}
  ch.root.position.x+=vx/60;ch.root.position.z+=vz/60;
  const c=Math.cos(ch.root.rotation.y),s=Math.sin(ch.root.rotation.y);
  // kid space: +x left, +z forward
  const ux=v>1e-6?vx/v:0,uz=v>1e-6?vz/v:0;Object.assign(state,{speed:v,localMove:{x:-(ux*c-uz*s),z:ux*s+uz*c}});ch.update(1/60,state);ch.root.updateMatrixWorld(true);
  const hy=ch.yaw+ch.hipTwist,R=ch.root.position,F=ch.feet;
  const local=f=>({lat:(f.cw.x-R.x)*Math.cos(hy)-(f.cw.z-R.z)*Math.sin(hy),fwd:(f.cw.x-R.x)*Math.sin(hy)+(f.cw.z-R.z)*Math.cos(hy)});
  const kx=vx*c-vz*s,kz=vx*s+vz*c,kl=Math.hypot(kx,kz);
  const row={tick,v,heading:kl>.5?(ch.mdx*kx+ch.mdz*kz)/kl:1,moving:ch.moving,duty:ch.duty,cad:ch.cad,lift:[false,false],catch:[false,false],slide:0,jump:0,
   hips:ch.P[C.HIPS+1],chest:ch.P[C.CHEST+1],both:F[0].sw&&F[1].sw,L:local(F[0]),R:local(F[1])};
  F.forEach((f,j)=>{
   if(!f.planted&&prev[j]){row.lift[j]=true;row.catch[j]=!!f.offbeat;}
   if(last[j]){if(f.planted&&last[j].planted)row.slide=Math.max(row.slide,f.cw.distanceTo(last[j].cw));row.jump=Math.max(row.jump,f.cw.distanceTo(last[j].cw));}
   prev[j]=f.planted;last[j]={planted:f.planted,cw:f.cw.clone()};
  });
  rows.push(row);
 }
 return rows;
}
// Offset of each right lift-off after the preceding left lift-off, in cycles.
function offsets(rows,from,to){
 const out=[];let left=null;
 for(const r of rows.slice(from,to)){if(r.lift[0])left=r;if(r.lift[1]&&left)out.push((r.tick-left.tick)*r.cad/60);}
 return out;
}
const steady=[['forward',0,1,4.2],['backward',0,-1,4.2],['left strafe',1,0,4.2],['right strafe',-1,0,4.2],
 ['forward left',.7071,.7071,4.2],['forward right',-.7071,.7071,4.2],['back left',.7071,-.7071,4.2],['back right',-.7071,-.7071,4.2],
 ['slow left strafe',1,0,.6],['walking right strafe',-1,0,1.5],['running left strafe',1,0,5.76],['slow forward',0,1,.35]];
test('legs alternate in steady walking, running, strafing and diagonals on the actual rig',async t=>{
 const {api,ch,state}=await character();
 for(const [name,dx,dz,v] of steady)await t.test(name,()=>{
  const rows=drive(api,ch,state,[[240,dx,dz,v]]),tail=rows.slice(90);
  const off=offsets(rows,90,240);
  assert.ok(off.length>=(v<1?1:4),`enough steps (${off.length})`);
  for(const o of off)assert.ok(Math.abs(o-.5)<=.08,`lift-offs alternate half a cycle apart (${off.map(x=>x.toFixed(2))})`);
  assert.equal(tail.filter(r=>r.catch[0]||r.catch[1]).length,0,'steady travel needs no catch steps');
  assert.ok(tail.every(r=>r.slide<1e-8),'planted shoes stay locked in world space');
  if(tail[0].duty>.5)assert.equal(tail.filter(r=>r.both).length,0,'a walking gait always keeps one foot down');
  // Side by side the shoes keep a gap across the pelvis; a running leg may pass
  // the other one far ahead or behind, never through it.
  const crossed=tail.filter(r=>Math.abs(r.L.fwd-r.R.fwd)<.2&&r.L.lat-r.R.lat<.06);
  assert.equal(crossed.length,0,`no crossover beside the support foot (${crossed.map(r=>`${r.tick}:${(r.L.lat-r.R.lat).toFixed(3)}/${(r.L.fwd-r.R.fwd).toFixed(3)}`)})`);
 });
});
const turns=[
 ['stop and start',[[120,0,1,4.2],[45,0,1,0],[150,0,1,4.2]]],
 ['90 degree turn',[[120,0,1,4.2,0],[150,1,0,4.2,Math.PI/2]]],
 ['180 degree reversal',[[120,0,1,4.2,0],[180,0,-1,4.2,Math.PI]]],
 ['strafe flip left to right',[[120,1,0,4.2],[180,-1,0,4.2]]],
 ['forward to backward',[[120,0,1,4.2],[180,0,-1,4.2]]],
 ['walking strafe flip',[[120,1,0,1.5],[180,-1,0,1.5]]],
];
test('direction changes keep contacts planted, the pelvis continuous and the legs re-alternating',async t=>{
 const {api,ch,state}=await character();
 for(const [name,segments] of turns)await t.test(name,()=>{
  const rows=drive(api,ch,state,segments),change=segments[0][0],end=rows.length;
  assert.ok(rows.every(r=>r.slide<1e-8),'no planted shoe slides through the turn');
  for(let i=1;i<rows.length;i++){
   assert.ok(Math.abs(wrap(rows[i].hips-rows[i-1].hips))<.12,`pelvis yaw is continuous at tick ${i}`);
   assert.ok(Math.abs(wrap(rows[i].chest-rows[i-1].chest))<.12,`chest yaw is continuous at tick ${i}`);
   // A fast swing moves a shoe ~0.2-0.3 per tick on consecutive ticks; a pop
   // is a single large move between small ones.
   const near=Math.max(rows[i-1].jump,rows[i+1]?.jump??0);
   assert.ok(rows[i].jump<.4&&(rows[i].jump<.15||rows[i].jump<3*near),`no shoe teleports at tick ${i} (${rows[i].jump.toFixed(3)})`);
  }
  const catches=rows.slice(change).filter(r=>r.catch[0]||r.catch[1]).length;
  assert.ok(catches<=2,`a reversal needs at most two catch steps (${catches})`);
  const off=offsets(rows,end-80,end);
  assert.ok(off.length>=1&&off.every(o=>Math.abs(o-.5)<=.08),`legs alternate again after the change (${off.map(x=>x.toFixed(2))})`);
  const late=rows.slice(change+40);
  // The displayed travel heading follows a reversal instead of keeping the old side.
  assert.ok(late.every(r=>r.heading>.9),`travel heading follows the new direction (${Math.min(...late.map(r=>r.heading)).toFixed(2)})`);
  const crossed=late.filter(r=>Math.abs(r.L.fwd-r.R.fwd)<.2&&r.L.lat-r.R.lat<.06);
  assert.equal(crossed.length,0,`no crossover after the change settles (${crossed.map(r=>`${r.tick}:${(r.L.lat-r.R.lat).toFixed(3)}`)})`);
 });
});
