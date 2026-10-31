import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {compactModuleStrings} from '../../../scripts/lib/inkwave-source-compaction.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const source = process.env.SPECIAL_VFX_SOURCE ? fs.readFileSync(process.env.SPECIAL_VFX_SOURCE, 'utf8') : read('../runtime/special-vfx.mjs');
const code = adaptBuildSource('patches/splatoon3/runtime/special-vfx.mjs', source).replace(/^import .*;\n/gm, '').replace(/^export default .*;$/gm, '').replace(/^export /gm, '');
const native = read('../../../inkwave-public/src/game/weapons.js');
const methods = native.slice(native.indexOf('  _new() {'), native.indexOf('  ghostBomb('));
class Vec {
  constructor(x=0,y=0,z=0) { this.set(x,y,z); }
  set(x,y,z) { Object.assign(this,{x,y,z}); return this; }
  multiplyScalar(s) { this.x*=s;this.y*=s;this.z*=s;return this; }
  add(p) { return this.addScaledVector(p,1); }
  copy(p) { return this.set(p.x,p.y,p.z); }
  setY(y) { this.y=y; return this; }
  addScaledVector(p,s) { this.x+=p.x*s;this.y+=p.y*s;this.z+=p.z*s;return this; }
}
function fixture({reject=false,nested=false}={}) {
  const G = {}, context = vm.createContext({ console, G, THREE: {Vector3:Vec}, inkVacState:a=>a.state, inkVacPresentationMuzzle:()=>false, WAIL_SPEAKER_POSITIONS:[], SHELL:{SHOCK:1} });
  let program=code+'\nglobalThis.testApi={Director,DIRECTORS,installSpecialVfx,directors};\nclass NativeProjectiles { '+methods+' }; globalThis.Projectiles=NativeProjectiles;';
  if(process.env.SPECIAL_VFX_ESBUILD) program=compactModuleStrings(createRequire(import.meta.url)(process.env.SPECIAL_VFX_ESBUILD).transformSync(program,{loader:'js',minify:true,charset:'utf8'}).code).code;
  vm.runInContext(program,context);
  const {Director,DIRECTORS,installSpecialVfx,directors}=context.testApi;
  class FX { update(){} clear(){} setCollider(){} }
  const fx = new FX(), P = context.Projectiles, system = new P();
  Object.assign(system,{list:[],pool:[],inkFlight:{restore(){}}});
  Object.assign(G,{fx,projectiles:system});
  const flashes=[], shells=[], director=Object.assign(Object.create(Director.prototype),{
    inkVacShots:new WeakSet(), inkjetImpacts:new WeakSet(), rounds:new Map(),
    v:Array.from({length:8},()=>new Vec()), rgb:()=>[1,0,0], aim:(_,out)=>out.set(0,0,1),
    muzzle(p){flashes.push({...p});},shell(...args){shells.push(args);},call(fn,...args){return fn?.apply(this,args);},
  });
  const nativeGhost=P.prototype.ghostProjectile;
  if(reject) {P.prototype.ghostProjectile=function(){return null;};P.prototype._push=function(){return false;};}
  if(nested) P.prototype.ghostProjectile=function(...args){nativeGhost.apply(this,args);this._push(this.list.pop());};
  directors.set(fx,director);
  installSpecialVfx({FX,Projectiles:P,G});
  const actor={pos:new Vec(),team:0,state:{phase:'exhale'}};
  const shot=(reuse)=>{if(reuse)system.pool.push(reuse);const p=system._new();Object.assign(p,{wid:'inkVac',owner:actor,team:0,dead:false});p.pos.set(2,3,4);p.start.copy(p.pos);return p;};
  const packet=[0,'p',7,'blast','inkVac',2,3,4,0,0,30,0,4,0,6,.2,0,0,0,0,.2,1,1,0,0,0,0];
  return {G,system,actor,shot,packet,flashes,shells,director,DIRECTORS};
}
test('HOLD, no shot and cancellation never emit a countershot muzzle',()=>{
  const f=fixture(),track={color:[1,0,0],d:{}};
  for(const phase of ['exhale','exhale','done',null]) {f.actor.state.phase=phase;f.DIRECTORS.inkVac.frame.call(f.director,f.actor,track,1/60);}
  assert.equal(f.flashes.length,0);
});
test('actual native _push emits once at authored birth, preserves native recording and return',()=>{
  const f=fixture(),p=f.shot();let recorded=0;f.G.netm={recProj(q){assert.equal(q,p);recorded++;}};
  assert.equal(f.system._push(p),undefined); assert.equal(recorded,1);
  assert.equal(f.flashes.length,1);assert.deepEqual(f.flashes[0],{x:2,y:3,z:4});assert.equal(f.shells.length,1);
  f.director.inkVacShot(p);f.system._push(p);assert.equal(f.flashes.length,1);
});
test('actual native ghostProjectile bypasses _push but emits once on accepted birth',()=>{
  const f=fixture();f.actor.remote=true;
  assert.equal(f.system.ghostProjectile(f.actor,f.packet),undefined);
  const p=f.system.list[0];assert.equal(p.ghost,true);assert.equal(f.flashes.length,1);
  f.system._push(p);assert.equal(f.flashes.length,1,'nested push/ghost observation deduplicated');
});
test('native _new resets pooled-object dedup for the next actual shot',()=>{
  const f=fixture(),p=f.shot();f.system._push(p);f.system.list.length=0;
  assert.equal(f.shot(p),p);f.system._push(p);assert.equal(f.flashes.length,2);
});
test('disabled effects, dead/cancelled rounds and unrelated projectiles produce no flash',()=>{
  const f=fixture();const dead=f.shot();dead.dead=true;f.system._push(dead);
  const cancelled=f.shot();cancelled._netEnded=true;f.system._push(cancelled);
  const other=f.shot();other.wid='trizooka';f.system._push(other);
  f.G.fx.s3SpecialVfxEnabled=false;f.system._push(f.shot());assert.equal(f.flashes.length,0);
});
test('native hook ignores another projectile system',()=>{
  const f=fixture(),other=Object.create(Object.getPrototypeOf(f.system));Object.assign(other,{list:[]});other._push(f.shot());assert.equal(f.flashes.length,0);
});

