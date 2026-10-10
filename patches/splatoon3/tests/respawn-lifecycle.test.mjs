import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { installRespawnLifecycle, advanceSpawnProtection, spawnProtectionRemaining, sampleRespawnCountdown, beginInitialSquidSpawn } from '../runtime/respawn-lifecycle.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';
const patched = process.env.INKWAVE_RESPAWN_BASELINE !== '1';
async function setup() {
  const f = await fixture(); if (patched) installRespawnLifecycle(f, f.profile);
  f.G.level.spawnPads = [new f.THREE.Vector3(), new f.THREE.Vector3(0, 0, 20)];
  f.G.physics.groundProbe = (_x,_y,_z,_u,_d,_r,h) => { h.hit = false; return h; };
  f.G.match.canRespawn = () => true;
  const make = (weapon='shooter') => { const a = f.make(weapon); a.isLocal = true; a.slot = 0; return a; };
  return { ...f, make };
}
function installLandingStage(f) {
  const level = new f.Level({
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawnPads: [[0, 2.2, 0], [0, 2.2, 18]], spawnBarrier: 4.2,
    single: [{ kind: 'box', min: [-6, -1, -12], max: [6, 0, 12] }], half: [],
  });
  f.G.level = level; f.G.physics = new f.Physics(level);
  return level;
}
function installUnsupportedLandingStage(f) {
  const level = new f.Level({
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawnPads: [[0, 2.2, 0], [0, 2.2, 18]], spawnBarrier: 4.2,
    single: [
      { kind: 'box', min: [-6, -1, -12], max: [6, 0, 12] },
      // groundHeight sees this steep top, but native Actor._resolve rejects it
      // using Physics.WALKABLE. It reproduces a height-only false target.
      { kind: 'ramp', low: [4, 0, 0], high: [8, 5.333333333333, 0], width: 8, thickness: .4, thin: true },
    ], half: [],
  });
  f.G.level = level; f.G.physics = new f.Physics(level);
  return level;
}
test('post-splat gauge including equipped Special Saver survives Squid Spawn; initial spawn/reset still clears', async () => {
  const f = await setup(), a = f.make(), observed = [];
  a.isLocal = false; f.G.match.mode = 'turf'; f.G.match.opts = {};
  f.on('respawn', ({ actor }) => { if (actor === a) observed.push(actor.special); });
  for (const [initial, ap] of [[160,0],[100,10],[80,30],[0,30]]) {
    a.reset(); a.s3.loadout = emptyLoadout();
    for (let piece = 0; piece < ap / 10; piece++) a.s3.loadout[piece].main = 'specialSaver';
    a.setWeapon(a.weaponId); const saver = a.s3.modifiers.specialSaver;
    a.special = initial;
    a.splat(null); const retained = a.special; assert.equal(retained, initial*saver);
    a.hp = 1; a.ink = 1; a.respawn(); assert.equal(a.special, retained); assert.equal(observed.at(-1), retained);
    assert.equal(a.s3.squidSpawn.phase, 'aim'); assert.equal(a.hp, 100); assert.equal(a.ink, 100); assert.equal(a.specialActive, null);
    a.splat(null); a.respawn(); assert.equal(a.special, retained*saver);
    a.spawnAt(new f.THREE.Vector3(), 0); assert.equal(a.special, 0); assert.equal(a.s3.spawnArmor, undefined);
  }
});
test('armor durability, delayed break and uncapped per-hit overflow replace binary immunity', async () => {
  const f = await setup(), a = f.make(), attacker = f.make(); attacker.team = 1;
  a.respawn(); assert.equal(a.invuln, 0); assert.equal(a.s3.spawnArmor.hp, 30);
  a.damage(20, attacker, 'shooter'); assert.equal(a.hp, 100); assert.equal(a.s3.spawnArmor.hp, 10);
  a.damage(10, attacker, 'shooter'); assert.equal(a.hp, 100); assert.ok(a.s3.spawnArmor.breakRemaining > 0);
  for(let i=0;i<19;i++) advanceSpawnProtection(a,1/60);
  a.damage(90, attacker, 'shooter'); assert.equal(a.hp, 100, 'armor persists during verified break delay');
  advanceSpawnProtection(a,1/60); a.damage(40,attacker,'shooter'); assert.equal(a.hp,60);
  for(const [amount,hp] of [[100,100],[160,40],[180,20],[220,-20]]) {
    a.respawn(); a.damage(amount,attacker,'bomb'); assert.equal(a.hp,hp);
    if(amount>100)assert.ok(a.s3.spawnArmor?.breakRemaining>0,'penetration starts break state without deleting armor');
    if(hp<=0){assert.equal(a.alive,true);f.tick(a);assert.equal(a.alive,false);assert.equal(a.hp,0);}
  }
  a.respawn(); a.damage(30,attacker,'shooter');
  const breakBefore=a.s3.spawnArmor.breakRemaining;
  a.damage(120,attacker,'bomb'); assert.equal(a.hp,80,'#1071 a 120 hit during break deals exactly 20 penetration');
  assert.ok(a.s3.spawnArmor,'#1071 penetrating hit preserves the breaking armor');
  assert.equal(a.s3.spawnArmor.breakRemaining,breakBefore,'#1071 penetration does not shorten or reset break time');
  a.damage(90,attacker,'shooter'); assert.equal(a.hp,80,'ordinary hit is still blocked during break');
});
test('armor clock expires at 235F, ink bypasses it, reset/death clear and generic invulnerability remains separate', async () => {
  const f=await setup(), a=f.make();a.respawn();
  a.damage(5,null,'ink');assert.equal(a.hp,95);assert.equal(a.s3.spawnArmor.hp,30);
  for(let i=0;i<234;i++)advanceSpawnProtection(a,1/60);assert.ok(spawnProtectionRemaining(a)>0);
  advanceSpawnProtection(a,1/60);assert.equal(spawnProtectionRemaining(a),0);
  a.invuln=1;a.damage(30,null,'weapon');assert.equal(a.hp,95);
  a.respawn();a.splat(null);assert.equal(spawnProtectionRemaining(a),0);
  a.respawn();a.reset();assert.equal(a.s3.spawnArmorManaged,undefined);
});
test('rearm blocks held Roller across actual death/respawn until release, without synthetic airborne flick', async () => {
  const f=await setup(),a=f.make('roller');a.intent.fire=true;a._prevIntent.fire=true;
  a.splat(null);a.respawn();const ink=a.ink;
  for(let i=0;i<60;i++){a.grounded=i>=20;a.intent.fire=true;f.tick(a);assert.equal(a.weaponRunner.rolling,false);assert.ok(a.weaponRunner.flick<0);}
  assert.equal(a.ink,ink);assert.equal(f.shots.length,0);
  a.intent.fire=false;f.tick(a);a.intent.fire=true;f.tick(a);
  assert.ok(a.weaponRunner.flick>=0);assert.ok(Math.abs(a.ink-(ink-a.weapon.flickInk))<1e-9);
});
test('all held action keys rearm independently, stale press ordering disappears, and bots are not trapped', async () => {
  const f=await setup(),a=f.make();a._firePressT=9;a._squidPressT=10;
  a.splat(null);a.respawn();assert.equal(a._firePressT,-1);assert.equal(a._squidPressT,-1);
  const seen=[],native=a.weaponRunner.update;a.weaponRunner.update=function(dt,input){seen.push({...input});return native.call(this,dt,input);};
  for(const key of ['fire','jump','sub','special','squid'])a.intent[key]=true;
  f.tick(a);assert.equal(a.form,'kid');assert.equal(a.jumpBuffer,0);assert.equal(a.specialActive,null);assert.equal(a.weaponRunner.aimingSub,false);assert.equal(seen.at(-1).fire,false);
  a.intent.sub=false;f.tick(a);assert.equal(a.s3.respawnRearm.has('sub'),false);assert.equal(a.s3.respawnRearm.has('fire'),true);
  const bot=f.make('roller');bot.isBot=true;bot.splat(null);bot.respawn();assert.equal(bot.s3.respawnRearm,undefined);
});
test('HUD samples final actor timer after gear wrapper, ignores independent FX time and isolates players', async () => {
  const f=await setup(),a=f.make(),b=f.make();const killer=f.make();killer.team=1;a.isLocal=false;a.s3.loadout=emptyLoadout();a.s3.loadout[0].main='quickRespawn';a.setWeapon(a.weaponId);const reduction=a.s3.modifiers.quickRespawnReduction;assert.ok(reduction>0);a.splat(killer);a.respawn();assert.equal(a.s3.quickRespawnHistory.seenEnemyDeath,true);
  let st;f.on('splatted',({victim})=>{if(victim===a)st={actor:a,end:5.5,total:0,circumference:100,ring:{style:{}}};});
  a.splat(killer);assert.ok(Math.abs(a.respawnTimer-(f.PLAYER.respawnTime-reduction))<1e-10);const timer=a.respawnTimer;assert.equal(sampleRespawnCountdown(st,0),a.respawnTimer);assert.equal(st.ring.style.strokeDashoffset,'100');
  b.respawnTimer=99;assert.equal(sampleRespawnCountdown(st,200),a.respawnTimer,'render FX clock cannot consume authoritative time');
  a.respawnTimer=timer/2;assert.equal(sampleRespawnCountdown(st,0),timer/2);assert.ok(Math.abs(Number(st.ring.style.strokeDashoffset)-50)<1e-10);
  a.alive=true;assert.equal(sampleRespawnCountdown(st,0),0);assert.equal(sampleRespawnCountdown({end:4},1),3,'preview fallback retains old behavior');
});
test('#93 Turf Squid Spawn preserves Quick Respawn history through launch and feeds the gear-adjusted HUD timer', async () => {
  const f=await setup(),a=f.make(),killer=f.make();a.isLocal=false;killer.team=1;
  f.G.match.mode='turf';f.G.match.opts={};installLandingStage(f);
  a.s3.loadout=emptyLoadout();a.s3.loadout[0].main='quickRespawn';a.setWeapon(a.weaponId);
  const reduction=a.s3.modifiers.quickRespawnReduction;assert.ok(reduction>0);
  a.splat(killer);assert.equal(a.s3.quickRespawnHistory.seenEnemyDeath,true);assert.equal(a.s3.quickRespawnHistory.splats,0);
  a.respawn();assert.equal(a.s3.squidSpawn.phase,'aim');
  assert.equal(a.s3.quickRespawnHistory.seenEnemyDeath,true,'Squid Spawn keeps post-death gear history across spawnAt reset');assert.equal(a.s3.quickRespawnHistory.splats,0);
  a.intent.fire=true;f.tick(a);a.intent.fire=false;assert.equal(a.s3.squidSpawn.phase,'flight');
  for(let i=0;i<90&&a.s3.squidSpawn;i++)f.tick(a);
  assert.equal(a.s3.squidSpawn,undefined);assert.equal(a.grounded,true);
  let state;f.on('splatted',({victim})=>{if(victim===a)state={actor:a,end:5.5,total:0,circumference:100,ring:{style:{}}};});
  a.splat(killer);const expected=f.PLAYER.respawnTime-reduction;
  assert.ok(Math.abs(a.respawnTimer-expected)<1e-10,'Quick Respawn reduction survives the completed Squid Spawn');
  assert.equal(a.s3.lastDeathGear.quickReduction,reduction);
  assert.equal(sampleRespawnCountdown(state,250),expected,'HUD reads the final gear-adjusted actor timer');
  assert.equal(state.ring.style.strokeDashoffset,'100');
});
test('30/60/120 render schedules preserve armor and retained gauge boundaries', async () => {
  const results=[];
  for(const hz of [30,60,120]){const f=await setup(),a=f.make();a.special=160;a.splat(null);a.respawn();const clock=new FixedClock(),rows=[];
    for(let i=0;i<hz*4;i++)clock.advance(1/hz,dt=>{advanceSpawnProtection(a,dt);rows.push([spawnProtectionRemaining(a),a.special]);});results.push(rows);}
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);assert.equal(results[0][233][0]>0,true);assert.equal(results[0][234][0],0);
});

