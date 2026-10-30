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

// Followthrough checks retain the real BotBrain spring, steering, Actor
// integration, terrain collisions, native device landing and support effects.
import { makeBotSpecialFixture as makeFullBotFixture } from './bot-special-fixture.mjs';

test('real solo BotBrain deploys Tacticooler for its own frontline push and receives a drink', async () => {
  const f = await makeFullBotFixture(), { a, b, enemy } = f.scenario('tacticooler');
  f.G.actors = [a, enemy]; // No allied actor: the caster can still use its own drink.
  for (let i = 0; i < 180 && !a.s3?.drink; i++) f.tick(a, b);
  assert.equal(a.stats.specials, 1, 'solo frontline user does not wait forever for a teammate');
  assert.equal(a.specialActive, null);
  const stand = f.G.projectiles._s3SupportCoolers?.find(o => o.owner === a);
  assert.ok(stand, 'real cooler throw has landed');
  assert.ok(Math.hypot(stand.pos.x-a.pos.x, stand.pos.z-a.pos.z) < 7, 'drink is within pickup distance');
  assert.equal(a.s3.drink, true, 'native stand grants the drink');
});

test('a nearby real allied stand leaves another charged BotBrain free to aim its main weapon', async () => {
  const f = await makeFullBotFixture(), first = f.scenario('tacticooler');
  for (let i=0; i<110; i++) f.tick(first.a, first.b);
  assert.ok(f.G.projectiles._s3SupportCoolers?.length);
  const a=f.make('tacticooler'), b=f.brain(a, first.enemy);
  f.aim(a,b,first.enemy.pos);
  for(let i=0;i<25;i++) f.tick(a,b);
  assert.equal(a.stats.specials,0, 'do not duplicate the available stand');
  assert.ok(Math.abs(b.aimPitch)<.1, 'keep normal body aim instead of pointing the gun at a redundant floor placement');
});

test('real BotBrain support projectiles land in useful locations and cause native effects', async () => {
  const f=await makeFullBotFixture();
  for(const special of ['storm','tripleInkstrike','superChump','splattercolorScreen','waveBreaker']) {
    const {a,b,enemy}=f.scenario(special), hits=[];
    if(special==='waveBreaker')enemy.pos.z=25; // The bot must first close into useful deploy range.
    const damage=enemy.damage;
    enemy.damage=function(amount,owner,kind,...args){
      if(kind===special&&owner===a)hits.push(amount);
      return damage.call(this,amount,owner,kind,...args);
    };
    for(let i=0;i<650;i++)f.tick(a,b);
    assert.equal(a.stats.specials,1,special+' admitted exactly once');
    assert.equal(a.specialActive,null,special+' returned control after release');
    assert.ok(hits.length>0,special+' actually affects the observed opponent after landing');
    const land=f.events.filter(e=>e.actor===a&&e.id===special&&e.action==='land');
    if(special==='tripleInkstrike'){
      assert.equal(land.length,3);
      assert.ok(Math.max(...land.map(e=>e.pos[0]))-Math.min(...land.map(e=>e.pos[0]))>6,'three distinct pressure points');
      assert.ok(land.every(e=>Math.abs(e.pos[2]-20)<2&&Math.abs(e.pos[1])<.2),'all guides land near the intended floor');
    } else if(special==='waveBreaker'){
      assert.equal(land.length,1);
      assert.ok(Math.hypot(enemy.pos.x-land[0].pos[0],enemy.pos.z-land[0].pos[2])<20,'landed device reaches the enemy');
      assert.ok(hits.every(n=>n===45),'native wave damage');
    } else if(special==='splattercolorScreen'){
      assert.equal(land.length,1);assert.ok(land[0].pos[2]>5&&land[0].pos[2]<14);
      assert.ok(hits.includes(40),'native screen crossing damage');
    } else if(special==='superChump'){
      const active=f.events.filter(e=>e.actor===a&&e.id===special&&e.action==='active');
      assert.equal(active.length,12,'all twelve real decoys reach the floor');
      assert.ok(active.some(e=>Math.hypot(e.pos[0]-enemy.pos.x,e.pos[2]-enemy.pos.z)<6),'opponent is near a decoy, not the empty center');
    } else {
      assert.ok(hits.some(n=>n>0),'native rain damage, not just a throw event');
    }
    enemy.alive=false;b.target=null;b.seeTimer=0;
    b._pathTo(new f.THREE.Vector3(10,0,10),.6);b.repath=100;
    const before=a.pos.clone();for(let i=0;i<30;i++)f.tick(a,b);
    assert.ok(a.pos.distanceTo(before)>.3,special+' ordinary navigation resumes after throw');
  }
});

test('real Bubbler grows at the checked position and intercepts hostile Actor shots',async()=>{
  const f=await makeFullBotFixture(),{a,b,enemy}=f.scenario('bubbler');
  for(let i=0;i<90;i++)f.tick(a,b);
  const dome=f.bigBubblerDomes().find(d=>d.owner===a);assert.ok(dome&&dome.radius>4);
  const deployment=f.events.find(e=>e.actor===a&&e.event==='kit:bubbler:deploy');
  assert.ok(deployment);assert.ok(dome.pos.distanceTo(deployment.pos)<.01,'same checked native forward placement');
  const hp=dome.hp,field=dome.fieldHp;
  for(let i=0;i<90;i++){
    const dx=a.pos.x-enemy.pos.x,dz=a.pos.z-enemy.pos.z;
    enemy.aimYaw=Math.atan2(dx,dz);enemy.aimPitch=Math.atan2(a.pos.y+.85-enemy.pos.y-1.1,Math.hypot(dx,dz));
    enemy.aimDir.set(Math.sin(enemy.aimYaw)*Math.cos(enemy.aimPitch),Math.sin(enemy.aimPitch),Math.cos(enemy.aimYaw)*Math.cos(enemy.aimPitch));
    enemy.aimPoint.copy(a.pos);enemy.aimPoint.y+=.85;enemy.intent.fire=true;
    enemy.update(1/60);f.tick(a,b);
  }
  assert.ok(dome.hp<hp||dome.fieldHp<field,'real enemy projectiles contact the barrier');
  assert.equal(a.hp,100,'the grown barrier shields the bot from outside shots');
});
