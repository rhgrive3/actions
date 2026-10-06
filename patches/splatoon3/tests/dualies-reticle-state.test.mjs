import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
import {fixture} from './weapon-edgecases-fixture.mjs';import {adaptSource} from '../adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {adaptQualitySource} from '../../local-quality/adapter.mjs';import {FixedClock} from '../runtime/clock.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),SITE=process.env.INKWAVE_RETICLE_BUILT_SITE;
async function hudMethod(){const sourceRoot=SITE||path.join(ROOT,'inkwave-public'),mods=new Map(),context=vm.createContext({console,performance,URL,innerWidth:1280,innerHeight:720});
 const load=file=>{if(!SITE&&file.startsWith(path.join(sourceRoot,'patches')+path.sep))file=path.join(ROOT,path.relative(sourceRoot,file));if(mods.has(file))return mods.get(file);let code=fs.readFileSync(file,'utf8');if(!SITE){const rel=path.relative(sourceRoot,file);if(!rel.startsWith('..'))code=adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,code))));}const m=new vm.SourceTextModule(code,{context,identifier:file,initializeImportMeta(meta){meta.url=new URL(file,'file:').href;}});mods.set(file,m);return m;};
 const m=load(path.join(sourceRoot,'src/ui/hud.js'));await m.link((s,f)=>load(s==='three'?path.join(sourceRoot,'vendor/three/build/three.module.js'):path.resolve(path.dirname(f.identifier),s)));await m.evaluate();return m.namespace.HUD.prototype._updCrosshair;
}
function node(){const classes=new Set(),parts=new Map();return {classes,querySelector(key){if(!parts.has(key))parts.set(key,node());return parts.get(key);},classList:{toggle(k,on){on?classes.add(k):classes.delete(k);}},style:{setProperty(){}}};}
async function setup(){const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner,h={_L:{kind:'dualies',weapon:'dualies'},_bloom:0,_kick:0,ret:node(),xh:node(),shield:node(),subChip:node(),_local:()=>a,_snd(){},_updCrosshair:await hudMethod()};return {...f,a,r,h,draw(dt=1/60){h._updCrosshair({weapon:'dualies',crosshair:{spread:r.spread}},dt);return h.ret.classes.has('is-lock');}};}
async function roll(f){f.a.intent.fire=true;assert.equal(f.r.tryDodge(new f.THREE.Vector3(0,0,1)),true);f.draw();assert.ok(f.h.ret.classes.has('is-roll'));assert.equal(f.draw(),false);let count=0;while(f.r.dodge&&count++<60)f.r.update(1/60,{fire:true});assert.equal(f.r.s3Turret,true);assert.equal(f.draw(),true);assert.equal(f.h.ret.classes.has('is-roll'),false);}
test('#518 actual completed roll retains HUD concentrated state after movement lock expires',async()=>{
 const f=await setup();assert.equal(f.draw(),false);await roll(f);for(let i=0;i<80;i++){f.r.update(1/60,{fire:true});assert.equal(f.draw(),true);assert.equal(f.r._spreadDeg(f.a.weapon),0);}assert.equal(f.r.lockT,0);assert.equal(f.r.s3Turret,true);
});
test('#518 native turret-ending transitions clear HUD even if physical lock still remains',async()=>{
 for(const end of ['release','move','squid','sub','reset','weapon']){const f=await setup();await roll(f);if(end==='move'){f.r.lockT=0;f.a.intent.move.set(1,0,0);}if(end==='squid')f.a.form='squid';
  if(end==='reset')f.r.reset();else if(end==='weapon'){f.a.setWeapon('shooter');f.a.setWeapon('dualies');}else f.r.update(1/60,{fire:end!=='release',sub:end==='sub'});
  assert.equal(f.r.s3Turret,false,end);assert.equal(f.draw(),false,end);
 }
});
test('#518 HUD reads the local gameplay owner and cannot change weapon cadence, spread or state',async()=>{
 const f=await setup();f.r.s3Turret=true;f.r.lockT=0;const before=[f.r.cooldown,f.r.s3Turret,f.a.weapon.lockInterval,f.a.weapon.spreadLock];for(let i=0;i<120;i++)assert.equal(f.draw(1/120),true);assert.deepEqual([f.r.cooldown,f.r.s3Turret,f.a.weapon.lockInterval,f.a.weapon.spreadLock],before);
 f.h._local=()=>null;assert.equal(f.draw(),false);
});
test('#518 render schedules cannot shorten semantic turret lifetime',async()=>{
 for(const hz of [30,60,120]){const f=await setup();await roll(f);const clock=new FixedClock();for(let j=0;j<hz*2;j++){clock.advance(1/hz,dt=>f.r.update(dt,{fire:true}));assert.equal(f.draw(1/hz),true);}assert.equal(f.r.lockT,0);f.r.update(1/60,{fire:false});assert.equal(f.draw(1/hz),false);}
});
