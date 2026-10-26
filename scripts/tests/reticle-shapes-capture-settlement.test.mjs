import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {settleShapeCapture,waitForShapeCaptureSettlement} from '../lib/reticle-next/shapes-capture-settlement.mjs';
import {readShapeSample} from '../lib/reticle-next/shapes-recipe.mjs';
const sourceRoot=process.env.SHAPES_SOURCE_ROOT||new URL('../../',import.meta.url).pathname;
const {BLASTER_DIAGONAL_PROPOSAL}=await import(pathToFileURL(path.join(sourceRoot,'patches/local-quality/blaster-diagonal-proposal.mjs')));
const nativeCss=fs.readFileSync(path.join(sourceRoot,'inkwave-public/styles/hud.css'),'utf8');
const runner=fs.readFileSync(new URL('../check-inkwave-reticle-visual-review.mjs',import.meta.url),'utf8');
let browser;
before(async()=>{
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();});
async function setup({candidate=true}={}){
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  // Controlled DOM uses the actual production CSS and actual candidate SVG,
  // never a rewritten transition. Source owner is an explicit frozen double.
  await page.setContent(`<style>${nativeCss}</style><div id="ret" class="iw-ret iw-ret--blaster" style="left:640px;top:360px;--sp:0"><svg class="iw-ret__svg" viewBox="-40 -40 80 80"><circle class="iw-ret__ring" r="9"/><circle class="iw-ret__ring" r="13"/></svg>${candidate?BLASTER_DIAGONAL_PROPOSAL.svg:''}</div>`);
  await page.evaluate(()=>{
    const vec=values=>({toArray:()=>[...values]});
    const ret=document.querySelector('#ret');
    window.__G={time:9.35,input:{mouse:{left:true},enabled:true,locked:true,lastDevice:'kbm',keys:new Set()},match:{time:8,stateT:4},local:{weaponId:'blaster',grounded:true,intent:{fire:true,jump:false,squid:false,move:vec([0,0,0])},pos:vec([1,.04,2]),weaponRunner:{cooldown:0,charge:0,chargeT:0}},
      camera:{position:vec([1,2,3]),quaternion:vec([0,0,0,1]),fov:55,aspect:16/9}};
    window.__inkwave={frozen:true,s3Clock:{ticks:262,accumulator:0},rig:{yaw:0,pitch:-.12},hud:{ret,_L:{weapon:'blaster',kind:'blaster'}},
      _frame(){throw Error('Settlement must never call Game._frame');},R:{render(){}}};
    window.__reticleCadence=[{nativeTicksAfter:262}];
    window.__chargerRecipeObservation={events:[{actorWeaponId:'blaster',grounded:true}]};
  });
  await page.evaluate('window.__shapeCaptureSettlement='+waitForShapeCaptureSettlement.toString());
  await page.evaluate('window.__readShapeSample='+readShapeSample.toString());
  await settleShapeCapture(page);
  return page;
}
async function changeSpread(page,value=35){
  return page.evaluate(value=>{
    document.querySelector('#ret').style.setProperty('--sp',value);
    // Same task, before a slow host round trip can exhaust the 100ms native
    // transition: computed bounds flush native CSS at transition start.
    return window.__readShapeSample();
  },value);
}

