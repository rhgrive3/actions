import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { shooterImpactRadius, shooterImpactDepthScale } from '../runtime/shooter-impact-paint.mjs';
import { sourceFlightInkKind, SOURCE_SHOT_PAINT_KIND, SOURCE_SPLASH_PAINT_KIND } from '../runtime/source-shot-footprint.mjs';

const near = (a, b, tol = 1e-10) =>
  assert.ok(Math.abs(a-b) <= tol, 'expected ' + a + ' ~= ' + b);

test('11.3.0 pinned Shooter inputs remain the source of separate terminal, mid-flight and foot paint', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const raw = f.profile.weaponsFidelityCompletion.weapons.shooter;
  near(raw.PaintParam.WidthHalfNear, 1.93);
  near(raw.PaintParam.WidthHalfMiddle, 1.93);
  near(raw.PaintParam.WidthHalfFar, 1.71);
  near(raw.PaintParam.DepthScaleMax, 2.24);
  near(raw.SplashPaintParam.WidthHalf, 1.472);
  near(raw.SplashPaintParam.WidthHalfNearest, 2.0608);
  near(raw.SplashSpawnParam.SpawnNum, 1.5);
  assert.equal(raw.SplashSpawnParam.SplitNum, 8);
  assert.deepEqual(Array.from(raw.SplashSpawnParam.ForceSpawnNearestAddNumArray), [4]);
  assert.equal(sourceFlightInkKind('shot'), SOURCE_SHOT_PAINT_KIND);
  assert.equal(sourceFlightInkKind('trail'), SOURCE_SPLASH_PAINT_KIND);
  assert.equal(sourceFlightInkKind('drop'), SOURCE_SPLASH_PAINT_KIND);
  assert.equal(sourceFlightInkKind('blast'), 'blast');
});

test('Shooter main body selects source width and straight/break-free depth from the actual shot phase', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { V } = makePaintWorld(f);
  const w = f.WEAPONS.shooter;
  const start = V(0,0,0), floor = V(0,0,1.1);
  const shot = { start, vel: V(0,-1,0), inkProfile: {}, inkPhase: 0,
    fidelityPhase: 0 };
  near(shooterImpactRadius(w, shot, floor), 1.93);
  near(w.impactPaint.distanceFar, 20);
  near(w.impactPaint.degreeUseDepthScaleMax, 10);
  near(w.impactPaint.degreeUseDepthScaleMin, 35);
  near(shooterImpactRadius(w, shot, V(0,0,w.impactPaint.distanceFar)), 1.71);
  near(shooterImpactDepthScale(w, shot, V(0,1,0)), 1.31);
  shot.inkPhase = 2; // measured source flight free phase, not the generic fidelityPhase
  near(shooterImpactDepthScale(w, shot, V(0,1,0)), 1.12);
});

test('source DepthScale maps to a centered WidthHalf x depth ellipse with no extra size', async () => {
  const { catalogPaintEllipse } = await import('../runtime/catalog-splash-paint.mjs');
  for (const depth of [1, 1.12, 1.2, 1.31, 2.24]) {
    for (const radius of [1.472, 1.71, 1.93, 2.0608]) {
      const e = catalogPaintEllipse(radius, depth), sa = e.stretchAmt;
      near(e.radius, radius);
      near((1 + sa) * radius - e.centreBack, depth * radius);
      near((1 + .25 * sa) * radius + e.centreBack, depth * radius);
      near(2*radius*(1+.625*sa), 2*depth*radius);
    }
  }
});

test('all 65 source main weapon records retain numeric paint widths rather than a global rescale', () => {
  assert.equal(MAIN_WEAPON_CATALOG.referenceVersion, '11.3.0');
  assert.equal(MAIN_WEAPON_CATALOG.records.length, 65);
  for (const r of MAIN_WEAPON_CATALOG.records) {
    const source = r.parameters;
    const widths = [];
    function visit(value) {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith('WidthHalf') && Number.isFinite(v)) widths.push(v);
        else if (typeof v === 'object') visit(v);
      }
    }
    visit(source);
    assert.ok(widths.some(x => x > 0), r.sourceRow + ' needs a real positive source width');
  }
});

