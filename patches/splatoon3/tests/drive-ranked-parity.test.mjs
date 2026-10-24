import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RankedEngine,validRankedSnapshot,OWNED_RANKED_FRAME} from '../runtime/ranked/engine.mjs';
import {ClamsRule} from '../runtime/ranked/clams.mjs';
import {firstThreeFinite,finiteTripleAt} from '../runtime/ranked/coordinates.mjs';
import {objectiveText} from '../runtime/ranked/ui.mjs';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/drive-ranked-before-7f863ea2.json',import.meta.url)));
assert.equal(frozen.sourceSha,'7f863ea2d65671abd1453fdae1b61de00f1d10e2');
const paths=new Map();
function oldURL(file){
  if(paths.has(file))return paths.get(file);
  const base=new URL('../../../'+file,import.meta.url);
  const code=frozen.files[file].replace(/from (['"])(\.[^'"]+)\1/g,(_all,q,relative)=>{
    const next=new URL(relative,base),key=next.pathname.split('/patches/')[1];
    const path=key?'patches/'+key:null;
    return `from ${q}${frozen.files[path]?oldURL(path):next.href}${q}`;
  });
  const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');paths.set(file,url);return url;
}
const before=await import(oldURL('patches/splatoon3/runtime/ranked/engine.mjs'));
const {ClamsRule:OldClams}=await import(oldURL('patches/splatoon3/runtime/ranked/clams.mjs'));
const {objectiveText:oldText}=await import(oldURL('patches/splatoon3/runtime/ranked/ui.mjs'));
const stage={id:'drive-parity',zones:[{center:[0,0,0],size:[4,4]}],tower:{path:[[-10,0,0],[0,0,0],[10,0,0]],centerIndex:1,checkpoints:[[],[]],speed:2,halfSize:1.4},
  rainmaker:{center:[0,0,0],checkpoints:[[],[]],goals:[[10,0,0],[-10,0,0]],retreatZ:[-5,5]},
  clams:{spawns:[[0,0,0],[-3,0,3],[3,0,-3]],goals:[[10,0,0],[-10,0,0]]}};
function random(){let seed=0x1da743;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}

for(const mode of ['zones','tower','rainmaker','clams'])test(`full ${mode} state, ordered events and restore match fixed main under variable frame intervals`,()=>{
  const rng=random(),pair=[new before.RankedEngine(mode,structuredClone(stage)),new RankedEngine(mode,structuredClone(stage))];
  for(let frame=0;frame<360;frame++){
    const actors=Array.from({length:8},(_,i)=>({id:String(i),team:i<4?0:1,slot:i%4,pos:[(rng()-.5)*16,0,(rng()-.5)*8],alive:frame%41!==i,grounded:true}));
    const f={actors,inputs:Object.fromEntries(actors.map(a=>[a.id,{fire:frame%20<12,throw:frame%23===0,aim:[1,0,0]}])),
      zoneCoverage:[[frame%100<45?.8:0,frame%100>55?.8:0]],barrierHits:[],floorAt:()=>0,blocked:()=>false};
    const dt=[1/30,1/60,1/120,1/15,1/10,.25][frame%6];
    pair.forEach(e=>e.update(dt,f));
    assert.deepEqual(pair[1].snapshot(),pair[0].snapshot(),mode+'/'+frame);assert.deepEqual(pair[1].events,pair[0].events);
    if(frame%37===0){const saved=pair.map(e=>e.snapshot());pair.forEach((e,i)=>assert.equal(e.restore(saved[i]),true));}
  }
});

test('coordinate validation keeps eager getter reads, holes, inherited coordinates and custom slice fallback',()=>{
  const legacy=a=>Array.isArray(a)&&a.length>=3&&a.slice(0,3).every(Number.isFinite);
  for(const v of [[0,-0,3],[,,3],[NaN,1,2],[Infinity,0,0],[0,1,2,NaN],[],null,{x:1,y:2,z:3}])assert.equal(firstThreeFinite(v),legacy(v));
  const custom=[1,2,3];custom.slice=()=>[Infinity];assert.equal(firstThreeFinite(custom),false);
  for(const mutate of [false,true]){
    const run=fn=>{const seen=[],a=[0,1,2];Object.defineProperty(a,0,{get(){seen.push(0);if(mutate)delete a[1];return NaN;}});Object.defineProperty(a,2,{get(){seen.push(2);return 2;}});return{result:fn(a),seen};};
    assert.deepEqual(run(firstThreeFinite),run(legacy));
  }
  assert.equal(finiteTripleAt([99,1,2,3],1,Number.isFinite),true);
});

test('goal broadphase is exact for finite contacts and preserves nonfinite compatibility paths',()=>{
  const rng=random(),rules=[OldClams,ClamsRule];
  for(let i=0;i<6000;i++){
    const pos=[(rng()-.5)*40,(rng()-.5)*6,(rng()-.5)*40],next=pos.map(x=>x+(rng()-.5)*12);
    if(i<4)pos[i%3]=[NaN,Infinity,-Infinity,-0][i];
    const run=Rule=>{
      const events=[],engine={counts:[100,100],penalties:[0,0],event:(...x)=>events.push(x),score(){},special(){}};
      const r=new Rule(engine,structuredClone(stage),{seedInitial:false}),clam=r._newClam(i%2?'power':'small',0,[0,0,0],{ownerTeam:0,thrower:'0',grounded:false,velocity:[1,2,3]});
      r.state.baskets[0].barrierOpen=i%3===0;
      const result=r._tryGoal(clam,pos,next,{floorAt:()=>0});return{result,state:r.state,events};
    };
    assert.deepEqual(run(rules[1]),run(rules[0]),String(i));
  }
});

test('trusted catch-up shares only all-false owned inputs and still detaches hits and outer frames',()=>{
  for(const trusted of [false,true])for(const value of [false,true,undefined,0]){
    const engine=new RankedEngine('zones',stage),seen=[],f={actors:[],inputs:{a:{throw:value}},barrierHits:[{x:1}]};
    if(trusted)Object.defineProperty(f,OWNED_RANKED_FRAME,{value:f.inputs});
    engine.rule.update=(_dt,frame)=>seen.push(frame);engine.update(.05,f);
    assert.ok(seen.length>=3);assert.equal(seen[0],f);assert.notEqual(seen[1],f);assert.deepEqual(seen[1].barrierHits,[]);
    assert.equal(seen[1].inputs.a.throw,false);assert.equal(seen[1].inputs===f.inputs,trusted&&value===false);
    assert.equal(f.inputs.a.throw,value);
  }
});

test('snapshot visitor retains limits, forbidden-key rejection and own-key semantics',()=>{
  const good=new RankedEngine('clams',stage).snapshot();
  for(const mutation of [s=>{},s=>{s.rule.extra={__proto__:{inherited:NaN},a:1};},s=>{s.rule.extra=JSON.parse('{"__proto__":1}');},
    s=>{s.rule.extra={constructor:1};},s=>{s.rule.extra=Array(129).fill(0);},s=>{s.rule.extra=NaN;},s=>{let x=s.rule;for(let i=0;i<14;i++)x=x.deep={};}]){
    const s=structuredClone(good);mutation(s);assert.equal(validRankedSnapshot(s),before.validRankedSnapshot(s));
  }
});

test('cached zone HUD text follows rounded percentages, ownership, locale and in-place palette changes',()=>{
  const engine=new RankedEngine('zones',stage),G={palette:{names:['ALPHA','BRAVO']}},api={LANG:'en'};
  for(let i=0;i<200;i++){
    const coverage=Object.freeze([Object.freeze([i/199,(199-i)/199])]);engine.frame={zoneCoverage:coverage};
    engine.rule.state.zones[0].team=[-1,0,1][i%3];api.LANG=i%2?'ja':'en';G.palette.names[0]=i%5?'ALPHA':'ORANGE';
    const expected=oldText(engine,G,api);assert.equal(objectiveText(engine,G,api),expected);assert.equal(objectiveText(engine,G,api),expected);
  }
});

test('fresh transactional candidates preserve retained rule aliases and mutable stage changes',()=>{
  const e=new RankedEngine('tower',structuredClone(stage)),old=e.rule,snapshot=e.snapshot();
  e.stage.tower.path[2][0]=20;assert.equal(e.restore(snapshot),true);assert.notEqual(e.rule.metrics.total,old.metrics.total);
  const saved=structuredClone(old.state);const next=e.snapshot();next.revision++;next.rule.pathDistance++;
  assert.equal(e.restore(next),true);assert.deepEqual(old.state,saved,'a spare pool may not mutate an escaped prior rule');
});
