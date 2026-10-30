import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBotSpecialContext, prepareBotSpecialFrame, createBotSpecialFrame, completeBotSpecialContext, resetBotSpecialMemory} from '../runtime/bot-special-context.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const vector = (x=0,y=0,z=0) => ({ x,y,z,set(x,y,z){Object.assign(this,{x,y,z});return this;},clone(){return vector(this.x,this.y,this.z);} });
function setup() {
  const actor={alive:true,isBot:true,team:0,pos:vector(),weapon:{special:'trizooka'},weaponId:'shooter',aimYaw:0,aimPitch:0};
  const enemy={alive:true,team:1,pos:vector(0,0,12),vel:vector(),form:'kid'};
  const intent={move:vector(),fire:true,sub:false,jump:false,squid:false};
  const brain={target:enemy,seeTimer:1,aimYaw:0,aimPitch:0};
  const world={physics:{los:()=>true,segment:()=>({hit:false})},level:{groundHeight:()=>0}};
  const options={world,brain,move:intent.move,wantYaw:0,wantPitch:0,aimDistance:6};
  return {actor,enemy,intent,brain,world,options,ctx:(dt=1/60)=>createBotSpecialContext(actor,intent,dt,enemy,options)};
}

test('special context uses current recognized enemy and fails closed on lost perception or LOS',()=>{
  const f=setup();assert.equal(f.ctx().enemy,f.enemy);
  f.brain.seeTimer=0;assert.equal(f.ctx().enemy,null);
  f.brain.seeTimer=1;f.world.physics.los=()=>false;assert.equal(f.ctx().enemy,null);
  f.world.physics.los=()=>true;f.enemy.team=0;assert.equal(f.ctx().enemy,null);
  f.enemy.team=1;f.enemy.alive=false;assert.equal(f.ctx().enemy,null);
  f.enemy.alive=true;f.enemy.pos.x=NaN;assert.equal(f.ctx().enemy,null);
  delete f.options.world;assert.equal(f.ctx().visible,false);
});

test('context never controls local or remote players, invalid ticks or dead actors',()=>{
  const f=setup();for(const flag of ['remote','isLocal']){f.actor[flag]=true;assert.equal(f.ctx(),null);delete f.actor[flag];}
  f.actor.isBot=false;assert.equal(f.ctx(),null);f.actor.isBot=true;
  for(const dt of [0,-1,NaN,Infinity])assert.equal(f.ctx(dt),null);
  f.actor.alive=false;assert.equal(f.ctx(),null);
  assert.equal(f.intent.fire,true);
});

test('AI memory resets on active token, equipment, death, life and explicit brain reset',()=>{
  const f=setup();let ctx=f.ctx();ctx.memory.prepared=true;
  assert.equal(f.ctx().memory.prepared,true);
  f.actor.specialActive={id:'trizooka'};ctx=f.ctx(.1);
  assert.equal(ctx.memory.prepared,undefined);assert.equal(ctx.memory.time,.1);
  assert.ok(Math.abs(f.ctx(.2).memory.time-.3)<1e-9);
  f.actor.specialActive={id:'trizooka'};assert.equal(f.ctx(.1).memory.time,.1);
  f.actor.weapon={special:'trizooka'};assert.equal(f.ctx(.1).memory.time,.1);
  f.actor.netLife=2;assert.equal(f.ctx(.1).memory.time,.1);
  f.actor.alive=false;f.ctx();f.actor.alive=true;assert.equal(f.ctx(.1).memory.time,.1);
  resetBotSpecialMemory(f.actor);assert.equal(f.ctx(.1).memory.time,.1);
  f.actor.specialActive=null;assert.equal(f.ctx().memory.time,0);
});

test('aim requests alter the spring target, preserve actual aim and retain ordinary inputs',()=>{
  const f=setup(),ctx=f.ctx();ctx.aimAt(vector(12,2,0));
  assert.equal(ctx.wantYaw,Math.PI/2);assert.ok(ctx.wantPitch>0);assert.equal(ctx.isAimed(),false);
  assert.equal(f.actor.aimYaw,0);assert.equal(f.actor.aimPoint,undefined);
  assert.equal(ctx.normalIntent.fire,true);assert.equal(ctx.aimChanged,true);
  f.brain.aimYaw=ctx.wantYaw;f.brain.aimPitch=ctx.wantPitch;assert.equal(ctx.isAimed(),true);
});

test('active specials hold actual aim after recognition loss rather than tracking a hidden live target',()=>{
  const f=setup();f.actor.specialActive={id:'killerWail'};
  f.brain.aimYaw=.2;f.brain.aimPitch=-.1;f.actor.aimPoint=vector(0,1.1,17);
  f.options.wantYaw=2;f.options.wantPitch=.8;f.options.aimDistance=51;
  f.world.physics.los=()=>false;let ctx=f.ctx();
  assert.equal(ctx.enemy,null);assert.equal(ctx.wantYaw,.2);assert.equal(ctx.wantPitch,-.1);assert.equal(ctx.aimDistance,17);
  f.enemy.pos.set(100,50,-100);ctx=f.ctx();
  assert.equal(ctx.wantYaw,.2);assert.equal(ctx.wantPitch,-.1);assert.equal(ctx.aimDistance,17);
  ctx.aimAt(vector(3,0,8));assert.notEqual(ctx.wantYaw,.2,'an explicit last-seen/world point can still guide the policy');
});