test('real composed controller keeps held mouse blocked through map filtering and release re-arms it', async () => {
  const { boot, STEP } = await import('../../reliability/tests/pause-fixture.mjs');
  const h=await boot(); if (patched) installRespawnLifecycle({ ...h, PlayerController:h.controller.constructor },h.profile);
  h.G.level.spawnPads=[new h.THREE.Vector3(),new h.THREE.Vector3(0,0,20)];
  h.G.physics.groundProbe=(_x,_y,_z,_u,_d,_r,hit)=>{hit.hit=false;return hit;};
  const a=h.actor;a.isLocal=true;h.input.mouse.left=true;a._prevIntent.fire=true;a.splat(null);a.respawn();a.grounded=true;
  for(let i=0;i<4;i++)h.frame(STEP);assert.equal(h.ownedShots.length,0);
  h.input.keys.add('Tab');for(let i=0;i<4;i++)h.frame(STEP);h.input.keys.delete('Tab');h.frame(STEP);
  assert.equal(h.ownedShots.length,0,'map-owned intent false is not a physical release');
  h.input.mouse.left=false;h.frame(STEP);h.input.mouse.left=true;for(let i=0;i<Math.round(a.weapon.firstShotDelay/STEP);i++)h.frame(STEP);
  assert.equal(h.ownedShots.length,1,'fresh mouse press reaches native shooter once');
});