test('unsettled actual source transition reproduces screenshot recipe bounds drift',async()=>{
  const page=await setup();try{
    const before=await changeSpread(page);
    await page.screenshot();await page.screenshot({clip:{x:520,y:260,width:240,height:200}});
    const after=await page.evaluate(readShapeSample);
    assert.throws(()=>assert.deepEqual(after,before),/bounds/);
    assert.equal(after.nativeTicks,before.nativeTicks);assert.deepEqual(after.position,before.position);assert.deepEqual(after.shots,before.shots);
  }finally{await page.close();}
});
for(const candidate of [false,true])test(`native RAF settlement preserves full screenshot recipe equality (${candidate?'candidate':'baseline'} source)`,async()=>{
  const page=await setup({candidate});try{
    await changeSpread(page);
    const result=await settleShapeCapture(page);
    assert(result.frames>=4);assert.equal(result.stableFrames,3);assert(result.elapsedMs>0);
    assert.equal(result.ownerInvariant,true);assert.deepEqual(result.ownerAfter,result.ownerBefore);
    assert.equal(result.ownerAfter.clock[3],262);assert.equal(result.ownerAfter.shotCount,1);
    assert.equal(result.activeGeometry.length,0);
    const before=await page.evaluate(readShapeSample);
    await page.screenshot();await page.screenshot({clip:{x:520,y:260,width:240,height:200}});
    assert.deepEqual(await page.evaluate(readShapeSample),before);
    const css=await page.locator(candidate?'.iw-reticle-blaster-diagonal-proposal':'.iw-ret__svg').evaluate(n=>({transition:getComputedStyle(n).transition,transform:getComputedStyle(n).transform,width:n.getBoundingClientRect().width}));
    assert.match(css.transition,/transform 0\.1s linear/);assert(Math.abs(css.width-113.6)<.001);
    process.stdout.write(JSON.stringify({test:'settled-source',candidate,frames:result.frames,elapsedMs:result.elapsedMs,ownerInvariant:result.ownerInvariant,css})+'\n');
  }finally{await page.close();}
});

test('no-op native RAF is observed rather than replaced by an arbitrary sleep',async()=>{
  const page=await setup();try{
    const result=await settleShapeCapture(page);assert.equal(result.frames,4);assert.equal(result.stableFrames,3);
  }finally{await page.close();}
});
test('perpetual reticle geometry animation fails closed with bounded diagnostic; unrelated animation does not block',async()=>{
  const page=await setup();try{
    await page.evaluate(()=>{
      const outside=document.createElement('div');outside.style.animation='outside-spin 1s linear infinite';document.body.append(outside);
      const css=document.createElement('style');css.textContent='@keyframes outside-spin { to {transform:rotate(1turn)} }';document.head.append(css);
    });
    await settleShapeCapture(page);
    await page.evaluate(()=>{
      const css=document.createElement('style');css.textContent='@keyframes ret-moving { to {transform:scale(2)} } .iw-reticle-blaster-diagonal-proposal { animation:ret-moving 1s linear infinite }';document.head.append(css);
    });
    await assert.rejects(settleShapeCapture(page,{deadlineMs:120,stableFrames:3}),error=>{
      assert.match(error.message,/settlement deadline exceeded/);assert.match(error.message,/activeGeometry/);assert.match(error.message,/CSSAnimation/);assert.match(error.message,/ownerBefore/);return true;
    });
  }finally{await page.close();}
});
test('owner tick, pose and shot changes during native RAF fail before capture',async()=>{
  for(const field of ['tick','pose','shot']){
    const page=await setup();try{
      await assert.rejects(page.evaluate(field=>{
       requestAnimationFrame(()=>{
        if(field==='tick')window.__inkwave.s3Clock.ticks++;
        if(field==='pose')window.__G.local.pos.toArray=()=>[2,.04,2];
        if(field==='shot')window.__chargerRecipeObservation.events.push({actorWeaponId:'blaster'});
       });
       return window.__shapeCaptureSettlement();
      },field),/Native owner changed/);
    }finally{await page.close();}
  }
});
test('integration keeps complete before/after screenshot invariant and original screenshot deadline',()=>{
  assert(runner.indexOf('await settleShapeCapture(page)')<runner.indexOf('const row=await readSnapshot(page)'));
  assert.match(runner,/assert\.deepEqual\(afterCapture\.next,row\.next,'screenshot must not change native recipe state'\)/);
  assert.match(runner,/assertSurfaceInvariant\(row\.surfaceBefore,row\.surfaceAfter\)/);
  assert.equal((runner.match(/scale:'device',timeout:20000/g)||[]).length,2);
  const source=waitForShapeCaptureSettlement.toString();
  assert.doesNotMatch(source,/\._frame\(|debug\.step|\.finish\(|\.pause\(|\.currentTime\s*=|setProperty|animations:\s*['"]disabled/);
});
