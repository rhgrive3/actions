import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const browser = fs.readFileSync(new URL('../../../scripts/check-inkwave-ranked-browser.mjs', import.meta.url), 'utf8');
// Execute the browser callback's exact setup, without importing its Playwright CLI
// or maintaining a second implementation of the fix.
const setupSource = browser.match(/\/\/ BEGIN RAINMAKER PROOF TARGET SETUP[^\n]*\n([\s\S]*?)\/\/ END RAINMAKER PROOF TARGET SETUP/)?.[1];
assert.ok(setupSource, 'browser target setup is explicitly delimited');
const prepare = vm.runInNewContext(`(${setupSource.trim()})`);
// Exact previous setup as a negative control: only omit the new native reset.
const prepareWithoutWeaponReset = vm.runInNewContext(`(${setupSource.replace('target.weaponRunner.reset();', '').trim()})`);
async function boot() {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, includeCharacter: true, adaptNative: adaptBuildSource, adaptRuntime: adaptBuildSource,
    extraExports: `export { Match } from './inkwave-public/src/game/match.js';
      export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
      export { validRainmakerShotOrigin } from './patches/splatoon3/runtime/ranked/rainmaker-shot-origin.mjs';
      export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
      export { createRankedEffects } from './patches/splatoon3/runtime/ranked/combat.mjs';` });
  f.context.structuredClone = structuredClone; f.installRanked({ ...f.installedRuntime, structuredClone });
  f.G.scene = { add() {}, remove() {} }; f.G.netm = null;
  f.G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80,0,0],[80,0,0]], spawnBarrier: 0,
    half: [], single: [{ kind: 'box', min: [-100,-.5,-100], max: [100,0,100] }] });
  f.G.physics = new f.Physics(f.G.level); f.G.paint = { sample: () => 1, splat: () => 0 };
  return f;
}
function scenario(f, vx, stable, { weapon='shooter', charge=false, rollFrames=null, reset=true, wall=false }={}) {
  const { G } = f, dt = 1/60; G.actors = []; G.time = 0; G.projectiles.clear();
  // Release admission samples the native objective grip, not f.make()'s fixed muzzle.
  const a = new f.Actor({ team: 0, name: 'carrier', weapon: 'shooter', CharacterClass: f.Character }), target = f.make(weapon);
  a.character.actor = a;
  G.actors.push(a);
  Object.assign(a, { nid: 1, slot: 0, team: 0, invuln: 0 }); Object.assign(target, { nid: 2, slot: 0, team: 1, invuln: 0 });
  for (const p of [a,target]) { delete p._integrate; p.s3.spawnArmor = null; p.pos.set(0,0,0); p.vel.set(0,0,0); p.grounded = p.ground.hit = true; p.ground.block = 0; p.groundN.set(0,1,0); }
  const e = new f.RankedEngine('rainmaker', { id: 'proof-target', rainmaker: { center: [0,0,0], goals: [[0,0,40],[0,0,-40]], checkpoints: [[],[]] } });
  const m = G.match = Object.assign(Object.create(f.Match.prototype), { mode: 'rainmaker', state: 'playing', actors: [a,target], local: a, ranked: e,
    rankedGains: [0,0], rankedBarrierHits: [], time: 300, duration: 300, canRespawn: () => false,
    rankedWorld: { zoneCoverage: () => [], floorAt: () => 0, blocked: () => false, update() {} } });
  m.rankedEffects = f.createRankedEffects(f.installedRuntime,m);
  target.pos.set(0,0,2); e.rule.state.barrier.active = false; m.advanceRanked(dt); assert.equal(e.rule.state.carrier, '1');
  // Enter action state through the real runner; do not invent private state.
  if (charge) {
    target.form='kid';target.aimYaw=Math.atan2(.17865936485435868,-.9839109875135237);target.aimPitch=0;
    target.aimDir.set(.17865936485435868,0,-.9839109875135237);target.intent.move.copy(target.aimDir);target.intent.fire=true;
    for(let i=0;i<180;i++)target.weaponRunner.update(dt,{fire:true});
    assert.equal(target.weaponRunner.charging,true);
  }
  if (rollFrames!==null) {
    target.intent.fire=true;target.intent.move.set(.17865936485435868,0,-.9839109875135237);
    assert.equal(target.weaponRunner.tryDodge(target.intent.move),true);
    for(let i=0;i<rollFrames;i++){G.time+=dt;target.update(dt);}
    assert.ok(target.weaponRunner.dodge||target.weaponRunner.s3DualiesGlide||target.weaponRunner.catalogState?.roll||target.weaponRunner.catalogState?.slip,'real native/catalogue roll or slide is active');
  }
  const actionBefore={nativeRoll:!!target.weaponRunner.dodge,nativeSlide:!!target.weaponRunner.s3DualiesGlide,catalogRoll:!!target.weaponRunner.catalogState?.roll,catalogSlip:!!target.weaponRunner.catalogState?.slip};
  target.vel.set(vx,0,0); target.grounded = target.ground.hit = false;
  // Original incomplete browser setup, retained as the negative control.
  target.pos.set(0,0,2); target.invuln = 0; target.s3.spawnArmor = null; target.intent.move.set(0,0,0);
  target.intent.fire = target.intent.sub = target.intent.special = target.intent.squid = false;
  if (stable) (reset?prepare:prepareWithoutWeaponReset)(target, {x:0,z:2}, 0, G.physics, f.PLAYER.footRadius);
  a.form = 'kid'; a.aimYaw = a.aimPitch = 0; a.aimDir.set(0,0,1); a.intent.move.set(0,0,0); a.vel.set(0,0,0);
  const damage = [], shots = [], hurt = target.damage, play = m.playRankedEvents;
  target.damage = function(amount,...args) { damage.push(amount); return hurt.call(this,amount,...args); };
  m.playRankedEvents = function(events,...args) {
    for (const event of events.filter(e => e.kind === 'rainmaker-shot')) {
      assert.ok(a.character instanceof f.Character);
      assert.equal(Object.hasOwn(a, '_finishFrame'), false, 'release pose runs the native Actor finish');
      assert.ok(f.validRainmakerShotOrigin(event.shotOrigin, event), 'native release supplies the guarded origin');
      shots.push(event);
    }
    return play.call(this,events,...args);
  };
  const step = (n, fire) => { for(let i=0;i<n;i++) { G.time += dt; a.intent.fire=fire; a.intent.sub=a.intent.squid=false; a.update(dt); target.update(dt); m.advanceRanked(dt); } };
  step(61,true); assert.equal(e.rule.state.charge.value,1); step(1,false); step(20,true);
  assert.equal(shots.length,1); assert.ok(e.rule.state.charge.seconds <= 1e-8); step(20,false);
  const result = { actionBefore, damage:[...damage], alive:target.alive, pos:target.pos.toArray(), shots:shots.length };
  if (wall) {
    const owner=f.make();Object.assign(owner,{team:1,nid:3,slot:1,invuln:0});owner.pos.set(40,0,40);
    owner.weapon={...owner.weapon,sub:'splashWall'};owner.s3.abilityPoints={...owner.s3.abilityPoints,subPower:0};a.s3.objectHitGear=false;
    const shield=G.projectiles.throwBomb(owner);assert.equal(shield.subId,'splashWall');
    shield.phase='deployed';shield.pos.set(a.pos.x,a.pos.y,a.pos.z+1.2);shield.yaw=0;
    const before=shield.hp,beforeInk=a.ink,beforeSpecial=a.special,beforeShots=shots.length;
    step(61,true);step(1,false);step(20,true);step(20,false);
    assert.equal(before,800);assert.equal(shield.hp,380);assert.equal(shots.length-beforeShots,1);
    assert.equal(a.ink,beforeInk);assert.equal(a.special,beforeSpecial);
    result.wall={before,after:shield.hp,shots:shots.length-beforeShots};
  }
  m.rankedEffects.dispose(); return result;
}