test('source-connected HUD owns actual actor count/ring rather than the early splatted-event base value', async () => {
  const vm=await import('node:vm'),{adaptSource}=await import('../adapter.mjs');
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8');
  const source=patched?adaptSource('src/ui/hud.js',raw):raw,start=source.indexOf('  showSplatted('),end=source.indexOf('\n  hideSplatted(',start);
  assert.ok(start>=0&&end>start);
  const node=()=>({children:[],style:{},textContent:'',appendChild(n){this.children.push(n);},prepend(n){this.children.unshift(n);},animate(){},querySelector(){return this.fg||null;}});
  const create=(tag,props,...kids)=>{const n=node();n.children=kids;if(props?.class==='iw-spl__ring')n.fg=node();if(tag==='b')n.textContent=kids.join('');return n;};
  const H=vm.runInNewContext(`class H { ${source.slice(start,end)} }; H`,{h:create,sampleRespawnCountdown,Math,String,splatSVG:()=>'',richText:()=>'',colorVars(){},toHex:()=>'',BUMP:{}});
  const hud=new H(),actor={alive:false,respawnTimer:5.5};Object.assign(hud,{el:node(),splatLayer:node(),_kills:{lastKiller:null},_fxTime:0,
    hideSplatted(){this._splatted=null;},_addFx(_n,fn){this.callback=fn;},_snd(){}});
  hud.showSplatted({actor,respawn:5.5});actor.respawnTimer=2.5;hud.callback();
  assert.equal(hud._splatted.num.textContent,'3');assert.equal(hud._splatted.ring.style.animation,'none');
  hud._fxTime=400;actor.respawnTimer=1.25;hud.callback();assert.equal(hud._splatted.num.textContent,'2');
  assert.ok(Math.abs(Number(hud._splatted.ring.style.strokeDashoffset)/hud._splatted.circumference-.5)<1e-10);
});

