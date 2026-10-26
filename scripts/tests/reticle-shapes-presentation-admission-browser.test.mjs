// Controlled browser CSS/WebGL contract only; NOT the production game gate.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {loadNativeBlasterFixture} from './fixtures/blaster-presentation-native-fixture.mjs';
import {admitShapeCapturePresentation,inspectShapePresentation} from '../lib/reticle-next/shapes-presentation-admission.mjs';
import {readShapeSample} from '../lib/reticle-next/shapes-recipe.mjs';
import {inspectCaptureSurface,assertSurfaceInvariant,browserLaunchOptions} from '../check-inkwave-reticle-visual-review.mjs';
const sourceRoot=process.env.SHAPES_SOURCE_ROOT||new URL('../../',import.meta.url).pathname;
const fixture=await loadNativeBlasterFixture(sourceRoot);
const nativeCss=fixture.css;
let browser;
before(async()=>{const{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launch(browserLaunchOptions(process.env.CHROMIUM_PATH));});
after(async()=>{await browser?.close();});
async function setup(candidate){
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.setContent(`<style>${nativeCss}</style><canvas id="surface" width="1280" height="720" style="position:fixed;inset:0;width:100vw;height:100vh"></canvas><div id="ret" class="iw-ret iw-ret--blaster" style="left:640px;top:360px;--sp:40.3">${fixture.spec(candidate,40.3).markup}</div>`);
 await page.evaluate(()=>{
  const vec=v=>({toArray:()=>[...v]}),canvas=document.querySelector('#surface'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  if(!gl)throw Error('Controlled presentation test requires actual browser WebGL');
  window.__G={time:1,match:{time:2,stateT:3},input:{mouse:{left:false},enabled:true,locked:false,lastDevice:'kbm',keys:new Set()},
   local:{weaponId:'blaster',grounded:true,pos:vec([6,0,0]),intent:{fire:false,jump:false,squid:false,move:vec([0,0,0])},weaponRunner:{charge:0,chargeT:0,cooldown:0}},
   camera:{position:vec([1,2,3]),quaternion:vec([0,0,0,1]),fov:55,aspect:16/9},renderer:{domElement:canvas,getPixelRatio:()=>1,getContext:()=>gl}};
  window.__inkwave={frozen:true,s3Clock:{ticks:376,accumulator:0},rig:{yaw:0,pitch:-.12},hud:{ret:document.querySelector('#ret'),_L:{weapon:'blaster',kind:'blaster'}},
   _frame(){throw Error('Forbidden native game frame');},R:{render(){gl.clearColor(.03,.03,.03,1);gl.clear(gl.COLOR_BUFFER_BIT);}}};
  window.__chargerRecipeObservation={events:[{actorWeaponId:'blaster',grounded:true}]};window.__reticleCadence=[{}];
 });
 await page.evaluate('window.__readShapeSample='+readShapeSample.toString());
 // Initial ordinary presentation establishes the previous source pose, without
 // changing its CSS transition or animation settings.
 await page.evaluate(inspectCaptureSurface,{redraw:true});await page.screenshot({scale:'device',animations:'allow',timeout:20000});
 return page;
}
for(const candidate of [false,true])test(`ordinary presentation admission preserves actual source transform transition and full final PNG state (${candidate?'candidate':'baseline'})`,async()=>{
 const page=await setup(candidate);try{
  const spec=fixture.spec(candidate,34.9);
  const initial=await page.evaluate(()=>{document.querySelector('#ret').style.setProperty('--sp','34.9');return window.__readShapeSample();});
  const admission=await admitShapeCapturePresentation(page,{inspectSurface:inspectCaptureSurface,assertSurfaceInvariant});
  assert.equal(admission.presentation.status,'admitted');assert.equal(admission.presentation.ownerInvariant,true);
  assert(admission.presentation.warmups.length<=3);assert.equal(admission.settlement.activeGeometry.length,0);
  if(admission.presentation.initial.activeGeometry.length)assert(admission.presentation.warmups.length>=1);
  for(const w of admission.presentation.warmups){assert.equal(w.acceptedScreenshot,false);assert.match(w.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(w.before.owner,w.after.owner);}
  const snap=await page.evaluate(readShapeSample),surfaceBefore=await page.evaluate(inspectCaptureSurface,{redraw:true});
  await page.screenshot({scale:'device',animations:'allow',timeout:20000});
  await page.screenshot({clip:{x:520,y:260,width:240,height:200},scale:'device',animations:'allow',timeout:20000});
  assert.deepEqual(await page.evaluate(readShapeSample),snap);assertSurfaceInvariant(surfaceBefore,await page.evaluate(inspectCaptureSurface,{redraw:false}));
  const css=await page.locator(spec.animationOwner).evaluate(n=>({transition:getComputedStyle(n).transition,width:n.getBoundingClientRect().width}));
  assert.match(css.transition,/transform 0\.1s linear/);assert(Math.abs(css.width-spec.expectedDiameter)<.002);
  const svg=await page.locator(spec.nativeSvg).evaluate(n=>({width:n.getBoundingClientRect().width,transform:getComputedStyle(n).transform}));
  assert.equal(svg.width,spec.expectedSvgWidth);assert.equal(svg.transform,spec.expectedSvgTransform);
  assert.equal(Number(await page.locator(spec.nativeInner).getAttribute('r')),spec.expectedInnerRadius);
  assert.equal(await page.locator(spec.nativeOuter).evaluate(n=>getComputedStyle(n).display==='none'),candidate);
  assert.equal(snap.nativeTicks,initial.nativeTicks);assert.deepEqual(snap.position,initial.position);assert.deepEqual(snap.shots,initial.shots);
  process.stdout.write(JSON.stringify({test:'controlled-native-presentation',candidate,warmups:admission.presentation.warmups.map(w=>({index:w.index,sha256:w.sha256,before:w.before.activeGeometry,after:w.after.activeGeometry})),settlement:admission.settlement,css})+'\n');
 }finally{await page.close();}
});
test('ordinary presentation never hides a perpetual geometric animation',async()=>{
 const page=await setup(true);try{
  await page.addStyleTag({content:'@keyframes endless-shape {to {transform:scale(2)}} .iw-reticle-blaster-diagonal-proposal {animation:endless-shape 1s linear infinite}'});
  const before=await page.evaluate(inspectShapePresentation);assert(before.activeGeometry.length>0);
  await assert.rejects(admitShapeCapturePresentation(page,{inspectSurface:inspectCaptureSurface,assertSurfaceInvariant}),/finite native CSS timing/);
 }finally{await page.close();}
});
