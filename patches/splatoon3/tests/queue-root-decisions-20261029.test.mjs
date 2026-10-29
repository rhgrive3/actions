import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {RANKED_POSE_LIMITS} from '../runtime/ranked/pose-admission.mjs';
import {RankedEngine} from '../runtime/ranked/engine.mjs';
import {simulateMatchInterval} from '../runtime/turf-finish.mjs';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
function functionText(source,name){
  for(const entry of parse(source,{sourceType:'module',ecmaVersion:'latest'}).body){
    const node=entry.declaration||entry;
    if(node.type==='FunctionDeclaration'&&node.id.name===name)return source.slice(node.start,node.end);
  }
  throw new Error('Missing source function '+name);
}
test('already-installed nearest-floor distance cache retains independent frozen baseline results and all five ordered probes',()=>{
  const reference=JSON.parse(read('./fixtures/drive-ranked-before-7f863ea2.json'));
  assert.equal(reference.sourceSha,'7f863ea2d65671abd1453fdae1b61de00f1d10e2');
  const source=read('../runtime/ranked/pose-admission.mjs');
  const before=reference.files['patches/splatoon3/runtime/ranked/pose-admission.mjs'];
  const instantiate=s=>new Function('finite','L','FLOOR_PROBE_OFFSETS','return ('+functionText(s,'nearestFloor')+')')(
    Number.isFinite,RANKED_POSE_LIMITS,[[0,0],[1,0],[-1,0],[0,1],[0,-1]]);
  const old=instantiate(before),current=instantiate(source);
  assert.match(functionText(source,'nearestFloor'),/bestDistance/);
  let seed=291;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const special=[null,undefined,NaN,Infinity,-Infinity,0,-0,2,-2];
  for(let trial=0;trial<12000;trial++){
    const y=trial%5===0?0:random()*40-20;
    const floors=Array.from({length:5},(_,i)=>trial%3?random()*30-15:special[(trial+i)%special.length]);
    if(trial%7===0){floors[0]=y-2;floors[1]=y+2;}
    const p=[random()*20-10,y,random()*20-10],calls=[[],[]];
    const results=[old,current].map((fn,i)=>{let index=0;return fn({floorAt(...args){calls[i].push(args);return floors[index++];}},p);});
    assert.ok(Object.is(results[0],results[1]),'floor '+trial);
    assert.deepEqual(calls[1],calls[0]);assert.equal(calls[1].length,5);
  }
  assert.equal(current({},[0,0,0]),undefined);
  assert.equal(current({floorAt:()=>NaN},[0,0,0]),null);
});

test('discarding follower actor rows changes a newly owned bot goal before the next advanceRanked can rebuild it',()=>{
  // Actual rule + actual fixed-step ordering. Only Match's surrounding actor,
  // renderer and transport are modeled. This is a negative control for the
  // proposed advanceRanked-only guard, not a physical-network performance test.
  const stage={id:'follower-handoff',rainmaker:{center:[0,0,0],goals:[[0,0,10],[0,0,-10]],checkpoints:[[],[]],retreatZ:[-8,8]}};
  const run=shallow=>{
    const engine=new RankedEngine('rainmaker',stage),rule=engine.rule;
    rule.state.carrier='carrier';rule.state.carrierTeam=1;rule.state.pos=[1,0,1];rule.state.barrier.active=false;
    const carrier={id:'carrier',team:1,alive:true,pos:[7,0,-3]};
    const bot={id:'new-bot',team:0,alive:true,pos:[-2,0,1],slot:0};
    engine.frame={actors:shallow?[]:[carrier,bot],inputs:{},zoneCoverage:[],barrierHits:[],floorAt:()=>0,blocked:()=>false};
    const trace=[];
    const match={ranked:engine,mode:'rainmaker',state:'playing',paused:false,time:300,
      updateController(){trace.push('controller');},
      update(){trace.push({botGoal:rule.botGoal(bot,engine.frame)});},
      advanceRanked(){trace.push('advanceRanked');engine.frame.actors=[carrier,bot];},
    };
    simulateMatchInterval(match,1/60,{time:1,projectiles:{update(){trace.push('projectiles');}}},false);
    return trace;
  };
  const full=run(false),shallow=run(true);
  assert.deepEqual(full[1].botGoal.pos,[7,0,-3]);
  assert.deepEqual(shallow[1].botGoal.pos,[1,0,1]);
  assert.deepEqual(full.slice(2),['projectiles','advanceRanked']);
  assert.notDeepEqual(shallow[1],full[1]);
  const installed=read('../runtime/ranked/install.mjs');
  assert.match(installed,/this\.ranked\.frame = buildFrame\(this, api\)/);
});