test('native NetMatch mirrors launch-owned armor; proxy stays presentation-only throughout landing', async () => {
  const f=await fixture("export { NetMatch } from './inkwave-public/src/net/netmatch.js';");if(patched)installRespawnLifecycle(f,f.profile);
  installLandingStage(f); f.G.match.mode='turf';
  const a=f.make(),proxy=f.make();a.nid=1;a.slot=0;a.aimPoint.set(4,0,7);a.splat(null);a.respawn();proxy.remote=true;proxy._finishFrame=()=>{};
  assert.equal(a.s3.spawnArmor,null,'aim phase has no finite armor');
  a.intent.fire=true;a.update(1/60);a.intent.fire=false;
  assert.equal(a.s3.squidSpawn.phase,'flight');
  assert.equal(a.s3.spawnArmor.remaining,f.profile.spawnArmor.duration,'armor starts at launch');
  const out=[],nm=Object.create(f.NetMatch.prototype);Object.assign(nm,{byNid:new Map([[1,a]]),out:[],stats:{out:0},s:{tr:{broadcast:m=>out.push(m)}}});
  nm._sendTick();let packet=out[0].a[0];assert.equal(packet.length,23);assert.ok(packet[10]&8388608,'launch owner snapshot carries the existing armor flag');
  let sample={x:packet[1],y:packet[2],z:packet[3],vx:0,vy:0,vz:0,yaw:0,aimYaw:0,aimPitch:0,f:packet[10],hp:100,ink:100,sp:80,turf:0,ch:0,lockT:0};
  proxy.net={ready:true,cur:sample,err:new f.THREE.Vector3(),prevGrounded:false,prevVy:0};nm.applyRemote(proxy,1/60);
  assert.ok(spawnProtectionRemaining(proxy)>0);assert.equal(proxy.invuln,.1,'flight invulnerability remains a separate visual flag');assert.equal(proxy.s3.spawnArmor,undefined,'visual sample cannot create proxy damage authority');
  for(let i=0;i<60&&a.s3.squidSpawn;i++)a.update(1/60);
  assert.equal(a.s3.squidSpawn,undefined);assert.ok(a.s3.spawnArmor.remaining<f.profile.spawnArmor.duration,'flight consumes the launch-owned clock');
  nm._sendTick();packet=out.at(-1).a[0];assert.ok(packet[10]&8388608,'owner protection remains represented after touchdown');
  assert.equal(packet[21],0,'no Super Jump clock in this live spawn');assert.equal(packet[22],a.stats.specials||0,'current special-count sidecar');assert.equal(packet[10]&262144,0);
  sample.f=packet[10];nm.applyRemote(proxy,1/60);assert.equal(proxy.invuln,0);
  a.s3.spawnArmor=null;nm._sendTick();sample.f=out.at(-1).a[0][10];nm.applyRemote(proxy,1/60);assert.equal(spawnProtectionRemaining(proxy),0,'expired owner protection clears the proxy marker');
  sample.f|=262144;nm.applyRemote(proxy,1/60);assert.equal(proxy.invuln,.1,'old generic invulnerability flag remains independent');
});