test('safe movement rejects wall, drop, water and unsupported Kraken grates',()=>{
  const f=setup();assert.equal(f.ctx().moveToward(f.enemy.pos),true);assert.equal(f.intent.move.z,1);
  f.world.physics.segment=()=>({hit:true});assert.equal(f.ctx().moveToward(f.enemy.pos),false);assert.equal(f.intent.move.z,0);
  f.world.physics.segment=()=>({hit:false});f.world.level.groundHeight=()=>-Infinity;assert.equal(f.ctx().safePath(f.enemy.pos),false);
  f.world.level.groundHeight=(x,z)=>z>5?-2:0;assert.equal(f.ctx().safePath(f.enemy.pos),false);
  assert.equal(f.ctx().safePath(f.enemy.pos,1.2),true);
  f.world.level.groundHeight=()=>0;f.actor.weapon.special='krakenRoyale';
  let rays=0;
  f.world.physics.raycast=(_origin,_down,_length,out,skipGrates)=>{rays++;assert.equal(skipGrates,true);out.hit=false;};
  assert.equal(f.ctx().safePath(f.enemy.pos),false);
  f.world.physics.raycast=(_origin,_down,_length,out)=>{rays++;out.hit=true;out.point.y=0;out.normal.y=1;};
  rays=0;assert.equal(f.ctx().safePath(f.enemy.pos),true);
  assert.equal(rays,Math.ceil(12/.45)*3,'only one support ray per path column');
});

test('boss targets must remain in the living boss current hit-shape collection',()=>{
  const f=setup(),shape={active:true,pos:vector(0,2,10)};
  const target={shape,los:true};f.brain.target=f.brain.bTgt=target;
  f.world.boss={visible:true,dead:false,model:{hitShapes:[shape]}};
  const ctx=()=>createBotSpecialContext(f.actor,f.intent,.1,target,f.options);
  assert.equal(ctx().enemy.botBossTarget,target);
  shape.active=false;assert.equal(ctx().enemy,null);shape.active=true;
  f.world.boss.model.hitShapes=[];assert.equal(ctx().enemy,null);
  f.world.boss.model.hitShapes=[shape];f.world.boss.dead=true;assert.equal(ctx().enemy,null);
});

test('production composition has one final tail policy and no random or competing special owner',()=>{
  const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/bots.js',import.meta.url),'utf8');
  const code=adaptBuildSource('src/game/bots.js',source);
  assert.equal((code.match(/driveCanonicalBotSpecial\(a,/g)||[]).length,1);
  assert.ok(code.includes('    }, true);\n    if (specialControl?.handled)'), 'only the composed tail opts into inactive context deferral');
  assert.ok(code.indexOf('driveCanonicalBotSpecial(a,')<code.indexOf('this.aimYawV +='));
  assert.ok(code.indexOf('it.jump = specialJump;')>code.indexOf('if (this._needJump'));
  assert.ok(code.includes('resetBotSpecialMemory(this.a);'));
  assert.ok(!code.includes('if (r.own < 0.5) it.special = true'));
  assert.ok(!code.includes('botSubPressed'));
  assert.ok(!code.includes("w.special === 'trizooka' && dist < 24"));
  assert.ok(!code.includes("w.special === 'storm' && dist < 16"));
});

test('uncharged bots preserve ordinary combat without invoking category planning',()=>{
  // Exercise the real dispatcher with an observable category boundary. Its
  // production dependencies need the game module loader; this narrow test
  // keeps only the category planners behind a spy, not the readiness policy.
  const source=fs.readFileSync(new URL('../runtime/canonical-kits.mjs',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replace(/^export \{[^\n]*\n/gm,'').replaceAll('export function ','function ');
  let planned=0;
  const planner=ctx=>{planned++;ctx.wantYaw=2;ctx.move.set(1,0,0);ctx.intent.fire=false;return true;};
  const dispatch=Function('createBotSpecialContext','prepareBotSpecialFrame','createBotSpecialFrame','completeBotSpecialContext','driveMeleeSpecial','driveRangedSpecial','driveSupportSpecial',
    source+'\nreturn driveCanonicalBotSpecial;')(createBotSpecialContext,prepareBotSpecialFrame,createBotSpecialFrame,completeBotSpecialContext,planner,planner,planner);
  const f=setup();f.actor.specialReady=()=>false;f.intent.move.set(.2,0,.7);
  const ctx=dispatch(f.actor,f.intent,.1,f.enemy,f.options);
  assert.equal(planned,0);assert.equal(ctx.handled,false);assert.equal(ctx.wantYaw,0);
  assert.deepEqual([f.intent.move.x,f.intent.move.z],[.2,.7]);assert.equal(f.intent.fire,true);
  f.actor.specialReady=()=>true;dispatch(f.actor,f.intent,.1,f.enemy,f.options);assert.equal(planned,1);
  f.actor.specialReady=()=>false;f.actor.specialActive={id:'trizooka'};
  dispatch(f.actor,f.intent,.1,f.enemy,f.options);assert.equal(planned,2,'active specials continue after spending their meter');
  f.actor.specialActive=null;f.actor.specialReady=()=>true;f.actor.nid=9;
  f.world.match={mode:'rainmaker',ranked:{rule:{state:{carrier:'9'}}}};
  f.intent.fire=true;f.intent.move.set(.1,0,.8);
  const carrier=dispatch(f.actor,f.intent,.1,f.enemy,f.options);
  assert.equal(planned,2);assert.equal(carrier.handled,false);assert.equal(f.intent.fire,true);
  assert.deepEqual([f.intent.move.x,f.intent.move.z],[.1,.8]);assert.equal(f.intent.special,false);
});