test('browser Rainmaker proof clears residual target drift without weakening direct/blast assertions', async () => {
  const f = await boot();
  for (const vx of [0,8,10]) {
    const old = scenario(f,vx,false), fixed = scenario(f,vx,true);
    assert.deepEqual(old.damage, vx === 0 ? [60,180] : [], 'old fixture misses solely from residual velocity');
    assert.deepEqual(fixed.damage,[60,180]); assert.equal(fixed.alive,false); assert.equal(fixed.shots,1);
    assert.equal(fixed.pos[0],0); assert.ok(Math.abs(fixed.pos[1]) < 1e-12); assert.equal(fixed.pos[2],2);
  }
});

test('browser target setup rejects flight, Spawn and missing real support instead of erasing those states', async () => {
  const f = await boot(), a = f.make(), lane = {x:0,z:2}; a.invuln = 0;
  a.superJumpState = {phase:'flight'};
  assert.throws(() => prepare(a,lane,0,f.G.physics,f.PLAYER.footRadius), /settled target/); assert.equal(a.superJumpState.phase,'flight');
  a.superJumpState = null; a.s3.squidSpawn = {phase:'flight'};
  assert.throws(() => prepare(a,lane,0,f.G.physics,f.PLAYER.footRadius), /settled target/); assert.equal(a.s3.squidSpawn.phase,'flight');
  a.s3.squidSpawn = null;
  assert.throws(() => prepare(a,lane,10,f.G.physics,f.PLAYER.footRadius), /native floor support/);
});

