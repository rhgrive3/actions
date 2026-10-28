import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const f = await fixture({ productionComposition: true, extraExports: `
  export { NativeLevel, NativePhysics } from './patches/native-stages/runtime/engine.mjs';
  export { RankedWorld } from './patches/splatoon3/runtime/ranked/world.mjs';
` });
const V = (x=0,y=0,z=0) => new f.THREE.Vector3(x,y,z);
const box = {kind:'box',min:[-1,0,4],max:[1,3,5],paint:false,hidden:true};
function legacy() {
  return new f.Level({bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,
    single:[{kind:'box',min:[-30,-1,-30],max:[30,0,30]}],half:[]});
}
function native() {
  return new f.NativeLevel({
    manifest:{id:'revision-floor',bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,objects:[],faces:[]},
    triangles:new Float32Array([-30,0,-30,0,0,30,30,0,-30]),normals:new Float32Array([0,1,0]),
    flags:new Uint32Array([3]),objectIds:new Uint32Array([0]),nodes:new Float32Array([-30,0,-30,30,0,30,-1,1]),
    order:new Uint32Array([0]),triangleFace:new Int32Array([-1]),mask:new Uint8Array(),
  });
}
function setup(level) {
  const physics = level.native ? new f.NativePhysics(level) : new f.Physics(level);
  Object.assign(f.G,{level,physics,paint:null,scene:new f.THREE.Scene(),time:0});
  return physics;
}
function tower(level) {
  const physics=setup(level),match={mode:'tower',actors:[]};
  const world=new f.RankedWorld({G:f.G,THREE:f.THREE,Hit:f.Hit},match,
    {id:'revision-tower',tower:{path:[[-10,2,0],[0,2,0],[0,2,10],[0,2,0],[10,2,0]],centerIndex:1,halfSize:1.4}});
  return {world,physics};
}
for (const [name,make] of [['Level',legacy],['NativeLevel',native]]) {
  test(`${name}: real add/rebuild invalidates; collision queries do not`,()=>{
    const level=make(),physics=setup(level),before=level.collisionRevision,hit=new f.Hit();
    assert.ok(Number.isSafeInteger(before) && before>=0);
    for(let i=0;i<30;i++)physics.raycast(V(0,1,0),V(0,0,1),10,hit,true);
    assert.equal(hit.hit,false);assert.equal(level.collisionRevision,before);
    level._addBlock(box);assert.ok(level.collisionRevision>before);
    const added=level.collisionRevision;level._buildHash();assert.ok(level.collisionRevision>added);
    physics.raycast(V(0,1,0),V(0,0,1),10,hit,true);
    assert.equal(hit.hit,true);assert.equal(hit.block,level.blocks.length-1);
  });
  test(`${name}: Tower translation/rotation and disposal publish actual changes`,()=>{
    const level=make(),before=level.collisionRevision,{world,physics}=tower(level),hit=new f.Hit();
    assert.ok(level.collisionRevision>before,'real Tower installation changes collision');
    const installed=level.collisionRevision,blocks=level.blocks,hash=level.hash;
    const state=p=>({rule:{state:{progress:p}}});
    world.beforeActors(state(world._towerProgress));assert.equal(level.collisionRevision,installed,'unchanged transform is free');
    const origin=world.towerPoleBlock.center.clone().add(V(0,0,-4));
    physics.raycast(origin,V(0,0,1),8,hit,true);assert.equal(hit.hit,true);
    world.beforeActors(state(.1));assert.ok(level.collisionRevision>installed);
    const moved=level.collisionRevision;world.beforeActors(state(.1));assert.equal(level.collisionRevision,moved);
    world.beforeActors(state(.25));const position=world.towerBlock.center.clone(),axis=world.towerBlock.axes[0].clone(),priorRotation=level.collisionRevision;
    world.update(state(.75),1/60);
    assert.ok(world.towerBlock.center.equals(position),'the real path revisits exactly the same position');
    assert.ok(!world.towerBlock.axes[0].equals(axis),'the revisited position has a different bearing');
    assert.ok(level.collisionRevision>priorRotation,'rotation alone invalidates');
    assert.equal(level.blocks,blocks);assert.equal(level.hash,hash,'in-place transform does not rely on container identity');
    const latest=level.collisionRevision;world.dispose();assert.ok(level.collisionRevision>latest);
    physics.raycast(origin,V(0,0,1),8,hit,true);assert.equal(hit.hit,false,'removed tower no longer collides');
    const disposed=level.collisionRevision;world.dispose();assert.equal(level.collisionRevision,disposed);
  });
}
test('Tower disposal invalidates when a later block keeps removed colliders in the array',()=>{
  const level=legacy(),{world}=tower(level),deck=world.towerBlock,pole=world.towerPoleBlock;
  level._addBlock(box);level._buildHash();const before=level.collisionRevision,length=level.blocks.length;
  world.dispose();assert.equal(level.blocks.length,length);
  assert.equal(deck.solid,false);assert.equal(pole.solid,false);assert.ok(level.collisionRevision>before);
});
test('an unrelated custom world is not silently certified by ranked lifecycle',()=>{
  const level={blocks:[],faces:[],hash:[],blockStamp:new Uint32Array(),_stamp:1};setup(level);
  const world=new f.RankedWorld({G:f.G,THREE:f.THREE},{mode:'zones',actors:[]},{zones:[]});
  world.dispose();assert.equal(level.collisionRevision,undefined);assert.equal(level.markCollisionChanged,undefined);
});
