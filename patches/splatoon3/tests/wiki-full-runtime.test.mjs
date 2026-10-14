import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const DT=1/60;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export * from './patches/splatoon3/runtime/camera-aim-controls.mjs'; export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 return f;
}
const added=family=>MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&r.family===family);

test('both scopes keep normal projection through half charge, then zoom smoothly',async()=>{
 const f=await world();
 for(const id of ['s3-charger-normalscope','s3-charger-longscope']){
  const a=f.make(id);a.form='kid';a.weaponRunner.charging=true;const rig={zoom:0};
  for(const charge of [0,.1,.49,.5]){a.weaponRunner.charge=charge;for(let i=0;i<60;i++)f.updateScopeZoom(rig,a,DT);close(rig.zoom,0);}
  a.weaponRunner.charge=.6;f.updateScopeZoom(rig,a,DT);assert.ok(rig.zoom>0);
  a.form='squid';f.updateScopeZoom(rig,a,DT);close(rig.zoom,0);
 }
});

for(const frames of [25,26])test(`all added rollers: native natural fall ${frames}F selects and latches the correct flick`,async()=>{
 const f=await world();
 for(const r of added('roller')){
  f.G.projectiles.clear();const a=f.make(r.id);a.form='kid';a.grounded=false;
  f.tick(a,frames-1);a.intent.fire=true;f.tick(a);assert.ok(a.weaponRunner.catalogState.pending,r.id);
  a.grounded=true;f.tick(a,70);
  const shots=f.G.projectiles.list.filter(p=>p.wid===r.id);assert.ok(shots.length>0,r.id);
  assert.ok(shots.every(p=>p.catalog.descriptor.key===(frames===25?'horizontal':'vertical')),r.id+' landing cannot change the committed attack');
 }
});

test('all added rollers: admitted jump selects vertical immediately; rejected jump keeps the grace',async()=>{
 const f=await world();
 for(const accepted of [true,false])for(const r of added('roller')){
  f.G.projectiles.clear();const a=f.make(r.id);a.form='kid';a.grounded=accepted;a.coyote=0;
  if(!accepted)f.tick(a,5);
  a.intent.jump=true;a.intent.fire=true;f.tick(a);a.intent.jump=false;f.tick(a,70);
  assert.equal(a.character.events.some(e=>e[0]==='jump'),accepted,r.id+' admission');
  const shots=f.G.projectiles.list.filter(p=>p.wid===r.id);assert.ok(shots.length>0,r.id+' native emission');
  assert.ok(shots.every(p=>p.catalog.descriptor.key===(accepted?'vertical':'horizontal')),r.id);
 }
});

test('all added rollers and brushes: held fire while stationary has no paint, body damage or ink debit',async()=>{
 const f=await world();let paint=0,hits=0;f.G.paint.splat=()=>{paint++;return 1;};f.G.projectiles.applyHit=()=>{hits++;};
 for(const r of [...added('roller'),...added('brush')]){
  const a=f.make(r.id);a.form='kid';a.intent.move.set(0,0,0);a.vel.set(0,0,0);
  const enemy=f.make();enemy.team=1;enemy.pos.set(0,0,.6);f.G.actors=[a,enemy];
  const before=a.ink;for(let i=0;i<120;i++)a.weaponRunner.update(DT,{fire:true,firePressed:false});
  close(a.ink,before);assert.equal(paint,0,r.id);assert.equal(hits,0,r.id);
 }
});