test('a spawn hit has one armor owner even when roll/surge protection overlaps', async () => {
  const f=await setup(),a=f.make();a.respawn();
  a.s3.actions={roll:{armorTime:1,armorHP:100}};a.damage(160,null,'charger');
  assert.equal(a.hp,40);assert.equal(a.s3.actions.roll.armorHP,100,'spawn hit is not charged to a second shield');
});


test('#93 normal Turf battle human post-death Squid Spawn selects supported targets from camera aim and confirms via FIRE',async()=>{
  const f=await setup();installLandingStage(f);f.G.match.mode='turf';
  assert.equal(f.G.match.opts?.range,undefined,'standard Turf battle uses the landing-selection path');
  const samples=[];
  const a=f.make();a.slot=0;
  for(const x of [4,-4]) {
    a.splat(null);
    a.respawn();assert.equal(a.s3.squidSpawn.phase,'aim');
    assert.equal(a.s3.squidSpawn.initial,false);
    const camera={position:new f.THREE.Vector3(),direction:new f.THREE.Vector3(),getWorldDirection(out){return out.copy(this.direction);}};
    f.G.camera=camera;f.G.rig={gameCam:camera,mapK:0};f.G.settings={};
    const input={mobile:null,pad:null,lastDevice:'keyboard',mouse:{dx:0,dy:0,left:false,right:false},padPressed:new Set(),
      down:()=>false,padButton:()=>false,padValue:()=>0,wasPressed:()=>false};
    const controller=new f.PlayerController(a,{yaw:0,pitch:0},input);
    camera.position.set(a.pos.x,a.pos.y+1.3,a.pos.z);
    const pointCameraAt=(x,z)=>{
      camera.direction.set(x-camera.position.x,-camera.position.y,z-camera.position.z).normalize();
      controller.computeAim();a.update(1/60);
    };
    pointCameraAt(x,7);
    assert.ok(Number.isFinite(f.G.level.groundHeight(a.s3.squidSpawn.target.x,a.s3.squidSpawn.target.z)),'aim resolves only to supported stage ground');
    const retained={...a.s3.squidSpawn.target};
    camera.direction.set(1,0,0);controller.computeAim();a.update(1/60);
    assert.deepEqual(a.s3.squidSpawn.target,retained,'unsupported aim retains the last legal target');
    pointCameraAt(x,7);
    // Aim has no finite shield; the existing armor clock starts on FIRE/launch.
    assert.equal(a.s3.spawnArmor,null);
    assert.equal(a.invuln,Infinity);
    const target=a.s3.squidSpawn.target;
    assert.ok(Math.hypot(target.x,target.z)<=12+1e-9,'landing selection remains inside calibrated base-region radius');
    input.mouse.left=true;controller.update(1/60);a.update(1/60);
    assert.equal(a.s3.squidSpawn.phase,'flight');
    assert.equal(a.s3.spawnArmor.remaining,f.profile.spawnArmor.duration,'launch starts the existing armor clock');
    samples.push({...a.s3.squidSpawn.to});input.mouse.left=false;a.intent.fire=false;
    for(let i=0;i<60&&a.s3.squidSpawn;i++)a.update(1/60);
    assert.equal(a.s3.squidSpawn,undefined,'each death/respawn completes before the next selection');
    assert.equal(a.grounded,true);
  }
  assert.ok(samples[0].x>0&&samples[1].x<0,'the same player can select different supported positions on repeated respawns');
});


