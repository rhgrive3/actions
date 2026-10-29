import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { RankedEngine } from '../runtime/ranked/engine.mjs';
import { ClamsRule } from '../runtime/ranked/clams.mjs';
import { firstThreeFinite } from '../runtime/ranked/coordinates.mjs';
import { sphereEntry, sphereEntryComponents } from '../runtime/ranked/combat.mjs';
import { nativePaintGoalIds } from '../../native-stages/runtime/native-bots.mjs';
const frozen = JSON.parse(fs.readFileSync(new URL('./fixtures/ranked-queue-baseline-c0938a3f.json', import.meta.url)));
assert.equal(frozen.sourceSha, 'c0938a3f84768474df91713f7b372f9d7f8fe96a');
const old = path => frozen.files[path];
const current = path => fs.readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const dataUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
// Keep the frozen queue implementation as the reference. Apply only the two
// intentional support fixes from #1849; comparing against its former airborne
// grounding bug would reject the fix rather than detect queue regressions.
const replaceReference = (source, before, after) => {
 assert.equal(source.split(before).length, 2, 'unique frozen reference anchor');
 return source.replace(before, after);
};
function supportCorrectedReference(source) {
 source = replaceReference(source,
  `      clam.grounded = true;
      const floor = this._floorAt(frame, position[0], position[2], position[1] + 0.25);
      if (floor !== null) clam.pos[1] = floor;`,
  `      const floor = this._floorAt(frame, position[0], position[2], position[1] + 0.25);
      clam.grounded = floor !== null && Math.abs(floor - position[1]) <= 0.25;
      if (clam.grounded) clam.pos[1] = floor;`);
 source = replaceReference(source,
  `    const pos = vec(position);
    if (typeof frame?.floorAt === 'function') {
      const floor = this._floorAt(frame, pos[0], pos[2], pos[1] + 0.25);
      if (floor !== null) pos[1] = floor;
    }
    const count = inv.small;`,
  `    const pos = vec(position);
    let grounded = true;
    if (typeof frame?.floorAt === 'function') {
      const floor = this._floorAt(frame, pos[0], pos[2], pos[1] + 0.25);
      grounded = floor !== null && Math.abs(floor - pos[1]) <= 0.25;
      if (grounded) pos[1] = floor;
    }
    const count = inv.small;`);
 return replaceReference(source,
  `{ grounded: true, expiresIn: CLAM_LIFETIME });\n    }\n    inv.small = 0;`,
  `{ grounded, expiresIn: CLAM_LIFETIME });\n    }\n    inv.small = 0;`);
}
const urls = {};
for (const name of ['clams', 'tower', 'zones', 'rainmaker', 'engine']) {
 let source = old(`patches/splatoon3/runtime/ranked/${name}.mjs`);
 if (name === 'clams') source = supportCorrectedReference(source);
 // The short-tap fix adds an idle release latch. This queue trace exercises
 // held/full-charge releases; give the frozen state the same additive default.
 if (name === 'rainmaker') source = replaceReference(source,
  'firing: false, delay: 0, recovery: 0, pending: null, wasSwimming: false',
  'firing: false, released: false, delay: 0, recovery: 0, pending: null, wasSwimming: false');
 source = source.replace(/from '\.\/(\w+)\.mjs'/g, (_all, dependency) => `from '${urls[dependency]}'`);
 urls[name] = dataUrl(source);
}
const { RankedEngine: BaselineEngine } = await import(urls.engine);
const { ClamsRule: LegacyClamsRule } = await import(dataUrl(old('patches/splatoon3/runtime/ranked/clams.mjs')));
const { ClamsRule: ReferenceClamsRule } = await import(urls.clams);
test('the reference changes only the intentional unsupported reflection and inventory drop verdicts', () => {
 for (const floor of [null, -3, 3]) {
  const rules = [LegacyClamsRule, ReferenceClamsRule, ClamsRule].map(C => new C(null, { clams: { spawns: [] } }));
  const frame = { floorAt: () => floor };
  const clams = rules.map(r => r._newClam('small', null, [0, 3, 0], { grounded: false, bounces: 2, velocity: [2, -1, 0] }));
  rules.forEach((r, i) => r._reflect(clams[i], [0, 3, 0], frame));
  assert.equal(clams[0].grounded, true, 'frozen baseline formerly manufactured support');
  assert.equal(clams[1].grounded, floor === 3);
  assert.deepEqual(plain(clams[2]), plain(clams[1]));
  for (const r of rules) {
   r.state.clams = [];
   r.state.inventories.holder = { team: 0, small: 3, power: false };
   r._dropSmallInventory('holder', [0, 3, 0], 0, frame);
  }
  assert.ok(rules[0].state.clams.every(c => c.grounded));
  assert.ok(rules[1].state.clams.every(c => c.grounded === (floor === 3) && c.pos[1] === 3));
  assert.deepEqual(plain(rules[2].state), plain(rules[1].state));
 }
});
const random = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const plain = value => JSON.parse(JSON.stringify(value));
const stage = { id: 'queue-equivalence', zones: [{ center: [0,0,0], size: [6,6] }],
 tower: { path: [[0,0,-10],[0,0,0],[0,0,10]], centerIndex: 1, checkpoints: [[{ progress: .5, count: 1.3 }],[{ progress: .5, count: 1.3 }]], speed: 1.2, halfSize: 1.4 },
 rainmaker: { center: [0,0,0], goals: [[0,0,10],[0,0,-10]], checkpoints: [[[0,0,5],[1,0,5]],[[0,0,-5],[-1,0,-5]]], retreatZ: [-8,8] },
 clams: { spawns: [[0,0,0],[1,0,0],[-1,0,0]], goals: [[0,0,10],[0,0,-10]] } };
