import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

// Actual bundled shooter pack, real InkVolumes and source-loaded Character.
// Matrix uploads are inspected on CPU; WebGL acceptance is a separate receipt.
const extraExports="export { InkVolumes } from './patches/local-quality/ink-volume/runtime.mjs';\nexport { unpackVolumes } from './patches/local-quality/ink-volume/pack.mjs';\nexport { submitInkVolume } from './patches/local-quality/ink-volume/recipes.mjs';\nexport { shotTailFrames } from './patches/splatoon3/runtime/weapons-fidelity.mjs';\nexport { FixedClock } from './patches/splatoon3/runtime/clock.mjs';\nexport { NetMatch } from './src/net/netmatch.js';\nexport { MAP_LAYOUTS } from './src/world/maps.js';\nexport { map3ArtColliders } from './src/world/stages/map3-art.js';\nexport const volumeBytes=Uint8Array;";
const plain=x=>JSON.parse(JSON.stringify(x));
async function world(){return sourceLoadedActorFixture({random:()=>.5,extraExports});}
function engine(f){
 const dir=new URL('../../local-quality/ink-volume/assets/shooter/',import.meta.url);
 const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',dir))),raw=gunzipSync(fs.readFileSync(new URL(manifest.binary,dir)));
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),manifest.binarySHA256,'actual bundled pack digest');
 const e=new f.InkVolumes(new f.THREE.Group(),{sunDir:new f.THREE.Vector3(0,1,0),sunCol:new f.THREE.Color('white'),sky:new f.THREE.Color('gray'),ground:new f.THREE.Color('gray')},{capacity:128,triangleBudget:600000});
 e.register('shooter',f.unpackVolumes(manifest,new f.volumeBytes(raw).buffer));return e;
}
function matrices(f,e){
 const a=e.assets.get('shooter'),rod=a.patterns[0].frames[0][0].mesh,tips=a.patterns[1].frames[0][0].mesh;
 assert.equal(rod.count,1);assert.equal(tips.count,2);
 const m=new f.THREE.Matrix4(),read=(mesh,i)=>{mesh.getMatrixAt(i,m);return Array.from(m.elements);};
 const r=read(rod,0),head=read(tips,0),back=read(tips,1),half=a.patterns[0].aspect/2;
 return{head,back,rod:r,endpoints:[r.slice(12,15).map((v,i)=>v+r[i]*half),r.slice(12,15).map((v,i)=>v-r[i]*half)]};
}
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function authority(f,a,paint){return plain({ink:a.ink,hp:a.hp,pos:a.pos.toArray(),vel:a.vel.toArray(),paint,
 wire:f.G.netm.out,projectiles:f.G.projectiles.list.map(p=>({start:p.start.toArray(),prev:p.prev.toArray(),pos:p.pos.toArray(),vel:p.vel.toArray(),age:p.age,damage:p.damage,life:p.life,seed:p.seed,ghost:p.ghost,owner:p.owner?.nid,meta:p.inkMeta}))});}