test('#93 height-only endpoints rejected by native Actor._resolve stay out of aim and launch',async()=>{
  const f=await setup();const level=installUnsupportedLandingStage(f);f.G.match.mode='turf';
  const a=f.make();a.splat(null);a.respawn();
  const retained={...a.s3.squidSpawn.target};
  const x=6,z=0,y=level.groundHeight(x,z);
  assert.ok(Number.isFinite(y),'height lookup incorrectly considers the steep face a candidate');
  const pos=a.pos.clone(),vel=a.vel.clone(),grounded=a.grounded,airTime=a.airTime,groundN=a.groundN.clone();
  a.pos.set(x,y,z);a.vel.set(0,-1,0);a.grounded=false;a._resolve(false,y,false);
  assert.equal(a.grounded,false,'native Actor._resolve rejects this height-only endpoint');
  assert.equal(a.ground.hit,false);
  a.pos.copy(pos);a.vel.copy(vel);a.grounded=grounded;a.airTime=airTime;a.groundN.copy(groundN);
  a.aimPoint.set(x,y,z);a.update(1/60);
  assert.deepEqual(a.s3.squidSpawn.target,retained,'unsupported aim preserves the last native-supported endpoint');
  a.intent.fire=true;a.update(1/60);
  assert.equal(a.s3.squidSpawn.phase,'flight');
  assert.deepEqual(a.s3.squidSpawn.to,retained,'launch revalidates and retains only the supported target');
});


test('#1005 launch-owned armor clock is consumed through Squid Spawn touchdown',async()=>{
  const f=await setup();installLandingStage(f);f.G.match.mode='turf';
  const a=f.make();a.aimPoint.set(4,0,7);a.splat(null);a.respawn();
  assert.equal(a.s3.spawnArmor,null,'aim does not start the finite clock');
  a.intent.fire=true;a.update(1/60);a.intent.fire=false;
  assert.equal(a.s3.spawnArmor.hp,f.profile.spawnArmor.hp);
  assert.equal(a.s3.spawnArmor.remaining,f.profile.spawnArmor.duration,'the configured armor amount and duration start at launch');
  const launchDuration=a.s3.squidSpawn.duration,dt=1/60;
  let elapsed=0;
  while(a.s3.squidSpawn&&elapsed<launchDuration+dt){a.update(dt);elapsed+=dt;}
  assert.equal(a.s3.squidSpawn,undefined);
  assert.equal(a.grounded,true);
  assert.ok(Math.abs(a.s3.spawnArmor.remaining-(f.profile.spawnArmor.duration-launchDuration))<1e-9,
    'touchdown does not reset or extend the launch-owned armor clock');
});