for (const mode of ['zones','tower','rainmaker','clams']) test(`${mode === 'clams' ? 'support-corrected baseline' : 'baseline'} complete ${mode}${mode === 'rainmaker' ? ' non-firing' : ''} rules preserve each catch-up step, events and detached restore`, () => {
 const pair = [new BaselineEngine(mode, stage), new RankedEngine(mode, stage)], r = random(771);
 for (let tick = 0; tick < 600; tick++) {
  const actors = Array.from({ length: 8 }, (_, i) => ({ id: String(i), team: i % 2, slot: i, pos: [Math.sin(tick / 31 + i) * 1.3, 0, Math.sin(tick / 71 + i) * 6], alive: tick % 113 !== i, grounded: tick % 5 !== 0, weight: 'middle', swimming: tick % 11 === 0, onTower: mode === 'tower' && i === Math.floor(tick / 120) % 2 }));
  // Short releases intentionally differ from the frozen rule now. Preserve
  // this trace's exact ownership/checkpoint/swim/death/clock comparisons with
  // fire idle; full-shot equivalence and the new tap behavior have separate tests.
  const inputs = Object.fromEntries(actors.map(a => [a.id, { fire: mode !== 'rainmaker' && tick % 150 < 80, throw: tick % 37 === 0, aim: [0, .1, a.team ? -1 : 1] }]));
  const frame = { actors, inputs, zoneCoverage: [[tick % 181 < 90 ? .8 : .1, tick % 181 < 90 ? .1 : .8]], barrierHits: tick % 73 === 0 ? [{ id: '0', team: 0, damage: 1200, kind: 'shooter' }] : [], floorAt: () => 0, blocked: () => false };
  const dt = [1/120,1/60,1/30,.08,.25][Math.floor(r()*5)];
  for (const engine of pair) engine.update(dt, frame);
  assert.deepEqual(pair[1].snapshot(), pair[0].snapshot(), mode + ' tick ' + tick);
  assert.deepEqual(pair[1].events, pair[0].events, mode + ' ordered events ' + tick);
  for (const engine of pair) engine.events.length = 0;
  if (tick === 270) {
   const snaps = pair.map(e => e.snapshot());
   for (let i=0;i<2;i++) assert.equal(pair[i].restore(snaps[i]),true);
   snaps[0].counts[0]=snaps[1].counts[0]=0;
   assert.deepEqual(pair[1].snapshot(),pair[0].snapshot());
   assert.notEqual(pair[1].counts[0],0,'restore did not borrow incoming arrays');
  }
 }
});
test('baseline Rainmaker full-charge releases preserve catch-up snapshots and ordered shot events', () => {
 const pair = [new BaselineEngine('rainmaker', stage), new RankedEngine('rainmaker', stage)], shots = [];
 for (const engine of pair) engine.rule.state.barrier.active = false;
 const frame = { actors: [{id:'0',team:0,pos:[0,0,0],alive:true,grounded:true,swimming:false}],
  inputs: {'0':{fire:false,aim:[0,0,1]}}, floorAt:()=>0, blocked:()=>false };
 const step = (dt,fire) => {
  frame.inputs['0'].fire=fire;
  for (const engine of pair) engine.update(dt,frame);
  assert.deepEqual(pair[1].snapshot(),pair[0].snapshot());
  assert.deepEqual(pair[1].events,pair[0].events);
  shots.push(...pair[1].events.filter(e=>e.kind==='rainmaker-shot'));
  for (const engine of pair) engine.events.length=0;
 };
 step(1/60,false);
 for(let cycle=0;cycle<2;cycle++) {
  for(const dt of [1/120,1/60,1/30,.08,.25,.4,.5])step(dt,true);
  for(const dt of [1/120,1/60,1/30,.08,.25,.4])step(dt,false);
 }
 assert.equal(shots.length,2);assert.ok(shots.every(e=>e.charge===1&&e.damage===60&&e.blastDamage===180));
});
test('Rainmaker swept-sphere arithmetic preserves exact baseline numbers without per-target arrays', () => {
 const r=random(417);
 for(let i=0;i<30000;i++) {
  const a=Array.from({length:3},()=>r()*50-25),b=Array.from({length:3},()=>r()*50-25),c=Array.from({length:3},()=>r()*50-25),radius=r()*10;
  assert.ok(Object.is(sphereEntry(a,b,c,radius),sphereEntryComponents(...a,...b,...c,radius)));
 }
});
const loadBrain = (source,G,seed) => {
 const math=Object.create(Math);math.random=random(seed);
 return new Function('THREE','G','clamp','angleDiff','PLAYER','DIFFICULTY','SUB','Math',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn BotBrain;')(THREE,G,(x,a,b)=>Math.max(a,Math.min(b,x)),(a,b)=>b-a,{},{normal:{reaction:.2,fireDiscipline:.7,aimError:.1}}, {},math);
};
const actor = () => ({ yaw: 0, team: 0, pos: new THREE.Vector3(), weapon: { kind:'shooter', range:12 } });
const targetState = brain => ({ target: brain.bTgt ? { id: brain.bTgt.shape?.id ?? brain.bTgt.crab?.id, dist: brain.bTgt.dist, los:brain.bTgt.los, weak:brain.bTgt.weak, rad:brain.bTgt.rad, pos:brain.bTgt.pos?.toArray() } : null, react:brain.react, shapeT:brain.shapeT, acqT:brain.acqT, acqSignY:brain.acqSignY, acqSignP:brain.acqSignP });
test('actual Boss perception retains targets, reaction/RNG and current geometry across reacquisition and crab movement', () => {
 const r=random(1501);
 for(let scene=0;scene<300;scene++) {
  const rays=[0,0],Gs=[0,1].map(i=>({physics:{los(_a,b){rays[i]++;return Math.sin(b.x*2+b.z*3)>.1;}}}));
  const brains=[old('inkwave-public/src/game/bots.js'),current('inkwave-public/src/game/bots.js')].map((src,i)=>new (loadBrain(src,Gs[i],scene+1))(actor()));
  const crabs=new Map(Array.from({length:scene%8},(_,i)=>[i,{id:'crab'+i,x:r()*20-10,y:0,z:r()*20-10,dead:r()<.2}]));
  const shapes=Array.from({length:scene%13},(_,i)=>({id:'shape'+i,active:r()>.2,weak:i%3===0,socket:i===0?'belly':'eye',r:.6,pos:new THREE.Vector3(r()*20-10,r()*5,r()*20-10)}));
  const boss={crabs,visible:scene%7!==0,dead:scene%19===0,model:{hitShapes:shapes}};
  for(let pass=0;pass<5;pass++) {
   brains.forEach(b=>b._bossPerceive(boss));
   assert.deepEqual(targetState(brains[1]),targetState(brains[0]),`scene ${scene} pass ${pass}`);
   for(const c of crabs.values()) { c.x+=.11;c.z-=.03; }
   for(const h of shapes)h.pos.x+=.01;
  }
  assert.ok(rays[1]<=rays[0]);
 }
});
test('native directed BFS IDs/order, per-brain cache and stamp-wrap behavior match the original', () => {
 const baseline = new Function(old('patches/native-stages/runtime/native-bots.mjs').replace('export function','function')+';return nativePaintGoalIds;')();
 const nodes=Array.from({length:280},(_,id)=>({id,x:id%20,y:0,z:Math.floor(id/20),zone:id%29===0?id%2:-1,nativePaintable:id%3!==0,nb:[]}));
 for(const n of nodes)for(const d of [1,20,-1,-20])if(nodes[n.id+d])n.nb.push({to:n.id+d});
 const nav={nodes,valid:new Uint8Array(nodes.length).fill(1),nearest:p=>Math.abs(Math.floor(p.x))%nodes.length};
 for(let i=0;i<70;i++) {
  const oldBrain={a:{team:i%2,pos:new THREE.Vector3(i,0,0)}},newBrain={a:{team:i%2,pos:new THREE.Vector3(i,0,0)}},G={nav};
  assert.deepEqual(nativePaintGoalIds(newBrain,G),baseline(oldBrain,G));
  const saved=nativePaintGoalIds(newBrain,G);newBrain.a.pos.z+=100;
  assert.equal(nativePaintGoalIds(newBrain,G),saved,'preserve existing same-start cache semantics');
 }
 nav._nativePaintGoalWork.stamp=0xffffffff;
 const brain={a:{team:0,pos:new THREE.Vector3(2,0,0)}};
 assert.deepEqual(nativePaintGoalIds(brain,{nav}),baseline({a:brain.a},{nav}));
 assert.equal(nav._nativePaintGoalWork.stamp,1);
 assert.equal(nav._nativePaintGoalWork.queue.length,0);
});

test('owned-node nearest fast path preserves duplicate-coordinate tie order and all maxUp cases', () => {
 const load = source => new Function('THREE','PLAYER','buildNativeNav',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn NavGraph;')(THREE,{},()=>{});
 const classes=[load(old('inkwave-public/src/game/nav.js')),load(current('inkwave-public/src/game/nav.js'))];
 const nodes=[],cells=Array.from({length:16},()=>[]);
 for(let layer=0;layer<3;layer++)for(let z=0;z<4;z++)for(let x=0;x<4;x++){
  const n={id:nodes.length,x,y:layer===2?0:layer,z};nodes.push(n);cells[z*4+x].push(n.id);
 }
 const valid=new Uint8Array(nodes.length).fill(1);valid[5]=valid[11]=0;
 const pair=classes.map(C=>Object.assign(Object.create(C.prototype),{nodes,cells,valid,x0:0,z0:0,step:1,nx:4,nz:4}));
 for(const n of nodes)for(const maxUp of [-1,0,.3,1,NaN])assert.equal(pair[1].nearest(n,maxUp),pair[0].nearest(new THREE.Vector3(n.x,n.y,n.z),maxUp));
});
test('actual BossNav cast keeps exact endpoints/wall classification with shared heading trig', () => {
 const load=source=>new Function('THREE',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn BossNav;')(THREE);
 const classes=[load(old('inkwave-public/src/boss/bossNav.js')),load(current('inkwave-public/src/boss/bossNav.js'))],r=random(8301);
 const pair=classes.map(C=>Object.assign(Object.create(C.prototype),{
  wallClear:(x,z)=>Math.sin(x*.1+z*.17)>.5?1:6,
  floorClear:(x,z)=>Math.cos(x*.09-z*.13)>.6?1:5,
  kindAt:(x,z)=>Math.sin(x*2+z*3)>.2?1:0
 }));
 for(let i=0;i<4000;i++){
  const args=[r()*40-20,r()*40-20,r()*20-10,r()*34,[.15,.25,.5][i%3]];
  assert.deepEqual(pair[1].cast(...args),pair[0].cast(...args));
 }
});

test('settled Tower count memo invalidates progress edits, engine overrides and restore', () => {
 const engine=new RankedEngine('tower',stage),rule=engine.rule;
 let writes=0,value=rule.state.countProgress[0];
 Object.defineProperty(rule.state.countProgress,'0',{enumerable:true,configurable:true,get:()=>value,set:v=>{value=v;writes++;}});
 rule._updateCounts(rule.metrics);const initial=writes;
 for(let i=0;i<100;i++)rule._updateCounts(rule.metrics);
 assert.equal(writes,initial,'a stable frame avoids recalculating count progress');
 rule.state.checkpointProgress[0][0]=.31;rule._updateCounts(rule.metrics);assert.equal(writes,initial+1,'even an in-place progress edit invalidates');
 rule.state.checkpointProgress[0][0]=NaN;rule._updateCounts(rule.metrics);rule._updateCounts(rule.metrics);assert.equal(writes,initial+3,'invalid inputs stay on the ordinary safe path');
 rule.state.checkpointProgress[0][0]=0;rule.state.controllingTeam=0;
 const setCount=engine.setCount;let calls=0;engine.setCount=function(...args){calls++;return setCount.apply(this,args);};
 rule._updateCounts(rule.metrics);rule._updateCounts(rule.metrics);assert.equal(calls,2,'custom setter side effects keep their original call cadence');
 engine.setCount=setCount;const snapshot=rule.snapshot();rule.restore(snapshot);assert.equal(rule._countMemo,null);
});
const loadRankedPlanning = source => new Function('firstThreeFinite',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn {rainmakerBarrierApproach,towerApproachPath,clamThrowAim};')(firstThreeFinite);
const planning=[loadRankedPlanning(old('patches/splatoon3/runtime/ranked/bots.mjs')),loadRankedPlanning(current('patches/splatoon3/runtime/ranked/bots.mjs'))];
test('stable approach heap preserves selected shield node and exact attempted A* order', () => {
 const r=random(491);
 for(let scene=0;scene<100;scene++){
  const nodes=Array.from({length:260},(_,id)=>({id,x:r()*16-8,y:0,z:r()*16-8,nb:[]}));
  // Stable ties at identical coordinates must retain original candidate order.
  for(let i=20;i<30;i++){nodes[i].x=nodes[19].x;nodes[i].z=nodes[19].z;}
  const traces=[[],[]],results=planning.map((p,lane)=>{
   const nav={nodes,validIds:nodes.map(n=>n.id),nearest:()=>0,path(_s,id){traces[lane].push(id);return scene%7!==0&&id%5>0?[0,id]:null;}};
   return p.rainmakerBarrierApproach({a:{team:0,pos:new THREE.Vector3(-3,0,-4),weapon:{range:12}}},{x:0,y:0,z:0},null,{blocked:()=>false},{nav});
  });
  assert.deepEqual(results[1],results[0]);assert.deepEqual(traces[1],traces[0]);
 }
});
test('tower admissible zero-cost bound preserves reachable choice and respects negative custom graphs', () => {
 for(const negative of [false,true]){
  const nodes=[{id:0,x:-5,y:.55,z:0,nb:[]}];
  for(let i=0;i<50;i++){
   const angle=Math.PI+i*.11;const n={id:nodes.length,x:Math.cos(angle)*1.85,y:.55,z:Math.sin(angle)*1.85,nb:[]};
   nodes.push(n);nodes[0].nb.push({to:n.id,cost:negative&&i===49?-20:.1+i*.01});
  }
  const calls=[0,0],brains=planning.map((p,lane)=>{
   const brain={a:{team:0,pos:new THREE.Vector3(-5,.55,0)}};
   const nav={nodes,validIds:nodes.slice(1).map(n=>n.id),nearest:()=>0,path(_s,id){calls[lane]++;return [0,id];}};
   assert.equal(p.towerApproachPath(brain,{x:0,y:1,z:0},{stage:{tower:{halfSize:1.4}}},{nav},{blocked:()=>false},1.5),true);
   return brain;
  });
  assert.deepEqual(brains[1].path,brains[0].path);assert.equal(brains[1].goal,brains[0].goal);
  if(negative)assert.equal(calls[1],calls[0]);else assert.ok(calls[1]<calls[0]);
 }
});
test('precomputed 211-angle clam arc preserves exact aim for both inventories and pass heights',()=>{
 const r=random(215);
 for(let i=0;i<1500;i++){
  const a={nid:1,pos:new THREE.Vector3(r()*20,r()*5,r()*20)},goal={pos:[r()*40,r()*10,r()*40],pass:i%3===0},engine={rule:{state:{inventories:{1:{power:!!(i%2)}}}}};
  assert.deepEqual(planning[1].clamThrowAim(a,goal,engine),planning[0].clamThrowAim(a,goal,engine));
 }
});
test('Rainmaker shot geometry sharing preserves exact palette colors and disposes every resource once',async()=>{
 const { createRankedEffects } = await import('../runtime/ranked/combat.mjs');
 const geometries=[],materials=[];
 class Geometry extends THREE.SphereGeometry { constructor(...args){super(...args);this.disposals=0;geometries.push(this);}dispose(){this.disposals++;super.dispose();} }
 class TailGeometry extends THREE.BufferGeometry { constructor(...args){super(...args);this.disposals=0;geometries.push(this);}dispose(){this.disposals++;super.dispose();} }
 class Material extends THREE.MeshStandardMaterial { constructor(...args){super(...args);this.disposals=0;materials.push(this);}dispose(){this.disposals++;super.dispose();} }
 const namespace={...THREE,SphereGeometry:Geometry,BufferGeometry:TailGeometry,MeshStandardMaterial:Material},scene=new THREE.Scene();
 const actor={nid:1,team:0,alive:true,remote:false,pos:new THREE.Vector3(),vel:new THREE.Vector3()};
 const G={scene,teamColors:[new THREE.Color(.3,.4,.5),new THREE.Color(.8,.2,.1)],audio:{play(){}},physics:{segment:()=>({hit:false})},projectiles:{kitDefenseCandidate:()=>null}};
 const match={state:'playing',actors:[actor],ranked:{revision:0},rankedWorld:{floorAt:()=>0}};
 const effects=createRankedEffects({G,THREE:namespace,Hit:class {},PLAYER:{waterY:-1}},match);
 const event={kind:'rainmaker-shot',actorId:'1',team:0,pos:[0,0,0],aim:[0,0,1],charge:1,shotOrigin:{actorId:'1',owner:null,life:0,team:0,body:[0,.7,0],muzzle:[0,1,0]}};
 effects.event(event);effects.event(event);assert.equal(geometries.length,3);assert.equal(materials.length,1);
 const head=root=>root.getObjectByName('rainmaker-shot-head'),tail=root=>root.getObjectByName('rainmaker-shot-ink-sheet'),drops=root=>root.getObjectByName('rainmaker-shot-droplets');
 for(const part of [head,tail,drops])assert.equal(part(scene.children[0]).geometry,part(scene.children[1]).geometry);
 const instanced=[];let retired=0;
 const observe=root=>{const mesh=drops(root);instanced.push(mesh);mesh.addEventListener('dispose',()=>retired++);};
 observe(scene.children[0]);observe(scene.children[1]);
 const previous=head(scene.children[0]).material.color.clone();G.teamColors[0].r+=1e-8;effects.event(event);observe(scene.children[2]);
 assert.equal(materials.length,2,'do not quantize distinct palette values to a common hex key');
 assert.equal(head(scene.children[0]).material.color.r,previous.r);assert.equal(head(scene.children[2]).material.color.r,G.teamColors[0].r);
 effects.update(4);assert.equal(scene.children.length,0);assert.equal(retired,3);assert.ok(geometries.every(g=>g.disposals===0),'shared geometry belongs to the effects lifetime');
 effects.event(event);observe(scene.children[0]);effects.dispose();effects.dispose();
 assert.equal(retired,instanced.length);assert.ok(geometries.every(g=>g.disposals===1));assert.ok(materials.every(m=>m.disposals===1));assert.equal(scene.children.length,0);
});