test('ranked browser keeps strict shot, 60/180 damage, 420 wall damage and failure state receipts', () => {
  for (const text of ['!v.superJumpState&&!v.s3?.squidSpawn', 'events.length!==1', '!damage.includes(60)||!damage.includes(180)||target.alive',
    'wallBefore!==800||Math.abs(wall.hp-380)>1e-8', 'targetBefore,targetPrepared,targetAfter:targetState(),damage,shots:events']) assert.ok(browser.includes(text), text);
});


test('stationary proof resets charged Splatana actions and preserves strict actor and wall damage', async () => {
  const f=await boot();
  for(const weapon of ['shooter','s3-saber-lite','s3-saber-normal','s3-saber-heavy'])for(const charge of weapon==='shooter'?[false]:[false,true]){
    const fixed=scenario(f,0,true,{weapon,charge,wall:true});
    assert.deepEqual(fixed.damage,[60,180]);assert.equal(fixed.alive,false);assert.equal(fixed.shots,1);
    assert.ok(Math.hypot(fixed.pos[0],fixed.pos[2]-2)<1e-10);assert.deepEqual(fixed.wall,{before:800,after:380,shots:1});
    if(charge){const old=scenario(f,0,true,{weapon,charge,reset:false});assert.deepEqual(old.damage,[]);assert.equal(old.alive,true);assert.ok(Math.hypot(old.pos[0],old.pos[2]-2)>2);}
  }
});

test('stationary proof resets native Dualies rolls after admission instead of relying on velocity alone', async () => {
  const f=await boot();
  for(const rollFrames of [0,3,6]){
    const old=scenario(f,0,true,{weapon:'dualies',rollFrames,reset:false});assert.deepEqual(old.damage,[]);assert.equal(old.alive,true);
    const fixed=scenario(f,0,true,{weapon:'dualies',rollFrames,wall:true});
    assert.deepEqual(fixed.damage,[60,180]);assert.equal(fixed.alive,false);assert.equal(fixed.shots,1);
    assert.ok(Math.hypot(fixed.pos[0],fixed.pos[2]-2)<1e-10);assert.deepEqual(fixed.wall,{before:800,after:380,shots:1});
  }
});