test('#93 supported touchdown uses native collision, preserves launch armor time, and adds no paint',async()=>{
  const f=await setup();installLandingStage(f);f.G.match.mode='turf';
  const seen=[],nativeLands=[];let paintCalls=0;
  f.G.paint.splat=()=>{paintCalls++;return 9;};
  f.on('squidspawn:land',({actor})=>seen.push(actor));
  f.on('actor:land',({actor})=>nativeLands.push(actor));
  for(const hz of [30,60,120]){
    const a=f.make();a.slot=0;a.aimPoint.set(4,0,7);a.splat(null);a.respawn();
    a.intent.fire=true;a.update(1/60);
    assert.equal(a.s3.squidSpawn.phase,'flight');
    assert.equal(a.s3.spawnArmor.remaining,f.profile.spawnArmor.duration,'armor starts at launch on each update schedule');
    const dt=1/hz,launchDuration=a.s3.squidSpawn.duration;let elapsed=0;
    while(a.s3.squidSpawn&&elapsed<launchDuration+dt){a.update(dt);elapsed+=dt;}
    assert.equal(a.s3.squidSpawn,undefined,'flight ends at the same landing on every schedule');
    assert.equal(a.grounded,true);
    assert.equal(a.invuln,0);
    assert.ok(Math.abs(a.s3.spawnArmor.remaining-(f.profile.spawnArmor.duration-launchDuration))<1e-9,
      'touchdown preserves the configured launch-relative clock');
    assert.equal(a.landT,0,'native collision resets the landing clock');
    assert.ok(a.ground.hit,'landing retained the native ground contact');
    assert.ok(seen.includes(a),'landing emits exactly once per flight');
  }
  assert.equal(seen.length,3);
  assert.equal(nativeLands.length,3,'native Actor._resolve owns land lifecycle events');
  assert.equal(paintCalls,0,'Squid Spawn adds no unsourced turf mutation or special credit');
  // Bots launch without FIRE and retain their deterministic selected target.
  const botTargets=[];
  for(let i=0;i<2;i++){
    const bot=f.make();bot.isBot=true;bot.slot=2;bot.splat(null);bot.respawn();
    assert.equal(bot.s3.squidSpawn.phase,'flight','bots launch deterministically without FIRE');
    botTargets.push({...bot.s3.squidSpawn.to});
    assert.ok(Number.isFinite(f.G.level.groundHeight(bot.s3.squidSpawn.to.x,bot.s3.squidSpawn.to.z)));
  }
  assert.deepEqual(botTargets[0],botTargets[1]);
});


test('#93 a real native Actor._resolve miss cannot award touchdown, reset armor, or paint',async()=>{
  const f=await setup();const level=installUnsupportedLandingStage(f);f.G.match.mode='turf';let landed=0,paintCalls=0;
  f.on('squidspawn:land',()=>landed++);f.G.paint.splat=()=>{paintCalls++;return 4;};
  const a=f.make();a.aimPoint.set(4,0,7);a.splat(null);a.respawn();a.intent.fire=true;a.update(1/60);a.intent.fire=false;
  for(let i=0;i<59;i++)a.update(1/60);
  const y=level.groundHeight(6,0);assert.ok(Number.isFinite(y));
  // Simulate a stale endpoint reaching touchdown; the actual Actor._resolve
  // and Physics.groundProbe reject it without a mocked collision result.
  a.s3.squidSpawn.to={x:6,y,z:0};
  a.update(1/60);
  assert.equal(a.grounded,false,'native ground miss leaves the actor airborne');
  assert.equal(a.s3.squidSpawn.phase,'landing','miss returns motion to native gravity instead of freezing at the endpoint');
  assert.ok(a.s3.spawnArmor,'the launch-owned armor remains on its original clock');
  assert.ok(a.s3.spawnArmor.remaining<f.profile.spawnArmor.duration,'the unsupported touchdown does not restart armor time');
  assert.equal(landed,0);assert.equal(paintCalls,0);
});


test('Practice Range keeps immediate control and legacy respawn without Turf Squid Spawn', async () => {
  const f = await setup(), a = f.make();
  f.G.match.mode = 'turf'; f.G.match.opts = { range: true };
  a.pos.set(-12, 0, 0); const position = a.pos.clone();
  assert.equal(beginInitialSquidSpawn(a), false);
  assert.deepEqual(a.pos, position);
  assert.equal(a.s3.squidSpawn, undefined);
  a.splat(null); assert.equal(a.alive, false); a.respawn();
  assert.equal(a.alive, true);
  assert.equal(a.s3.squidSpawn, undefined, 'range respawns never create a FIRE-owned launch');
  assert.ok(a.s3.spawnArmor?.remaining>0,'Range retains its existing native immediate protection path');
});