test('all added rollers: normal speed precedes each source dash duration; stopping resets it',async()=>{
 const f=await world();
 for(const r of added('roller')){
  const a=f.make(r.id);a.form='kid';a.intent.move.set(0,0,1);const p=r.parameters.WeaponRollParam;
  a.vel.set(0,0,p.SpeedNormal*60);
  for(let i=0;i<p.DashFrame-1;i++)a.weaponRunner.update(DT,{fire:true,firePressed:false});
  close(a.weaponRunner.moveSpeed(),p.SpeedNormal*60);
  a.weaponRunner.update(DT,{fire:true,firePressed:false});close(a.weaponRunner.moveSpeed(),p.SpeedDash*60);
  a.intent.move.set(0,0,0);a.vel.set(0,0,0);a.weaponRunner.update(DT,{fire:true,firePressed:false});
  close(a.weaponRunner.moveSpeed(),p.SpeedNormal*60);
 }
});

test('roller minimum ink-speed boundary uses minimum consumption, rather than zero-to-max interpolation',async()=>{
 const f=await world(),a=f.make('s3-roller-compact');a.form='kid';a.intent.move.set(0,0,.1);a.vel.set(0,0,1.2);
 a.weaponRunner.update(DT,{fire:true,firePressed:false});close(100-a.ink,.02);
});

test('airborne charge follows per-weapon rates, including normal-speed Squiffer, LACT and Sabers',async()=>{
 const f=await world();
 const cases=[['s3-charger-quick',10],['s3-charger-long',8+2/3],['s3-charger-light',8+.8],
 ['s3-charger-pencil',8+2/3],['s3-spinner-quick',10/6],['s3-spinner-hyper',10/3],
 ['s3-spinner-serein',2],['s3-stringer-normal',10/3],['s3-stringer-short',10],
 ['s3-stringer-explosion',10/3],['s3-saber-normal',10],['s3-saber-lite',10],['s3-saber-heavy',10]];
 for(const [id,expected] of cases){const a=f.make(id);a.form='kid';a.grounded=false;
  for(let i=0;i<10;i++)a.weaponRunner.update(DT,{fire:true,firePressed:i===0});
  close(a.weaponRunner.catalogState.chargeF,expected);
 }
});

test('all 18 added charge weapons progress with zero/under-minimum ink but never emit unpaid shots',async()=>{
 const f=await world();
 for(const r of MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&['charger','splatling','stringer','splatana'].includes(r.family)))for(const ink of [0,.01]){
  f.G.projectiles.clear();const a=f.make(r.id);a.form='kid';a.ink=ink;
  for(let i=0;i<700;i++)a.weaponRunner.update(DT,{fire:true,firePressed:i===0});
  close(a.weaponRunner.charge,1);assert.ok(a.ink>=0,r.id);
  for(let i=0;i<300;i++)a.weaponRunner.update(DT,{fire:false});
  assert.equal(f.G.projectiles.list.length,0,r.id+' ink='+ink);
 }
});

test('low-ink charging and funded release agree at 30/60/120 render rates',async()=>{
 const f=await world(),traces=[];
 for(const hz of [30,60,120]){
  f.G.projectiles.clear();const a=f.make('s3-spinner-hyper');a.form='kid';a.ink=2;
  const clock=new FixedClock(),trace=[];let tick=0;
  for(let i=0;i<hz*7;i++)clock.advance(1/hz,dt=>{a.weaponRunner.update(dt,{fire:tick<170,firePressed:tick===0});tick++;trace.push([a.ink,a.weaponRunner.charge,f.G.projectiles.list.length]);});
  assert.ok(f.G.projectiles.list.length>0);assert.ok(f.G.projectiles.list.length<=3,'only three whole Hydra rounds can be funded by 2%');traces.push(trace);
 }
 assert.deepEqual(traces[1],traces[0]);assert.deepEqual(traces[2],traces[0]);
});

