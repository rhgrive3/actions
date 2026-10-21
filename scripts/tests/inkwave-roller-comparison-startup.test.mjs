import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { bindRollerComparisonStartup, installRollerComparisonRandom } from '../lib/inkwave-roller-comparison-startup.mjs';

function fixture(){
  const stored=new Map(),window={};
  vm.runInNewContext('('+bindRollerComparisonStartup.toString()+')()',{
    window,localStorage:{setItem:(k,v)=>stored.set(k,v)}});
  const profile=JSON.parse(stored.get('inkwave.profile')),settings=JSON.parse(stored.get('inkwave.settings'));
  const v=(...values)=>({toArray:()=>[...values]});
  let calls=0,draws=0,lastArgs,lastThis;
  const token={unchanged:true};
  const proto={update(...args){calls++;lastArgs=args;lastThis=this;this.t+=args[0];this.rng();return token;}};
  const c=Object.assign(Object.create(proto),{name:profile.name,style:{...profile.style},seed:2444336694,
    color:v(1,0,0),enemyColor:v(0,0,1),hairMeta:[{},{}],hairPh:new Float32Array([1,2]),
    t:0,phase:0,brPh:0,brN:0,brAmp:1,brRate:1,tr:new Float32Array([0,100]),bl:{next:1},att:{t:1},
    rng(){draws++;return .25;}});
  const actor={character:c,team:0,pos:v(0,0,0),vel:v(0,0,0),yaw:0,aimYaw:0,aimPitch:0,
    grounded:true,form:'kid',hp:100,ink:100,dead:false,groundTeam:0,ground:{face:1},weaponRunner:{rolling:true}};
  const G={time:.05,local:actor,teamHex:['#ffd21a','#2a52ff'],teamColors:[v(1,0,0),v(0,0,1)]};
  window.__G=G;window.__inkwave={profile,settings};window.__rollerVideoClocks=()=>({game:G.time});
  return {stored,window,c,G,profile,settings,token,stats:()=>({calls,draws,lastArgs,lastThis})};
}

