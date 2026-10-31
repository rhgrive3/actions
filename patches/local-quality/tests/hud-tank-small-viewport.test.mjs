import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canvasCssSize} from '../layout-sample.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const source=adaptBuildSource('src/ui/hud.js',fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8'));
function rig(width,height,dpr=1,code=source) {
  const begin=code.indexOf('  _drawTank(dt, sub, low, nosub) {'),end=code.indexOf('  // ---------------------------------------------------------------- special gauge',begin);
  assert(begin>=0&&end>begin,'actual production-composed tank method');
  const paths=[],draws=[];
  class Path {
    constructor(){this.ops=[];paths.push(this);}
    moveTo(...v){this.ops.push(['moveTo',...v]);}
    lineTo(...v){this.ops.push(['lineTo',...v]);}
    closePath(){this.ops.push(['closePath']);}
    arcTo(...v){assert(v.every(Number.isFinite));if(v[4]<0)throw new RangeError('negative arc radius '+v[4]);this.ops.push(['arcTo',...v]);}
    roundRect(x,y,w,h,r){assert([x,y,w,h,...r].every(Number.isFinite));if(r.some(v=>v<0))throw new RangeError('negative roundRect radius '+Math.min(...r));this.ops.push(['roundRect',x,y,w,h,...r]);}
  }
  const Hud=new Function('Path2D','devicePixelRatio','shade','canvasCssSize','return class {'+code.slice(begin,end)+'}')(Path,dpr,s=>s,canvasCssSize);
  const h=new Hud();Object.assign(h,{_L:{},_tank:{t:0,level:.5,bubbles:[]},tankCanvas:{clientWidth:width,clientHeight:height,width:0,height:0},tankCtx:new Proxy({},{get:(_o,name)=>(...args)=>draws.push([name,...args]),set:(_o,name,value)=>{draws.push(['set',name,value]);return true;}})});
  return {h,paths,draws,draw(){h._drawTank(1/60,.7,false,true);return h._tankCache;}};
}

test('small responsive tank keeps finite rounded corners and a positive liquid well',()=>{
  // CSS --u=min(1vw,1.7778vh), tank=1.7u by 5.2u. This includes
  // the observed 320x200 crash and existing small-phone viewport dimensions.
  for(const [width,height] of [[320,200],[320,568],[360,800],[390,844],[480,300],[844,390],[960,640]]) {
    const u=Math.min(width*.01,height*.017778),cw=Math.round(u*1.7),ch=Math.round(u*5.2);
    for(const dpr of [.75,1,1.25,1.5,2,3]) {
      const r=rig(cw,ch,dpr),cache=r.draw();
      assert(cache.ww>0&&cache.wh>0,`${width}x${height}@${dpr}: visible liquid area`);
      assert(r.draws.some(op=>op[0]==='fill'&&op[1]===cache.outline));
      assert(r.draws.some(op=>op[0]==='clip'&&op[1]===cache.well));
      const count=r.paths.length;r.draw();assert.equal(r.paths.length,count,'same-size path cache reused');
    }
  }
});

// Restore only the pre-fix geometry statements as a negative/control fixture.
// All drawing commands, colours, animation and production composition stay real.
const legacy = source
  .replace('Math.min(dpr, W / 3, H / 3)', '1 * dpr')
  .replace('Math.min(bw * 0.2, (H - p * 2 - nub - neck) / 2)', 'bw * 0.2')
  .replace('Math.min(bw * 0.32, (yEnd - yb) / 2)', 'bw * 0.32')
  .replace('bw - frame * 2 > 0 && yEnd - yb - frame * 1.2 > 0 && rf - frame * 0.6 >= 0 ? frame : Math.min(frame, rf)', 'frame');

test('negative control reproduces the actual minus 0.48 radius at DPR 1',()=>{
  assert.notEqual(legacy,source);
  assert.throws(()=>rig(5,17,1,legacy).draw(),/negative roundRect radius -0.48/);
});

test('already-valid normal paths and draw commands are exactly unchanged',()=>{
  let comparisons=0;
  for(const [w,h] of [[7,20],[8,25],[14,43],[16,50],[18,74],[22,67],[24,75],[32,100],[48,148]]) {
    for(const dpr of [.75,1,1.25,1.5,2,3]) {
      const before=rig(w,h,dpr,legacy),after=rig(w,h,dpr);
      let cache;try{cache=before.draw();}catch(e){assert(e instanceof RangeError);continue;}
      if(cache.ww<=0||cache.wh<=0)continue;
      after.draw();
      assert.deepEqual(after.paths.map(p=>p.ops),before.paths.map(p=>p.ops),`${w}x${h}@${dpr} paths`);
      assert.deepEqual(JSON.parse(JSON.stringify(after.draws)),JSON.parse(JSON.stringify(before.draws)),`${w}x${h}@${dpr} rendering`);comparisons++;
    }
  }
  assert(comparisons>=45,'normal-size controls must not silently disappear');
});

test('resize invalidates both paths, then restores the same normal-size geometry',()=>{
  const r=rig(16,50),initial=r.draw(),first=initial.outline.ops.map(op=>op.slice()),oldOutline=initial.outline,oldWell=initial.well;
  r.h.tankCanvas.clientWidth=5;r.h.tankCanvas.clientHeight=17;
  const small=r.draw();assert.notEqual(small.outline,oldOutline);assert.notEqual(small.well,oldWell);assert(small.ww>0&&small.wh>0);
  const smallOutline=small.outline;
  r.h.tankCanvas.clientWidth=16;r.h.tankCanvas.clientHeight=50;
  const restored=r.draw();assert.notEqual(restored.outline,smallOutline);assert.deepEqual(restored.outline.ops,first);
  assert.equal(r.paths.length,6);
});