test('all stringers: arrows rotate continuously across air, landing and squid transitions',async()=>{
 const f=await world();
 for(const r of added('stringer')){
  f.G.projectiles.clear();const a=f.make(r.id);a.form='kid';
  for(let i=0;i<15;i++)a.weaponRunner.update(DT,{fire:true,firePressed:i===0});
  a.grounded=false;a.weaponRunner.update(DT,{fire:false});
  for(let i=0;i<15&&!f.G.projectiles.list.length;i++)a.weaponRunner.update(DT,{fire:false});
  const shot=f.G.projectiles.list.find(p=>p.wid===r.id&&p.catalog.index===0);assert.ok(shot,r.id);
  assert.ok(Math.abs(shot.vel.x)>1e-5&&Math.abs(shot.vel.y)>1e-5,r.id+' early flight is diagonal');
  const s=a.weaponRunner.catalogState;a.form='squid';a.intent.squid=true;
  for(let i=0;i<10;i++)a.weaponRunner.update(DT,{fire:false});close(s.bowTilt,90);
  a.grounded=true;a.weaponRunner.update(DT,{fire:false});assert.ok(s.bowTilt>0&&s.bowTilt<90,'landing does not instantly reset tilt');
 }
});

async function zipWorld(){
 const f=await world(),a=f.make();a.weapon={...a.weapon,special:'zipcaster',specialCost:100};a.special=100;a._resolve=()=>{};
 a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,35);a._startSpecial();return {f,a,s:a._s3AllSpecialState};
}
test('Zipcaster missed hook keeps position and fuel except time drain, and enforces the 45F miss wait',async()=>{
 const {f,a,s}=await zipWorld();f.G.physics.raycast=(_o,_d,_l,h)=>{h.hit=false;return h;};
 const start=a.pos.clone(),fuel=s.inkFuel;a.intent.sub=true;a._updateSpecial(DT);
 assert.equal(s.phase,'ready');close(fuel-s.inkFuel,s.inkDrainPerSecond*DT);close(a.pos.distanceTo(start),0);assert.equal(s.failedHooks,1);
 a.intent.sub=false;a._updateSpecial(DT);a.intent.sub=true;a._updateSpecial(DT);assert.equal(s.failedHooks,1,'fresh edge during cooldown cannot fire');
 a.intent.sub=false;for(let i=0;i<43;i++)a._updateSpecial(DT);a.intent.sub=true;a._updateSpecial(DT);assert.equal(s.failedHooks,2);
});
test('Zipcaster admits a close solid wall, but cannot hook into empty space beyond it',async()=>{
 const {f,a,s}=await zipWorld(),V=f.THREE.Vector3;
 const block={id:0,solid:true,grate:false,center:new V(0,1.5,2),half:new V(2,2,.1),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
 const level={blocks:[block],faces:[],queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;}};
 f.G.physics=new f.Physics(level);a.intent.sub=true;a._updateSpecial(DT);
 assert.equal(s.phase,'hookFlight');close(s.zipTarget.z,1.9);assert.ok(s.inkFuel<150-s.inkDrainPerSecond*DT);
});

test('Line Marker direct player hit terminates instead of rebounding into a second victim',async()=>{
 const f=await world(),a=f.make(),victim=f.make(),behind=f.make();
 a.nid=1;victim.nid=2;behind.nid=3;
 a.weapon={...a.weapon,sub:'angleShooter'};a.aimDir.set(0,0,1);victim.team=behind.team=1;
 victim.pos.set(0,0,1.5);behind.pos.set(0,0,-1);f.G.actors=[a,victim,behind];
 const hits=[],events=[];f.G.projectiles.applyHit=(owner,target,damage)=>{hits.push([target,damage]);};f.on('all:sub',e=>events.push(e));
 const marker=f.G.projectiles.throwBomb(a);marker.pos.set(0,.7,0);marker.prev.copy(marker.pos);marker.vel.set(0,0,60);
 for(let i=0;i<10;i++){f.G.time+=DT;f.G.projectiles.update(DT);}
 assert.equal(hits.length,1);assert.equal(hits[0][0],victim);assert.equal(hits[0][1],40);
 assert.equal(marker.dead,true);assert.equal(events.some(e=>e.phase==='bounce'),false);
 assert.ok(events.some(e=>e.phase==='mark')&&events.some(e=>e.phase==='expire'));
});
