import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { catalogChargerPaintParameters } from '../runtime/catalog-charger-paint.mjs';

const rows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='charger'&&!r.legacy);
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`);

test('every added Charger separates legal-minimum stripe, full stripe and impact endpoints',()=>{
  for(const r of rows){
    const p=r.parameters,t=p.WeaponParam;
    const minimum=(t.ChargeFrameMinCharge??8)/(t.ChargeFrameFullCharge??60);
    for(const [charge,suffix] of [[minimum,'MinCharge'],[1,'FullCharge']]){
      const paint=catalogChargerPaintParameters(p,charge);
      near(paint.width,p.SplashPaintParam['WidthHalf'+suffix],r.id+' width');
      near(paint.depth,p.SplashPaintParam['DepthHalf'+suffix],r.id+' depth');
      near(paint.impact,p.PaintParam['Radius'+suffix],r.id+' impact');
      assert.ok(paint.width<=paint.impact,r.id+' line never exceeds contact radius');
      if(suffix==='FullCharge')assert.ok(paint.width<paint.impact,r.id+' full line must not reuse contact radius');
    }
    const middle=catalogChargerPaintParameters(p,(minimum+1)/2);
    near(middle.width,(p.SplashPaintParam.WidthHalfMinCharge+p.SplashPaintParam.WidthHalfMaxCharge)/2,r.id+' charge interpolation');
  }
});

async function shot(f,r,frames){
  f.G.projectiles.clear();f.G.actors.length=0;
  const a=f.make(r.id);a.form='kid';a.isLocal=true;a.ink=100;
  a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,200);
  a.intent.fire=true;f.tick(a,frames+1);a.intent.fire=false;f.tick(a,3);
  const p=f.G.projectiles.list.find(p=>p.catalog?.r?.id===r.id);
  assert.ok(p,r.id+' accepted live projectile');
  // Fixed horizontal flight isolates paint dimensions from rendered rig aim.
  p.pos.set(0,1.05,0);p.prev.copy(p.pos);p.start.copy(p.pos);
  p.vel.set(0,0,p.catalog.descriptor.speed);
  return p;
}

async function scene(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.physics.segment=(_from,_to,h)=>{h.hit=false;return h;};
  f.G.physics.raycast=(at,dir,length,h)=>{
    h.hit=dir.y<-.9&&at.y>=0&&at.y<=length;
    if(h.hit){h.point.copy(at).setY(0);h.normal.set(0,1,0);h.face=0;h.dist=at.y;}
    return h;
  };
  f.G.level.faces=[{n:new f.THREE.Vector3(0,1,0),paintable:true}];
  return f;
}

test('production projectiles paint source-width ellipses for tap and full shots at 30/60/120Hz',async()=>{
  const f=await scene();
  for(const r of rows)for(const full of [false,true]){
    const frames=full?(r.parameters.WeaponParam.ChargeFrameFullCharge??60):(r.parameters.WeaponParam.ChargeFrameMinCharge??8);
    let reference=null;
    for(const hz of [30,60,120]){
      const p=await shot(f,r,frames),painted=[];
      f.G.paint.splat=(at,radius,team,options)=>{painted.push({at:at.clone(),radius,options});return 0;};
      const expected=catalogChargerPaintParameters(r.parameters,p.catalog.descriptor.charge);
      for(let i=0;i<hz*2;i++){f.G.time+=1/hz;if(f.G.projectiles._step(p,1/hz))break;}
      assert.ok(painted.length>0,r.id+' forward paint exists');
      for(const mark of painted){
        near(mark.radius,expected.width,r.id+' width at '+hz+'Hz');
        near(mark.options.stretchAmt,1.6*(expected.depth/expected.width-1),r.id+' depth at '+hz+'Hz');
        assert.equal(mark.options.claimOwner,p.owner);
      }
      const positions=painted.map(x=>Number(x.at.z.toFixed(8)));
      if(reference)assert.deepEqual(positions,reference,r.id+' frame-independent spacing');else reference=positions;
    }
  }
});

test('catalog Charger stops paint before cover and remote ghosts never claim turf',async()=>{
  const f=await scene(),r=rows.find(r=>r.id==='s3-charger-long');
  const p=await shot(f,r,r.parameters.WeaponParam.ChargeFrameFullCharge),painted=[];
  f.G.paint.splat=(at,radius)=>{painted.push({z:at.z,radius});return 0;};
  f.G.physics.segment=(from,to,h)=>{
    h.hit=from.z<5&&to.z>=5;
    if(h.hit){h.dist=5-from.z;h.point.copy(from).setZ(5);h.normal.set(0,0,-1);h.face=1;}
    return h;
  };
  for(let i=0;i<60;i++)if(f.G.projectiles._step(p,1/60))break;
  assert.ok(painted.length>0);
  assert.ok(painted.every(x=>x.z<=5),'line centers never pass the first obstruction');
  const ghost=await shot(f,r,8);ghost.ghost=true;painted.length=0;
  for(let i=0;i<60;i++)if(f.G.projectiles._step(ghost,1/60))break;
  assert.equal(painted.length,0,'replication is presentation-only');
});
