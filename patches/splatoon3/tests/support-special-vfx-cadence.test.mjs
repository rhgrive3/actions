import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

// Execute the actual production handlers, with renderer sinks instead of a GPU.
// This is a method-level regression, not composed/browser/retail visual acceptance.
const path = process.env.SUPPORT_VFX_SOURCE || new URL('../runtime/special-vfx.mjs', import.meta.url);
const source = readFileSync(path, 'utf8');
const executable = source.replace(/^import .*?;$/gm, '').replace(/^export default .*?;$/gm, '').replace(/^export /gm, '');
const ctx = vm.createContext({WAIL_SPEAKER_POSITIONS: [], BEAM: {LINE: 1}, SPARK: {STAR: 1}, PUFF: {MIST: 1}, SHELL: {HOLO: 1}, DISC: {TARGET: 1}, vfxRandom: () => 0.5});
let program = executable + '\nglobalThis.handlers = {OBJECT_FX, KIT_FX};';
// Optional bounded transform parity, not the emitted site or a production bundle.
if (process.env.SUPPORT_VFX_ESBUILD) {
 const esbuild = createRequire(import.meta.url)(process.env.SUPPORT_VFX_ESBUILD);
 program = esbuild.transformSync(program, {loader:'js', target:'es2022', minify:true}).code;
}
vm.runInContext(program, ctx);
const {OBJECT_FX, KIT_FX} = ctx.handlers;
const vec = () => ({x:0,y:0,z:0,copy(p){Object.assign(this,{x:p.x,y:p.y,z:p.z});return this;},setY(y){this.y=y;return this;},set(x,y,z){Object.assign(this,{x,y,z});return this;}});
const host = () => ({time:0,v:[vec(),vec()],up:{x:0,y:1,z:0},near:()=>true,hdr:c=>c,sparks:0,puffs:0,flash(){},spark(){this.sparks++;},puff(){this.puffs++;},shell(){},disc(...args){this.follow=args.at(-1).follow;return {};}});
const object = () => ({pos:{x:1,y:2,z:3},phase:'armed',hp:100,hpMax:100,radius:4});
const record = () => ({d:{},color:[1,0,0]});
function cadence(hz, seconds, cb) { for(let i=0;i<hz*seconds;i++)cb(1/hz); }
function angle(hz) {
 const h=host(),o=object(),r=record(),rec={v:new Array(16).fill(0)};rec.v[7]=1.7;
 OBJECT_FX.wave.start.call(h,r,o);h.follow(rec);
 cadence(hz,3,dt=>{h.time+=dt;h.follow(rec);});return rec.v[7];
}
test('Wave Breaker target phase is identical at 30/60/120/144Hz and preserves random seed',()=>{
 for(const hz of [30,60,120,144])assert.ok(Math.abs(angle(hz)-3.5)<1e-10,`${hz}Hz angle ${angle(hz)}`);
});
test('Wave target follows position and hides in flight without touching gameplay',()=>{
 const h=host(),o=object(),r=record(),rec={v:new Array(16).fill(0)};
 OBJECT_FX.wave.start.call(h,r,o);const before=JSON.stringify(o);h.follow(rec);assert.equal(JSON.stringify(o),before);
 o.phase='flight';o.pos.x=9;h.time=1;h.follow(rec);assert.equal(rec.v[0],9);assert.equal(rec.v[11],0);
 o.phase='armed';h.follow(rec);assert.equal(rec.v[11],.55);
});
for(const [kind,period] of [['bubbler',.12],['cooler',.18]]){
 test(`${kind} retains fractional emission time at 30/60/120/144Hz`,()=>{
  for(const hz of [30,60,120,144]){
   const h=host(),o=object(),r=record(),before=JSON.stringify(o);
   cadence(hz,9,dt=>KIT_FX[kind].frame.call(h,r,o,dt));
   assert.equal(h.sparks,Math.round(9/period),`${hz}Hz`);
   if(kind==='cooler')assert.equal(h.puffs,h.sparks);
   assert.equal(JSON.stringify(o),before,'presentation must not mutate authoritative record');
  }
 });
 test(`${kind} bounds catch-up work to one emission and respects culling`,()=>{
  const h=host(),o=object(),r=record();h.near=()=>false;
  for(let i=0;i<100;i++)KIT_FX[kind].frame.call(h,r,o,.1);
  assert.equal(h.sparks,0);h.near=()=>true;KIT_FX[kind].frame.call(h,r,o,1);
  assert.equal(h.sparks,1);assert.ok(r.acc>=0&&r.acc<period);
 });
}

function bubblerHost() {
 const h=host();h.beams=[];h.kit={q:0};h.streaks=()=>{};
 h.beam=(...args)=>{const rec={v:new Array(16).fill(0),initialAlpha:args[8],follow:args.at(-1).follow};rec.v[11]=rec.initialAlpha;h.beams.push(rec);return rec;};
 return h;
}
test('Bubbler tall pillar and halo stay hidden before ignition, then reuse the same records',()=>{
 const h=bubblerHost(),o={...object(),ignited:false},r=record(),before=JSON.stringify(o);
 KIT_FX.bubbler.start.call(h,r,o);assert.equal(h.beams.length,2);
 for(const b of h.beams){assert.equal(b.initialAlpha,0);b.follow(b);assert.equal(b.v[11],0);}
 assert.equal(JSON.stringify(o),before,'no radius, position, health or ignition mutation');
 o.ignited=true;h.time=2;
 for(const b of h.beams)b.follow(b);
 assert.ok(h.beams[0].v[11]>=.5&&h.beams[0].v[11]<=1);assert.equal(h.beams[1].v[11],.25);
 for(let i=0;i<30;i++){h.time+=1/60;KIT_FX.bubbler.frame.call(h,r,o,1/60);for(const b of h.beams)b.follow(b);}
 assert.equal(h.beams.length,2,'activation does not allocate repeated pillars');
 o.pos.x=7;for(const b of h.beams){b.follow(b);assert.equal(b.v[0],7);assert.equal(b.v[4],7);assert.equal(b.v[5],o.pos.y+30);}
 KIT_FX.bubbler.end.call(h,r,o);for(const b of h.beams)assert.equal(b.follow(b),false,'expired records retire');
});
test('Already-ignited replay creates visible beams without replaying a deployment delay',()=>{
 const h=bubblerHost(),o={...object(),ignited:true},r=record();KIT_FX.bubbler.start.call(h,r,o);
 assert.deepEqual(h.beams.map(b=>b.initialAlpha),[1,.25]);for(const b of h.beams){b.follow(b);assert.ok(b.v[11]>0);}
});
