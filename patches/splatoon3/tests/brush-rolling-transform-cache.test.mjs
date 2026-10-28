import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

test('loaded Brush floor correction stays stable between draws and follows the slope at its tip',async()=>{
  const f=await sourceLoadedActorFixture({random:()=>.4});
  f.G.audio={play(){},playWeapon(){},prepareWeapon(){},loop(){return {set(){},stop(){}};}};
  const flatLevel=f.G.level,flatPhysics=f.G.physics;
  const run=async(batch,slope=false)=>{
    f.G.level=slope?new f.Level({bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},
      spawnPads:[[-150,-40,-150],[150,-40,150]],spawnBarrier:0,half:[],single:[
        {kind:'box',min:[-200,-41,-200],max:[200,-40,200]},
        {kind:'ramp',low:[0,-40,160],high:[0,0,0],width:20,thickness:.6},
      ]}):flatLevel;
    f.G.physics=slope?new f.Physics(f.G.level):flatPhysics;
    f.G.time=0;
    const a=await f.make();a.setWeapon('s3-brush-mini');
    a.intent.fire=true;a.intent.move.set(0,0,1);
    const head=[],authority=[];
    try{
      for(let tick=0;tick<240;tick++){
        f.G.time+=1/60;a.update(1/60);
        authority.push({position:a.pos.toArray(),velocity:a.vel.toArray(),ink:a.ink,
          rolling:a.weaponRunner.rolling,cooldown:a.weaponRunner.cooldown,
          shots:f.G.projectiles.list.length});
        // The renderer flushes matrices once per draw. Do not refresh the
        // weapon between fixed ticks: that hid the stale feedback in old tests.
        if(tick%batch!==batch-1)continue;
        a.character.root.updateMatrixWorld(true);a.character.skeleton.update();
        if(tick>=120){
          assert.equal(a.alive,true);assert.equal(a.grounded,true);
          assert.equal(a.anim.rolling,true);assert.ok(a.character.wRoll>.99);
          assert.equal(a.character.sourceMotion.active,true,'actual source bank remains loaded');
          // Inspect the displayed vertices. Projecting an axis-aligned box
          // onto a slope combines extrema from different vertices.
          const point=new f.THREE.Vector3();let y=Infinity,normal=Infinity;
          for(const part of [a.character.weapon.parts.head,a.character.weapon.parts.headInk])part.traverse(o=>{
            const positions=o.geometry?.attributes.position;if(!positions)return;
            for(let i=0;i<positions.count;i++){
              point.fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld).sub(a.pos);
              y=Math.min(y,point.y);normal=Math.min(normal,point.dot(a.groundN));
            }
          });
          head.push({tick,y,normal});
        }
      }
      return {head,authority};
    }finally{f.reset();}
  };
  const everyTick=await run(1),batched=await run(6);
  assert.deepEqual(batched.authority,everyTick.authority,'presentation must preserve movement, payment and shot admission');
  for(const result of [everyTick,batched]){
    const values=result.head.map(x=>x.y),span=Math.max(...values)-Math.min(...values);
    assert.ok(span<.06,'settled brush head must not oscillate above/below the floor: '+span);
    assert.ok(Math.max(...values)<.1,'held brush must not float into a raised carry');
  }
  const reference=new Map(everyTick.head.map(x=>[x.tick,x.y]));
  assert.ok(batched.head.every(x=>Math.abs(x.y-reference.get(x.tick))<.03),'draw cadence must not change the held weapon transform');
  const downhill=await run(6,true);
  console.log('BRUSH_CONTACT',JSON.stringify([everyTick,batched,downhill].map(result=>({
    min:Math.min(...result.head.map(x=>x.normal)),max:Math.max(...result.head.map(x=>x.normal)),
  }))));
  assert.ok(downhill.head.every(x=>x.normal<.02),'tip must follow the downhill surface rather than float at foot height');
  const flatNormal=new Map(batched.head.map(x=>[x.tick,x.normal]));
  assert.ok(downhill.head.every(x=>Math.abs(x.normal-flatNormal.get(x.tick))<.04),'slope contact must retain the existing flat-ground clearance');
});