test('failure receipts retain target weapon and bounded native/catalogue action state',()=>{
  for(const text of ['weapon:target.weaponId','charging:r.charging','charge:r.charge','dodge:phase(r.dodge)',
    'chargeF:c?.chargeF','stop:c?.stop','roll:phase(c?.roll)','lunge:phase(c?.lunge)','pending:!!c?.pending','stepStick:Array.from'])assert.ok(browser.includes(text),text);
});


test('stationary proof resets a catalogue Dualies roll and its distinct post-roll slip', async () => {
  const f=await boot();
  for(const [rollFrames,phase] of [[0,'catalogRoll'],[8,'catalogRoll'],[20,'catalogSlip']]){
    const opts={weapon:'s3-maneuver-long',rollFrames};
    const old=scenario(f,0,true,{...opts,reset:false});assert.equal(old.actionBefore[phase],true);
    assert.ok(Math.hypot(old.pos[0],old.pos[2]-2)>.2,'old action moves despite prepared velocity0');
    const fixed=scenario(f,0,true,{...opts,wall:true});assert.equal(fixed.actionBefore[phase],true);
    assert.deepEqual(fixed.damage,[60,180]);assert.equal(fixed.alive,false);assert.equal(fixed.shots,1);
    assert.ok(Math.hypot(fixed.pos[0],fixed.pos[2]-2)<1e-10);assert.deepEqual(fixed.wall,{before:800,after:380,shots:1});
  }
});

// The ranked checker must deliver keyboard events through native Input. Merely
// editing held keys omits the physical edge now owned by Player -> Actor.
async function keyboardProof() {
  const f=await fixture({fullRuntime:true,productionComposition:true}),modules=new Map();
  const root=new URL('../../../',import.meta.url),upstream=new URL('inkwave-public/',root);
  class KeyboardEvent extends Event { constructor(type,options={}) { super(type);this.code=options.code;this.repeat=options.repeat??false; } }
  const window=new EventTarget(),document=Object.assign(new EventTarget(),{
    documentElement:{classList:{add(){},remove(){},toggle(){}}},hidden:false,pointerLockElement:null,hasFocus:()=>true,
  });
  Object.assign(f.context,{window,document,KeyboardEvent,AbortController,
    navigator:{userAgent:'ranked keyboard regression',maxTouchPoints:0,getGamepads:()=>[]},
    screen:{width:1280,height:800,orientation:{angle:0}},localStorage:{getItem:()=>null},RG:f.G,
    __rankedReplication:{motionTimer:null,armDodge(){ /* Actual browser observer is installed separately. */ }}});
  const synthetic=(identifier,values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value]of Object.entries(values))this.setExport(key,value);},{context:f.context,identifier});
  function load(url) {
    if(url.href.startsWith(new URL('patches/',upstream).href))url=new URL(url.href.slice(upstream.href.length),root);
    if(modules.has(url.href))return modules.get(url.href);
    const rel=url.href.startsWith(upstream.href)?url.href.slice(upstream.href.length):url.href.slice(root.href.length);
    const mod=rel==='src/core/ctx.js'?synthetic(url.href,{G:f.G})
      :rel==='src/config.js'?synthetic(url.href,f)
      :new vm.SourceTextModule(adaptBuildSource(rel,fs.readFileSync(url,'utf8')),{context:f.context,identifier:url.href});
    modules.set(url.href,mod);return mod;
  }
  const inputModule=load(new URL('src/core/input.js',upstream));
  await inputModule.link((spec,from)=>spec==='three'?synthetic('three',{...f.THREE}):load(new URL(spec,from.identifier)));
  await inputModule.evaluate();
  const input=new inputModule.namespace.Input({}),a=f.make('dualies'),rig={yaw:0,pitch:0};
  f.G.input=input;f.G.rig=rig;f.G.settings={aimAssist:0};a.canSuperJump=()=>false;
  const controller=new f.PlayerController(a,rig,input);controller.computeAim=()=>{};
  const helperStart=browser.indexOf(' const setInput='),helperEnd=browser.indexOf('\n const place=',helperStart);
  assert(helperStart>=0&&helperEnd>helperStart);
  const setInput=vm.runInContext('('+browser.slice(helperStart,helperEnd).trim().slice('const setInput='.length).replace(/;$/,'')+')',f.context);
  const page={evaluate:(fn,arg)=>fn(arg)};
  const tick=()=>{controller.update(1/60);f.tick(a);input.endFrame();};
  return {f,input,a,rig,window,KeyboardEvent,tick,setInput:(fire,keys=[])=>setInput(page,fire,keys)};
}

