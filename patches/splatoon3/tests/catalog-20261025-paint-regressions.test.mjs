import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

// Source: Leanny/splat3 data/parameter/1130/weapon, unmodified 11.3.0
// weapon records. These exercise the composed production runner and actual
// collision/CPU paint; they are not Switch measurements of masks or muzzle.
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  includeCharacter:true,vmMathRandom:()=>.5});
function setup(id,height=0){
  const {paint}=makePaintWorld(f),a=f.make(id),stamps=[];
  a.form='kid';a.pos.set(0,height,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,height+1.05,100);a.ink=100;
  a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));
  const splat=paint.splat;paint.splat=function(at,radius,team,options){
    stamps.push({at:at.clone(),radius,team,options});return splat.call(this,at,radius,team,options);
  };
  f.G.projectiles._draw=()=>{};
  return {a,paint,stamps};
}
function fire(a,heldFrames=1){
  for(let i=0;i<heldFrames;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});
  for(let i=0;i<50;i++)a.weaponRunner.update(1/60,{fire:false});
}
function simulate(paint,hz,seconds=1){
  for(let i=0;i<hz*seconds;i++){
    f.G.time+=1/hz;f.G.projectiles.update(1/hz);paint.advanceSimulation(1/hz);
  }
}

test('Stringer admitted volleys paint one sourced nearest mask on nearby grounded floor',()=>{
  for(const id of ['s3-stringer-normal','s3-stringer-short','s3-stringer-explosion']){
    for(const condition of ['ground','air','high','remote','empty']){
      const x=setup(id,condition==='high'?8:0),{a}=x;
      if(condition==='air')a.grounded=false;
      if(condition==='remote')a.remote=true;
      if(condition==='empty')a.ink=0;
      fire(a);
      if(condition!=='ground')assert.equal(x.stamps.length,0,id+' '+condition+' cannot paint immediate feet');
      else{
        const p=a.weapon.catalogRecord.parameters.spl__BulletStringerParam.SplashPaintParam;
        assert.equal(x.stamps.length,1,id+' volley owns exactly one nearest mask');
        assert.equal(x.stamps[0].radius,p.WidthHalfNearest??p.WidthHalf);
        assert.ok(x.stamps[0].at.distanceTo(a.pos)<1e-8);
        for(let i=0;i<60;i++)x.paint.advanceSimulation(1/60);
        assert.equal(x.paint.sampleWorld(0,a.pos),1,id+' the actor can swim at its feet');
      }
    }
  }
});

test('all four Brellas retain a single physical nearest volley drop before their first interval',()=>{
  for(const id of ['s3-shelter-normal','s3-shelter-wide','s3-shelter-compact','s3-shelter-focus']){
    const x=setup(id),{a}=x;fire(a);
    assert.equal(x.stamps.length,0,'closed-canopy shot does not instantly project ink');
    const volley=f.G.projectiles.list[0].catalog.brellaFlight.volley;
    f.G.projectiles.update(1/60);
    const nearest=f.G.projectiles._s3SplashDrops.filter(d=>Math.abs(d.releaseZ-.3)<1e-8);
    assert.equal(nearest.length,1,id+' feet member is shared by all pellets');
    assert.ok(Math.abs(nearest[0].radius-a.weapon.catalogRecord.parameters.spl__BulletShelterShotgunParam.SplashParam.SplashPaintWidthFullActive)<1e-10);
    simulate(x.paint,60);
    assert.equal(x.paint.sampleWorld(0,a.pos),1,id+' landed nearest ink covers the feet');
    assert.ok(volley.next<=volley.plan.count,'nearest member consumes the existing volley budget');
  }
});

test('Tri-Stringer nearest flight slot uses WidthHalfNearest instead of the intermediate width',()=>{
  const x=setup('s3-stringer-normal',8);
  for(let shot=0;shot<5;shot++){if(shot)f.G.projectiles.clear();fire(x.a);}
  assert.equal(f.G.projectiles.list.length,3);
  f.G.projectiles.update(1/60);
  assert.equal(f.G.projectiles._s3SplashDrops.length,3,'all three arrows crossed the fifth-shot nearest slot');
  assert.ok(f.G.projectiles._s3SplashDrops.every(d=>d.radius===1.683),'source nearest width is distinct from intermediate 1.39');
});

test('Tri-Slosher and Dread Wringer release only the source Combination globs across 30/60/120 Hz',()=>{
  for(const [id,expected] of [['s3-slosher-diffusion',[[1,2,.94,.2],[2,0,.825,.3],[3,0,.825,.3]]],
    ['s3-slosher-double',[[1,3,.7,.3]]]]){
    let reference;
    for(const hz of [30,60,120]){
      const x=setup(id,20);fire(x.a);
      const eligible=Array.from(f.G.projectiles.list).filter(p=>p.catalog.descriptor.splashCount>0);
      assert.deepEqual(eligible.map(p=>[p.catalog.descriptor.unit,p.catalog.index,
        p.catalog.descriptor.splashRadius,p.catalog.descriptor.sloshFall.drawRadius]),expected);
      const released=[],queue=f.G.projectiles._s3SplashDrops=[];
      queue.push=function(...drops){
        released.push(...drops.map(d=>({x:d.releaseX,z:d.releaseZ,radius:d.radius,draw:d.drawRadius})));
        return Array.prototype.push.apply(this,drops);
      };
      simulate(x.paint,hz);
      assert.equal(released.length,expected.length,id+' no extra falling rain from neighbouring globs');
      const signature=released.map(d=>[+d.x.toFixed(8),+d.z.toFixed(8),d.radius]);
      if(reference)assert.deepEqual(signature,reference,id+' fixed source release distances at '+hz+' Hz');
      else reference=signature;
    }
  }
});

