import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const extraExports="export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';";
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.settings={};f.setRandom(()=>.37);
const records=f.MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&['roller','brush'].includes(r.family));
const V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
function world(){
 const level=new f.Level({bounds:{minX:-25,maxX:25,minZ:-15,maxZ:25},spawnPads:[[-20,0,0],[20,0,0]],spawnBarrier:0,
 single:[{kind:'box',min:[-25,-1,-15],max:[25,0,25]}],half:[]});
 f.G.level=level;f.G.physics=new f.Physics(level);f.G.scene=new f.THREE.Scene();f.G.actors=[];f.G.time=0;
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){this.quads=0;}}
 const paint=new CpuPaint(null,level,{atlasSize:1024,maxDensity:20,cell:.25});f.G.paint=paint;f.G.projectiles=new f.Projectiles(f.G.scene);
 const calls=[],splat=paint.splat;paint.splat=function(at,r,team,opts){const area=splat.call(this,at,r,team,opts);calls.push({at:at.clone(),r,area,face:opts.face});return area;};
 return {paint,level,calls};
}
function actor(id,z=4){const a=f.make(id);a.pos.set(0,20,z);const h={hit:false,point:V(),normal:V()};f.G.physics.raycast(a.pos,V(0,-1,0),40,h,true);assert.ok(h.hit);a.pos.copy(h.point);a.ground.hit=true;a.ground.face=h.face;a.ground.normal.copy(h.normal);a.groundN.copy(h.normal);a.yaw=0;a.aimDir.set(0,-1,.001).normalize();a.grounded=true;a.form='kid';a.ink=100;a.intent.move.set(0,0,1);a.vel.set(0,0,.12);a.weaponRunner.cooldown=0;return a;}
const tick=(a,dt,input={})=>{f.G.time+=dt;a.weaponRunner.update(dt,{fire:true,firePressed:false,sub:false,...input});f.G.paint.advanceSimulation(dt);};

// Production rolling requires both intended movement and nonzero actual speed.
// A transform suspends rolling even while fire stays held. The next stroke
// must start at current support, as release and ink exhaustion already do.
for(const kind of ['squid','sub','aiming'])for(const hz of [30,60,120])for(const r of records)test(`${kind} retires ${r.id} rolling stroke at ${hz} Hz`,()=>{
 const w=world(),a=actor(r.id);a.intent.move.z=1;a.vel.z=8;tick(a,1/hz);assert.ok(w.calls.length>0);
 const state=a.weaponRunner.catalogState;state.rollingFrames=100;state.rollingDash=true;
 if(kind==='squid')a.form='squid';
 // Let native sub preparation establish aimingSub instead of forging it;
 // native update clears an unheld aiming flag before catalogue admission.
 if(kind==='aiming'){tick(a,1/hz,{sub:true});assert.equal(a.weaponRunner.aimingSub,true);}
 tick(a,1/hz,kind==='squid'?{}:{sub:true});assert.equal(a.weaponRunner.rolling,false);assert.equal(state.rollingFrames,0);assert.equal(state.rollingDash,false);
 a.pos.z+=8;a.form='kid';a.vel.z=8;a.weaponRunner.aimingSub=false;a.weaponRunner.cooldown=0;w.calls.length=0;tick(a,1/hz);
 assert.equal(w.calls.length,1,'resuming after interruption must not paint the traversed gap');
 assert.ok(w.calls[0].at.z>a.pos.z,'new contact stays at current drum position');
 assert.ok(w.calls[0].area>0,'new stroke still paints its current floor');
});

test('catalog Rollers use their own horizontal/vertical SwingMoveSpeed through post-release recovery',()=>{
 for(const rec of records.filter(r=>r.family==='roller'))for(const vertical of [false,true]){
  world();const a=actor(rec.id),wr=a.weaponRunner;
  a.grounded=!vertical;
  if(vertical)a.s3JumpAirborne=true; // actual admitted movement launch, not raw B input
  const key=vertical?'vertical':'horizontal';
  const src=rec.parameters[vertical?'WeaponVerticalSwingParam':'WeaponWideSwingParam'];
  const target=src.SwingMoveSpeed*60;
  assert.ok(Number.isFinite(target)&&target>0,rec.id+' source speed');
  wr.update(1/60,{fire:true,firePressed:true});
  assert.equal(wr.catalogState.s3SwingMode,key,rec.id+' admitted '+key);
  assert.ok(wr.catalogState.pending,rec.id+' is winding');
  assert.ok(Math.abs(wr.moveSpeed()-target)<1e-8,rec.id+' '+key+' windup');
  let released=false,recovery=false;
  const totalFrames=Math.ceil(wr.cooldown*60)+2;
  for(let frame=0;frame<totalFrames;frame++){
   wr.update(1/60,{fire:false,firePressed:false});
   if(wr.catalogState.pending||wr.cooldown>1e-8){
    assert.ok(Math.abs(wr.moveSpeed()-target)<1e-8,rec.id+' '+key+' frame '+frame);
    if(!wr.catalogState.pending){released=true;if(wr.firingT<=1e-8)recovery=true;}
   }
  }
  assert.equal(released,true,rec.id+' '+key+' real release');
  assert.ok(wr.cooldown<=1/60+1e-8,rec.id+' '+key+' recovered');
  assert.ok(wr.moveSpeed()>0);
 }
});
