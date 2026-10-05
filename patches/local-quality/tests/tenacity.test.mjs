import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { advanceTenacity, TENACITY_RATES } from '../tenacity.mjs';
import { sampleTeamWipes } from '../team-wipeout.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
function actor(team, alive=true) { return {team,alive,special:0,s3:{loadout:[{main:'tenacity'}],tenacityBaseCost:180},specialCost(){return 180;},specialReady(){return this.special>=this.specialCost();}}; }
function match(deficit=1) {return {mode:'turf',state:'playing',time:180,actors:[...Array.from({length:4-deficit},()=>actor(0)),...Array.from({length:4},()=>actor(1))]};}
for (const deficit of [0,1,2,3]) for (const hz of [30,60,120]) test(`deficit ${deficit} at ${hz}Hz yields documented baseline points`,()=>{
 const m=match(deficit);for(let n=0;n<hz;n++)advanceTenacity(m,1/hz,()=>{});
 assert.ok(Math.abs(m.actors[0].special-TENACITY_RATES[deficit])<1e-10);assert.equal(m.actors.at(-1).special,0);
});
test('gear discount does not accelerate normalized passive gauge',()=>{for(const scale of [1,1.0909,1.3]){const m=match();m.actors[0].specialCost=()=>180/scale;advanceTenacity(m,1,()=>{});assert.ok(Math.abs(m.actors[0].special/m.actors[0].specialCost()-3.26/180)<1e-12);}});
test('inactive, remote, active-special and unrelated slots never gain; stop gates',()=>{
 for(const patch of [{state:'intro'},{state:'finish'},{paused:true},{attract:true},{mode:'boss'},{time:0}]){const m=Object.assign(match(),patch);advanceTenacity(m,1,()=>{});assert.equal(m.actors[0].special,0);}
 for(const patch of [{alive:false},{remote:true},{specialActive:{}},{s3:{loadout:[{main:'none'}],tenacityBaseCost:180}}]){const m=match();Object.assign(m.actors[0],patch);advanceTenacity(m,1,()=>{});assert.equal(m.actors[0].special,0);}
 for(const dt of [0,-1,NaN,Infinity]){const m=match();advanceTenacity(m,dt,()=>{});assert.equal(m.actors[0].special,0);}
});
test('clamps and emits one authoritative ready transition, without turf awards',()=>{const m=match(),a=m.actors[0];a.special=179;const events=[];advanceTenacity(m,1,(type,e)=>events.push([type,e.actor]));advanceTenacity(m,1,(type,e)=>events.push([type,e.actor]));assert.equal(a.special,180);assert.deepEqual(events,[['special:ready',a]]);});
test('native gear normalization, equip, reset and setWeapon preserve nonstackable head ability',async()=>{
 const f=await fixture({adaptRuntime:adaptQualitySource});const {emptyLoadout,normalizeLoadout,abilityPoints}=f;
 for(let piece=0;piece<3;piece++)for(let slot=0;slot<4;slot++){const lo=emptyLoadout();if(slot===0)lo[piece].main='tenacity';else lo[piece].subs[slot-1]='tenacity';const n=normalizeLoadout(lo);assert.equal(slot===0?n[piece].main:n[piece].subs[slot-1],piece===0&&slot===0?'tenacity':'none');}
 const a=f.make();a.s3.loadout[0].main='tenacity';a.s3.loadout[1].main='specialCharge';a.setWeapon('shooter');assert.equal(a.s3.loadout[0].main,'tenacity');assert.equal(abilityPoints(a.s3.loadout).tenacity,undefined);assert.equal(a.s3.tenacityBaseCost,f.WEAPONS.shooter.specialCost);assert.ok(a.specialCost()<f.WEAPONS.shooter.specialCost);a.reset();assert.equal(a.s3.loadout[0].main,'tenacity');assert.equal(a.s3.tenacityBaseCost,f.WEAPONS.shooter.specialCost);
});
test('native Match update invokes once after actors, not on pause; duplicate hooks fail closed',()=>{
 const raw=fs.readFileSync('inkwave-public/src/game/match.js','utf8');const adapted=adaptQualitySource('src/game/match.js',raw);
 assert.ok(adapted.indexOf('advanceTenacity(this, dt, emit);')>adapted.indexOf('else a.update(dt);'));
 assert.throws(()=>adaptQualitySource('src/game/match.js',raw.replace('    this.bossMode?.update(dt);','')));
 assert.throws(()=>adaptQualitySource('src/game/match.js',raw.replace('    this.bossMode?.update(dt);','    this.bossMode?.update(dt);\n    this.bossMode?.update(dt);')));
 new vm.SourceTextModule(adapted);
});
test('actual Match update awards after coherent roster updates; raw negative, pause and finish boundaries',()=>{
 const raw=fs.readFileSync('inkwave-public/src/game/match.js','utf8');
 for(const patched of [false,true]){
  const source=patched?adaptQualitySource('src/game/match.js',raw):raw;
  const start=source.indexOf('  update(dt) {'),end=source.indexOf('\n  updateController',start);
  const G={},events=[];const Native=vm.runInNewContext(`class Match {${source.slice(start,end)}};Match`,{G,emit:(...x)=>events.push(x),advanceTenacity,sampleTeamWipes,PLAYER:{radius:.3},MATCH:{finalCountdown:10},Math});
  const m=Object.assign(new Native(),match(),{stateT:0,setState(s){this.state=s;}});
  m.actors.forEach((a,i)=>{a.pos={x:i*3,y:0,z:0};a.update=()=>{};});
  // A teammate dies during its native update. Every owner sees this final list.
  const teammate=actor(0);teammate.pos={x:99,y:0,z:0};teammate.update=()=>{teammate.alive=false;};m.actors.push(teammate);
  m.update(1);assert.equal(m.actors[0].special,patched?3.26:0);
  const prior=m.actors[0].special;m.paused=true;m.update(1);assert.equal(m.actors[0].special,prior);
  m.paused=false;m.time=.5;m.update(1);assert.equal(m.state,'finish');assert.equal(m.actors[0].special,prior);
 }
});
test('emitted complete Match module contains the production passive path', {skip:!process.env.INKWAVE_TENACITY_BUILT_SITE},async()=>{
 const path=await import('node:path'),site=path.resolve(process.env.INKWAVE_TENACITY_BUILT_SITE),modules=new Map(),context=vm.createContext({console,performance});
 function load(file){if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});modules.set(file,m);return m;}
 const root=load(path.join(site,'src/game/match.js'));await root.link((spec,from)=>load(spec==='three'?path.join(site,'vendor/three/build/three.module.js'):path.resolve(path.dirname(from.identifier),spec)));await root.evaluate();
 const m=Object.assign(Object.create(root.namespace.Match.prototype),match(),{stateT:0,setState(s){this.state=s;}});
 m.actors.forEach((a,i)=>{a.pos={x:i*3,y:0,z:0};a.update=()=>{};});m.update(1);assert.equal(m.actors[0].special,3.26);
 for(const range of [true,false,true]){const next=Object.assign(Object.create(root.namespace.Match.prototype),match(3),{opts:{range},stateT:0,setState(s){this.state=s;}});next.actors.forEach((a,i)=>{a.pos={x:i*3,y:0,z:0};a.update=()=>{};if(a.team===1)a.rangeTarget={index:i};});for(let i=0;i<60;i++)next.update(1/60);assert.ok(Math.abs(next.actors[0].special-(range?0:7.59))<1e-10,`emitted range=${range} reentry`);}

});
test('actual gear panel exposes Tenacity once, only on head main, and persists through existing storage handler',()=>{
 const source=adaptQualitySource('patches/splatoon3/runtime/gear.mjs',fs.readFileSync('patches/splatoon3/runtime/gear.mjs','utf8'));
 const elements=[],saved=new Map();function node(tag){const n={tag,children:[],handlers:{},append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);},setAttribute(){},addEventListener(type,fn){this.handlers[type]=fn;}};elements.push(n);return n;}
 const context=vm.createContext({document:{createElement:node},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},console});
 vm.runInContext(source.replaceAll('export ','')+';globalThis.gear={installGear,normalizeLoadout};',context);
 class A{reset(){}setWeapon(){}splat(){}_horizontal(){}}class W{moveSpeed(){}update(){}}class Menus{_scr_loadout(){return{el:node('screen')};}}
 context.gear.installGear({Actor:A,WeaponRunner:W,Menus,G:{},on(){}},{gear:{runSpeed:[1,1,1]}});
 new Menus()._scr_loadout();const selects=elements.filter(n=>n.tag==='select');assert.equal(selects.length,12);
 for(const [i,s]of selects.entries())assert.equal(s.children.filter(n=>n.value==='tenacity').length,i===0?1:0);
 selects[0].value='tenacity';selects[0].handlers.change();const loadout=JSON.parse(saved.get('inkwave.splatoon3.gear.v1'));assert.equal(loadout[0].main,'tenacity');assert.equal(context.gear.normalizeLoadout(loadout)[0].main,'tenacity');
});

