// Read-only source-level probes. Not a browser/GPU benchmark.
// Run from repository root: node reports/inkwave-mobile-audit-probe-2026-09-29.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
const root = 'inkwave-public';
const read = p => fs.readFileSync(`${root}/${p}`, 'utf8');
const main = read('src/main.js');
const method = (src, start, next) => {
  const a = src.indexOf(start), b = src.indexOf(next, a + start.length);
  if (a < 0 || b < 0) throw new Error('Source method boundary changed');
  return src.slice(a, b).trim();
};
const dyn = vm.runInNewContext(`({_dynRes${method(main, '  _dynRes(dt) {', '\n  _frame(dt) {').slice('_dynRes'.length)}})._dynRes`, {document:{hidden:false}});
function simulate(windows, initial = 1) {
  const changes = [];
  const R = {dynScale:initial,setDynamicScale(s){this.dynScale=Math.max(.6,Math.min(1,s));changes.push(this.dynScale);}};
  const g = {R,mobile:{touch:true,ios:false},settings:{quality:'high'},match:{attract:false,state:'playing'}};
  for (const [hz,seconds] of windows) for(let i=0;i<Math.round(hz*seconds);i++) dyn.call(g,1/hz);
  return {windows,initial,final:R.dynScale,changes,state:{failures:g._dyn.failures,cooldown:g._dyn.cooldown,probe:g._dyn.probe}};
}
const paint = read('src/world/paint.js');
const flush = vm.runInNewContext(`({${method(paint,'  flush(dt = 1 / 60) {','\n  _drawQuads() {')}}).flush`);
let drySubmissions=0;
const p={clock:0,frame:0,growing:[],quads:0,_dryAcc:0,_wetUntil:0,_dryU:{uDry:{value:0}},dryMesh:{visible:false},_drawQuads(){if(this.dryMesh.visible)drySubmissions++;}};
for(let i=0;i<600;i++)flush.call(p,1/60);
const renderer = read('src/core/renderer.js');
const screenfx = read('src/fx/screenfx.js');
const decor = read('src/world/decor.js');
const minimap = read('src/game/minimap.js');
const match = read('src/game/match.js');
const menus = read('src/ui/menus.js');
const config = read('src/config.js');
const qStart = config.indexOf('export const QUALITY =');
if (qStart < 0) throw new Error('QUALITY block missing');
const qCode = config.slice(qStart)
  .replace('export const QUALITY =', 'const QUALITY =')
  .replace('export function effectiveQuality', 'function effectiveQuality');
const qualityApi = vm.runInNewContext(qCode + '\n({QUALITY,effectiveQuality});');
const mobileQ = (quality, ios=false) => qualityApi.effectiveQuality({quality}, {touch:true,ios});

