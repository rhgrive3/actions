import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {MAIN_WEAPON_CATALOG as C} from '../runtime/main-weapon-catalog-data.mjs';
import {addedFamilySplash,brellaSplashPlan,collectBrellaSplashes} from '../runtime/added-family-paint.mjs';

async function setup(id,height=8,{wall=false}={}){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const {paint}=makePaintWorld(f,{wall});f.G.settings={};f.setRandom(()=>.37);
 const a=f.make(id);a.form='kid';a.pos.set(0,height,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,height+1.05,100);
 a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));
 const stamps=[],raw=paint.splat;paint.splat=function(at,r,team,opts={}){stamps.push({at:at.clone(),r,opts:{...opts,stretch:opts.stretch?.clone()}});return raw.call(this,at,r,team,opts);};
 return {f,a,paint,stamps};
}
function fire(a,frames=1){for(let i=0;i<frames;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});for(let i=0;i<50;i++)a.weaponRunner.update(1/60,{fire:false});}
function simulate(x,hz=60,seconds=3){for(let i=0;i<hz*seconds;i++){x.f.G.time+=1/hz;x.f.G.projectiles.update(1/hz);x.paint.advanceSimulation(1/hz);}}

for(const id of ['s3-stringer-normal','s3-stringer-short','s3-stringer-explosion','s3-saber-normal','s3-saber-lite','s3-saber-heavy'])
 test(id+' has independently falling flight splashes above a lower floor',async()=>{
  const x=await setup(id);fire(x.a);const p=x.f.G.projectiles.list.find(p=>p.catalog);assert.ok(p);
  assert.ok(p.catalog.descriptor.splashDropSpec?.gravity>0,'zero wave gravity must not disable drops');
  assert.ok(p.catalog.descriptor.splashCount>0);
  x.f.G.projectiles.update(1/60);
  assert.equal(x.stamps.length,0,'no instant floor projection from high airborne shot');
  simulate(x);assert.ok(x.f.G.projectiles._s3SplashLandings?.length>0);
  assert.ok(x.stamps.some(s=>s.opts.kind==='source-splash'));assert.equal(x.a.stats.turf,x.paint.counts[0]*.0625);
 });

for(const id of ['s3-shelter-normal','s3-shelter-wide','s3-shelter-compact','s3-shelter-focus'])
 test(id+' emits one shared volley drop per source distance, after landing only',async()=>{
  const x=await setup(id);fire(x.a);const rounds=x.f.G.projectiles.list.filter(p=>p.catalog);
  assert.ok(rounds.length>1);const plan=brellaSplashPlan(x.a.weapon.catalogRecord.parameters.spl__BulletShelterShotgunParam);
  x.f.G.projectiles.update(1/60);assert.equal(x.stamps.length,0);
  for(let i=0;i<10;i++)x.f.G.projectiles.update(1/60);
  const flight=rounds[0].catalog.brellaFlight.volley;
  assert.ok(flight.next>0&&flight.next<=plan.count,'bounded shared flight-distance budget');
  assert.ok(x.f.G.projectiles._s3SplashDrops.length>0);
  assert.ok(x.f.G.projectiles._s3SplashDrops.length<=plan.count,'never count once per pellet');
  simulate(x);assert.equal(flight.next,plan.count,'retired members settle every remaining threshold');
  assert.ok(x.stamps.some(s=>s.opts.kind==='source-splash'));assert.equal(x.a.stats.turf,x.paint.counts[0]*.0625);
 });

test('REEF-LUX launch spread narrows 10.5 -> 5 -> 0.5 degrees with charge and preserves arrow margin',async()=>{
 for(const [frames,expected] of [[1,10.5],[12,5],[34,.5]]){
  const x=await setup('s3-stringer-short');fire(x.a,frames);
  const rounds=x.f.G.projectiles.list.filter(p=>p.catalog);assert.equal(rounds.length,3);
  const degrees=rounds[0].vel.angleTo(rounds[1].vel)*180/Math.PI;
  assert.ok(Math.abs(degrees-expected)<1e-6,`${frames}: ${degrees}`);
  assert.ok(Math.abs(rounds[0].start.distanceTo(rounds[1].start)-.2)<1e-9,'source ArrowMargin');
 }
});

