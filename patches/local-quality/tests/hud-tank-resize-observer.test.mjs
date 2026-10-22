import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

// The production-composed tank methods, run against a recording 2D context. ResizeObserver is a parameter so each
// rig chooses a fake observer (callbacks fired by the test, as the browser does after layout) or none at all.
const source=adaptBuildSource('src/ui/hud.js',fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8'));
const begin=source.indexOf('  _drawTank(dt, sub, low, nosub) {'),end=source.indexOf('  // ---------------------------------------------------------------- special gauge',begin);
class Path {
  constructor(){this.ops=[];}
  moveTo(...v){this.ops.push(['moveTo',...v]);} lineTo(...v){this.ops.push(['lineTo',...v]);} closePath(){this.ops.push(['closePath']);}
  arcTo(...v){this.ops.push(['arcTo',...v]);} roundRect(...v){this.ops.push(['roundRect',...v.flat()]);}
}
function rig({observer=true,width=18,height=74,dpr=1}={}) {
  const observers=[];
  class FakeObserver { constructor(cb){this.cb=cb;this.targets=[];observers.push(this);} observe(t){this.targets.push(t);} disconnect(){this.targets.length=0;} }
  const Hud=new Function('Path2D','devicePixelRatio','shade','ResizeObserver','return class {'+source.slice(begin,end)+'}')(Path,dpr,s=>s,observer?FakeObserver:undefined);
  const draws=[],size={w:width,h:height};let reads=0;
  const canvas={width:0,height:0,get clientWidth(){reads++;return size.w;},get clientHeight(){reads++;return size.h;}};
  const ctx=new Proxy({},{get:(_o,name)=>(...args)=>draws.push([name,...args.map(a=>a instanceof Path?a.ops:a)]),set:(_o,name,value)=>{draws.push(['set',name,value]);return true;}});
  const h=new Hud();Object.assign(h,{_L:{},_tank:{t:0,level:.5,bubbles:[]},tankCanvas:canvas,tankCtx:ctx});
  return {h,canvas,draws,size,observers,get reads(){return reads;},
    draw(sub=.7,low=false,nosub=true){const n=draws.length;h._drawTank(1/60,sub,low,nosub);return draws.slice(n);},
    layout(){for(const o of observers)if(o.targets.length)o.cb([]);}};
}

test('tank reads its client size once and then only after a reported resize',()=>{
  const r=rig();
  r.draw();assert.equal(r.reads,2,'first paint reads width and height');
  for(let i=0;i<120;i++)r.draw();
  assert.equal(r.reads,2,'steady repaints no longer force a layout read');
  assert.equal(r.observers.length,1);assert.deepEqual(r.observers[0].targets,[r.canvas]);
});

test('every repaint issues exactly the commands of the per-paint size read',()=>{
  for(const [w,h] of [[18,74],[7,20],[22,67],[48,148]])for(const dpr of [.75,1,1.5,2,3]){
    const cached=rig({width:w,height:h,dpr}),legacy=rig({observer:false,width:w,height:h,dpr});
    for(const args of [[.7,false,true],[0,true,false],[.3,false,false]]){
      cached.h._tank.level=legacy.h._tank.level=args[0]+.1;cached.h._tank.t=legacy.h._tank.t+=.07;
      assert.deepEqual(cached.draw(...args),legacy.draw(...args),`${w}x${h}@${dpr} ${args}`);
    }
    assert.equal(legacy.reads,6,'no observer: the original read on every paint is kept');
  }
});

test('a resize is repainted at the new size from the observer callback, before the frame is painted',()=>{
  const r=rig(),fresh=rig({observer:false,width:22,height:67});
  r.draw(.4,false,false);assert.deepEqual([r.canvas.width,r.canvas.height],[18,74]);
  // Squid form resizes the tank by CSS. The next HUD paint in the same frame still uses the cached size ...
  r.size.w=22;r.size.h=67;r.h._tank.level=fresh.h._tank.level=.8;
  r.draw(.4,false,false);assert.deepEqual([r.canvas.width,r.canvas.height],[18,74]);
  // ... and the observer, which runs after layout and before paint, redraws it with the last arguments at the new size.
  const n=r.draws.length;r.layout();
  assert.deepEqual([r.canvas.width,r.canvas.height],[22,67]);
  assert.deepEqual(r.draws.slice(n),fresh.draw(.4,false,false),'same pixels as a paint that read the new size');
  const reads=r.reads;r.draw(.4,false,false);assert.equal(r.reads,reads,'the new size stays cached');
});

test('hidden canvases keep the original fallback and are not repainted at zero size',()=>{
  const r=rig();r.draw();
  r.size.w=0;r.size.h=0;const n=r.draws.length;r.layout();
  assert.equal(r.draws.length,n,'no paint while the tank has no box');
  r.draw();assert.deepEqual([r.canvas.width,r.canvas.height],[18,74],'0x0 falls back to the 18x74 canister, as before');
  r.size.w=22;r.size.h=67;r.layout();assert.deepEqual([r.canvas.width,r.canvas.height],[22,67],'shown again at its real size');
});

test('a HUD derived from the live one keeps the live observer connected',()=>{
  const r=rig();r.draw();
  const probeCanvas={width:0,height:0,clientWidth:30,clientHeight:90};
  const p=Object.create(r.h);Object.assign(p,{tankCanvas:probeCanvas,_tankCache:undefined});
  r.h._drawTank.call(p,1/60,0,false,false);
  assert.deepEqual([probeCanvas.width,probeCanvas.height],[30,90]);
  assert.deepEqual(r.observers[0].targets,[r.canvas],'live canvas still observed');
  assert.equal(r.h._tankBox.cv,r.canvas);
  r.size.w=22;r.size.h=67;r.layout();assert.deepEqual([r.canvas.width,r.canvas.height],[22,67]);
});
