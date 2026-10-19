import test from 'node:test';
import assert from 'node:assert/strict';
import { rollerDrumSupport } from '../runtime/roller.mjs';

function world({height=0,hasFloor=true}={}){
  const calls=[];
  const level={blocks:[],queryBlocks(){return []},groundHeight(x,z,yMax){
    calls.push([x,z,yMax]);return hasFloor?height:-Infinity;
  }};
  const scratch={
    ids:[],start:{x:0,y:0,z:0},delta:{x:0,y:0,z:0},
    normalY:0,contactPoint:{x:0,y:0,z:0},wallPoint:{x:0,y:0,z:0}
  };
  return {G:{physics:{level}},scratch,calls};
}

test('supported stage floor survives native grounded Actor 5cm pose clearance',()=>{
  const w=world();
  const actor={pos:{x:0,y:.05,z:0},yaw:0,grounded:true};
  const support=rollerDrumSupport(actor,w.G,w.scratch);
  assert.deepEqual(support,{floor:true,wall:false,supported:true});
  assert.equal(w.calls.length,1);
  assert.ok(Math.abs(w.calls[0][2]-.14)<1e-10);
});

test('no false supported roll off a ledge, at height, or while airborne',()=>{
  for(const [args,grounded,actorY] of [
    [{hasFloor:false},true,.05],
    [{height:-.5},true,.05],
    [{height:0},true,.20],
    [{height:0},false,.05]
  ]){
    const w=world(args);
    const result=rollerDrumSupport({pos:{x:0,y:actorY,z:0},yaw:0,grounded},w.G,w.scratch);
    assert.equal(result.floor,false,JSON.stringify([args,grounded,actorY]));
    assert.equal(result.supported,false);
  }
});
