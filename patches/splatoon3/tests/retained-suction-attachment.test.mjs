import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// S3 versus GP0, current Wiki Tower/Suction mechanics. Tower/OBB geometry is
// native INKWAVE stage calibration; no retail rotation/speed law is inferred.
// https://wikiwiki.jp/splatoon3mix/ガチヤグラ
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/キューバンボム#Explanation
const F=1/60,near=(a,b,m)=>assert.ok(a.distanceTo(b)<1e-7,`${m}: ${a.toArray()} != ${b.toArray()}`);
async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`}),{G,THREE}=f;
 G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();
 G.level=new f.Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:70},spawnPads:[[0,0,0],[0,0,60]],spawnBarrier:0,
  single:[{kind:'box',min:[-50,-1,-50],max:[50,0,70]},
   {kind:'box',min:[5.5,1.9,29.5],max:[6.5,2,30.5]}],half:[]});G.physics=new f.Physics(G.level);
 class Paint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){this.quads=0;}}
 G.paint=new Paint(null,G.level,{atlasSize:1024,maxDensity:6,cell:.25});G.projectiles=new f.Projectiles(G.scene);
 G.match={mode:'tower',state:'playing',playing:()=>true,canRespawn:()=>false};
 const stage={id:'suction-attachment',tower:{path:[[-10,2,30],[0,2,30],[10,2,30]],centerIndex:1,halfSize:1.4}};
 const tower=G.match.rankedWorld=new f.RankedWorld({G,THREE,Hit:f.Hit},G.match,stage);
 const a=f.make();Object.assign(a,{nid:1,netLife:0,team:0});a.pos.set(-20,0,0);a.aimDir.set(0,0,1);a.weapon={...a.weapon,sub:'suction'};a.weaponRunner.reset();
 const stamps=[],blast=[];const splat=G.paint.splat.bind(G.paint);G.paint.splat=(p,r,t,o)=>{stamps.push({pos:p.clone(),r});return splat(p,r,t,o);};f.on('bomb:explode',e=>blast.push(e));
 const step=()=>{G.time+=F;G.projectiles.update(F);G.paint.advanceSimulation(F);};
 const release=()=>{a.ink=100;for(let i=0;i<8;i++)a.weaponRunner.update(F,{sub:true});a.weaponRunner.update(F,{sub:false,subReleased:true});a.weaponRunner.update(F,{sub:false});const b=G.projectiles.bombs.at(-1);assert.equal(b.s3Resolved.spec.id,'suction');return b;};
 const deck=()=>tower.towerBlock.center.clone().addScaledVector(tower.towerBlock.axes[0],.8).add(new THREE.Vector3(0,.12,0));
 const move=()=>tower._syncTower({rule:{state:{progress:.8}}},false);
 function fromLocal(s){const p=s.block.center.clone();for(let i=0;i<3;i++)p.addScaledVector(s.block.axes[i],s.position[i]);return p;}
 const cleanup=()=>{G.projectiles.clear();tower.dispose();};
 return {f,G,a,tower,stamps,blast,step,release,deck,move,fromLocal,cleanup};
}

for(const hz of [30,60,120])test(`native Suction follows the hit Tower deck and explodes at its moved pose after the original120F fuse, render${hz}Hz`,async()=>{
 const w=await world(),{f,G,a}=w,b=w.release();b.pos.set(-20,20,0);b.vel.set(0,0,0);
 for(let i=0;i<8;i++)w.step();assert.equal(b.fuse,-1,'airborne time does not consume the contact fuse');
 b.pos.copy(w.deck()).add(new f.THREE.Vector3(0,.3,0));b.vel.set(0,-30,0);w.step();
 assert.equal(b.s3Mode,'stuck');const support=b.s3SuctionAttachment;assert.ok(support);assert.ok(support.block===w.tower.towerBlock);
 assert.ok(Math.abs(b.fuse-(2-F))<1e-8);b.s3ExplosionPaintSeed=.25;
 const victim=f.make();Object.assign(victim,{team:1,hp:500,invuln:0});victim.pos.set(30,0,60);
 const clock=new f.FixedClock();let ticks=0,burstAt=null,expected;
 for(let frame=0;frame<2*hz;frame++)clock.advance(1/hz,()=>{
  ticks++;if(ticks===20){w.move();expected=w.fromLocal(support);victim.pos.copy(expected).add(new f.THREE.Vector3(1,-.21,0));}
  if(ticks===30)a.splat(null,'water');w.step();
  if(ticks===20){near(b.pos,expected,'attachment moves before native fuse/paint work');near(b.mesh.position,b.pos,'same moved native visual');assert.equal(b.vel.lengthSq(),0,'no inherited collision velocity');}
  if(ticks===118)assert.ok(G.projectiles.bombs.includes(b),'penultimate contact-counted frame remains');
  if(burstAt===null&&!G.projectiles.bombs.includes(b))burstAt=ticks;
 });
 assert.equal(burstAt,119,'first contact tick plus119 further ticks is120F');assert.equal(victim.hp,320,'real moved blast hits the moved enemy after owner death');
 const core=w.stamps.find(s=>s.r===5);assert.ok(core,'native kit explosion paints once');near(core.pos,expected.clone().add(new f.THREE.Vector3(0,.45,0)),'paint uses moved contact plane');
 assert.equal(w.blast.length,1);w.cleanup();assert.equal(G.projectiles.bombs.length,0);
});

test('real ghost Suction follows the Tower pole but its expiry cannot paint, damage or promote kit authority',async()=>{
 const w=await world(),{f,G}=w,remote=f.make();Object.assign(remote,{remote:true,nid:2,netLife:0,team:0});
 const pole=w.tower.towerPoleBlock,from=pole.center.clone().addScaledVector(pole.axes[0],.5),v=pole.axes[0].clone().multiplyScalar(-30);
 G.projectiles.ghostBomb(remote,'bomb',from.x,from.y,from.z,v.x,v.y,v.z,42,'suction',0);const b=G.projectiles.bombs.at(-1);
 for(let i=0;i<3&&b.s3Mode!=='stuck';i++)w.step();assert.equal(b.s3Mode,'stuck');assert.ok(b.s3SuctionAttachment?.block===pole);
 w.move();w.step();near(b.pos,w.fromLocal(b.s3SuctionAttachment),'pole local attachment');near(b.mesh.position,b.pos,'remote visual follows');
 const victim=f.make();Object.assign(victim,{team:1,hp:500,invuln:0});victim.pos.copy(b.pos);const before=w.stamps.length;
 for(let i=0;i<120;i++)w.step();assert.equal(G.projectiles.bombs.includes(b),false);assert.equal(victim.hp,500);assert.equal(w.stamps.length,before);
 assert.equal(b.s3Resolved,undefined,'movement never grants gameplay ownership');w.cleanup();
});

test('fixed-floor Suction remains at its first surface when a Tower passes, and clear cannot transfer attachment to a later native bomb',async()=>{
 const w=await world(),{f,G}=w,b=w.release();b.pos.set(6,2.1,30);b.vel.set(0,-30,0);w.step();
 assert.equal(b.s3Mode,'stuck');assert.equal(b.s3SuctionAttachment,null,'static floor cannot become a Tower binding');const fixed=b.pos.clone(),fuse=b.fuse;
 w.move();const pole=w.tower.towerPoleBlock,relative=b.pos.clone().sub(pole.center);
 assert.ok(pole.axes.every((axis,i)=>Math.abs(relative.dot(axis))<[pole.half.x,pole.half.y,pole.half.z][i]),'the passing Tower really overlaps the fixed bomb');
 for(let i=0;i<20;i++)w.step();near(b.pos,fixed,'passing platform cannot push or reattach a fixed placed bomb');assert.ok(b.fuse<fuse,'timer is not restarted');
 w.cleanup();assert.equal(G.projectiles.bombs.length,0);const next=w.release();assert.equal(next.s3SuctionAttachment,undefined);assert.equal(next.fuse,-1,'new native flight has no stale support or countdown');
 G.projectiles.clear();
});