test('explosive arrows paint on lodging, then detonate once after the source fuse',async()=>{
 const x=await setup('s3-stringer-normal',0);fire(x.a,72);
 const p=x.f.G.projectiles.list.find(p=>p.catalog?.index===1);assert.ok(p);
 x.f.G.actors=[];x.f.G.physics.level=null;
 x.f.G.physics.raycast=(from,dir,len,h)=>{h.hit=true;h.dist=from.y;h.point.copy(from).setY(0);h.normal.set(0,1,0);h.face=0;return h;};
 x.f.G.physics.segment=(from,to,h)=>{h.hit=true;h.dist=from.distanceTo(to)*.5;h.point.copy(from).lerp(to,.5);h.point.y=0;h.normal.set(0,1,0);h.face=0;return h;};
 const before=x.stamps.length;assert.equal(x.f.G.projectiles._step(p,1/60),false);
 assert.equal(p.catalog.stuck,true);assert.equal(x.stamps.length,before+1);assert.equal(x.stamps.at(-1).r,3);
 for(let i=0;i<44;i++)assert.equal(x.f.G.projectiles._step(p,1/60),false);
 assert.equal(x.stamps.length,before+1,'fuse does not repeatedly stamp');
 assert.equal(x.f.G.projectiles._step(p,1/60),true);assert.equal(x.stamps.length,before+2);
});

test('Saber foot mask requires nearby grounded floor; expiry releases its explicit terminal radius',async()=>{
 for(const id of ['s3-saber-normal','s3-saber-lite','s3-saber-heavy']){
  const x=await setup(id,0);fire(x.a);assert.ok(x.stamps.some(s=>s.r===x.a.weapon.catalogRecord.parameters.spl__WeaponSaberParam.FootSplashPaintParam.WidthHalfNearest));
  const high=await setup(id,8);fire(high.a);assert.equal(high.stamps.length,0);
  const p=high.f.G.projectiles.list.find(p=>p.catalog);high.f.G.actors=[];
  while(!high.f.G.projectiles._step(p,1/60)){}
  assert.ok(high.f.G.projectiles._s3SplashDrops.some(d=>d.radius===p.catalog.descriptor.b.BurstParam.SplashPaintRadius&&!d.depth));
 }
});

test('Brella collector survives a blocked centre pellet without crossing the wall or duplicating budgets',async()=>{
 const {THREE}=await fixture();const V=(z)=>new THREE.Vector3(0,8,z),source=C.records.find(r=>r.id==='s3-shelter-focus').parameters.spl__BulletShelterShotgunParam;
 const plan=brellaSplashPlan(source),volley={plan,nodes:[],next:0},released=[];
 for(let i=0;i<3;i++)volley.nodes.push({volley,distance:0,ended:false,samples:new Map()});
 const put=(i,end,ended)=>collectBrellaSplashes(volley.nodes[i],{prev:V(0)},V(end),ended,(at,r,spec,k)=>released.push({z:at.z,r,spec,k}));
 put(0,1,true);put(1,20,true);assert.equal(released.length,0,'await remaining member');put(2,20,true);
 assert.equal(released.length,6);assert.ok(released.every((r,i)=>Math.abs(r.z-3.3*(i+1))<1e-9));
 assert.ok(released.every(r=>r.r>source.SplashParam.SplashPaintWidthOneActive&&r.r<source.SplashParam.SplashPaintWidthFullActive));
 const blocked={plan,nodes:[],next:0};for(let i=0;i<3;i++)blocked.nodes.push({volley:blocked,distance:0,ended:false,samples:new Map()});
 const forbidden=[];for(const n of blocked.nodes)collectBrellaSplashes(n,{prev:V(0)},V(1),true,(...v)=>forbidden.push(v));assert.equal(forbidden.length,0);
});

for(const id of ['s3-stringer-short','s3-saber-lite','s3-shelter-focus'])test(id+' preserves final floor paint at 30/60/120Hz and has no ghost authority',async()=>{
 const grids=[];
 for(const hz of [30,60,120]){const x=await setup(id);fire(x.a);simulate(x,hz);grids.push(Array.from(x.paint.grid));}
 assert.deepEqual(grids[0],grids[1]);assert.deepEqual(grids[1],grids[2]);
 const x=await setup(id);fire(x.a);x.a.remote=true;for(const p of x.f.G.projectiles.list)p.ghost=true;simulate(x);
 assert.equal(x.stamps.length,0);assert.equal(x.a.stats.turf,0);assert.equal(x.f.G.projectiles._s3SplashLandings?.length||0,0);
});