test('degenerate positive canvas sizes and hidden-DOM fallback stay drawable',()=>{
  for(const dpr of [.75,1,1.25,1.5,2,3])for(const width of [0,1,2,3,5,22])for(const height of [0,1,2,3,17,74]) {
    const r=rig(width,height,dpr),cache=r.draw();
    assert(cache.ww>0&&cache.wh>0,`${width}x${height}@${dpr}: positive liquid well`);
    r.h._tank.level=0;r.h._drawTank(1/30,.7,true,true);
    r.h._tank.level=1;r.h._drawTank(1/120,.7,false,false);
    assert.equal(r.paths.length,2);
  }
});

// Scalar-only instrumentation contract; no browser, DOM layout or rendering.
{
 const browserSource=()=>fs.readFileSync(new URL('../../../scripts/check-inkwave-small-tank.mjs',import.meta.url),'utf8');
 async function scalarRun(targets=[100,0,50],cadenceFrames=6){
  const code=browserSource(),a=code.indexOf('    const scalarObservation='),b=code.indexOf('    for(const ink of [100,0,50])',a),c=code.indexOf('     for(let i=0;i<cadenceFrames;i++){',b),d=code.indexOf('     const pixels=',c);
  assert(a>=0&&b>a&&c>b&&d>c);const declarations=code.slice(a,b),loop=code.slice(c,d);
  assert(!/getComputedStyle|getBoundingClientRect|clientWidth|clientHeight|toDataURL|getImageData|_drawTank/.test(declarations+loop),'no per-frame layout/draw/capture');
  const actor={nid:7,netLife:2,ink:100},h={_t:0,_tank:{level:.2811595098606351,prevInk:1}},G={time:0,local:actor,hud:h,match:{state:'playing',paused:false,local:actor}};
  let frames=0,yields=0,mono=0;const game={frozen:true,_frameN:0,_frame(dt){assert.equal(dt,1/30);frames++;this._frameN++;G.time+=dt;h._t+=dt;h._tank.prevInk=actor.ink/100;}};
  const run=new Function('G','g','h','a','performance','requestAnimationFrame','targets','cadenceFrames','return(async()=>{'+declarations+'for(const ink of targets){'+loop+'}return scalarObservation;})()');
  const result=await run(G,game,h,actor,{now:()=>++mono},resolve=>{yields++;actor.ink+=1;resolve();},targets,cadenceFrames);
  return {result,frames,yields,actor,h,G,game};
 }
 test('bounded tank scalar evidence preserves all18 native steps and observes input/clock changes',async()=>{
  const x=await scalarRun();assert.equal(x.frames,18);assert.equal(x.yields,18);assert.equal(x.result.frames.length,18);assert.equal(x.result.dropped,0);
  for(const row of x.result.frames){assert.equal(row.requestedDt,1/30);assert.equal(row.before.actorInk,row.requestedInk);assert.equal(row.afterFrame.hudInputInk,row.requestedInk/100);assert.equal(row.afterYield.actorInk,row.requestedInk+1);assert.equal(row.afterFrame.gameFrame,row.before.gameFrame+1);assert(row.afterFrame.hudTime>row.before.hudTime);assert(row.afterYield.monoMs>row.afterFrame.monoMs);assert.equal(row.before.sampledActorIsCurrent,true);assert.equal(row.before.sampledActorIsMatchLocal,true);assert.equal(row.before.hudStillCurrent,true);}
  assert.equal(x.h._tank.level,.2811595098606351,'observer never settles or overrides displayed level');assert.throws(()=>assert(x.h._tank.level<.1),'known failed scalar remains failed');
  const dpr2=await scalarRun([100,0,50],12);assert.equal(dpr2.frames,36);assert.equal(dpr2.result.frames.length,36);assert.equal(dpr2.result.limit,36);
  const overflow=await scalarRun([100,0,50,75]);assert.equal(overflow.result.frames.length,18);assert.equal(overflow.result.dropped,6,'fixed cap remains bounded under a controlled extra-state mutation');
 });
 test('tank diagnostics retain native frame count, strict level/pixel gates and existing screenshot calls',()=>{
  const s=browserSource();assert(s.includes('for(const ink of [100,0,50])'));assert(s.includes('const cadenceFrames=window.devicePixelRatio>1?12:6;'));assert(s.includes('for(let i=0;i<cadenceFrames;i++){'));assert(s.includes('row.framesPerInkState=row.cadenceFrames;row.frameDt=1/30;'));
  assert(s.includes('assert(row.snapshots[0].level>.9&&row.snapshots[1].level<.1&&row.snapshots[2].level>.4&&row.snapshots[2].level<.6);'));
  assert(s.includes("requireInk(row.inkProbe.fullVsEmpty);requireInk(row.inkProbe.halfVsEmpty);"));assert(s.includes("assert.throws(()=>requireInk(row.inkProbe.suppressedFullVsEmpty),/native ink fill/"));
  assert.equal((s.match(/page\.screenshot\(/g)||[]).length,2,'no additional capture');assert(s.includes('inkProbe,cadenceFrames,scalarObservation};'));
 });
}
