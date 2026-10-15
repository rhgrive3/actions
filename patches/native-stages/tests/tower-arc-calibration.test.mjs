import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeTowerStartIndex} from '../runtime/native-tower-calibration.mjs';
import {RankedEngine} from '../../splatoon3/runtime/ranked/engine.mjs';

test('local Tower starts at the existing nearest 3D arc midpoint, independent of waypoint density',()=>{
 const path=[[-10,0,0],[-9,0,0],[-8,0,0],[-7,0,0],[-6,0,0],[0,8,0],[6,0,0],[10,0,0]],before=structuredClone(path);
 assert.equal(nativeTowerStartIndex(path),5,'vertical source travel counts, unlike an index/XZ midpoint');
 assert.deepEqual(path,before,'source waypoints remain byte-for-byte unchanged');
 assert.equal(nativeTowerStartIndex([...path].reverse()),2);
 assert.throws(()=>nativeTowerStartIndex([[0,0,0],[0,0,0],[0,0,0]]),/no travel arc/);
 assert.throws(()=>nativeTowerStartIndex([[0,0,0],[NaN,0,0],[1,0,0]]),/invalid waypoint/);
});

test('production Tower scoring retains checkpoint budgets at 30/60/120 Hz for both sides',()=>{
 const path=[[-12,0,0],[-10,0,0],[-8,0,0],[-6,0,0],[-4,0,0],[-2,0,0],[0,0,0],[6,0,0],[12,0,0]],stage={id:'arc-calibration-unit',tower:{path,centerIndex:nativeTowerStartIndex(path),halfSize:1.2,speed:1.2,checkpoints:[[{progress:.6,count:5}],[{progress:.6,count:5}]]}},times=[];
 for(const hz of [30,60,120])for(const team of [0,1]){
  const engine=new RankedEngine('tower',stage);let frames=0;
  while(engine.winner===null&&frames<hz*60){engine.update(1/hz,{actors:[{id:'rule-frame-rider',team,alive:true,grounded:true,pos:[...engine.rule.state.position]}],inputs:{}});frames++;}
  assert.equal(engine.winner,team);assert.equal(engine.reason,'knockout');assert.equal(engine.rule.state.checkpointCleared[team][0],true);times.push({team,hz,elapsed:engine.elapsed});
 }
 for(const hz of [30,60,120])assert(Math.abs(times.find(x=>x.hz===hz&&x.team===0).elapsed-times.find(x=>x.hz===hz&&x.team===1).elapsed)<1/hz);
});
