import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { areaSpecialVfxTicks } from '../runtime/area-special-vfx-clock.mjs';

const candidate = new URL('../runtime/special-vfx.mjs', import.meta.url);
const baseline = process.env.AREA_VFX_BASELINE;
class Vec {
  constructor(x=0,y=0,z=0) { this.set(x,y,z); }
  set(x,y,z) { Object.assign(this,{x,y,z}); return this; }
  copy(v) { return this.set(v.x,v.y,v.z); }
  add(v) { this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  length() { return Math.hypot(this.x,this.y,this.z); }
  multiplyScalar(k) { this.x*=k; this.y*=k; this.z*=k; return this; }
}
async function load(file, transform) {
  let source = await fs.readFile(file, 'utf8');
  source += '\nexport { ROUND_FX as areaRounds, DIRECTORS as areaDirectors };';
  if (transform) source = await transform(source);
  const context = vm.createContext({ console });
  let clock = areaSpecialVfxTicks;
  if (transform) {
    const helper = new vm.SourceTextModule(await transform(await fs.readFile(new URL('../runtime/area-special-vfx-clock.mjs', import.meta.url), 'utf8')), { context });
    await helper.link(() => { throw new Error('clock must remain dependency-free'); });
    await helper.evaluate(); clock = helper.namespace.areaSpecialVfxTicks;
  }
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async (specifier) => {
    // Dependency stubs isolate actual full-module presentation branches, not a
    // reimplementation of either frame function. No WebGL/browser claim.
    const names = new Set();
    const original = await fs.readFile(file, 'utf8');
    for (const m of original.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g))
      if (m[2] === specifier) for (const name of m[1].split(',')) names.add(name.trim());
    const values = { areaSpecialVfxTicks: clock, vfxRandom: () => .25,
      SPARK: { STREAK: 0 }, WAIL_SPEAKER_POSITIONS: Array.from({length:6},(_,i)=>[i,1,0]) };
    return new vm.SyntheticModule([...names], function() {
      for (const name of names) this.setExport(name, values[name] ?? (()=>{}));
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}
function run(namespace, kind, fps, seconds) {
  let count=0;
  const director = { THREE:{Vector3:Vec}, time:0, v:Array.from({length:8},()=>new Vec()),
    pushRibbon(){}, hdr(c){return c;}, spark(){count++;}, disc(){return {};}, G:{time:0} };
  const pos = Object.freeze(new Vec(0,2,0));
  const actor = Object.freeze({pos, yaw:0});
  const projectile = Object.freeze({pos});
  const r = {d:{},vel:new Vec(0,3,0),color:[1,0,0]};
  const t = {d:{},start:0,color:[1,0,0]};
  for(let i=0;i<Math.round(fps*seconds);i++) {
    director.time=(i+1)/fps;
    if(kind==='missile') namespace.areaRounds.tentaMissiles.frame.call(director,r,projectile,1/fps);
    else namespace.areaDirectors.killerWail.frame.call(director,actor,t,1/fps);
  }
  return count;
}
for (const fps of [30,60,120,144,240]) test(`clock retains 60 ticks per second at ${fps} Hz`,()=>{
  const r={}; let total=0; for(let i=0;i<fps;i++) total+=areaSpecialVfxTicks(r,1/fps);
  assert.equal(total,60); assert.ok(r.areaSpecialVfxCarry<1);
});
test('invalid dt does not emit or consume carry; stalled time cannot create a particle burst',()=>{
  const r={}; assert.equal(areaSpecialVfxTicks(r,1/120),0);
  for(const dt of [0,-1,NaN,Infinity,-Infinity]) assert.equal(areaSpecialVfxTicks(r,dt),0);
  assert.equal(r.areaSpecialVfxCarry,.5);
  assert.equal(areaSpecialVfxTicks(r,99),2);
  assert.equal(areaSpecialVfxTicks(r,1/120),1);
});
test('independent records cannot spend each other\'s carry',()=>{
  const a={},b={}; assert.equal(areaSpecialVfxTicks(a,1/120),0);
  assert.equal(areaSpecialVfxTicks(b,1/120),0); assert.equal(areaSpecialVfxTicks(a,1/120),1);
  assert.equal(b.areaSpecialVfxCarry,.5);
});
for (const mode of ['source', ...(process.env.AREA_VFX_ESBUILD ? ['minified'] : [])]) {
  test(`${mode}: actual missile exhaust and Wail charge preserve 60 Hz emission opportunities`,async()=>{
    const transform = mode==='minified' ? async code => (await (await import(process.env.AREA_VFX_ESBUILD)).transform(code,{format:'esm',minify:true})).code : null;
    const ns=await load(candidate,transform);
    for(const fps of [30,60,120,144,240]) {
      assert.equal(run(ns,'missile',fps,1),60,`missile ${fps}`);
      // .5 s stays within the existing .6 s charge window. Terminal boundary
      // behavior and phase lifetime are deliberately not recalibrated here.
      assert.equal(run(ns,'wail',fps,.5),180,`Wail ${fps}`);
    }
  });
}
if(baseline) test('negative control: frozen original ties both effects to render callbacks',async()=>{
  const ns=await load(baseline);
  assert.deepEqual([30,60,144].map(fps=>run(ns,'missile',fps,1)),[30,60,144]);
  assert.deepEqual([30,60,144].map(fps=>run(ns,'wail',fps,.5)),[90,180,432]);
});
