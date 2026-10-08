import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture,cpuFloor} from './batch03-fixture.mjs';
async function draw(speed=7.92,yaw=0){const f=await batchFixture(),a=f.make('roller'),r=a.weaponRunner;a.isLocal=true;a.yaw=yaw;a.vel.set(Math.sin(yaw)*speed,0,Math.cos(yaw)*speed);r.rolling=true;r.rollT=1.5;r.lastRollPos=a.pos.clone().add(new f.THREE.Vector3(0,0,-1));r._roller(1/60,{fire:true},a.weapon);return {...f,a,r};}
test('#189 real rolling emission scores a continuous 5.6-wide maximum-speed CPU footprint, in both axes',async()=>{
 for(const yaw of [0,Math.PI/2]){const f=await draw(7.92,yaw),floor=cpuFloor(f,20,.025);assert.equal(f.paint.length,5,'3 body bands + 2 floor-only edge bands');f.paint.forEach(e=>floor.splat(e.point,e.radius,e.team,e.opts));const ext=floor.extent(yaw===0?'x':'z');assert.ok(Math.abs(ext.width-5.6)<.06,JSON.stringify(ext));
  const row=Math.floor((.75+10)/.025);for(let k=Math.ceil((10-2.7)/.025);k<Math.floor((10+2.7)/.025);k++){const index=yaw===0?row*floor.face.nu+k:k*floor.face.nu+row;assert.equal(floor.p.grid[index],1,'no unpainted band seams');}
  assert.equal(f.a.weapon.rollWidth,1.9,'damage width unchanged');assert.equal(f.a.weapon.rollSpeed,7.92);assert.equal(f.a.weapon.rollDashTime,1.5);
 }
});
test('#189 low/normal rolling retains existing body paint; no unverified #650 curve is invented',async()=>{
 for(const speed of [1,6.48,7.8]){const f=await draw(speed);assert.equal(f.paint.length,3);assert.ok(f.paint.every(e=>e.radius===.62));}
 const f=await draw();assert.ok(f.paint.slice(3).every(e=>e.opts.kind==='rollFloor'));
});
test('#189 floor alias filters only side paint on real PaintSystem surface projection; existing body walls remain',async()=>{
 const f=await batchFixture(),V=f.THREE.Vector3;const faces=[{origin:new V(),n:new V(0,1,0),u:new V(1,0,0),v:new V(0,0,1),su:20,sv:20,atlas:{},wall:false},{origin:new V(),n:new V(1,0,0),u:new V(0,0,1),v:new V(0,1,0),su:20,sv:20,atlas:{},wall:true}];
 const touched=[],p=Object.create(f.PaintSystem.prototype);Object.assign(p,{level:{faces,blocks:[{faces:[0,1,-1,-1,-1,-1],aabbMin:new V(-2,-2,-2),aabbMax:new V(20,20,20)}],queryBlocks:()=>[0]},growing:[],clock:0,_wetUntil:0,_splatEntryPool:[],_splatGrowthPool:[],_splatPoolStats:{entryArraysCreated:0,growthRecordsCreated:0},_cpuSplat(face){touched.push(face.wall);return 1;},_emitGrowth(){},_rippledNear:()=>true});
 p.splat(new V(.1,.1,1),1,0,{seed:.5,kind:'rollFloor',stretch:new V(0,0,1)});assert.deepEqual(touched,[false]);touched.length=0;p.splat(new V(.1,.1,1),1,0,{seed:.5,kind:'roll',stretch:new V(0,0,1)});assert.deepEqual(touched,[false,true]);
});
test('#189 existing wire recorder/replayer preserves floor-only kind and avoids re-recording',async()=>{
 const f=await batchFixture(),out=[];const nm={applying:false,mute:0,_rec:e=>out.push([0,...e])};f.NetMatch.prototype.recSplat.call(nm,new f.THREE.Vector3(1,.35,2),1.4,0,{kind:'rollFloor',seed:.5,stretch:new f.THREE.Vector3(0,0,1)});assert.equal(out.length,1);assert.equal(out[0][8],'rollFloor');
 f.NetMatch.prototype._play.call(nm,'peer',out[0]);assert.equal(f.paint[0].opts.kind,'rollFloor');assert.equal(out.length,1);
});

test('#189 reduced source composition retains native body paint without a fidelity installer',async()=>{
 const {fixture}=await import('./source-fixture.mjs');const f=await fixture(),a=f.make('roller'),r=a.weaponRunner;
 const paints=[];f.G.actors=[];f.G.paint.splat=(point,radius,team,opts)=>{paints.push({radius,kind:opts.kind});return 0;};
 a.isLocal=true;a.vel.set(0,0,7.92);r.rolling=true;r.rollT=1.5;r.lastRollPos=a.pos.clone().add(new f.THREE.Vector3(0,0,-1));
 r._roller(1/60,{fire:true},a.weapon);assert.equal(paints.length,3);assert.ok(paints.every(p=>p.radius===.62));
});
