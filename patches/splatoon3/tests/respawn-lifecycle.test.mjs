import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { installRespawnLifecycle, advanceSpawnProtection, spawnProtectionRemaining, sampleRespawnCountdown, beginInitialSquidSpawn } from '../runtime/respawn-lifecycle.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const patched = process.env.INKWAVE_RESPAWN_BASELINE !== '1';
async function setup() {
  const f = await fixture(); if (patched) installRespawnLifecycle(f, f.profile);
  f.G.level.spawnPads = [new f.THREE.Vector3(), new f.THREE.Vector3(0, 0, 20)];
  f.G.physics.groundProbe = (_x,_y,_z,_u,_d,_r,h) => { h.hit = false; return h; };
  f.G.match.canRespawn = () => true;
  const make = (weapon='shooter') => { const a = f.make(weapon); a.isLocal = true; a.slot = 0; return a; };
  return { ...f, make };
}
test('post-splat gauge including Special Saver survives native respawn; initial spawn/reset still clears', async () => {
  const f = await setup(), a = f.make(), observed = [];
  f.on('respawn', ({ actor }) => { if (actor === a) observed.push(actor.special); });
  for (const [initial, saver] of [[160,.5],[100,.8],[0,1]]) {
    a.reset(); a.special = initial; a.s3.modifiers.specialSaver = saver;
    a.splat(null); const retained = a.special; assert.equal(retained, initial*saver);
    a.hp = 1; a.ink = 1; a.respawn(); assert.equal(a.special, retained); assert.equal(observed.at(-1), retained);
    assert.equal(a.hp, 100); assert.equal(a.ink, 100); assert.equal(a.specialActive, null);
    a.s3.modifiers.specialSaver = saver; a.splat(null); a.respawn(); assert.equal(a.special, retained*saver);
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
  const f=await setup(),a=f.make(),b=f.make();const killer=f.make();killer.team=1;a.s3.modifiers.quickRespawnReduction=4;a.splat(killer);a.respawn();
  let st;f.on('splatted',({victim})=>{if(victim===a)st={actor:a,end:5.5,total:0,circumference:100,ring:{style:{}}};});
  a.s3.modifiers.quickRespawnReduction=4;a.splat(killer);assert.ok(Math.abs(a.respawnTimer-(f.PLAYER.respawnTime-4))<1e-10);const timer=a.respawnTimer;assert.equal(sampleRespawnCountdown(st,0),a.respawnTimer);assert.equal(st.ring.style.strokeDashoffset,'100');
  b.respawnTimer=99;assert.equal(sampleRespawnCountdown(st,200),a.respawnTimer,'render FX clock cannot consume authoritative time');
  a.respawnTimer=timer/2;assert.equal(sampleRespawnCountdown(st,0),timer/2);assert.ok(Math.abs(Number(st.ring.style.strokeDashoffset)-50)<1e-10);
  a.alive=true;assert.equal(sampleRespawnCountdown(st,0),0);assert.equal(sampleRespawnCountdown({end:4},1),3,'preview fallback retains old behavior');
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

test('native NetMatch snapshots carry armor separately from invulnerability and clear the proxy on expiry', async () => {
  const f=await fixture("export { NetMatch } from './inkwave-public/src/net/netmatch.js';");if(patched)installRespawnLifecycle(f,f.profile);
  f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3(0,0,20)];
  f.G.physics.groundProbe=(_x,_y,_z,_u,_d,_r,h)=>{h.hit=false;return h;};
  const a=f.make(),proxy=f.make();a.nid=1;a.slot=0;a.respawn();proxy.remote=true;proxy._finishFrame=()=>{};
  const out=[],nm=Object.create(f.NetMatch.prototype);Object.assign(nm,{byNid:new Map([[1,a]]),out:[],stats:{out:0},s:{tr:{broadcast:m=>out.push(m)}}});
  nm._sendTick();const packet=out[0].a[0];assert.equal(packet.length,23);assert.equal(packet[21],0,'no Super Jump clock in this live spawn');assert.equal(packet[22],a.stats.specials||0,'current special-count sidecar');assert.ok(packet[10]&8388608);assert.equal(packet[10]&262144,0);
  const sample={x:packet[1],y:packet[2],z:packet[3],vx:0,vy:0,vz:0,yaw:0,aimYaw:0,aimPitch:0,f:packet[10],hp:100,ink:100,sp:80,turf:0,ch:0,lockT:0};
  proxy.net={ready:true,cur:sample,err:new f.THREE.Vector3(),prevGrounded:false,prevVy:0};nm.applyRemote(proxy,1/60);
  assert.ok(spawnProtectionRemaining(proxy)>0);assert.equal(proxy.invuln,0);assert.equal(proxy.s3.spawnArmor,undefined,'visual sample cannot create proxy damage authority');
  a.s3.spawnArmor=null;nm._sendTick();sample.f=out[1].a[0][10];nm.applyRemote(proxy,1/60);assert.equal(spawnProtectionRemaining(proxy),0);
  sample.f|=262144;nm.applyRemote(proxy,1/60);assert.equal(proxy.invuln,.1,'old generic invulnerability flag remains independent');
});


test('a spawn hit has one armor owner even when roll/surge protection overlaps', async () => {
  const f=await setup(),a=f.make();a.respawn();
  a.s3.actions={roll:{armorTime:1,armorHP:100}};a.damage(160,null,'charger');
  assert.equal(a.hp,40);assert.equal(a.s3.actions.roll.armorHP,100,'spawn hit is not charged to a second shield');
});


test('#93 human post-death Squid Spawn selects different legal targets from aim and confirms via FIRE',async()=>{
  const f=await setup();f.G.match.mode='turf';
  const samples=[];
  for(const x of [4,-4]) {
    const a=f.make();a.slot=0;a.aimPoint.set(x,0,7);a.splat(null);
    a.respawn();assert.equal(a.s3.squidSpawn.phase,'aim');
    assert.equal(a.s3.squidSpawn.initial,false);
    // Spawn protection begins at landing, not at launch or aim.
    assert.equal(a.s3.spawnArmor,null);
    assert.equal(a.invuln,Infinity);
    const target=a.s3.squidSpawn.target;
    assert.ok(Math.hypot(target.x,target.z)<=12+1e-9,'landing selection remains inside base region');
    a.intent.fire=true;a.update(1/60);
    assert.equal(a.s3.squidSpawn.phase,'flight');
    assert.equal(a.s3.spawnArmor,null,'flight keeps native invulnerability without starting the armor clock');
    samples.push({...a.s3.squidSpawn.to});
  }
  assert.ok(samples[0].x>0&&samples[1].x<0,'ordinary respawns are not fixed slot positions');
});


test('#93 Squid Spawn landing resolves ground, paints, and starts armor at touchdown',async()=>{
  const f=await setup();f.G.match.mode='turf';
  const seen=[];
  f.on('squidspawn:land',({actor})=>seen.push(actor));
  for(const hz of [30,60,120]){
    const a=f.make();a.slot=0;a.aimPoint.set(4,0,7);a.splat(null);a.respawn();
    a.intent.fire=true;a.update(1/60);
    assert.equal(a.s3.squidSpawn.phase,'flight');
    const dt=1/hz,frames=Math.ceil(1/dt)+2;
    for(let i=0;i<frames&&a.s3.squidSpawn;i++)a.update(dt);
    assert.equal(a.s3.squidSpawn,undefined,'flight ends at the same landing on every schedule');
    assert.equal(a.grounded,true);
    assert.equal(a.invuln,0);
    assert.ok(a.s3.spawnArmor&&a.s3.spawnArmor.remaining>0,'finite armor starts at landing');
    assert.ok(a.landT<1,'native land timer restarts at touchdown');
    assert.ok(seen.includes(a),'landing emits exactly once per flight');
  }
  assert.equal(seen.length,3);
  // Remote/bot landings keep owner authority: local simulation owns ground and
  // armor, proxies only mirror the owner's snapshot through NetMatch.
  const owner=f.make();owner.slot=0;owner.aimPoint.set(-4,0,7);owner.splat(null);owner.respawn();
  assert.equal(owner.s3.squidSpawn.phase,'aim');
  owner.isBot=true;owner.update(1/60);
  assert.equal(owner.s3.squidSpawn.phase,'flight','bots launch deterministically without FIRE');
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
});
