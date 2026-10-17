import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const F=1/60,near=(a,b)=>assert.ok(a.distanceTo(b)<1e-7,`${a.toArray()} != ${b.toArray()}`);
// S3 versus GP0. Tower placement is documented on the current community Wiki;
// Nintendo 4.0.0 also explicitly fixes Sprinklers placed on Tower sides/bottom.
// Native Tower/OBB transforms are calibrated stage geometry, not retail data.
// https://wikiwiki.jp/splatoon3mix/バンカラマッチ指南/ガチヤグラ指南
// https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/Splatoon-3-Update-History-2358763.html
async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`});
  const {G,THREE}=f;G.scene=new THREE.Scene();
  G.level=new f.Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:70},spawnPads:[[0,0,0],[0,0,60]],spawnBarrier:0,
    single:[{kind:'box',min:[-50,-1,-50],max:[50,0,70]}],half:[]});
  G.physics=new f.Physics(G.level);
  class Paint extends f.PaintSystem{
    _initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}
    _pushQuad(){} _drawQuads(){this.quads=0;}
    dispose(){this._clearPaintOwnership?.();}
  }
  G.paint=new Paint(null,G.level,{atlasSize:1024,maxDensity:6,cell:.25});
  G.projectiles=new f.Projectiles(G.scene);
  G.match={mode:'tower',state:'playing',actors:G.actors,playing:()=>true,canRespawn:()=>false};
  const stage={id:'attachment-fixture',tower:{path:[[-10,2,20],[0,2,30],[10,3,30]],centerIndex:1,halfSize:1.4}};
  const tower=G.match.rankedWorld=new f.RankedWorld({G,THREE,Hit:f.Hit},G.match,stage);
  const a=f.make();Object.assign(a,{nid:1,netLife:0,team:0});
  const deck=()=>tower.towerBlock.center.clone().addScaledVector(tower.towerBlock.axes[0],.8).add(new THREE.Vector3(0,.12,0));
  a.pos.copy(deck());a.ground.block=tower.towerBlockId;a.ground.normal.set(0,1,0);
  const events=[],stamps=[];f.on('all:sub',e=>events.push({...e}));
  const splat=G.paint.splat.bind(G.paint);G.paint.splat=(p,r,t,o)=>{stamps.push({pos:p.clone(),r});return splat(p,r,t,o);};
  function step(){G.time+=F;G.projectiles.update(F);G.paint.advanceSimulation(F);}
  function fire(id){a.weapon={...a.weapon,sub:id};a.weaponRunner.reset();a.ink=100;
    for(let i=0;i<8;i++)a.weaponRunner.update(F,{sub:true});a.weaponRunner.update(F,{sub:false,subReleased:true});a.weaponRunner.update(F,{sub:false});
    return id==='sprinkler'?G.projectiles.bombs.at(-1):G.projectiles._s3SubObjects.at(-1);}
  function move(){tower._syncTower({rule:{state:{progress:.8}}},false);}
  function fromLocal(local){const b=tower.towerBlock,p=b.center.clone();for(let i=0;i<3;i++)p.addScaledVector(b.axes[i],local[i]);return p;}
  function cleanup(){G.projectiles.clear();tower.dispose();G.paint.dispose();}
  return {f,a,tower,deck,events,stamps,step,fire,move,fromLocal,cleanup};
}

test('native Sprinkler source and ghost follow the contacted Tower while existing detached drops stay in world space',async()=>{
  const w=await world(),{f}=w,b=w.fire('sprinkler');assert.ok(b);
  b.pos.copy(w.deck()).add(new f.THREE.Vector3(0,.5,0));b.vel.set(0,-12,0);
  for(let i=0;i<8&&!b.s3Sprinkler;i++)w.step();assert.ok(b.s3Sprinkler?.support);
  const remote=f.make();Object.assign(remote,{nid:2,netLife:0,remote:true});remote.weapon={...remote.weapon,sub:'sprinkler'};
  const start=w.deck().add(new f.THREE.Vector3(0,.5,0));
  f.G.projectiles.ghostBomb(remote,'bomb',start.x,start.y,start.z,0,-12,0,42,'sprinkler',0);
  const ghost=f.G.projectiles.bombs.at(-1);assert.equal(ghost.ghost,true);
  for(let i=0;i<8&&!ghost.s3Sprinkler;i++)w.step();assert.ok(ghost.s3Sprinkler?.support);
  for(let i=0;i<60&&b.s3Sprinkler.drops.length===0;i++)w.step();assert.ok(b.s3Sprinkler.drops.length>0);
  const drop=b.s3Sprinkler.drops[0],oldDropPos=drop.pos.clone(),local=b.s3Sprinkler.support.position;
  const ghostLocal=ghost.s3Sprinkler.support.position,oldPos=b.pos.clone(),before=w.stamps.length;
  w.move();w.step();near(b.pos,w.fromLocal(local));near(ghost.pos,w.fromLocal(ghostLocal));
  assert.ok(b.pos.distanceTo(oldPos)>1);assert.ok(drop.pos.distanceTo(oldDropPos)<1,'already detached ink does not teleport with its emitter');
  assert.equal(ghost.s3Resolved,undefined);assert.equal(ghost.s3Sprinkler.drops.length,0,'attachment does not create replica ink authority');
  assert.equal(w.stamps.slice(before).filter(s=>s.r===.3).length,0,'movement does not repaint the deployment footprint');
  near(b.mesh.position,b.pos);near(ghost.mesh.position,ghost.pos);w.cleanup();assert.equal(f.G.projectiles.bombs.length,0);
});

for(const face of ['side','bottom'])test(`native Sprinkler on the Tower ${face} retains the contacted local surface orientation after translation and rotation`,async()=>{
  const w=await world(),b=w.fire('sprinkler'),block=w.tower.towerBlock;
  const normal=face==='side'?block.axes[0].clone():block.axes[1].clone().negate();
  b.pos.copy(block.center).addScaledVector(block.axes[2],.8).addScaledVector(normal,(face==='side'?block.half.x:block.half.y)+.5);
  b.vel.copy(normal).multiplyScalar(-12);
  for(let i=0;i<8&&!b.s3Sprinkler;i++)w.step();assert.ok(b.s3Sprinkler?.support);
  assert.ok(b.s3SurfaceNormal.dot(normal)>.999);
  const local=b.s3Sprinkler.support.position,painted=w.stamps.filter(s=>s.r===.3).length;
  w.move();w.step();near(b.pos,w.fromLocal(local));
  const expected=face==='side'?block.axes[0].clone():block.axes[1].clone().negate();
  near(b.s3SurfaceNormal,expected);assert.equal(w.stamps.filter(s=>s.r===.3).length,painted);
  w.cleanup();
});

for(const id of ['inkMine','beakon','splashWall'])test(`${id} source and replay follow the canonical Tower without changing native committed jump behavior`,async()=>{
  const w=await world(),{f}=w,b=w.fire(id);assert.ok(b);
  if(id==='splashWall'){
    b.pos.copy(w.deck()).add(new f.THREE.Vector3(0,.5,0));b.vel.set(0,-12,0);
    for(let i=0;i<8&&b.phase==='flight';i++)w.step();assert.equal(b.phase,'wallPending');
  }
  assert.ok(b.s3SurfaceAttachment);const local=b.s3SurfaceAttachment.position;
  const remote=f.make();Object.assign(remote,{nid:2,netLife:0,remote:true,team:0});remote.weapon={...remote.weapon,sub:id};
  for(const e of w.events.filter(e=>e.subId===id&&['spawn','deploy'].includes(e.phase))){
    const {actor,paintSource,...payload}=e;assert.equal(f.installedRuntime.replaySub({...JSON.parse(JSON.stringify(payload)),actor:remote}),true);
  }
  const ghost=f.G.projectiles._s3SubObjects.find(o=>o.owner===remote);assert.ok(ghost?.s3SurfaceAttachment);
  const ghostLocal=ghost.s3SurfaceAttachment.position;
  const before=w.stamps.length;w.move();w.step();near(b.pos,w.fromLocal(local));near(ghost.pos,w.fromLocal(ghostLocal));
  if(id==='beakon'){
    const target=f.G.bigBubblerJumpTargets(0).find(t=>t.pos===b.pos);assert.ok(target);near(target.pos,w.fromLocal(local));
    const jumper=f.make();jumper.isLocal=true;jumper.pos.set(-20,0,30);
    assert.equal(jumper.superJumpToBubbler(target),true);const committed=jumper.superJumpState.target.clone();
    w.tower._syncTower({rule:{state:{progress:.7}}},false);w.step();jumper.update(F);
    near(jumper.superJumpState.target,committed,'ordinary target commit is preserved');
    assert.ok(target.pos.distanceTo(committed)>1,'future map selections still see the moved destination');
  }else if(id==='inkMine'){
    const victim=f.make();Object.assign(victim,{team:1,nid:3,invuln:0});victim.pos.copy(b.pos).add(new f.THREE.Vector3(.9,0,0));
    f.G.time=2;w.step();assert.equal(b.dead,true);assert.equal(victim.hp,55);assert.ok(victim.s3.revealedUntil[0]>2);
    const core=w.stamps.slice(before).find(s=>s.r===5);assert.ok(core);near(core.pos,b.pos.clone().add(new f.THREE.Vector3(0,.45,0)));
    assert.equal(ghost.dead,false,'replica placement cannot trigger an authoritative Mine blast');
  }else{
    while(b.phase==='wallPending')w.step();
    const enemy=f.make();enemy.team=1;enemy.pos.set(40,0,60);
    const n=new f.THREE.Vector3(Math.sin(b.yaw),0,Math.cos(b.yaw));
    const p={owner:enemy,team:1,size:.01,damage:20,prev:b.pos.clone().add(new f.THREE.Vector3(0,1,0)).addScaledVector(n,-2),
      pos:b.pos.clone().add(new f.THREE.Vector3(0,1,0)).addScaledVector(n,2)};
    assert.equal(f.G.projectiles.kitBarrierCandidate(p)?.object,b,'live barrier collision uses the attached pose/yaw');
  }
  w.cleanup();assert.equal(f.G.projectiles._s3SubObjects.length,0);
});

test('placing a third Mine synchronously bursts the oldest at its moved Tower pose before the next projectile tick',async()=>{
  const w=await world(),first=w.fire('inkMine'),local=first.s3SurfaceAttachment.position;
  w.a.pos.set(30,0,30);w.a.ground.block=0;const second=w.fire('inkMine');assert.ok(second&&!second.dead);
  w.move();const expected=w.fromLocal(local).add(new w.f.THREE.Vector3(0,.45,0)),before=w.stamps.length;
  w.a.pos.set(30,0,45);const third=w.fire('inkMine');assert.ok(third&&!third.dead);
  assert.equal(first.dead,true);assert.equal(second.dead,false);
  const core=w.stamps.slice(before).find(s=>s.r===5);assert.ok(core);near(core.pos,expected);
  w.cleanup();
});