test('production source mask uses original WidthHalf without artificial shrink or satellite Turf', () => {
  const raw = fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js', import.meta.url), 'utf8');
  const composed = adaptSource('src/world/paint.js', raw);
  assert.match(composed, /'source-shot': 8, 'source-splash': 9/);
  assert.match(composed, /const REACH = \[1.75, 1.75, 1.75, 1.75, 1.75, 1.75, 1.25, 1.35, 1, 1\]/);
  assert.match(composed, /sd = length\(p\) - r \* grow;/);
  assert.match(composed, /if \(sourced && d > r\) continue;/);
  assert.match(composed, /if \(!sourced\) \{/);
  assert.match(composed, /const sourced = kind === K_SOURCE_SHOT \|\| kind === K_SOURCE_SPLASH/);
  assert.doesNotMatch(composed, /sourceShotRasterRadius|2\.56|2\.08/);
  const flight = adaptSource('src/game/inkFlightRuntime.js',
    fs.readFileSync(new URL('../../../inkwave-public/src/game/inkFlightRuntime.js', import.meta.url), 'utf8'));
  assert.match(flight, /kind: sourceFlightInkKind\(kind\)/);
  assert.match(flight, /shooterImpactRadius\(shooter, p, hit\.point\)/);
  // A direct Shooter depth override would bypass the live 60 Hz source
  // phase/height paintShape. The sourced width is the only substituted axis.
  assert.doesNotMatch(flight, /shooterImpactDepthScale\(shooter, p, hit\.normal\)/);
  // Keep the live 60 Hz InkFlight paintShape depth/phase/height interpolation.
  // The narrower Shooter WidthHalf replaces the radius, not that native stretch.
  assert.match(flight, /paintShape\(p\.inkProfile, p\.start\.distanceTo\(hit\.point\), angle, p\.inkPhase, Math\.max\(0, p\.inkPeak - hit\.point\.y\)\)/);
  assert.match(flight, /if \(width > 0\) shape\.radius = width;/);
  assert.match(flight, /this\.paint\(p, hit, splashPaintFootprint\(shape\), p\.vel, 'shot'\)/);
  const network = fs.readFileSync(new URL('../../network-replication/adapter.mjs', import.meta.url), 'utf8');
  assert.match(network, /'source-shot', 'source-splash'/);
});

test('source-defined WidthHalf and DepthScale bound real CPU turf on a flat floor', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { paint, face, V } = makePaintWorld(f, { cell: 0.125 });
  const owner = f.make('shooter');
  const params = f.profile.weaponsFidelityCompletion.weapons.shooter.PaintParam;
  const centre = V(0, 0, 8), direction = V(0, 0, 1);
  const width = params.WidthHalfNear, stretch = params.DepthScaleMax - 1;
  const area = paint.splat(centre, width, owner.team, {
    kind: SOURCE_SHOT_PAINT_KIND, face: 0, stretch: direction,
    stretchAmt: stretch, seed: .37, claimOwner: owner,
  });
  assert.ok(area > 0);
  const growth = paint.growing.at(-1);
  assert.equal(growth.kind, 8);
  near(growth.R, width);
  near(growth.entries[6], stretch);
  let cells = 0;
  for (let y = 0; y < face.nv; y++) for (let x = 0; x < face.nu; x++) {
    if (paint.grid[face.grid + y*face.nu + x] !== 1) continue;
    cells++;
    const du = face.origin.x + (x+.5)*face.cu - centre.x;
    const dv = face.origin.z + (y+.5)*face.cv - centre.z;
    const forwardScale = dv > 0 ? 1 + stretch : 1 + .25*stretch; // native painter smear before source-center adjustment
    assert.ok(Math.hypot(du, dv/forwardScale) <= width + 1e-8,
      'source WidthHalf bounds lateral coverage after internal DepthScale elongation');
  }
  assert.ok(cells > 40);
  const before = paint.counts[0];
  for (let i=0;i<120;i++) paint.advanceSimulation(1/60);
  assert.equal(paint.counts[0], before,
    'no invented late satellites; S3 SplashSpawnParam produces its own drops');
});

test('actual native source ink flight retains separate head and detached splash numeric widths', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { paint, V } = makePaintWorld(f);
  const owner = f.make('shooter');
  const src = f.profile.weaponsFidelityCompletion.weapons.shooter;
  const shot = src.PaintParam.WidthHalfNear;
  const mid = src.SplashPaintParam.WidthHalf;
  const shape = { radius: shot, stretch: src.PaintParam.DepthScaleMax-1 };
  f.G.projectiles.inkFlight.paint({ owner, team: owner.team, ghost: false, seed: .37 },
    { face: 0, point: V(0,0,8), normal: V(0,1,0) }, shape, V(0,0,1), 'shot');
  const impact = paint.growing.at(-1);
  assert.equal(impact.kind, 8);
  near(impact.R, shot);
  f.G.projectiles.inkFlight.paint({ owner, team: owner.team, ghost: false, seed: .72 },
    { face: 0, point: V(12,0,8), normal: V(0,1,0) },
    { radius: mid, stretch: 0 }, V(0,0,1), 'drop');
  const drop = paint.growing.at(-1);
  assert.equal(drop.kind, 9);
  near(drop.R, mid);
  assert.equal(paint.grid.filter(x => x === 1).length, paint.counts[0]);
});

