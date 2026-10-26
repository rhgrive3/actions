import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { Vector3 } from '../../../inkwave-public/vendor/three/build/three.module.js';
import { SPARK, PUFF, RIBBON, BEAM, SHELL, DISC } from '../runtime/special-vfx-kit.mjs';
import { nonWailVfxTicks, consumeVfxPeriod } from '../runtime/nonwail-vfx-clock.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

// Execute the actual composed recipes and retained-disc method. The frozen
// fixture predates these five changes; it is not a rewritten reference model.
// These tests measure emission instructions, not GPU admission or screenshots.
const source = adaptBuildSource('patches/splatoon3/runtime/special-vfx.mjs', fs.readFileSync(new URL('../runtime/special-vfx.mjs', import.meta.url), 'utf8'));
const frozen = JSON.parse(fs.readFileSync(new URL('./fixtures/queue-special-cadence-before-1878.json', import.meta.url), 'utf8'));
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const recipes = {};
for (const id of Object.keys(frozen.recipes)) {
  const [table, key] = id.split('.');
  const root = ast.body.find(n => n.type === 'VariableDeclaration' && n.declarations[0].id.name === table).declarations[0].init;
  const node = root.properties.find(n => n.key.name === key).value;
  recipes[id] = source.slice(node.start, node.end);
}
const discNode = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'Director').body.body.find(n => n.key.name === 'disc');
const discSource = source.slice(discNode.start, discNode.end);
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
function copy(value) {
  if (typeof value === 'function') return '<callback>';
  if (value?.isVector3) return value.toArray();
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value, copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, copy(v)]));
  return value;
}
function harness(id, { old = false, mode = 'source', constantRandom = null } = {}) {
  let word = 0x12345678, draws = 0;
  const random = () => { draws++; return constantRandom ?? (word = (Math.imul(word,1664525) + 1013904223) >>> 0) / 4294967296; };
  const bindings = { nonWailVfxTicks, consumeVfxPeriod, vfxRandom:random, rnd:(a=1,b=0)=>b+random()*(a-b), TAU:Math.PI*2,
    clamp01, smooth, easeOut, SPARK, PUFF, RIBBON, BEAM, SHELL, DISC, SPECIAL_VFX_CALIBRATION:{booyah:{blastSeconds:40/60}} };
  let code = `return ${old ? frozen.recipes[id] : recipes[id]};`;
  if (mode === 'minified') code = createRequire(import.meta.url)(process.env.SPECIAL_VFX_ESBUILD).transformSync(`function recipe(){${code}}`, {minify:true,keepNames:true}).code + ';return recipe();';
  // Wrapping the extracted recipe preserves every production branch while
  // allowing a seeded replacement of the separate cosmetic RNG.
  const api = new Function(...Object.keys(bindings), code)(...Object.values(bindings));
  const rows = [], shapes = [];
  const emit = name => (...args) => {
    rows.push([name, ...args.map(copy)]);
    const record = { t:0, v:new Float32Array(16), follow:args.at(-1)?.follow };
    if (name === 'shell' || name === 'disc') shapes.push(record);
    return record;
  };
  const self = { v:Array.from({length:8},()=>new Vector3()), up:new Vector3(0,1,0), time:0, nearValue:true,
    hdr:(c,g=1,w=0)=>c.map(x=>x*g+w), bone:()=>null, chest:(a,v,y)=>v.copy(a.pos).setY(a.pos.y+y), near(){return this.nearValue;},
    c:{setRGB:(...v)=>v}, kit:{q:1,ribbons:{end(){}}}, pushRibbon(){}, setBeam(){}, ribbon:()=>({}), beam:()=>({v:new Float32Array(16)}) };
  for (const name of ['drop','spark','puff','flash','shell','disc','streaks','chunks','petals','nativeBurst','activation']) self[name] = emit(name);
  const observed = { pos:Object.freeze(new Vector3(2,3,4)), vel:Object.freeze(new Vector3(1,-2,3)), phase:'landed', dur:5.3, age:0, frameCount:0,
    _s3AllSpecialState:{phase:'aimThrow',zipTarget:Object.freeze(new Vector3(9,6,1)),hookFlightT:.05,hookFlightDuration:.1} };
  const record = {d:{},color:[.2,.4,.8],start:0,acc:0};
  const actor = id.startsWith('DIRECTORS');
  return { api, self, observed, record, rows, shapes, random, bindings, get draws(){return draws;}, get word(){return word;},
    frame(dt){ api.frame.call(self,...(actor?[observed,record]:[record,observed]),dt); },
    start(){ api.start?.call(self,...(actor?[observed,record]:[record,observed])); } };
}
const modes = ['source', ...(process.env.SPECIAL_VFX_ESBUILD ? ['minified'] : [])];
for (const mode of modes) {
  test(`${mode}: all five recipes preserve exact seeded 60 Hz birth instructions and RNG order through phase changes`,()=>{
    for (const id of Object.keys(recipes)) {
      const old = harness(id,{old:true}), next = harness(id,{mode});
      old.start(); next.start();
      for (let i=0;i<360;i++) for (const h of [old,next]) {
        h.self.time=(i+1)/60; h.self.nearValue=i%19>3;
        h.observed.age=(i+1)/60; h.observed.frameCount=i;
        h.observed.phase=i<90?'flight':'landed';
        h.observed._s3AllSpecialState.phase=id.endsWith('zipcaster')?['hookFlight','zip','recall'][Math.floor(i/20)%3]:i%31<17?'aimThrow':'swing';
        const before=copy(h.observed); h.frame(1/60); assert.deepEqual(copy(h.observed),before,`${id} remains presentation-only`);
      }
      assert.deepEqual(next.rows,old.rows,id); assert.equal(next.draws,old.draws,id); assert.equal(next.word,old.word,id);
    }
  });
  test(`${mode}: fixed-phase random recipes and Zipcaster body births match the 60 Hz reference at 30/60/120 Hz`,()=>{
    for (const [id,phase] of [['ROUND_FX.inkVac',null],['DIRECTORS.ultraStamp','aimThrow'],['DIRECTORS.zipcaster','hookFlight'],['DIRECTORS.zipcaster','zip'],['OBJECT_FX.booyahBlast','charge'],['OBJECT_FX.booyahBlast','blast']]) {
      const results=[];
      for (const hz of [30,60,120]) {
        const h=harness(id,{mode}); h.record.acc=-1000; h.observed.frameCount=phase==='blast'?60:10; h.record.blasted=phase==='blast';
        h.observed._s3AllSpecialState.phase=phase;
        for(let i=0;i<hz*2;i++) h.frame(1/hz);
        results.push({rows:h.rows,draws:h.draws,word:h.word});
      }
      assert.deepEqual(results[0],results[1],`${id} ${phase} 30 Hz`); assert.deepEqual(results[2],results[1],`${id} ${phase} 120 Hz`);
    }
  });
  test(`${mode}: decoy independent blink clock retains the accelerating last-second sequence across cadences`,()=>{
    const results=[];
    for(const hz of [30,60,120]) {
      const h=harness('OBJECT_FX.decoy',{mode}); h.record.landed=true;
      const times=[];
      for(let i=1;i<hz;i++) {
        h.observed.age=h.observed.dur-1+i/hz; const size=h.rows.length; h.frame(1/hz);
        for(const row of h.rows.slice(size)) if(row[0]==='spark'&&row[1]===SPARK.GLOW)times.push(i/hz);
      }
      results.push(times);
      assert.equal(h.draws,0,'pre-pop glow itself consumes no RNG');
      const snapshot=h.rows.length; for(const dt of [0,NaN,-1,Infinity])h.frame(dt); assert.equal(h.rows.length,snapshot);
    }
    const reference=results[1];
    for(const [i,hz] of [[0,30],[2,120]]) {
      assert.ok(Math.abs(results[i].length-reference.length)<=1,`${hz}: ${results[i].length}/${reference.length}`);
      for(const time of results[i]) assert.ok(reference.some(ref=>Math.abs(ref-time)<=1/30+1e-9),`${hz}: blink near ${time}`);
    }
    const h=harness('OBJECT_FX.decoy',{mode});h.observed.phase='flight';h.observed.age=h.observed.dur-.8;
    h.frame(1/120); assert.equal(h.record.d.nonWailCarry,.5); assert.equal(h.record.d.blinkClock.nonWailCarry,.5);
    h.frame(1/120); assert.equal(h.record.d.nonWailCarry,0);assert.equal(h.record.d.blinkClock.nonWailCarry,0);assert.equal(h.record.blink,1);
  });
  test(`${mode}: phase exits clear fractional carry; hitches remain bounded and Booyah burst is exactly once`,()=>{
    const stamp=harness('DIRECTORS.ultraStamp',{mode,constantRandom:.1});
    stamp.frame(1/120);assert.equal(stamp.record.d.nonWailCarry,.5);
    stamp.observed._s3AllSpecialState.phase='swing';stamp.frame(1/60);assert.equal(stamp.record.d.nonWailCarry,0);
    stamp.observed._s3AllSpecialState.phase='aimThrow';stamp.frame(1/120);assert.equal(stamp.rows.length,0);stamp.frame(99);assert.equal(stamp.rows.length,2);
    const zip=harness('DIRECTORS.zipcaster',{mode});zip.record.acc=-1000;zip.observed._s3AllSpecialState.phase='hookFlight';zip.frame(1/120);
    zip.observed._s3AllSpecialState.phase='zip';zip.frame(1/120);assert.equal(zip.rows.length,0);zip.frame(1/120);assert.equal(zip.rows.length,2);
    zip.observed._s3AllSpecialState.phase='recall';zip.frame(1/60);assert.equal(zip.record.d.nonWailCarry,0);assert.equal(zip.record.d.trail,null);
    const blast=harness('OBJECT_FX.booyahBlast',{mode,constantRandom:.1});blast.observed.frameCount=40;
    for(let i=0;i<5;i++)blast.frame(99);
    assert.equal(blast.rows.filter(r=>r[0]==='flash').length,1);assert.equal(blast.rows.filter(r=>r[0]==='drop').length,8);
    blast.self.nearValue=false;const before=blast.draws;blast.frame(1/60);assert.equal(blast.draws,before);assert.equal(blast.record.d.nonWailCarry,0);
  });
}
test('actual retained-disc callback already resets the Booyah warning angle in PR 1878; preserve that 60 Hz visual',()=>{
  for(const hz of [30,60,120]) for(const old of [false,true]) {
    const h=harness('OBJECT_FX.booyahBlast',{old});
    const actualDisc=new Function(...Object.keys(h.bindings),`return ({${old?frozen.disc:discSource}}).disc;`)(...Object.values(h.bindings));
    h.self.kit.discs={addRaw(life,...values){const follow=values.pop();return {life,t:0,v:Float32Array.from(values),follow};}};
    h.self.disc=actualDisc;h.start();const rec=h.record.d.warn,initial=rec.v[7];
    for(let i=0;i<hz;i++){rec.t+=1/hz;rec.follow(rec,1/hz);assert.ok(Math.abs(rec.v[7]-(initial+.02))<1e-6);}
  }
});