test('Practice Range dummy population never earns Tenacity and reentry does not alter battle ownership',()=>{
 const raw=fs.readFileSync('inkwave-public/src/game/match.js','utf8'),source=adaptQualitySource('src/game/match.js',raw),start=source.indexOf('  update(dt) {'),end=source.indexOf('\n  updateController',start);
 const events=[],Native=vm.runInNewContext(`class Match {${source.slice(start,end)}};Match`,{G:{},emit:(...x)=>events.push(x),advanceTenacity,sampleTeamWipes,PLAYER:{radius:.3},MATCH:{finalCountdown:10},Math});
 for(const range of [true,false,true]){const m=Object.assign(new Native(),match(3),{opts:{range},stateT:0,setState(s){this.state=s;}});m.actors.forEach((a,i)=>{a.pos={x:i*3,y:0,z:0};a.update=()=>{};if(a.team===1)a.rangeTarget={index:i};});for(let i=0;i<60;i++)m.update(1/60);assert.ok(Math.abs(m.actors[0].special-(range?0:7.59))<1e-10);}
 assert.equal(events.length,0);
 const remote=match(3);remote.actors[0].remote=true;advanceTenacity(remote,1,()=>{});assert.equal(remote.actors[0].special,0);
});
test('negative control without the range gate awards passive points for training targets',()=>{
 const source=fs.readFileSync('patches/local-quality/tenacity.mjs','utf8');assert(source.includes(' || match.opts?.range'));
 const old=vm.runInNewContext(source.replace(' || match.opts?.range','').replaceAll('export ','')+';advanceTenacity');
 const m=Object.assign(match(3),{opts:{range:true}});old(m,1,()=>{});assert.equal(m.actors[0].special,7.59);
});