function simulateFrameCap(hz, seconds, frameRate = 'auto', touch = true) {
  let acc = 0, elapsed = 0, frames = 0, simSeconds = 0;
  const capHz = frameRate === 'display' ? 0 : frameRate === 60 ? 60 : (touch ? 60 : 0);
  const rawDt = 1 / hz;
  for (let i = 0; i < Math.round(hz * seconds); i++) {
    let dt = rawDt;
    if (capHz > 0) {
      const step = 1 / capHz;
      acc += rawDt; elapsed += rawDt;
      if (acc + 1e-6 < step) continue;
      acc = Math.min(step, Math.max(0, acc - step));
      dt = elapsed; elapsed = 0;
    } else {
      acc = 0; elapsed = 0;
    }
    frames++;
    simSeconds += dt;
  }
  return { inputHz: hz, seconds, frames, outputHz: frames / seconds, simSeconds, carrySeconds: elapsed };
}
// Execute the existing build script's graph walker, without minification or writing build files.
const build = fs.readFileSync('scripts/build-inkwave.mjs','utf8');
const graphCode = build.slice(build.indexOf('const html0 ='), build.indexOf('const preload ='));
const graph = vm.runInNewContext(graphCode+'\norder;', {fs,path,SRC:path.resolve(root)});
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const js = walk(`${root}/src`).filter(f=>f.endsWith('.js'));
const selected = ['src/main.js','src/config.js','src/core/renderer.js','src/world/paint.js','src/world/decor.js','src/fx/screenfx.js','src/game/minimap.js','src/game/match.js','src/ui/menus.js'];
const output={
  kind:'source-level deterministic probes; no real device FPS, GPU timing, power or network measurement',
  sourceSha256:Object.fromEntries(selected.map(f=>[f,crypto.createHash('sha256').update(read(f)).digest('hex')])),
  dynamicResolution:{slowThen60:simulate([[30,20],[60,120]]),sustained30:simulate([[30,60]]),normal50:simulate([[50,60]]),repeatedRecovery:simulate([[30,20],[60,60],[30,20],[60,80]])},
  effectiveQuality:{
    androidHigh:mobileQ('high',false),
    iosHigh:mobileQ('high',true),
    rendererUsesShared:renderer.includes('effectiveQuality(settings, this.mobile)'),
    screenfxUsesShared:screenfx.includes('effectiveQuality(G.settings, G.mobile)'),
  },
  idlePaintAt60HzFor10Seconds:{dryDrawSubmissions:drySubmissions},
  frameCap:{
    touchAuto60:simulateFrameCap(60,10),
    touchAuto75:simulateFrameCap(75,10),
    touchAuto90:simulateFrameCap(90,10),
    touchAuto120:simulateFrameCap(120,10),
    touchAuto144:simulateFrameCap(144,10),
    touchDisplay120:simulateFrameCap(120,10,'display',true),
    desktopAuto120:simulateFrameCap(120,10,'auto',false),
    sourceUsesElapsedAccumulator:main.includes('this._frameCapElapsed') && main.includes('this._frameCapAcc'),
    menuExposesControl:menus.includes("key: 'frameRate'"),
  },
  p2p3:{
    bossStaticImportInMain:/from ['"]\.\/boss\/bossMode\.js['"]/.test(main),
    bossStaticImportInMatch:/from ['"]\.\.\/boss\/bossMode\.js['"]/.test(match),
    bossLazyLoad:main.includes("loadLazyModule('./boss/bossMode.js')"),
    lobbyWorldGuard:main.includes('const worldHidden = setUp') && main.includes('if (!worldHidden)'),
    minimapDirty30Hz:minimap.includes('this._composeAcc >= 1 / 30'),
    minimapHiddenTick:minimap.includes('tickHidden(dt)') && main.includes('this.minimap.tickHidden?.(dt)'),
    minimapDisabledSkipsIdleBuild:minimap.includes("if (G.settings?.minimap !== false) idle("),
    hudReusesArrays:main.includes('this._hudPlayers ||') && main.includes('this._hudMarkers ||'),
    touchSkipsBloomAllocation:renderer.includes('if (!this.mobile.touch || q.bloom)'),
  },
  lifecycle:{
    composerDisposesPasses:renderer.includes('pass.dispose?.()') && renderer.includes('comp.dispose?.()') && renderer.includes('pass === this.extraPass'),
    decorHasDispose:decor.includes('dispose()') && decor.includes('this.emblem?.dispose?.()') && decor.includes('this.flagTex?.dispose?.()'),
    stageTracksLightmap:main.includes('this.stageLightmap = lightmap') && main.includes('this.stageLightmap.dispose()'),
  },
  buildPreloadGraph:{modules:graph.length,bossModules:graph.filter(f=>f.startsWith('src/boss/')),bytesBeforeBuild:graph.reduce((n,f)=>n+fs.statSync(`${root}/${f}`).size,0)},
  allSourceJs:{files:js.length,bytesBeforeBuild:js.reduce((n,f)=>n+fs.statSync(f).size,0)}
};
console.log(JSON.stringify(output,null,2));
