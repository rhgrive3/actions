import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { mainInkFootprint, INK_PROFILE_BYTES, INK_FOOTPRINT_KINDS } from '../runtime/main-ink-footprints.mjs';

const families=new Set(['shooter','dualies','roller','brush','slosher']);
const options={fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('profile resource is bounded and only the requested main families opt in',()=>{
  assert.equal(INK_PROFILE_BYTES.byteLength,4096);
  for(const r of MAIN_WEAPON_CATALOG.records)assert.equal(!!mainInkFootprint(r),families.has(r.family),r.id);
  assert.equal(mainInkFootprint('shooter'),mainInkFootprint('dualies'),'both fire discrete ink shots');
  assert.notEqual(mainInkFootprint('brush'),mainInkFootprint('slosher'));
  assert.equal(mainInkFootprint({family:'slosher',sourceActor:'WeaponSlosherBathtub'}),'ink-shot','bubbles retain discrete puddles');
});

test('single nearest GPU fetch packs both linear profile endpoints exactly', () => {
  assert.equal(INK_PROFILE_BYTES.length, 128 * 8 * 4);
  for (let row = 0; row < INK_FOOTPRINT_KINDS.length; row++) {
    for (let i = 0; i < 128; i++) {
      const offset = (row * 128 + i) * 4;
      const neighbor = (row * 128 + Math.min(i + 1, 127)) * 4;
      assert.equal(INK_PROFILE_BYTES[offset + 2], INK_PROFILE_BYTES[neighbor], 'next left');
      assert.equal(INK_PROFILE_BYTES[offset + 3], INK_PROFILE_BYTES[neighbor + 1], 'next right');
    }
  }
});

test('all 34 main Actors use the new CPU silhouette through real release/contact paths and credit it once',async()=>{
  const f=await fixture(options);f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  const rows=[];
  for(const r of MAIN_WEAPON_CATALOG.records.filter(r=>families.has(r.family))) {
    f.G.projectiles.clear();f.G.actors=[];
    const {paint}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
    const a=f.make(r.id);a.form='kid';a.pos.set(0,0,0);a.ink=100;
    a.aimDir.set(0,-.12,1).normalize();a.aimPoint.set(0,0,12);
    const kinds=new Set(),stamps=[],cpu=paint._cpuSplat,native=paint.splat;
    paint._cpuSplat=function(...args){const result=cpu.apply(this,args);if(result>0)kinds.add(args[9]);return result;};
    paint.splat=function(at,R,team,opts={}){
      stamps.push({at:at.toArray(),R,team,seed:opts.seed,kind:opts.kind,footprint:opts.footprint,
        stretch:opts.stretch?.toArray(),stretchAmt:opts.stretchAmt,face:opts.face});
      return native.call(this,at,R,team,opts);
    };
    for(let i=0;i<300;i++){
      a.intent.fire=i<120;f.G.time+=1/60;a.update(1/60);f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);
    }
    assert.ok(stamps.length>0,r.id);assert.ok(paint.counts[0]>0,r.id);
    // Explosher's explosion is a separate existing blast owner, not Bucket's sheet.
    if(r.sourceActor!=='WeaponSlosherWashtub')assert.ok([...kinds].some(k=>k>=10&&k<=14),r.id+' selected live silhouette');
    assert.equal(a.stats.turf,paint.counts[0]*.0625,r.id+' exact once-only turf credit');
    rows.push({id:r.id,family:r.family,kinds:[...kinds].sort((a,b)=>a-b),stamps:stamps.length,cells:paint.counts[0],
      grid:digest(paint.grid),events:digest(JSON.stringify(stamps))});
  }
  assert.equal(rows.length,34);
  if(process.env.INK_FOOTPRINT_RECEIPT)fs.writeFileSync(process.env.INK_FOOTPRINT_RECEIPT,JSON.stringify({version:'11.3.0',profileBytes:4096,rows},null,2)+'\n');
});

