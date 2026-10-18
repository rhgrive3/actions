import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { catalogDualiesIntervalDistance,integrateCatalogDualies } from '../runtime/catalog-dualies-motion.mjs';
const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('calibrated braking and explicit .98 air retention consume exact distances at 30/60/120Hz',()=>{
  for(const [distance,dur,kd] of [[3,8/60,undefined],[3.5,12/60,undefined],[5.5,16/60,.98],[.6,30/60,undefined],[1.2,50/60,undefined]])
    for(const hz of [30,60,120]){
      const motion={distance,dur,kd,t:0};let sum=0;
      while(motion.t<dur-1e-9){sum+=catalogDualiesIntervalDistance(motion,1/hz);motion.t+=1/hz;}
      near(sum,distance);
      motion.t=0;const first=catalogDualiesIntervalDistance(motion,1/60);motion.t=dur-1/60;
      assert.ok(first>catalogDualiesIntervalDistance(motion,1/60),'a bounded decelerating phase replaces constant velocity');
    }
});

test('added roll substeps stay within half a body radius and discard blocked motion without accumulating debt',()=>{
  const motion={distance:5.5,dur:16/60,t:0,direction:{x:1,z:0}};
  const actor={weapon:{catalogRecord:{family:'dualies'}},weaponRunner:{catalogState:{roll:motion}},alive:true,form:'kid',vel:{x:0,z:0},x:0,
    _integrateMovementStep(dt){assert.ok(this.vel.x*dt<=.2+1e-9);this.x=Math.min(.1,this.x+this.vel.x*dt);}};
  for(let i=0;i<16;i++){assert.equal(integrateCatalogDualies(actor,1/60,false,false,.4),true);motion.t+=1/60;}
  near(actor.x,.1);motion.t=motion.dur;
  actor._integrateMovementStep=function(dt){this.x+=this.vel.x*dt;};
  integrateCatalogDualies(actor,1/60,false,false,.4);near(actor.x,.1);
});

test('production Actor integrates source Dapple 3+.6 and Douser 5.5+1.2, including a thin wall',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  for(const wall of [false,true])for(const [id,frames,distance] of [['s3-maneuver-short',38,3.6],['s3-maneuver-long',66,6.7],['s3-maneuver-gallon',12,5],['s3-maneuver-dual',12,3.5],['s3-maneuver-stepper',17,3.5]]){
    f.G.projectiles.clear();f.G.actors.length=0;
    const single=[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}];
    if(wall)single.push({kind:'box',min:[1,0,-5],max:[1.03,10,5]});
    f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},single,half:[],spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0});
    f.G.physics=new f.Physics(f.G.level);
    const a=f.make(id);a._integrate=f.Actor.prototype._integrate;a.form='kid';a.intent.fire=true;a.pos.set(0,0,0);
    assert.ok(a.weaponRunner.tryDodge(new f.THREE.Vector3(1,0,0)));a.intent.fire=false;
    const core=(a.weaponRunner.catalogState.roll.dur+a.weaponRunner.catalogState.roll.startupDur)*60;
    f.tick(a,core);
    if(wall)assert.ok(a.pos.x<.7&&a.pos.x>.4,'the real body solver stops before the wall');
    else near(a.pos.x,a.weapon.catalogRecord.parameters.SideStepParam.MoveDist??5);
    assert.equal(!!a.weaponRunner.catalogState.slip,frames>core,'only an explicit distance/time pair admits slip');
    f.tick(a,frames-core);
    if(wall)assert.ok(a.pos.x<1,'the 0.03-unit wall is not tunneled through');else near(a.pos.x,distance);
    assert.equal(a.weaponRunner.catalogState.slip??null,null);
    if(!wall){f.tick(a,5);near(a.pos.x,distance);}
  }
});

test('all six base Dualies retain exact 60Hz Actor/round traces under 30/60/120Hz presentation scheduling',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[],spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0});
  f.G.physics=new f.Physics(f.G.level);
  for(const id of ['dualies','s3-maneuver-short','s3-maneuver-gallon','s3-maneuver-dual','s3-maneuver-stepper','s3-maneuver-long']){
    const runs=[];
    for(const hz of [30,60,120]){
      f.G.projectiles.clear();f.G.actors.length=0;f.G.time=0;f.setRandom(()=>.37);
      const a=f.make(id),clock=new f.FixedClock(),trace=[];a._integrate=f.Actor.prototype._integrate;a.form='kid';a.pos.set(0,0,0);a.intent.fire=true;
      assert.ok(a.weaponRunner.tryDodge(new f.THREE.Vector3(1,0,0)));
      for(let render=0;render<hz*2;render++)clock.advance(1/hz,dt=>{
        f.G.time+=dt;a.intent.fire=clock.ticks<80;a.update(dt);f.G.projectiles.update(dt);
        trace.push([a.pos.x,a.pos.y,a.pos.z,a.ink,a.weaponRunner.cooldown,a.weaponRunner.spread,
          ...f.G.projectiles.list.flatMap(p=>[p.age,p.pos.x,p.pos.y,p.pos.z,p.damage,p.radius])]);
      });
      assert.equal(trace.length,120);runs.push(trace);
    }
    assert.deepEqual(runs[0],runs[1],id+' 30/60');assert.deepEqual(runs[1],runs[2],id+' 60/120');
  }
});

test('Splat Dualies alternate kits retain the dedicated native owner and the same real Actor trace',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[],spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0});
  f.G.physics=new f.Physics(f.G.level);const runs=[];
  for(const id of ['dualies','dualies-01','dualies-02']){
    f.G.projectiles.clear();f.G.actors.length=0;f.G.time=0;f.setRandom(()=>.37);
    const a=f.make(id),trace=[];a._integrate=f.Actor.prototype._integrate;a.form='kid';a.intent.fire=true;
    assert.ok(a.weaponRunner.tryDodge(new f.THREE.Vector3(1,0,0)));
    assert.ok(a.weaponRunner.dodge);assert.equal(a.weapon.catalogRecord,undefined,id+' remains native');
    for(let frame=0;frame<120;frame++){
      f.G.time+=1/60;a.intent.fire=frame<80;a.update(1/60);f.G.projectiles.update(1/60);
      assert.ok(f.G.projectiles.list.every(p=>!p.catalog),id+' no catalogue projectiles');
      trace.push([a.pos.x,a.pos.y,a.ink,a.weaponRunner.cooldown,a.weaponRunner.spread,
        ...f.G.projectiles.list.flatMap(p=>[p.age,p.pos.x,p.pos.y,p.pos.z,p.damage,p.radius])]);
    }
    runs.push(trace);
  }
  assert.deepEqual(runs[0],runs[1]);assert.deepEqual(runs[0],runs[2]);
});
