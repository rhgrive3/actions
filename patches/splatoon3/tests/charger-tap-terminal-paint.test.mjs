// Tap (8F minimum) and partial Charger shots that expire in the air leave a
// terminal stamp at the stopping point. It used to inherit the DepthHalf
// stretch of the line stamps, pushing its leading edge up to ~2.7WU past the
// 9.033WU minimum range. The line stamps keep their pinned source ellipse.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './weapon-edgecases-fixture.mjs';
async function shoot(frames){
 const f=await fixture({composeProductionAdapters:true}),a=f.make('charger');a.ink=100;
 a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,30);
 const calls=[];
 f.G.paint={sample:()=>1,splat:(c,r,_t,o)=>{calls.push({z:c.z,r,stretch:o.stretchAmt||0});return 0;}};
 f.G.physics={los:()=>true,segment:(_a,_b,h)=>{h.hit=false;return h;},
  raycast:(from,dir,_l,h)=>{if(dir.y<-.5&&from.y>0){h.hit=true;h.dist=from.y;h.point=new f.THREE.Vector3(from.x,0,from.z);h.normal=new f.THREE.Vector3(0,1,0);h.face=0;}else h.hit=false;return h;}};
 const system=new f.Projectiles(new f.THREE.Scene());f.G.actors=[a];
 f.G.projectiles={...f.G.projectiles,fireCharger:(x,w,c)=>system.fireCharger(x,w,c)};
 a.intent.fire=true;f.tick(a,frames);a.intent.fire=false;
 for(let i=0;i<30;i++){f.tick(a);system.update(1/60);}
 return {f,calls,muzzleZ:.3};
}
for(const [frames,label] of [[1,'tap'],[31,'partial']])test(`${label} shot terminal stamp stays on the stopping point`,async()=>{
 const {f,calls,muzzleZ}=await shoot(frames);
 const line=calls.filter(c=>c.z>muzzleZ+.01||c.stretch>0);
 const terminal=line.at(-1);
 assert.ok(terminal,'terminal stamp emitted');
 assert.equal(terminal.stretch,0,'terminal stamp is not stretched past the range');
 const raw=f.profile.weaponsFidelityCompletion.weapons.charger.MoveParam;
 if(frames===1)assert.ok(Math.abs(terminal.z-(muzzleZ+raw.DistanceMinCharge))<1e-6,`tap terminal at min range: ${terminal.z}`);
 // Every line stamp's forward reach (r*(1+stretch) from its centre) ends at the terminal point or before.
 for(const c of line.slice(0,-1))assert.ok(c.z+c.r*(1+c.stretch)<=terminal.z+terminal.r+1e-6,'line stamps do not overshoot the terminal splash');
});