test('oriented contact band has parallel sides and continuous center coverage without circular scallops',async()=>{
  const f=await fixture(options),{paint,V}=makePaintWorld(f,{cell:.125});
  const direction=V(0,0,1);
  for(let z=4;z<12;z+=.25)paint.splat(V(0,0,z),.6,0,{kind:'source-shot',footprint:'ink-contact',seed:.37,face:0,stretch:direction,stretchAmt:0});
  const face=f.G.level.faces[0],halfWidths=[];
  for(let z=5;z<11;z+=.125){
    let lo=Infinity,hi=-Infinity;
    for(let x=-1;x<1;x+=.125)if(paint.sampleWorld(0,V(x,0,z))===1){lo=Math.min(lo,x);hi=Math.max(hi,x);}
    assert.ok(lo<0&&hi>0,'center path remains swimmable');halfWidths.push(hi-lo);
  }
  assert.equal(new Set(halfWidths).size,1,'straight stroke keeps a constant width');
  assert.equal(paint.sampleWorld(0,V(1,0,8)),0,'does not claim turf beyond the brush width');
  assert.ok(face.nu>0);
});

test('all added Rollers and Brushes select the band through grounded, moving WeaponRunner contact',async()=>{
  const f=await fixture(options);f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.settings={};f.setRandom(()=>.37);
  for(const r of MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&(r.family==='brush'||r.family==='roller'))){
    f.G.actors=[];f.G.time=0;
    const level=new f.Level({bounds:{minX:-15,maxX:15,minZ:-5,maxZ:20},spawnPads:[[-10,0,0],[10,0,0]],spawnBarrier:0,
      single:[{kind:'box',min:[-15,-1,-5],max:[15,0,20]}],half:[]});
    f.G.level=level;f.G.physics=new f.Physics(level);f.G.scene=new f.THREE.Scene();
    class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){this.quads=0;}}
    const paint=f.G.paint=new CpuPaint(null,level,{atlasSize:1024,maxDensity:20,cell:.125});
    f.G.projectiles=new f.Projectiles(f.G.scene);
    const a=f.make(r.id);a.pos.set(0,20,3);
    const support={hit:false,point:new f.THREE.Vector3(),normal:new f.THREE.Vector3()};
    f.G.physics.raycast(a.pos,new f.THREE.Vector3(0,-1,0),40,support,true);assert.ok(support.hit);
    a.pos.copy(support.point);a.ground.hit=true;a.ground.face=support.face;a.ground.normal.copy(support.normal);a.groundN.copy(support.normal);
    a.form='kid';a.ink=100;a.grounded=true;a.yaw=0;a.aimDir.set(0,-.1,1).normalize();
    a.intent.move.set(0,0,1);a.vel.set(0,0,3);a.weaponRunner.cooldown=0;
    const kinds=new Set(),cpu=paint._cpuSplat;paint._cpuSplat=function(...args){const v=cpu.apply(this,args);if(v>0)kinds.add(args[9]);return v;};
    for(let i=0;i<60;i++){
      // Prescribed real contact trajectory isolates paint from movement tuning.
      a.pos.z=3+i*.05;f.G.time+=1/60;
      a.weaponRunner.update(1/60,{fire:true,firePressed:false,sub:false});paint.advanceSimulation(1/60);
    }
    assert.ok(kinds.has(14),r.id+' uses contact silhouette');
    const face=level.faces.find(face=>face.n.y>.9&&face.paintable);
    for(let z=4;z<6;z+=.125)assert.equal(paint.sampleWorld(face.id,new f.THREE.Vector3(0,0,z)),1,r.id+' uninterrupted center');
  }
});

test('canonical event records the chosen kind before replication and replay uses it without an actor',async()=>{
  const f=await fixture(options),{paint,V}=makePaintWorld(f),events=[];
  f.G.netm={mute:0,applying:false,recSplat(at,R,team,opts){events.push({at:at.clone(),R,team,opts:{...opts}});}};
  for(const footprint of INK_FOOTPRINT_KINDS)paint.splat(V(0,0,10),1.3,0,
    {kind:'source-shot',footprint,seed:.37,face:0,stretch:V(.6,0,.8),stretchAmt:.8});
  assert.deepEqual(events.map(e=>e.opts.kind),[...INK_FOOTPRINT_KINDS]);
  const expected=digest(paint.grid);f.G.netm=null;
  const {paint:remote}=makePaintWorld(f);
  for(const e of events){delete e.opts.footprint;delete e.opts.claimOwner;remote.splat(e.at,e.R,e.team,e.opts);}
  assert.equal(digest(remote.grid),expected);
});
