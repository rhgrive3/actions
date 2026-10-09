import test from 'node:test';
import assert from 'node:assert/strict';
import { batchFixture } from './batch03-fixture.mjs';

test('#975 wall admission paints 2.2 once, retaining 1.3/1.0/0.6 and one terrain burst',async()=>{
  const f=await batchFixture(),a=f.make('blaster'),p=f.G.projectiles._new();
  Object.assign(p,{owner:a,s3Weapon:a.weapon,type:'blast',team:0,seed:.5});
  const hit=new f.Hit();hit.hit=true;hit.point.set(0,8,6);hit.normal.set(0,0,-1);hit.face=0;hit.block=0;
  f.G.level.faces=[{paintable:true}];f.G.level.blocks=[{solid:true}];
  let bursts=0;const system={_blastBurst(q){assert.equal(q.s3TerrainBurst,true);bursts++;}};
  assert.equal(f.beginFidelityWallDrop(system,p,hit),true);
  assert.deepEqual(f.paint.map(e=>e.radius),[2.2,1.3]);
  assert.deepEqual([p.fidelityWallDrop.shockRadius,p.fidelityWallDrop.fallRadius,p.fidelityWallDrop.groundRadius],[1.3,1,.6]);
  assert.equal(f.beginFidelityWallDrop(system,p,hit),true);assert.equal(bursts,1);assert.equal(f.paint.length,2);
});

test('#975 floor, grate and unpaintable contacts do not produce wall-impact paint; ghosts do not score',async()=>{
  for(const kind of ['floor','grate','unpaintable','ghost']){
    const f=await batchFixture(),a=f.make('blaster'),p=f.G.projectiles._new();
    Object.assign(p,{owner:a,s3Weapon:a.weapon,type:'blast',team:0,seed:.5,ghost:kind==='ghost'});
    const hit=new f.Hit();hit.hit=true;hit.point.set(0,8,6);hit.normal.set(0,kind==='floor'?1:0,kind==='floor'?0:-1);hit.face=0;hit.block=0;
    f.G.level.faces=[{paintable:kind!=='unpaintable'}];f.G.level.blocks=[{solid:true,grate:kind==='grate'}];
    f.beginFidelityWallDrop({_blastBurst(){}},p,hit);assert.equal(f.paint.length,0,kind);
  }
});
