import test from 'node:test';
import assert from 'node:assert/strict';
import { batchFixture, cpuFloor } from './batch03-fixture.mjs';
import { configureDualiesSlidePaint, paintDualiesSlide, slideStampRadius } from '../runtime/dualies-slide-paint.mjs';
import { FixedClock } from '../runtime/clock.mjs';

test('#979 installed runner uses the pinned half width, native CPU roll footprint and no legacy trail', async()=>{
  const f=await batchFixture(),a=f.make('dualies'),r=a.weaponRunner,cpu=cpuFloor(f);
  a.pos.set(0,0,0);r.dodge={t:0,dur:.2};r._dodgeDir.set(0,0,1);
  const record=f.G.paint.splat; f.G.paint.splat=(...args)=>{record(...args);return cpu.splat(...args);};
  r._dualies(1/60,{fire:false},a.weapon);
  assert.equal(a.weapon.rollPaintWidthHalf,1.8);assert.ok(f.paint.length);assert.ok(f.paint.every(e=>e.opts.kind==='roll'));
  assert.ok(Math.abs(cpu.extent('x').width-3.6)<=.1,JSON.stringify(cpu.extent('x')));
  assert.ok(f.paint.every(e=>e.radius===slideStampRadius(1.8)));
});

test('#979 fixed simulation has identical paint at 30/60/120Hz; rolls remain independent',async()=>{
  const traces=[];
  for(const hz of [30,60,120]){
    const f=await batchFixture(),a=f.make('dualies'),r=a.weaponRunner,clock=new FixedClock();
    a.pos.set(0,0,0);r.dodge={t:0,dur:.2};r._dodgeDir.set(0,0,1);
    for(let frame=0;frame<hz*.2;frame++)clock.advance(1/hz,dt=>{a.pos.z+=.2;r._dualies(dt,{fire:false},a.weapon);});
    traces.push(f.paint.map(e=>[...e.point.toArray(),e.radius,e.opts.seed]));
    const first=f.paint.length;r.dodge={t:0,dur:.2};a.pos.set(10,0,0);r._dualies(1/60,{fire:false},a.weapon);
    assert.ok(f.paint.length>first);assert.ok(f.paint.slice(first).every(e=>e.point.x===10));
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('#1165 shared wavy band keeps Dualies slide ownership inside the sourced width across seeds and headings',async()=>{
  const f=await batchFixture();
  for(const nid of ['local','peer-17','peer-52']) for(const angle of [0,.3,Math.PI/2]) {
    const a=f.make('dualies'),r=a.weaponRunner,cpu=cpuFloor(f,12,.05);
    a.nid=nid;a.pos.set(0,0,0);r.dodge={t:0,dur:.2};
    r._dodgeDir.set(Math.sin(angle),0,Math.cos(angle));
    f.G.paint.splat=(...args)=>cpu.splat(...args);
    r._dualies(1/60,{fire:false},a.weapon);
    let lo=Infinity,hi=-Infinity;
    const {p,face}=cpu;
    for(let j=0;j<face.nv;j++) for(let i=0;i<face.nu;i++) if(p.grid[face.grid+j*face.nu+i]) {
      const x=(i+.5)*face.cu-6,z=(j+.5)*face.cv-6;
      const across=x*Math.cos(angle)-z*Math.sin(angle);
      lo=Math.min(lo,across);hi=Math.max(hi,across);
    }
    const half=a.weapon.rollPaintWidthHalf;
    assert.ok(lo>=-half && hi<=half,`${nid}/${angle}: source width exceeded (${lo},${hi})`);
    assert.ok(hi-lo>=2*half-.15,`${nid}/${angle}: slide unexpectedly narrowed`);
  }
});

test('#979 scale follows profile; air, remote and dead actors cannot score slide paint',async()=>{
  const f=await batchFixture();f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit=2;configureDualiesSlidePaint(f.WEAPONS,f.profile);
  assert.equal(f.WEAPONS.dualies.rollPaintWidthHalf,3.6);
  for(const state of [{grounded:false},{remote:true},{alive:false}]){
    const a=f.make('dualies'),r=a.weaponRunner;a.pos.set(0,0,0);Object.assign(a,state);r.dodge={t:0,dur:.2};r._dodgeDir.set(0,0,1);
    paintDualiesSlide(f.G,r,a.weapon);
  }
  assert.equal(f.paint.length,0);
});

test('#979 optional 4F startup performs no paint before movement admission',async()=>{
 const f=await batchFixture(),a=f.make('dualies'),r=a.weaponRunner;a.isLocal=true;
 r.dodge={t:0,dur:a.weapon.rollTime,startup:4/60};r._dodgeDir.set(0,0,1);
 for(let i=0;i<4;i++){paintDualiesSlide(f.G,r,a.weapon);r.dodge.startup=Math.max(0,r.dodge.startup-1/60);}
 assert.equal(f.paint.length,0);assert.equal(r.s3SlidePaint,null);
 paintDualiesSlide(f.G,r,a.weapon);assert.equal(f.paint.length,1);
});
