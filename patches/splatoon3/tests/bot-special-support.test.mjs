import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const extraExports = `export {driveSupportSpecial} from './patches/splatoon3/runtime/bot-special-support.mjs';
export {bigBubblerDomes} from './patches/splatoon3/runtime/kit-big-bubbler.mjs';`;
async function setup(special) {
  const f = await fixture({fullRuntime:true, productionComposition:true, realProjectiles:true, extraExports});
  f.G.level = new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},
    spawnPads:[[-70,0,0],[70,0,0]],spawnBarrier:0,half:[],
    single:[{kind:'box',min:[-100,-1,-100],max:[100,0,100]}]});
  f.G.physics = new f.Physics(f.G.level);
  const a = f.make(), enemy = f.make(), ally = f.make();
  a._resolve = () => {};
  a.weapon = {...a.weapon, special, specialCost:100}; a.special = 100;
  a.pos.set(0,0,0); a.aimYaw = 0; a.aimPitch = -.1;
  a._prevIntent = {fire:false,sub:false,jump:false,squid:false,special:false};
  enemy.team = 1; enemy.pos.set(0,0,20); ally.pos.set(3,0,0);
  f.G.nav = {nodes:[{x:0,y:0,z:20}]};
  f.G.paint.regionStats = () => ({n:1,own:0,enemy:1,empty:0});
  const brain = {goal:-1,target:enemy,mode:'fight'};
  let token, memory;
  function tick(dt=1/60, visible=true) {
    if (token !== a.specialActive || !memory) {token=a.specialActive; memory={};}
    Object.assign(a.intent,{fire:false,sub:false,jump:false,squid:false,special:false});
    const ctx = {actor:a,intent:a.intent,dt,special,state:a.specialActive,memory,enemy,
      distance:Math.hypot(enemy.pos.x-a.pos.x,enemy.pos.z-a.pos.z),height:enemy.pos.y-a.pos.y,
      visible,world:f.G,brain,move:a.intent.move,wantYaw:a.aimYaw,wantPitch:a.aimPitch,aimDistance:20};
    ctx.aimAt = p => {
      const dx=p.x-a.pos.x,dz=p.z-a.pos.z,dy=p.y-a.pos.y-1.1;
      ctx.wantYaw=Math.atan2(dx,dz);ctx.wantPitch=Math.atan2(dy,Math.hypot(dx,dz));
      ctx.aimDistance=Math.hypot(dx,dy,dz);
    };
    ctx.isAimed = tolerance => Math.abs(Math.atan2(Math.sin(a.aimYaw-ctx.wantYaw),Math.cos(a.aimYaw-ctx.wantYaw)))<tolerance && Math.abs(a.aimPitch-ctx.wantPitch)<tolerance;
    f.driveSupportSpecial(ctx);
    a.aimYaw=ctx.wantYaw;a.aimPitch=ctx.wantPitch;
    a.aimDir.set(Math.sin(a.aimYaw)*Math.cos(a.aimPitch),Math.sin(a.aimPitch),Math.cos(a.aimYaw)*Math.cos(a.aimPitch));
    a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0,1.1,0)).addScaledVector(a.aimDir,ctx.aimDistance);
    a.update(dt); f.G.time+=dt; f.G.projectiles.update(dt);
    return ctx;
  }
  return {...f,a,enemy,ally,brain,tick};
}

for (const special of ['bubbler','storm','tripleInkstrike','tacticooler','superChump','splattercolorScreen','waveBreaker']) {
  test(`support ${special}: real Actor input produces its deployed world object`,async()=>{
    const f=await setup(special),events=[];f.on('all:special',e=>events.push(e));
    for(let i=0;i<240;i++)f.tick();
    assert.equal(f.a.stats.specials,1,'one admitted charge');
    assert.equal(f.a.specialActive,null,'activation and release finish');
    if(special==='bubbler')assert.ok(f.bigBubblerDomes().some(d=>d.owner===f.a));
    else if(special==='storm')assert.ok(f.G.projectiles.clouds.some(c=>c.owner===f.a));
    else if(special==='tacticooler')assert.ok(f.G.projectiles._s3SupportCoolers.some(c=>c.owner===f.a));
    else if(special==='tripleInkstrike')assert.equal(events.filter(e=>e.action==='marker').length,3,'all three actual marker releases');
    else assert.ok(events.some(e=>e.id===special&&['balloon','screen','device'].includes(e.action)));
    const points=[...(f.G.projectiles._s3SupportCoolers||[]),...(f.G.projectiles._s3AllSpecialObjects||[])].filter(o=>o.owner===f.a);
    assert.ok(points.every(o=>[o.pos.x,o.pos.y,o.pos.z].every(Number.isFinite)));
  });
}

for(const hz of [30,120])test(`triple Inkstrike holds/releases all three at ${hz} Hz`,async()=>{
  const f=await setup('tripleInkstrike'),events=[];f.on('all:special',e=>events.push(e));
  for(let i=0;i<hz*4;i++)f.tick(1/hz);
  assert.equal(events.filter(e=>e.action==='marker').length,3);
  assert.equal(f.a.specialActive,null);
});

test('Tacticooler supports nearby allies without a visible enemy and avoids a live allied stand',async()=>{
  const f=await setup('tacticooler');f.brain.target=null;
  for(let i=0;i<150;i++)f.tick(1/60,false);
  assert.equal(f.a.stats.specials,1);
  const stand=f.G.projectiles._s3SupportCoolers[0];assert.ok(stand);
  f.a.special=100;f.a.s3PreOperationGauge=null;f.a.specialGaugeLock=0;
  for(let i=0;i<20;i++)f.tick(1/60,false);
  assert.equal(f.a.stats.specials,1);
});

test('unknown enemies, unsupported terrain and close invaders do not trigger wasteful deployment',async()=>{
  for(const special of ['bubbler','storm','tripleInkstrike','superChump','splattercolorScreen','waveBreaker']){
    const f=await setup(special);f.brain.goal=-1;
    for(let i=0;i<30;i++)f.tick(1/60,false);
    assert.equal(f.a.stats.specials,0,`${special}: hidden enemy`);
    f.G.level.groundHeight=()=>-Infinity;
    for(let i=0;i<30;i++)f.tick();
    assert.equal(f.a.stats.specials,0,`${special}: no landing floor`);
  }
  const f=await setup('bubbler');f.enemy.pos.z=2;
  for(let i=0;i<30;i++)f.tick();assert.equal(f.a.stats.specials,0);
});

test('throw planning rejects a wall before the target without creating a device',async()=>{
  const f=await setup('storm');f.G.physics.los=()=>false;
  for(let i=0;i<90;i++)f.tick();
  assert.equal(f.a.stats.specials,0);assert.equal(f.G.projectiles.clouds.length,0);
});