test('#1431 actual Quad source-volume back/rod connect to posed birth and detach without changing physical or wire authority',async()=>{
 const f=await world(),e=engine(f),negative=engine(f),proof=[];
 try{
  for(const wall of [false,true])for(const hz of [30,60,120]){
   f.reset();f.G.time=0;f.G.level=new f.Level(f.MAP_LAYOUTS.tidewater,f.map3ArtColliders(f.MAP_LAYOUTS.tidewater));f.G.physics=new f.Physics(f.G.level);
   f.G.match={playing:()=>true,canRespawn:()=>false,state:'playing',opts:{range:true}};
   const a=await f.make();a.setWeapon('s3-maneuver-stepper');a.nid=7;a.pos.set(wall?-5:0,0,wall?-1.72:0);assert.equal(f.G.level.groundHeight(a.pos.x,a.pos.z,.1),0,'authored source actor starts on the actual MAP3 lower floor');a.aimYaw=a.yaw=0;a.aimPitch=0;
   a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0,1.05,80));a.character.onEvent=null;
   f.G.netm=new f.NetMatch({myId:7},{});
   const paint=[],fx=[];f.G.paint={sample:()=>0,splat:(at,radius,team,o)=>{paint.push({at:Array.from(at.toArray()),radius,team,owner:o?.claimOwner?.nid});return 0;}};
   f.G.fx=new Proxy({inkVolumes:e,muzzle:(at)=>fx.push(Array.from(at.toArray()))},{get:(t,k)=>k in t?t[k]:()=>{}});
   const clock=new f.FixedClock();f.G.game={s3Clock:clock};let tick=0,connected=0,unchanged=0,detached=0,maxError=0,minNegativeGap=Infinity;
   for(let frame=0;frame<hz*2;frame++)clock.advance(1/hz,dt=>{
    a.intent.fire=tick>=30&&tick<110;f.G.time+=dt;a.update(dt);f.G.projectiles.update(dt);
    for(const p of f.G.projectiles.list)if(p.owner===a&&p.catalog?.r.id==='s3-maneuver-stepper'){
     const before=authority(f,a,paint);e.begin();const accepted=f.submitInkVolume(e,p);e.end();
     // Same artifact and same projectile: disabling only its presentation
     // connection reproduces the former owner that did not consume it.
     const saved=p._s3PoseBirthOffset;let oldAccepted;
     try{p._s3PoseBirthOffset=null;negative.begin();oldAccepted=f.submitInkVolume(negative,p);negative.end();}finally{p._s3PoseBirthOffset=saved;}
     assert.equal(accepted,oldAccepted);assert.deepEqual(authority(f,a,paint),before,'actual rendering changes no birth/velocity/LOS/contact/paint/ink/wire owner state');
     if(!accepted||e.metrics.active!==3)continue;
     const actual=matrices(f,e),control=matrices(f,negative),o=p._s3PoseBirthOffset;
     const sourceFrames=p.catalog.r.parameters.spl__BulletShooterTailLengthParam?.MaxLengthFrame;
     const frames=Number.isFinite(sourceFrames)&&sourceFrames>0?sourceFrames:f.shotTailFrames(p);
     if(o&&p.start.distanceTo(p.pos)<=p.vel.length()*frames/60){
      assert.equal(p._iwVisualHistory??null,null,'registered native source volume owns this round, not history');
      const socket=[p.start.x+o.x,p.start.y+o.y,p.start.z+o.z],error=dist(actual.back.slice(12,15),socket);
      assert.ok(error<2e-6,'real back instance centre equals its post-pose birth socket '+JSON.stringify({hz,wall,tick,age:p.age,frames,error,actual:actual.back.slice(12,15),socket}));
      assert.ok(Math.min(...actual.endpoints.map(x=>dist(x,socket)))<2e-6,'real line-mesh endpoint reaches the same socket');
      assert.ok(Math.min(...actual.endpoints.map(x=>dist(x,p.pos.toArray())))<2e-6,'real line head remains at physical p.pos');
      assert.deepEqual(actual.head,control.head,'physical head matrix is unchanged');
      const gap=dist(control.back.slice(12,15),socket);assert.ok(gap>1e-4,'old owner fails this same posed-back endpoint');
      assert.ok(fx.some(at=>dist(at,socket)<1e-8),'same-tick actual deferred muzzle FX shares the connection');
      maxError=Math.max(maxError,error);minNegativeGap=Math.min(minNegativeGap,gap);connected++;
     }else{
      assert.deepEqual(actual,control,'prediction/LOS fallback or detached tail retains its former native matrices');unchanged++;if(o)detached++;
     }
    }
    tick++;
   });
   assert.equal(tick,120);assert.ok(connected>0||wall&&paint.length>0,'real connection or immediate actual cover retirement is observed');assert.ok(unchanged>0||wall&&paint.length>0,'unconnected/detached or actual cover controls were measured');
   assert.ok(f.G.netm.out.some(event=>event[1]==='p'),'actual serialized projectile events retained');
   proof.push({hz,wall,connected,unchanged,detached,maxBackError:connected?maxError:null,minOldOwnerGap:connected?minNegativeGap:null,wireBirths:f.G.netm.out.filter(x=>x[1]==='p').length,paintCalls:paint.length,source:{status:a.character.sourceMotion.status,active:a.character.sourceMotion.active}});
  }
  assert.ok(proof.some(p=>p.detached>0),'old attached births genuinely detach under the existing tail cap');
  console.log(JSON.stringify({quadNativeVolumePose:proof}));
 }finally{f.G.netm=null;f.reset();e.dispose();negative.dispose();}
});