for(const id of C.records.filter(r=>r.family==='dualies'&&!r.legacy).map(r=>r.id))test(id+' slide uses source half-width and does not paint in midair',async()=>{
 const x=await setup(id,0);const a=x.a;a.intent.fire=true;a.weaponRunner.update(1/60,{fire:false});
 assert.equal(a.weaponRunner.tryDodge(new x.f.THREE.Vector3(0,0,1)),true);
 const w=a.weapon.catalogRecord.parameters.SideStepParam.SplashSlideParam.PaintWidthHalf;
 for(let i=0;i<20;i++){const roll=a.weaponRunner.catalogState.roll;if(roll)a.pos.z+=roll.speed/60;a.weaponRunner.update(1/60,{fire:false});}
 const slide=x.stamps.filter(s=>s.opts.kind==='roll');assert.ok(slide.length>1);
 assert.ok(slide.every(s=>s.r> w && s.r< w*1.4));assert.equal(a.stats.turf,x.paint.counts[0]*.0625);
 const high=await setup(id);high.a.grounded=false;high.a.intent.fire=true;high.a.weaponRunner.update(1/60,{fire:false});
 high.a.weaponRunner.tryDodge(new high.f.THREE.Vector3(0,0,1));high.a.weaponRunner.update(1/60,{fire:false});assert.equal(high.stamps.length,0);
});

for(const id of ['s3-stringer-short','s3-saber-lite'])test(id+' releases all and only splash distances before a wall contact',async()=>{
 const x=await setup(id);fire(x.a);const p=x.f.G.projectiles.list.find(p=>p.catalog);
 p.pos.set(0,8,0);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,600);p.age=0;p.life=2;
 Object.assign(p.catalog,{carry:0,travel:0,range:100,nextSplash:1,dropCount:0});
 Object.assign(p.catalog.descriptor,{m:{},splashCount:8,splashSpacing:1});
 x.f.G.physics.level=null;x.f.G.physics.segment=(from,to,h)=>{h.hit=true;h.dist=2.5;h.point.set(0,8,2.5);h.normal.set(0,0,-1);h.face=0;return h;};
 x.f.G.projectiles._step(p,1/60);
 assert.deepEqual(Array.from(x.f.G.projectiles._s3SplashDrops,d=>d.releaseZ),[1,2]);
});

test('an already fired Brella volley still lands after its owner is splatted, then clear removes every queued drop',async()=>{
 const x=await setup('s3-shelter-focus');fire(x.a);x.a.alive=false;simulate(x);
 assert.ok(x.paint.counts[0]>0);assert.equal(x.a.stats.turf,x.paint.counts[0]*.0625);
 const y=await setup('s3-saber-lite');fire(y.a);y.f.G.projectiles.update(1/30);assert.ok(y.f.G.projectiles._s3SplashDrops.length>0);
 y.f.G.projectiles.clear();assert.equal(y.f.G.projectiles._s3SplashDrops.length,0);
});

for(const hz of [30,60,120])test('launched Brella paints a bounded trail, stops at terrain and cannot project from a high ledge at '+hz+'Hz',async()=>{
 for(const height of [0,8]){
  const x=await setup('s3-shelter-focus',height,{wall:true});x.a.intent.fire=true;
  for(let i=0;i<65;i++)x.a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});
  assert.equal(x.a.weaponRunner.catalogState.canopy,null,'source canopy launch completed');
  x.f.G.projectiles.list.length=0; // Isolate the launched canopy from its preceding shotgun volley.
  x.stamps.length=0;
  for(let i=0;i<hz*2;i++)x.f.G.projectiles.update(1/hz);
  if(height===8)assert.equal(x.stamps.length,0,'no stamp on the lower floor from an airborne canopy');
  else{assert.ok(x.stamps.length>5);assert.ok(x.stamps.every(s=>s.at.z<=8&&s.opts.face===0),'all canopy trail centres remain before the wall');}
 }
});