test('Octobrush roll reads the full source half width and small flicks reach their source far width',()=>{
  const x=setup('s3-brush-normal'),{a}=x;
  a.vel.set(0,0,8);a.intent.move.set(0,0,1);
  a.weaponRunner.update(1/60,{fire:true,firePressed:false});
  assert.equal(a.weaponRunner.rolling,true);
  assert.ok(x.stamps.length>0,'real held brush stamps the floor');
  assert.ok(x.stamps.every(s=>s.radius===.9),'source 1.8-wide path is not quartered to .45');
  const y=setup('s3-brush-normal');fire(y.a);
  const p=f.G.projectiles.list.find(p=>p.catalog?.descriptor.unit===1);
  assert.ok(p,'small trailing brush glob exists');
  p.delay=0;p.catalog.birthPending=null;p.age=0;p.life=2;
  p.start.set(0,1.3,0);p.pos.set(0,1,5);p.prev.copy(p.pos);p.vel.set(0,-6,0);
  f.G.physics.level=null;
  f.G.physics.segment=(from,to,h)=>{
    h.hit=true;h.dist=from.distanceTo(to)*.5;h.point.copy(from).lerp(to,.5);h.normal.set(0,1,0);h.face=0;return h;
  };
  const before=y.stamps.length;f.G.projectiles._step(p,1/60);
  assert.equal(y.stamps.length,before+1);
  assert.equal(y.stamps.at(-1).radius,1.465,'DistanceFar=5 selects its full authored width');
});

test('real Tri-Slosher rig cannot lower horizontal physics births, including delayed globs',()=>{
  for(const hz of [30,60,120]){
    makePaintWorld(f);
    const a=new f.Actor({team:0,name:'Tri-Slosher',weapon:'s3-slosher-diffusion',isLocal:true,
      CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
    a.form='kid';a.ink=100;a.pos.set(0,0,0);a.grounded=a.ground.hit=true;
    a.character.actor=a;a.character.onEvent=null;a._nearCamera=()=>false;
    a._integrate=()=>{};a._spawnBarrier=()=>{};
    f.G.scene.add(a.character.root);f.G.actors=[a];f.G.projectiles._draw=()=>{};
    const births=[];f.G.netm={mute:0,recSplat(){},recProj(p){if(p.owner===a)births.push({y:p.start.y,unit:p.catalog.descriptor.unit,index:p.catalog.index});}};
    for(let frame=0;frame<hz;frame++){
      a.aimPitch=0;a.aimYaw=a.yaw=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);
      a.intent.fire=births.length===0;
      f.G.time+=1/hz;a.update(1/hz);f.G.projectiles.update(1/hz);
    }
    assert.equal(births.length,9,hz+' Hz admits exactly the nine-glob volley');
    assert.ok(births.every(b=>Math.abs(b.y-1.05)<1e-8),hz+' Hz stable body anchor for immediate and delayed globs');
    a.character.dispose();f.G.netm=null;
  }
});

test('horizontal Tri-Slosher reaches a standing opponent at 12.0 units but misses at 12.1 across 30/60/120 Hz',()=>{
  // Wiki's 11.3.0 central effective range is rounded to 2.4 five-unit lines.
  // The round centre's floor contact at 10.7024 is not its damage reach:
  // source bullet radius 1.07 and the .35-radius standing capsule extend it.
  // Keep both actors stationary, on the same level, with zero camera pitch.
  for(const hz of [30,60,120])for(const distance of [12,12.1]){
    const x=setup('s3-slosher-diffusion'),a=x.a,b=f.make('shooter');
    a.vel.set(0,0,0);b.form='kid';b.team=1;b.pos.set(0,0,distance);b.vel.set(0,0,0);
    assert.equal(f.PLAYER.s3HumanoidHurtRadius,.35);assert.equal(f.PLAYER.s3HumanoidHurtHeight,1.65);
    const hits=[];
    // Retain real projectile/terrain/capsule collision and source damage.
    // Observe hit dispatch without adding respawn protection or health state.
    f.G.projectiles.applyHit=(owner,target,damage)=>{if(owner===a&&target===b)hits.push(damage);};
    fire(a);assert.equal(f.G.projectiles.list.length,9);
    simulate(x.paint,hz);
    assert.deepEqual(hits,distance===12?[62]:[],`${hz} Hz, stationary target centre at ${distance}`);
  }
});