test('same full-precision sourced event gives identical CPU ownership on local and replay clients', async () => {
  const clients=[];
  const client=async id=>{
    const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true});
    const {paint,V,face}=makePaintWorld(f),wire=[],messages=[],areas=[];
    const actor=f.make('shooter');Object.assign(actor,{nid:1,owner:'owner',remote:id!=='owner',isLocal:id==='owner',team:0});
    const trigger=actor.character.trigger;
    const nm=new f.NetMatch({myId:id,hostId:'owner',isHost:id==='owner',_members:new Map([['owner','Owner'],['receiver','Receiver']]),tr:{broadcast(msg){wire.push(JSON.parse(JSON.stringify(msg)));},sendTo(){return false;}}},{id:'source-shot-parity'});
    const recSplat=nm.recSplat,splat=paint.splat;
    const c={f,paint,V,face,actor,trigger,nm,recSplat,splat,wire,messages,areas};clients.push(c);
    nm.bind({actors:[actor],state:'playing',time:180,follower:id!=='owner'});
    // Observe the production boundary while retaining its authority/order receipt.
    nm.recSplat=function(at,r,team,options){messages.push({radius:r,kind:options.kind,face:options.face});return recSplat.call(this,at,r,team,options);};
    paint.splat=function(...args){const area=splat.apply(this,args);areas.push(area);return area;};
    return c;
  };
  try{
    const a=await client('owner'),b=await client('receiver');
    const r=a.f.profile.weaponsFidelityCompletion.weapons.shooter.PaintParam.WidthHalfNear;
    const area=a.paint.splat(a.V(0,0,8),r,0,{kind:SOURCE_SHOT_PAINT_KIND,face:0,seed:.37,stretch:a.V(0,0,1),stretchAmt:1.24,claimOwner:a.actor});
    assert.ok(area>0);
    a.nm._sendTick();
    const tick=a.wire.find(msg=>msg.k==='t');assert.ok(tick);assert.equal(tick.e.filter(e=>e[1]==='s').length,1);
    const row=tick.e.find(e=>e[1]==='s');near(row[5],1.93);assert.equal(row[8],SOURCE_SHOT_PAINT_KIND);
    assert.deepEqual(row[14][4],['inkwave-paint-authority-v1','actor',1,0]);
    b.nm.onMessage('owner',JSON.parse(JSON.stringify(tick)));
    for(let i=0;i<12;i++){b.f.G.time+=1/60;b.nm.update(1/60);}
    assert.equal(b.areas.length,1,'the real JSON receiver applies the paint exactly once');
    const collect=c=>({area:c.areas[0],cells:Array.from(c.paint.grid),radius:c.paint.growing.at(-1).R,kind:c.paint.growing.at(-1).kind,messages:c.messages,faceCells:c.face.nu*c.face.nv});
    const local=collect(a),remote=collect(b);
    near(local.radius,1.93);
    assert.deepEqual(local.messages,[{radius:1.93,kind:SOURCE_SHOT_PAINT_KIND,face:0}]);
    assert.deepEqual(remote.messages,[],'remote playback does not record a new local stamp');
    assert.deepEqual({...remote,messages:local.messages},local);
    // A replayed tick must not repaint cells, add another growth, or re-credit turf.
    const before={cells:Array.from(b.paint.grid),growth:b.paint.growing.length,credit:b.actor.stats.turf};
    b.nm.onMessage('owner',JSON.parse(JSON.stringify(tick)));
    for(let i=0;i<12;i++){b.f.G.time+=1/60;b.nm.update(1/60);}
    assert.equal(b.areas.length,1);assert.deepEqual({cells:Array.from(b.paint.grid),growth:b.paint.growing.length,credit:b.actor.stats.turf},before);
  }finally{
    for(const c of clients){try{c.nm.dispose();}finally{c.nm.recSplat=c.recSplat;c.paint.splat=c.splat;c.actor.character.trigger=c.trigger;delete c.actor.character._netTrig;c.nm.byNid.clear();c.nm.match=null;const i=c.f.G.actors.indexOf(c.actor);if(i>=0)c.f.G.actors.splice(i,1);}}
  }
});