test('startup binding selects the existing native Rookie preset and normal colorblind palette',async()=>{
  const root=new URL('../../',import.meta.url);
  const source=fs.readFileSync(new URL('inkwave-public/src/game/character-style.js',root),'utf8');
  const catalog=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const config=fs.readFileSync(new URL('inkwave-public/src/config.js',root),'utf8');
  assert.match(config,/COLORBLIND_PALETTE = \{ id: 'cb-yellow-blue', a: '#ffd21a', b: '#2a52ff'/);
  const f=fixture();assert.deepEqual(f.profile.style,catalog.PRESETS.find(x=>x.id==='rookie').style);
  assert.deepEqual(Object.keys(f.profile.style),['hair','skin','outfit','eyes','hat','brows']);
  assert.deepEqual([...f.stored.keys()],['inkwave.profile','inkwave.settings']);
  assert.equal(f.settings.colorblind,true);assert.equal(f.G.time,.05);assert.equal(f.c.t,0);
  assert.equal(f.stats().draws,0);assert.equal(f.stats().calls,0);
});
test('observer forwards native receiver, arguments, return and RNG exactly, then restores descriptors',()=>{
  const f=fixture(),rd=Object.getOwnPropertyDescriptor(f.c,'rng'),originalUpdate=f.c.update;
  const initial=f.window.__beginRollerCharacterObserver();
  const input={speed:3,grounded:true,localMove:{x:0,z:1}},extra={pass:true};
  assert.equal(f.c.update(1/60,input,extra),f.token);
  assert.equal(f.stats().lastThis,f.c);assert.deepEqual(f.stats().lastArgs,[1/60,input,extra]);
  assert.equal(f.stats().draws,1);assert.equal(f.stats().calls,1);
  const receipt=f.window.__rollerCharacterObserver.restore();
  assert.equal(receipt.restored,true);assert.deepEqual(Object.getOwnPropertyDescriptor(f.c,'rng'),rd);
  assert.equal(f.c.update,originalUpdate);assert.equal(Object.hasOwn(f.c,'update'),false);
  assert.equal(receipt.draws.length,1);assert.equal(receipt.draws[0].value,.25);
  assert.equal(receipt.frames.length,1);assert.equal(receipt.frames[0].dt,1/60);
  assert.equal(receipt.frames[0].after.character.t,1/60);
  assert.equal(initial.state.character.t,0);assert.equal(receipt.performanceEvidence,false);
});
for(const [name,mutate]of [
  ['style',f=>f.c.style.hair=1],['saved profile',f=>f.profile.style.hair=1],
  ['name',f=>f.c.name='Other'],['palette',f=>f.G.teamHex[0]='#000000'],
  ['setting',f=>f.settings.colorblind=false]
])test('mismatched '+name+' is rejected before observation',()=>{
  const f=fixture(),r=f.c.rng,u=f.c.update;mutate(f);
  assert.throws(()=>f.window.__beginRollerCharacterObserver(),/Comparison/);
  assert.equal(f.c.rng,r);assert.equal(f.c.update,u);assert.equal(f.stats().calls,0);assert.equal(f.stats().draws,0);
});
test('non-finite native input is rejected without invoking an extra update',()=>{
  const f=fixture();f.window.__beginRollerCharacterObserver();
  try{assert.throws(()=>f.c.update(1/60,{speed:Infinity}),/Non-finite/);assert.equal(f.stats().calls,0);}
  finally{f.window.__rollerCharacterObserver.restore();}
});
test('exact360 native updates are admitted and361st is rejected without invoking native code',()=>{
  const f=fixture();f.window.__beginRollerCharacterObserver();
  try{for(let i=0;i<360;i++)f.c.update(1/60,{});
    assert.throws(()=>f.c.update(1/60,{}),/update bound/);assert.equal(f.stats().calls,360);}
  finally{f.window.__rollerCharacterObserver.restore();}
});
test('RNG draw bound fails closed before consuming another native random value',()=>{
  const f=fixture();f.window.__beginRollerCharacterObserver();
  try{for(let i=0;i<4096;i++)f.c.rng();
    assert.throws(()=>f.c.rng(),/draw bound/);assert.equal(f.stats().draws,4096);}
  finally{f.window.__rollerCharacterObserver.restore();}
});
test('pair equality rejects separate style, clock, physics, input, RNG and breath changes',()=>{
  const f=fixture();f.window.__beginRollerCharacterObserver();f.c.update(1/60,{speed:3});
  const a=JSON.parse(JSON.stringify(f.window.__rollerCharacterObserver.restore()));
  for(const mutate of [
    x=>x.initial.style.hair++,x=>x.frames[0].after.sceneClocks.game+=1/60,
    x=>x.frames[0].after.actor.pos[0]+=.001,x=>x.frames[0].input.scalars.speed+=.001,
    x=>x.draws[0].value+=.001,x=>x.frames[0].after.character.brPh+=1e-12
  ]){const b=structuredClone(a);mutate(b);assert.throws(()=>assert.deepEqual(a,b));}
});
test('numeric-only path guards all native image serialization and both screenshot paths',()=>{
  const driver=fs.readFileSync(new URL('../check-inkwave-roller-holding-video.mjs',import.meta.url),'utf8');
  assert.equal((driver.match(/toDataURL\('image\/png'\)/g)||[]).length,4);
  assert.equal((driver.match(/numericOnly\?null:G\.renderer\.domElement\.toDataURL/g)||[]).length,4);
  assert.match(driver,/if\(!numericOnly\)await page\.locator/);
  assert.match(driver,/if\(!numericOnly\)await page\?\.screenshot/);
  assert.match(driver,/if\(numericOnly\)\{delete image\.png;continue;\}/);
});

function randomFixture(seed=1715,installer=installRollerComparisonRandom){
  const context=vm.createContext({window:{}});
  vm.runInContext('window.originalRandom = Math.random',context);
  vm.runInContext('('+installer.toString()+')({seed:'+seed+'})',context);
  return {context,api:context.window.__rollerComparisonRandom,run:code=>vm.runInContext(code,context)};
}
test('pre-import stable function keeps captured native FX aliases seeded across closure resets',()=>{
  const f=randomFixture();
  vm.runInContext('const rand=Math.random; window.fxDraw=()=>rand();',f.context,{filename:'http://localhost:1234/src/fx/fx.js'});
  const first=Array.from({length:3},()=>f.context.window.fxDraw());
  assert.equal(f.api.phase().nativeFxDrawIndices.length,3);assert.equal(f.api.phase().draws,3);
  const identity=f.run('Math.random');f.api.begin('steady-180');
  assert.deepEqual(Array.from({length:3},()=>f.context.window.fxDraw()),first);
  assert.equal(f.run('Math.random'),identity);assert.deepEqual(Array.from(f.api.phase().nativeFxDrawIndices),[0,1,2]);
  const r=f.api.restore();assert(r.originalRestored);assert.equal(f.run('Math.random'),f.context.window.originalRandom);
  assert.equal(f.api.receipt().phases.length,2);
});
test('old late-replacement alias is rejected by the stable function identity guard',()=>{
  const f=randomFixture();f.run('Math.random=()=>.5');
  assert.throws(()=>f.api.begin('steady-180'),/identity changed/);
  assert.throws(()=>f.api.phase(),/identity changed/);
  assert.throws(()=>f.api.receipt(),/identity changed/);
  assert.throws(()=>f.api.restore(),/identity changed/);
});
test('RNG boundary order, duplicate reset and invalid seed fail closed',()=>{
  const f=randomFixture();f.run('Math.random()');
  assert.throws(()=>f.api.begin('movie-180'),/Unexpected/);assert.equal(f.api.phase().draws,1);
  f.api.begin('steady-180');assert.throws(()=>f.api.begin('steady-180'),/Unexpected/);
  for(const seed of [-1,4294967296,1.5,NaN])assert.throws(()=>randomFixture(seed),/uint32/);
  f.api.restore();
});
test('global RNG observer forwards native seeded values and cannot add uncounted alias draws',()=>{
  const f=randomFixture(),seen=[];f.api.observe((value,label,index)=>seen.push([value,label,index]));
  const values=f.run('[Math.random(),Math.random()]');assert.equal(seen.length,2);
  assert.equal(seen[0][0],values[0]);assert.deepEqual(seen.map(x=>x.slice(1)),[['startup',0],['startup',1]]);
  f.api.observe(null);f.run('Math.random()');assert.equal(seen.length,2);assert.equal(f.api.phase().draws,3);
  f.api.restore();
});
test('global RNG draw limit rejects before an extra output and copied receipts cannot edit the state',()=>{
  const f=randomFixture();f.run('for(let i=0;i<200000;i++) Math.random()');
  assert.throws(()=>f.run('Math.random()'),/draw bound/);assert.equal(f.api.phase().draws,200000);
  const r=f.api.receipt();r.phases[0].draws=0;r.phases[0].firstValues[0]=99;
  assert.equal(f.api.phase().draws,200000);assert.notEqual(f.api.phase().firstValues[0],99);f.api.restore();
});
test('driver never replaces Math.random after native imports or resets native clocks',()=>{
  const driver=fs.readFileSync(new URL('../check-inkwave-roller-holding-video.mjs',import.meta.url),'utf8');
  assert.equal((driver.match(/Math\.random\s*=(?!=)/g)||[]).length,0);
  assert.equal((driver.match(/(?:G\.time|g\.time|c\.t|c\.brPh)\s*=(?!=)/g)||[]).length,0);
  assert.match(driver,/addInitScript\(installRollerComparisonRandom,\{seed:gripSeed\}\)/);
  assert.match(driver,/globalRandom\.begin\('steady-180'\)/);assert.match(driver,/globalRandom\.begin\('movie-180'\)/);
  assert.match(driver,/Global RNG changed while native movie was frozen/);
  assert.match(driver,/Movie inspection changed simulation or stable global RNG/);
});

test('actual native clock can route presentation separately while captured QA aliases remain callable',()=>{
  const source=fs.readFileSync(new URL('../../patches/splatoon3/runtime/clock.mjs',import.meta.url),'utf8');
  const start='const PRESENTATION_SEED =',end='export class FixedClock';
  assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);
  const native=source.slice(source.indexOf(start),source.indexOf(end)).replace('export function withSeparatedPresentationRandom','function withSeparatedPresentationRandom');
  const f=randomFixture(),qa=f.run('Math.random');f.run('window.capturedRandom=Math.random');
  vm.runInContext(native+`;window.nativeFrame=()=>withSeparatedPresentationRandom(()=>{
    const presentation=Math.random,firstPresentation=presentation();
    const aliasValue=window.capturedRandom();let tickRandomIdentity,tickValue;
    runTickWithGameplayRandom(()=>{tickRandomIdentity=Math.random;tickValue=Math.random();},1/60);
    const afterTick=Math.random,secondPresentation=Math.random();
    return {presentation,firstPresentation,aliasValue,tickRandomIdentity,tickValue,afterTick,secondPresentation};
  });`,f.context);
  const result=f.context.window.nativeFrame();
  assert.notEqual(result.presentation,qa);assert.equal(result.afterTick,result.presentation);
  assert.equal(result.tickRandomIdentity,qa);assert.equal(f.run('Math.random'),qa);
  assert.equal(f.api.phase().draws,2);assert.equal(f.api.phase().capturedAliasWhileGlobalDiffers,1);
  assert.deepEqual(Array.from(f.api.phase().firstValues),[result.aliasValue,result.tickValue]);
  assert.notEqual(result.firstPresentation,result.secondPresentation);
  assert.equal(f.api.receipt().nativePresentationDrawsObserved,false);f.api.restore();
});