test('ranked keyboard producer delivers one native dodge edge; holds do not duplicate and release/repress does',async()=>{
  const old=await keyboardProof();
  old.input.mouse.left=true;old.input.keys.add('KeyD');old.input.keys.add('Space');old.tick();
  assert.equal(old.a.intent.jump,true);assert.equal(old.a.weaponRunner.dodge,null,'old held-key-only helper never supplies the physical jump edge');
  assert.equal(old.a.ink,100);
  const h=await keyboardProof();
  await h.setInput(true,['KeyD','Space']);assert.equal(h.input.wasPressed('Space'),true);h.tick();
  assert.ok(h.a.weaponRunner.dodge,'native Player -> Actor admits the genuine dodge');
  const token=h.a.weaponRunner.dodge.token;assert.equal(token,1);assert.equal(h.a.ink,93);
  assert.equal(h.input.wasPressed('Space'),false,'native Input.endFrame consumes the physical edge');
  await h.setInput(true,['KeyD','Space']);assert.equal(h.input.wasPressed('Space'),false);
  h.window.dispatchEvent(new h.KeyboardEvent('keydown',{code:'Space',repeat:true}));
  assert.equal(h.input.wasPressed('Space'),false,'native auto-repeat cannot create another edge');
  for(let i=0;i<60;i++)h.tick();
  assert.equal(h.a.weaponRunner.dodge,null);assert.equal(h.a.weaponRunner._rollToken,token,'held jump cannot create another native roll');
  await h.setInput(false);assert.equal(h.input.down('Space'),false);h.tick();
  await h.setInput(true,['KeyD','Space']);assert.equal(h.input.wasPressed('Space'),true);h.tick();
  assert.equal(h.a.weaponRunner.dodge.token,token+1,'release/repress admits exactly one new native roll');
});

test('ranked keyboard producer preserves a pending edge on keyup and delegates menu consumption',async()=>{
  const h=await keyboardProof();
  await h.setInput(false,['Space']);await h.setInput(false);
  assert.equal(h.input.down('Space'),false);assert.equal(h.input.wasPressed('Space'),true,'native keyup retains a tap pending its simulation tick');
  h.input.endFrame();assert.equal(h.input.wasPressed('Space'),false);
  h.input.onKey=()=>true;await h.setInput(false,['Space']);
  assert.equal(h.input.down('Space'),false);assert.equal(h.input.wasPressed('Space'),false,'the helper does not bypass native menu ownership');
});

test('ranked placement discards the audio-unlock pointer delta before moving in the verified corridor',async()=>{
  const reset=browser.split('\n').find(line=>line.includes('RG.input.mouse.dx=RG.input.mouse.dy=0;'));
  assert(reset,'placement must clear pointer movement left by the real unlock gesture');
  const movements=[];
  for(const clear of [false,true]){
    const h=await keyboardProof();h.rig.yaw=-Math.PI/2;h.rig.pitch=0;h.input.mouse.dx=700;
    if(clear)vm.runInContext(reset,h.f.context);
    await h.setInput(false,['KeyS']);h.tick();movements.push(h.a.intent.move.toArray());
    await h.setInput(false);
  }
  assert(movements[0][0]<.5,'the old accumulated gesture rotates movement away from the corridor');
  assert(movements[1][0]>.99);assert(Math.abs(movements[1][2])<1e-10);
});
