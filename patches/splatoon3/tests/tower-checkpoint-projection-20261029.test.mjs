import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerRule, towerCheckpointPosition } from '../runtime/ranked/tower.mjs';
import { installRankedUi } from '../runtime/ranked/ui.mjs';

const stage = () => ({ tower: { path: [[-10,0,0],[-8,0,0],[0,0,0],[0,6,8],[30,6,8]], centerIndex: 1, checkpoints: [[{progress:.5,count:1}],[{progress:.5,count:1}]] } });
test('checkpoint projection uses physical arc length and each team direction from an off-center origin', () => {
  const s=stage(), rule=new TowerRule({},s);
  assert.deepEqual(towerCheckpointPosition(s,0,.5,rule.metrics),[6,6,8]);
  assert.deepEqual(towerCheckpointPosition(s,1,.5,rule.metrics),[-9,0,0]);
  for(const team of [0,1]) {
    assert.deepEqual(towerCheckpointPosition(s,team,-1),[-8,0,0]);
    assert.deepEqual(towerCheckpointPosition(s,team,0),[-8,0,0]);
    assert.deepEqual(towerCheckpointPosition(s,team,1),team===0?[30,6,8]:[-10,0,0]);
    assert.deepEqual(towerCheckpointPosition(s,team,2),team===0?[30,6,8]:[-10,0,0]);
  }
  for(const value of [undefined,null,NaN,Infinity,-Infinity,'0.5']) assert.equal(towerCheckpointPosition(s,0,value),null);
  assert.equal(towerCheckpointPosition(s,2,.5),null);
});
test('duplicate and zero-length segments, filtered invalid vertices and fallback routes remain finite', () => {
  const duplicate={tower:{path:[[0,0,0],[0,0,0],[3,0,4]],centerIndex:0}};
  assert.deepEqual(towerCheckpointPosition(duplicate,0,.5),[1.5,0,2]);
  const zero={tower:{path:[[2,3,4],[2,3,4]],centerIndex:1}};
  for(const team of [0,1]) for(const progress of [0,.5,1]) assert.deepEqual(towerCheckpointPosition(zero,team,progress),[2,3,4]);
  const invalid={tower:{path:[[NaN,0,0],null,[-2,0,0],[2,0,0]],centerIndex:0}};
  assert.deepEqual(towerCheckpointPosition(invalid,0,.5),[0,0,0]);
  assert.deepEqual(towerCheckpointPosition({},0,1),[1,0,0]);
  assert.deepEqual(towerCheckpointPosition({},1,1),[-1,0,0]);
});
test('installed minimap draws independent expected checkpoint positions for both viewer orientations and skips invalid checkpoints', () => {
  for(const flip of [1,-1]) {
    const s=stage(), rule=new TowerRule({},s), arcs=[];
    s.tower.checkpoints[0].push(null,{progress:NaN});
    const ctx=Object.fromEntries(['save','restore','beginPath','fill','stroke','strokeText','fillText','moveTo','lineTo','setLineDash'].map(k=>[k,()=>{}]));
    ctx.arc=(x,y,r)=>{if(r===3)arcs.push([x,y]);};
    class Minimap {
      constructor(){this.ctx=ctx;this.s=1;}
      _compose(){}
      toCanvas(x,z,out){out.x=x*flip;out.y=z*flip;return out;}
    }
    installRankedUi({G:{match:{ranked:{mode:'tower',stage:s,rule}}},Minimap});
    new Minimap()._compose(1/30);
    assert.deepEqual(arcs,[[6*flip,8*flip],[-9*flip,0*flip]]);
  }
});
