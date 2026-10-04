import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';
import { adaptHudAuthority, SPECIAL_SEGMENTS, specialGaugeSVG } from '../hud-authority-adapter.mjs';
import { fixture, readSource } from '../../reliability/tests/hud-fixture.mjs';
const root = new URL('../../../', import.meta.url);
const compose = (rel, input = readSource(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, input))));
const hudCode = compose('src/ui/hud.js'), gameCode = compose('src/main.js');
const fixed = () => fixture({ hudSource: hudCode, gameSource: gameCode });
function specialRig(code = hudCode) {
  const a = code.indexOf('  _updSpecial(f, dt) {'), b = code.indexOf('  // ---------------------------------------------------------------- turf ticker', a);
  const Hud = vm.runInNewContext(`class Hud { ${code.slice(a,b)} }; Hud`, { clamp: v => Math.min(1,Math.max(0,v)) });
  const make = () => ({ attrs:{}, classes:new Set(), classList:{ toggle(n,on){on?this.owner.classes.add(n):this.owner.classes.delete(n);} }, setAttribute(n,v){this.attrs[n]=v;}, animate(){} });
  const node = () => { const n=make();n.classList.owner=n;return n; };
  const h = new Hud(); Object.assign(h,{_L:{},sp:node(),spSegments:Array.from({length:23},node),spLiquid:{style:{}},spPct:{textContent:''},flashes:[],_restart(_el,n){this.flashes.push(n);}});
  return {h, update(s,ready=false,active=false){h._updSpecial({special:s,specialReady:ready,specialActive:active},1/60);return h.spSegments.filter(x=>x.classes.has('is-filled')).length;}};
}

test('#425: native markup has exactly 23 paths and no continuous/numeric presentation', () => {
  assert.equal(SPECIAL_SEGMENTS,23);
  assert.equal((specialGaugeSVG().match(/class="iw-sp__segment"/g)||[]).length,23);
  assert.equal((hudCode.match(/class=\\?"iw-sp__segment\\?"/g)||[]).length,23);
  assert.doesNotMatch(hudCode,/spLiquid|spPct|iw-sp__pct|iw-sp__liquid|Math.floor\(s \* 100\)/);
  assert.match(hudCode,/'aria-valuemax': '23'/);
  assert.match(compose('styles/hud.css'),/\.iw-sp__segment.is-filled/);
  assert.ok(JSON.stringify(qualityIdentity()).includes('hud-authority-adapter.mjs'));
});

test('#425: every boundary lights monotonically and ignores the old .002 deadband', () => {
  const r=specialRig(); assert.equal(r.update(0),0);
  for(let i=1;i<23;i++){
    assert.equal(r.update(i/23-1e-7),i-1);
    assert.equal(r.update(i/23+1e-7),i);
    assert.equal(r.h.sp.attrs['aria-valuenow'],String(i));
  }
  assert.equal(r.update(.99999),22);assert.equal(r.update(1),23);
  assert.equal(r.h.sp.classes.has('is-ready'),false);
});

test('#425: actual ready/consume/refill transitions flare once and never retain stale segments', () => {
  const r=specialRig(); r.update(.98);
  assert.equal(r.update(1,true),23);assert.equal(r.update(1,true),23);
  assert.equal(r.h.flashes.filter(x=>x==='is-flare').length,1);
  assert.equal(r.update(1,false,true),23);assert(!r.h.sp.classes.has('is-ready'));
  assert.equal(r.update(0,false,true),0);assert(r.h.sp.classes.has('is-active'));assert(!r.h.sp.classes.has('is-ready'));
  assert.equal(r.update(.5,false,false),11);assert(!r.h.sp.classes.has('is-active'));
  assert.equal(r.update(1,true),23);assert.equal(r.h.flashes.filter(x=>x==='is-flare').length,2);
  assert.equal(r.update(NaN),0);assert.equal(r.update(-1),0);assert.equal(r.update(100),23);
});