test('old per-draw identity guard rejects the real native routing and still restores native global on exception',()=>{
  const old=installRollerComparisonRandom.toString().replace('const random=function(){','const random=function(){ identity();');
  assert.notEqual(old,installRollerComparisonRandom.toString());
  const f=randomFixture(1715,{toString:()=>old}),qa=f.run('Math.random');
  const source=fs.readFileSync(new URL('../../patches/splatoon3/runtime/clock.mjs',import.meta.url),'utf8');
  const native=source.slice(source.indexOf('const PRESENTATION_SEED ='),source.indexOf('export class FixedClock')).replace('export function withSeparatedPresentationRandom','function withSeparatedPresentationRandom');
  vm.runInContext(native+';window.alias=Math.random;window.frame=()=>withSeparatedPresentationRandom(()=>window.alias());',f.context);
  assert.throws(()=>f.context.window.frame(),/identity changed/);
  assert.equal(f.run('Math.random'),qa);assert.equal(f.api.phase().draws,0);f.api.restore();
});
test('throwing native presentation callback preserves counted aliases and restores global before QA cleanup',()=>{
  const f=randomFixture(),qa=f.run('Math.random');
  const source=fs.readFileSync(new URL('../../patches/splatoon3/runtime/clock.mjs',import.meta.url),'utf8');
  const native=source.slice(source.indexOf('const PRESENTATION_SEED ='),source.indexOf('export class FixedClock')).replace('export function withSeparatedPresentationRandom','function withSeparatedPresentationRandom');
  vm.runInContext(native+';window.alias=Math.random;window.frame=()=>withSeparatedPresentationRandom(()=>{window.alias();throw Error("native callback failure");});',f.context);
  assert.throws(()=>f.context.window.frame(),/native callback failure/);
  assert.equal(f.run('Math.random'),qa);assert.equal(f.api.phase().draws,1);
  assert.equal(f.api.phase().capturedAliasWhileGlobalDiffers,1);
  assert(f.api.restore().originalRestored);assert.equal(f.run('Math.random'),f.context.window.originalRandom);
});
