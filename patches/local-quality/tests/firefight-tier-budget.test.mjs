import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  selectNearInvisibleClipTail, shouldDeferCosmeticDrop, flatFootHeightAt,
  adaptFirefightTierBudget,
} from '../firefight-tier-budget.mjs';

const once = (source, before, after, label) => {
  const index = source.indexOf(before);
  assert.ok(index >= 0 && source.indexOf(before, index + before.length) < 0, `unique ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
};

test('never truncate a substantial diagonal/walk/run third clip', () => {
  const list = [.35, .34, .31].map((weight, id) => ({ weight, id }));
  assert.equal(selectNearInvisibleClipTail(list, 0.006), false);
  assert.deepEqual(list.map(item => item.weight), [.35, .34, .31]);
});

test('tiny tail only, preserving the original retained clip order and normalized total', () => {
  const list = [{id:1,weight:.003},{id:2,weight:.696},{id:3,weight:.299},{id:4,weight:.002}];
  assert.equal(selectNearInvisibleClipTail(list, .006), true);
  assert.deepEqual(list.map(item => item.id), [2,3]);
  assert.ok(Math.abs(list.reduce((sum,item)=>sum+item.weight,0)-1)<1e-12);
  assert.equal(selectNearInvisibleClipTail(list, .006), false);
});

test('contribution gate strictly bounds retained weight distortion', () => {
  let seed=20261018;const rand=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/0x100000000;};
  for(let i=0;i<50000;i++){
    const n=3+Math.floor(rand()*6),a=Array.from({length:n},(_,id)=>({id,weight:rand()}));
    const total=a.reduce((sum,x)=>sum+x.weight,0);for(const x of a)x.weight/=total;
    const original=a.map(x=>({...x}));const kept=selectNearInvisibleClipTail(a,.006);
    if(kept){
      const ids=new Set(a.map(x=>x.id));const omitted=original.filter(x=>!ids.has(x.id)).reduce((sum,x)=>sum+x.weight,0);
      assert.ok(omitted<=.0060000000001);
      assert.ok(Math.abs(a.reduce((sum,x)=>sum+x.weight,0)-1)<1e-11);
    }else assert.deepEqual(a,original);
  }
});

test('paint, rings, large, water-level, expiring or low-fps droplets never defer', () => {
  const accepts=(o={})=>shouldDeferCosmeticDrop(o.flags??0,o.size??.02,o.life??1,o.y0??1,o.y1??.9,o.water??0,o.dt??1/60,o.n??120,o.i??1,o.phase??0);
  assert.equal(accepts(),true);
  for(const flags of [1,2,3,4,5,6,7])assert.equal(accepts({flags}),false);
  assert.equal(accepts({size:.08}),false);
  assert.equal(accepts({life:2/60}),false);
  assert.equal(accepts({y1:.2}),false);
  assert.equal(accepts({y0:.2}),false);
  assert.equal(accepts({dt:1/30}),false);
  assert.equal(accepts({n:32}),false);
  assert.equal(accepts({i:0,phase:0}),false);
});

test('deferred cosmetic ray always sampled at least once every three 60Hz frames',()=>{
  for(let i=0;i<512;i++){
    const flags=0, dt=1/60;let checked=0;
    for(let phase=0;phase<3;phase++)if(!shouldDeferCosmeticDrop(flags,.025,1,1,1,0,dt,128,i,phase))checked++;
    assert.equal(checked,1);
  }
});

test('flat height only reused within observed 5mm expanded footprint',()=>{
  const f={_iwFlatY:3,_iwFlatMinX:-.10,_iwFlatMaxX:.11,_iwFlatMinZ:-.08,_iwFlatMaxZ:.12};
  assert.equal(flatFootHeightAt(f,0,0),3);
  assert.equal(flatFootHeightAt(f,.2,0),null);
  assert.equal(flatFootHeightAt(f,0,-.2),null);
  f._iwFlatY=null;assert.equal(flatFootHeightAt(f,0,0),null);
});

test('FX adapter preserves full world-space collision sweep from saved dK',()=>{
  const src=`    const col = this.collider, drag = 1 - 0.35 * dt;\n    for (let i = 0; i < this.dN; i++) {\n      if (!(flags & F_NOCOL) && col && this._checks < this.maxChecks) {\n        _from.set(K[i3], K[i3+1], K[i3+2]);`;
  const out=adaptFirefightTierBudget('src/fx/fx.js',src,once);
  assert.match(out, /shouldDeferCosmeticDrop\(flags/);
  assert.match(out, /_from\.set\(K\[i3\], K\[i3\+1\], K\[i3\+2\]\)/);
  assert.doesNotMatch(out,/K\[i3\]\s*=\s*nx;/);
});

test('source-motion adapter leaves gameplay cadence derivation untouched',()=>{
  const src=`  const cadenceHz=this.pivoting?Math.abs(this.turnRate)/Math.PI:timing.cadenceHz;\n  else if(moving){\n   let total=0;\n   for(const item of list){`;
  const out=adaptFirefightTierBudget('src/game/motion/source-controller.js',src,once);
  assert.match(out,/selectNearInvisibleClipTail\(list,_budget\)/);
  assert.match(out,/const cadenceHz=this.pivoting\?Math.abs\(this.turnRate\)\/Math.PI:timing.cadenceHz/);
});