test('#425: normalized costs and 30/60/120Hz samples preserve the same display', () => {
  for(const cost of [160,180,200,220]){
    const r=specialRig();for(let i=0;i<23;i++)assert.equal(r.update((cost*(i+.1)/23)/cost),i);
  }
  const traces=[];
  for(const hz of [30,60,120]){const r=specialRig(),rows=[];for(let tick=0;tick<=120;tick++){for(let f=0;f<hz/30;f++)r.update(tick/120,tick===120);rows.push(r.h._L.spSegments);}traces.push(rows);}
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('#425 negative control: old native update exposes exact percentage and has no segment state', () => {
  const r=specialRig(readSource('src/ui/hud.js'));r.update(.47);assert.equal(r.h.spPct.textContent,'47%');assert.equal(r.h._L.spSegments,undefined);
});

test('#381 negative control: raw native Judd calls a nonzero 0.04-point lead a tie', async () => {
  const r=await fixture(); const p=r.hud.judge({percents:[40,39.96],winner:0});await r.advance(5300);assert.equal((await p).winner,-1);
});

test('#381: complete native judge honors both authoritative teams across threshold/rounded/exact ties', async () => {
  for(const winner of [0,1])for(const diff of [0,.000001,.04,.049,.05,.051]){
    const r=await fixed(),percents=winner===0?[40,40-diff]:[40-diff,40];
    const p=r.hud.judge({percents,winner}); await r.advance(3900);
    assert(r.judges()[0].classList.contains(winner===0?'is-win-a':'is-win-b'));
    assert(!r.judges()[0].textContent.includes("IT'S A TIE!"));
    await r.advance(1500);assert.equal((await p).winner,winner);await r.advance(1000);assert.equal(r.judges().length,0);
  }
});

test('#381: supplied host winner overrides percentages; missing authority never invents a winner', async () => {
  for(const winner of [0,1,undefined]){
    const r=await fixed(),p=r.hud.judge({percents:[60,40],winner});await r.advance(5300);assert.equal((await p).winner,winner??-1);
  }
});

test('#381: actual Game result flows into Judd and existing results/fanfare consistently', async () => {
  for(const winner of [0,1]){
    const r=await fixed();r.match.result={coverage:[.4,.3996],winner};
    const p=r.game._judge();await r.advance(3900);assert(r.judges()[0].classList.contains(winner===0?'is-win-a':'is-win-b'));
    await r.advance(2500);await p;assert.equal(r.game.profile.wins,winner===0?1:0);assert.equal(r.game.profile.matches,1);
    assert(r.calls.some(x=>x.includes(winner===0?'victory_fanfare':'defeat_jingle')));
  }
});

test('#381: reliability cancellation/replacement cannot show an old authoritative winner', async () => {
  const r=await fixed();const first=r.hud.judge({winner:0});await r.advance(200);const second=r.hud.judge({winner:1});
  assert.equal((await first).cancelled,true);assert.equal(r.judges().length,1);await r.advance(5300);assert.equal((await second).winner,1);
  const pending=r.game._judge();await r.advance(200);await r.game.quitToMenu();await r.advance(6000);await pending;assert.equal(r.count('results'),0);assert.equal(r.judges().length,0);
});

test('HUD adapters compile in the production order and fail closed on stale/duplicate anchors', () => {
  new vm.SourceTextModule(hudCode);new vm.SourceTextModule(gameCode);
  for(const rel of ['src/ui/hud.js','src/main.js','src/core/mobile.js'])for(const input of ['',readSource(rel)+readSource(rel),compose(rel)])assert.throws(()=>adaptHudAuthority(rel,input),/HUD patch conflict/);
  assert.equal(adaptHudAuthority('src/game/actor.js','unchanged'),'unchanged');
});

test('#425: emitted full HUD and touch modules retain quantization and authoritative readiness', {skip:!process.env.INKWAVE_HUD_BUILT_SITE}, async()=>{
  const site=process.env.INKWAVE_HUD_BUILT_SITE;
  const path=await import('node:path');const modules=new Map(),context=vm.createContext({console,performance});
  function load(file){
    if(modules.has(file))return modules.get(file);
    const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});modules.set(file,m);return m;
  }
  const root=load(path.join(site,'src/ui/hud.js'));
  await root.link((spec,from)=>load(spec==='three'?path.join(site,'vendor/three/build/three.module.js'):path.resolve(path.dirname(from.identifier),spec)));
  await root.evaluate();
  const r=specialRig();r.h._updSpecial=root.namespace.HUD.prototype._updSpecial;
  for(const [s,count]of [[0,0],[.47,10],[.99999,22],[1,23]])assert.equal(r.update(s),count);
  assert(!r.h.sp.classes.has('is-ready'));r.update(1,true);assert(r.h.sp.classes.has('is-ready'));
  assert.equal(r.update(0,false,true),0);assert.equal(r.h.flashes.filter(x=>x==='is-flare').length,1);
  const mobile=load(path.join(site,'src/core/mobile.js'));
  await mobile.link((spec,from)=>load(spec==='three'?path.join(site,'vendor/three/build/three.module.js'):path.resolve(path.dirname(from.identifier),spec)));await mobile.evaluate();
  const m={setHud:mobile.namespace.MobileInput.prototype.setHud,els:{special:r.h.sp,fire:r.h.sp,sub:r.h.sp},_buzz(){}};
  r.h.sp.querySelectorAll=()=>r.h.spSegments;r.h.sp.style={setProperty(){}};
  for(const [s,count]of [[0,0],[.47,10],[.99999,22],[1,23],[0,0]]){m.setHud({special:s,ready:s===1});assert.equal(r.h.spSegments.filter(n=>n.classes.has('is-filled')).length,count);}
});

test('#425: touch SP replacement uses 23 steps while preserving readiness/buzz and other controls',()=>{
  const code=compose('src/core/mobile.js');
  assert.equal((code.match(/class="iwm-sp-segment"/g)||[]).length,23);
  assert.doesNotMatch(code,/E.special.style.setProperty\('--g'/);
  const start=code.indexOf('  setHud('),end=code.indexOf('\n  endFrame()',start);
  const Mobile=vm.runInNewContext(`class Mobile {${code.slice(start,end)}};Mobile`,{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))});
  const r=specialRig(),m=new Mobile();m.els={special:r.h.sp,fire:r.h.sp,sub:r.h.sp};m.els.special.querySelectorAll=()=>r.h.spSegments;m.els.fire.style={setProperty(){}};
  let buzzes=0;m._buzz=()=>buzzes++;
  for(let i=0;i<23;i++)for(const delta of [1e-7,2e-7]){m.setHud({special:i/23+delta});assert.equal(r.h.spSegments.filter(n=>n.classes.has('is-filled')).length,i);}
  m.setHud({special:1});assert(!r.h.sp.classes.has('is-ready'));assert.equal(m._hud.sp,23);
  m.setHud({special:1,ready:true});m.setHud({special:1,ready:true});assert.equal(buzzes,1);
  m.setHud({special:0,activeSp:true});assert.equal(m._hud.sp,0);assert(r.h.sp.classes.has('is-active'));assert(!r.h.sp.classes.has('is-ready'));
  m.setHud({special:.5});assert.equal(m._hud.sp,11);assert.equal(buzzes,1);
  new vm.SourceTextModule(code);
});