test('rejected births never emit; nested ghost-to-push emits only once',()=>{
  const rejected=fixture({reject:true});assert.equal(rejected.system._push(rejected.shot()),false);
  assert.equal(rejected.system.ghostProjectile(rejected.actor,rejected.packet),null);assert.equal(rejected.flashes.length,0);
  const nested=fixture({nested:true});nested.system.ghostProjectile(nested.actor,nested.packet);assert.equal(nested.flashes.length,1);
});
test('actual Ink Vac authored emitter reaches the installed native birth hook',()=>{
  const f=fixture(),kit=read('../runtime/kit-ink-vac.mjs');
  const begin=kit.indexOf('    Projectiles.prototype.fireInkVacExhale = function');
  const end=kit.indexOf('\n    };',begin)+7;
  // The authored emitter now shares its launch snapshot with prediction. Run
  // that actual helper and its local dependencies in this same fixture realm.
  const launch=kit.match(/^export function inkVacExhaleKinematics\([\s\S]*?^\}/m)?.[0];
  const requireApi=kit.match(/^function requireApi\(\).+$/m)?.[0];
  const clamp01=kit.match(/^const clamp01 =.+$/m)?.[0];
  assert.ok(launch&&requireApi&&clamp01,'actual Ink Vac launch dependencies are present');
  const THREE={Vector3:Vec};
  const context=vm.createContext({ Projectiles:f.system.constructor,THREE,api:{THREE},
    originOf:(_,v)=>v.set(2,3,4),forwardOf:(_,v)=>v.set(0,0,1),exhaleDamage:()=>220,
    exhaleSpeed:()=>30,MIN_PLAYER_RADIUS:.2,SPAWN_SPEED_Y:0,SPAWN_BLAST_WAIT:240,
    INK_VAC_CALIBRATION:{framesPerSecond:60},FLY_GRAVITY:0,FLY_AIR_RESIST:0 });
  vm.runInContext([clamp01,requireApi,launch.replace(/^export /,''),kit.slice(begin,end)].join('\n'),context);
  const p=f.system.fireInkVacExhale(f.actor,{charge:.5,descriptor:{id:'inkVac',impactRadius:8}});
  assert.equal(f.system.list[0],p);assert.equal(f.flashes.length,1);assert.equal(p.age,0);assert.equal(p.life,4);
});

test('clearing presentation neither flashes nor replays an already observed live round',()=>{
  const f=fixture(),p=f.shot();f.system._push(p);
  for(const name of ['tracks','objects','lasers','domes','coolers','fists','storms'])f.director[name]=new Map();
  f.director.kit={clear(){}};f.G.fx.clear();assert.equal(f.flashes.length,1);
  f.system._push(p);assert.equal(f.flashes.length,1);
});
