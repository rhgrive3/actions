#!/usr/bin/env node
// Local review harness only. No workflow/PR mutation. Run against a built PR1312
// site only after the owner/coordinator agrees the extra browser run is useful.
// Same Mesh, camera, simulation tick and native renderer/Environment GL context.
// Four cells distinguish early/late discard from nonindexed/full vs culled draw.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = process.env.NATIVE_REVIEW_FIXTURES || here;
const baseline = fs.readFileSync(path.join(fixtures, 'native-render-baseline.mjs'));
const candidate = fs.readFileSync(path.join(fixtures, 'patches/native-stages/runtime/native-render.mjs'));
const chunkSource = fs.readFileSync(path.join(fixtures, 'patches/native-stages/runtime/native-ink-chunks.mjs'));
const worldSource = fs.readFileSync(path.join(fixtures, 'patches/native-stages/runtime/native-world.mjs'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const gitSha = bytes => crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
assert.equal(gitSha(candidate), '4be609e2557b57fde6949ea0a15622df2ec46e7f');
assert.equal(gitSha(chunkSource), '8c8cab89a2e777469b2e171d7a6617727fe2d9c9');
assert.equal(gitSha(baseline), '43b5c0dafd12caf738b84c35ae3b26c3976fd7bc');
assert.equal(gitSha(worldSource), 'd44bcd14e985eb9172e4802709a248eaac85fb49');
assert.match(baseline.toString(), /native-ink-overlay-v1/);
assert.match(candidate.toString(), /native-ink-overlay-v2/);

if (process.argv.includes('--prepare-check')) {
  console.log(JSON.stringify({status:'prepared-only', candidateHead:'996a30c93d4a01d5f2924c7316f132e56adb229a', baselineCommit:'ac1159b76b42a10ff02fe58add74a8285cc08d32', baselineGitSha:gitSha(baseline), candidateGitSha:gitSha(candidate), syntax:'checked separately by node --check', browserRun:false}));
  process.exit(0);
}
assert(process.argv[2] && process.argv[3], 'Usage: node prepare-fullpost-comparison.mjs BUILT_PR1312_SITE OUTPUT_DIR');
const site = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const build = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
assert.equal(build.files['native-stages/runtime/native-render.mjs'], sha(candidate), 'Built input is not the pinned reviewed shader');
assert.equal(build.files['native-stages/runtime/native-ink-chunks.mjs'], sha(chunkSource), 'Built input is not the pinned reviewed culling code');
assert.equal(build.files['native-stages/runtime/native-world.mjs'], sha(worldSource), 'Built input is not the pinned reviewed lifecycle code');
fs.mkdirSync(out, {recursive:true});
const result = {status:'running', reviewedHead:'996a30c93d4a01d5f2924c7316f132e56adb229a', buildIdentity:{contentHash:build.contentHash,inputHash:build.inputHash,revision:build.build.revision}, baselineMaterial:{commit:'ac1159b76b42a10ff02fe58add74a8285cc08d32',gitSha:gitSha(baseline),sha256:sha(baseline)}, conditions:{viewport:[600,600],quality:'high',shadows:true,bloom:true,completion:'Same JavaScript task: full native post.render, default-framebuffer RGBA readPixels, error check and PNG copy before yielding',timing:'Diagnostic wall time only; no mobile FPS or isolated GPU claim',simulation:'Seeded setup once per stage, two fixed paint teams; stage-only: eight Actor roots hidden equally, all production mesh/material/pass hooks preserved',phase:'Same starting composer read/write targets, delta zero, camera and simulation/paint clocks fixed',priorFullScene:'ea44a8a0309df4b1ec42ee0c2df6f39736e5a428: 3-5 actor shoulder/chest self-variation pixels; also had an invalid all-mesh hook freeze; not an adoption result',factorCells:['old-full','new-full','old-culled','new-culled']}, stages:[], errors:[]};
const save = () => fs.writeFileSync(path.join(out, 'fullpost-comparison.json'), JSON.stringify(result,null,2));
save();
// Serve the exact old source alongside the candidate at the same module depth.
// Its relative createLevelMaterial import resolves to the SAME built module and
// GL context. No source rewrite of the discard and no second renderer/PMREM.
const virtualSuffix = '/patches/native-stages/runtime/native-render-review-baseline.mjs';
const mime = {'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server = http.createServer((req,res) => {
  try {
    const u = new URL(req.url,'http://local');
    if (u.pathname.endsWith(virtualSuffix)) {res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});res.end(baseline);return;}
    const file = path.resolve(site, '.' + (u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)));
    if (!file.startsWith(site+path.sep) || !fs.statSync(file).isFile()) throw Error('Not found');
    res.writeHead(200,{'content-type':mime[path.extname(file)] || 'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  } catch {res.writeHead(404);res.end();}
});
const require = createRequire(process.env.NATIVE_REVIEW_PACKAGE || path.resolve('package.json'));
const {chromium} = require('playwright');
let browser;
try {
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  // Default to one stage to avoid silently launching a long all-five run.
  // The explicit all-stage option is NATIVE_STAGE_IDS=scorch,hagglefish,inkblot,mako,brinewater.
  for (const id of (process.env.NATIVE_STAGE_IDS || 'scorch').split(',')) {
    const context = await browser.newContext({viewport:{width:600,height:600},deviceScaleFactor:1,serviceWorkers:'block'});
    const page = await context.newPage();
    const stage = {id,status:'running',frames:[],comparisons:[],errors:[]};result.stages.push(stage);save();
    page.on('pageerror',e => {stage.errors.push(e.message);save();});
    page.on('console',m => {if(m.type()==='error'){stage.errors.push(m.text());save();}});
    try {
      await page.addInitScript(() => {
        localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:true,bloom:true,minimap:false,musicVolume:0}));
        let s=0x12345678;Math.random=()=>{s|=0;s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/?map=${id}&shadercheck`,{waitUntil:'domcontentloaded'});
      await page.evaluate(async () => {globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;});
      await page.waitForFunction(() => (NG.game?.menus && NG.mode!=='boot') || document.getElementById('boot-error')?.textContent,null,{timeout:240000});
      assert.equal(await page.locator('#boot-error').textContent(),'');
      await page.evaluate(async id => {
        const g=NG.game;g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();
        await g.startMatch({mapId:id,mode:'turf',difficulty:'normal'});
        for(let i=0;i<330;i++)g._frame(1/60);
        g.input.mouse.left=true;for(let i=0;i<3;i++)g._frame(1/60);
        g.input.mouse.left=false;for(let i=0;i<80;i++)g._frame(1/60);
      },id);
      stage.setup = await page.evaluate(async () => {
        const G=NG,g=G.game,r=G.renderer,gl=r.getContext(),ink=g.levelMesh;
        const THREE=await import(new URL('vendor/three/build/three.module.js',document.baseURI));
        const {nativeInkMaterial}=await import(new URL('patches/native-stages/runtime/native-render-review-baseline.mjs',document.baseURI));
        if(!ink?.isMesh || !ink._drawIndex || ink.chunks.length<2)throw Error('Pinned culling mesh is absent');
        if(!G.post?.gtao?.enabled || !G.post.composer?.passes.includes(G.post.gtao))throw Error('Actual GTAO pass is not enabled');
        if(!r.shadowMap.enabled || !G.env?.sun?.castShadow)throw Error('Native shadows are not enabled');
        if(G.actors.length!==8)throw Error('Expected eight actual actors');
        const original=G.camera.clone(),geometry=ink.geometry,newMaterial=ink.material;
        const oldMaterial=nativeInkMaterial(G.paint,g.murals,g.texlib);
        // Preserve current palette/clock/wakes/see-through inputs. The old factory
        // closure keeps its uniform table; copy the values into that table.
        const syncOld=()=>{for(const [key,u] of Object.entries(newMaterial.userData.uniforms)){if(!oldMaterial.userData.uniforms[key])throw Error('Uniform mismatch '+key);oldMaterial.userData.uniforms[key].value=u.value;}};
        syncOld();
        const chooseFace=predicate=>G.paint.paintFaces.filter(f=>f.atlas && f.triangles?.length && predicate(f)).sort((a,b)=>(b.su*b.sv)-(a.su*a.sv))[0];
        const selected={wall:chooseFace(f=>Math.abs(f.n.y)<.2),slope:chooseFace(f=>f.n.y>.2&&f.n.y<.98)};
        const faceViews={};const preparedPaint=[];
        for(const [name,f] of Object.entries(selected)){
          if(!f)continue;
          const tri=f.triangles[0],p=new THREE.Vector3(),v=new THREE.Vector3();
          for(let k=0;k<3;k++)p.add(v.fromArray(G.level.data.triangles,tri*9+k*3));p.multiplyScalar(1/3);
          const face=G.level.faces.indexOf(f);if(face<0)throw Error('Selected face has no authoritative ID');
          for(let team=0;team<2;team++)G.paint.splat(p.clone().addScaledVector(f.u,team?.35:-.35).addScaledVector(f.n,.015),1.4,team,{face,seed:.21+team*.17,instant:true});
          const camera=original.clone();camera.position.copy(p).addScaledVector(f.n,8).addScaledVector(f.v,1);camera.lookAt(p);camera.updateMatrixWorld();faceViews[name]=camera;
          preparedPaint.push({name,face,triangle:tri,point:p.toArray(),normal:f.n.toArray()});
        }
        G.paint.flush(1/60);
        const grid=G.paint.grid.slice(),positions=geometry.attributes.position.array.slice(),level=G.level,physics=G.physics,nav=G.nav;
        const comp=G.post.composer;
        const originalState={material:ink.material,index:geometry.index,drawRange:{...geometry.drawRange},drawIndex:ink._drawIndex.array.slice(),visible:ink._visible.slice(),callback:ink.onBeforeRender,camera:original,shadowNeeds:r.shadowMap.needsUpdate,sunNeeds:G.env.sun.shadow.needsUpdate,target:r.getRenderTarget(),readBuffer:comp.readBuffer,writeBuffer:comp.writeBuffer,getDelta:comp.timer.getDelta,time:G.time,paintClock:G.paint.clock,characters:G.actors.map(a=>[a.character.root,a.character.root.visible])};
        // Do not freeze object hooks: Character partGate, reflection hooks and
        // shadowUngate are production render contracts, not animation ticks.
        for(const [root] of originalState.characters)root.visible=false;
        comp.timer.getDelta=()=>0;
        const shadowHooks=new Map();
        const d={G,g,r,gl,THREE,ink,geometry,newMaterial,oldMaterial,syncOld,grid,positions,level,physics,nav,originalState,faceViews,pixels:new Map(),active:null,calls:[],shadowDraws:0};
        d.classify=pixels=>{
          let alphaPixels=0,nonzeroRGBPixels=0,differentFromFirst=0;
          for(let i=0;i<pixels.length;i+=4){alphaPixels+=pixels[i+3]>0;nonzeroRGBPixels+=(pixels[i]|pixels[i+1]|pixels[i+2])!==0;differentFromFirst+=pixels[i]!==pixels[0]||pixels[i+1]!==pixels[1]||pixels[i+2]!==pixels[2]||pixels[i+3]!==pixels[3];}
          return {alphaPixels,nonzeroRGBPixels,differentFromFirst,validScene:alphaPixels>0&&nonzeroRGBPixels>0&&differentFromFirst>0,reason:!alphaPixels?'transparent':!nonzeroRGBPixels?'black':!differentFromFirst?'uniform':'nonuniform-scene'};
        };
        d.readOutput=()=>{
          if(r.getRenderTarget()!==null||gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)!==null)throw Error('Final output is not the default framebuffer');
          const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,pixels=new Uint8Array(width*height*4),t=performance.now();
          gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          const readMs=performance.now()-t,glError=gl.getError();
          // Copy both bytes and image synchronously before control can yield.
          const png=r.domElement.toDataURL('image/png');
          return {pixels,png,meta:{width,height,readMs,glError,contextLost:gl.isContextLost(),...d.classify(pixels)}};
        };
        d.negativeControls=()=>{
          const color=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),scissor=r.getScissorTest(),target=r.getRenderTarget(),rows=[];
          try{r.setRenderTarget(null);r.setScissorTest(false);
            for(const [name,hex,a,reason] of [['black',0,1,'black'],['transparent',0,0,'transparent'],['uniform',0x3a71b9,1,'uniform']]){
              r.setClearColor(hex,a);r.clear(true,true,true);const captured=d.readOutput();
              rows.push({name,expectedReason:reason,...captured.meta,png:captured.png});
            }
          }finally{r.setClearColor(color,alpha);r.setScissorTest(scissor);r.setRenderTarget(target);}
          return rows;
        };
        G.scene.traverse(o=>{if(o.isMesh&&o.castShadow){const hook=o.onBeforeShadow;shadowHooks.set(o,hook);o.onBeforeShadow=function(...args){d.shadowDraws++;return hook.apply(this,args);};}});
        d.setVariant=variant=>{
          const [age,mode]=variant.split('-');syncOld();ink.material=age==='old'?oldMaterial:newMaterial;
          if(mode==='full'){
            geometry.setIndex(null);geometry.setDrawRange(0,geometry.attributes.position.count);
            ink.onBeforeRender=(_r,scene,camera,_geo,material)=>{d.calls.push({pass:scene.overrideMaterial?'override':'beauty',camera:camera.uuid,indices:geometry.attributes.position.count,material:material.type});};
          }else{
            geometry.setIndex(ink._drawIndex);ink._visible.fill(255);
            ink.onBeforeRender=function(...args){originalState.callback.apply(this,args);d.calls.push({pass:args[1].overrideMaterial?'override':'beauty',camera:args[2].uuid,indices:geometry.drawRange.count,material:args[4].type});};
          }
          d.active=variant;
        };
        d.setView=name=>{
          d.pixels.clear();G.camera.copy(original);
          if(faceViews[name])G.camera.copy(faceViews[name]);
          if(name==='edge-left'||name==='edge-right')G.camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),name==='edge-left'?-.43:.43));
          if(name==='away'){const b=level.bounds;G.camera.position.set(b.maxX+2000,2000,b.maxZ+2000);G.camera.lookAt(b.maxX+4000,2000,b.maxZ+4000);}
          G.camera.updateMatrixWorld();d.view=name;
        };
        d.draw=(variant,keep,key)=>{
          d.setVariant(variant);d.calls=[];d.shadowDraws=0;r.setRenderTarget(null);r.info.reset();
          if(G.time!==originalState.time||G.paint.clock!==originalState.paintClock)throw Error('Frozen simulation/paint clock advanced');
          comp.readBuffer=originalState.readBuffer;comp.writeBuffer=originalState.writeBuffer;
          // Exercise the existing native sun shadow pass, identically for all cells.
          r.shadowMap.needsUpdate=true;G.env.sun.shadow.needsUpdate=true;
          const beforeError=gl.getError();if(beforeError!==gl.NO_ERROR)throw Error('Pending GL error '+beforeError);
          const t0=performance.now();G.post.render();const submitMs=performance.now()-t0;
          // This read MUST happen before any await/yield with preserveDrawingBuffer=false.
          const {pixels,png,meta:capture}=d.readOutput();
          const meta={variant,view:d.view,...capture,submitMs,completedWallMs:submitMs+capture.readMs,inkCalls:d.calls,shadowDraws:d.shadowDraws,render:{...r.info.render},phase:{time:G.time,paintClock:G.paint.clock,startRead:originalState.readBuffer.texture.uuid,startWrite:originalState.writeBuffer.texture.uuid,delta:0},shadowMapAllocated:!!G.env.sun.shadow.map,passes:G.post.composer.passes.filter(p=>p.enabled).map(p=>p.constructor.name)};
          if(keep)d.pixels.set(key,pixels);
          // The deliberate away view may legitimately be a uniform sky. All
          // geometry views must reject opaque black, transparent and flat reads.
          return {meta,png,error:capture.glError!==gl.NO_ERROR||capture.contextLost||!capture.alphaPixels||(d.view!=='away'&&!capture.validScene)?'Invalid completed readback':null};
        };
        d.restore=()=>{
          for(const[o,hook]of shadowHooks)o.onBeforeShadow=hook;shadowHooks.clear();ink.material=originalState.material;ink.onBeforeRender=originalState.callback;
          comp.readBuffer=originalState.readBuffer;comp.writeBuffer=originalState.writeBuffer;comp.timer.getDelta=originalState.getDelta;
          for(const[root,visible]of originalState.characters)root.visible=visible;
          geometry.setIndex(originalState.index);ink._drawIndex.array.set(originalState.drawIndex);ink._drawIndex.clearUpdateRanges();ink._drawIndex.addUpdateRange(0,ink._drawIndex.count);ink._drawIndex.needsUpdate=true;
          ink._visible.set(originalState.visible);geometry.setDrawRange(originalState.drawRange.start,originalState.drawRange.count);
          G.camera.copy(original);G.camera.updateMatrixWorld();r.setRenderTarget(originalState.target);
          r.shadowMap.needsUpdate=originalState.shadowNeeds;G.env.sun.shadow.needsUpdate=originalState.sunNeeds;oldMaterial.dispose();
          if(G.level!==level||G.physics!==physics||G.nav!==nav||ink.geometry!==geometry||grid.some((v,i)=>v!==G.paint.grid[i])||positions.some((v,i)=>v!==geometry.attributes.position.array[i]))throw Error('Rendering changed gameplay authority or source positions');
          return {authoritiesUnchanged:true,cpuPaintUnchanged:true,positionsUnchanged:true,geometryIndexRestored:geometry.index===originalState.index,callbackRestored:ink.onBeforeRender===originalState.callback,composerPhaseRestored:comp.readBuffer===originalState.readBuffer&&comp.writeBuffer===originalState.writeBuffer&&comp.timer.getDelta===originalState.getDelta,characterVisibilityRestored:originalState.characters.every(([root,visible])=>root.visible===visible),drawRangeRestored:geometry.drawRange.start===originalState.drawRange.start&&geometry.drawRange.count===originalState.drawRange.count};
        };
        globalThis.nativeFullpostReview=d;
        const ext=gl.getExtension('WEBGL_debug_renderer_info');
        return {sourceSha256:level.manifest.sourceSha256,actors:G.actors.length,hiddenActorRoots:originalState.characters.length,sceneMode:'stage-only',productionHooksPreserved:true,chunks:ink.chunks.length,preparedPaint,views:['gameplay',...Object.keys(faceViews),'edge-left','edge-right','away','return'],missingSurfaceCoverage:['wall','slope'].filter(k=>!faceViews[k]),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),sameEnvironmentGL:true,ao:true,shadows:true,materialCacheKeys:[oldMaterial.customProgramCacheKey(),newMaterial.customProgramCacheKey()]};
      });
      save();
      try {
        stage.negativeControls=await page.evaluate(()=>nativeFullpostReview.negativeControls());
        for(const row of stage.negativeControls){const file=`${id}-negative-${row.name}.png`;fs.writeFileSync(path.join(out,file),Buffer.from(row.png.split(',')[1],'base64'));delete row.png;row.image=file;}
        save();
        for(const row of stage.negativeControls){assert.equal(row.glError,0);assert.equal(row.contextLost,false);assert.equal(row.validScene,false);assert.equal(row.reason,row.expectedReason);}
        for(const view of stage.setup.views){
          await page.evaluate(view=>nativeFullpostReview.setView(view),view);
          // Warm both shader programs/full post once; save each completed frame
          // so a shader/readback failure retains its own exact image and state.
          for(const variant of ['old-full','new-full','old-culled','new-culled']){
            const frame=await page.evaluate(variant=>nativeFullpostReview.draw(variant,false,''),variant);
            const file=`${id}-${view}-${variant}-warm.png`;fs.writeFileSync(path.join(out,file),Buffer.from(frame.png.split(',')[1],'base64'));
            stage.frames.push({...frame.meta,phase:'warm',image:file,error:frame.error});save();assert.equal(frame.error,null);
          }
          // A/A and B/B self controls before cross-cell interpretation.
          for(const variant of ['old-full','new-full','new-culled','old-culled'])for(let repeat=0;repeat<2;repeat++){
            const frame=await page.evaluate(({variant,repeat})=>nativeFullpostReview.draw(variant,true,variant+'-'+repeat),{variant,repeat});
            const file=`${id}-${view}-${variant}-${repeat}.png`;fs.writeFileSync(path.join(out,file),Buffer.from(frame.png.split(',')[1],'base64'));
            stage.frames.push({...frame.meta,phase:'compare',repeat,image:file,error:frame.error});save();assert.equal(frame.error,null);
          }
          const comparisons=await page.evaluate(()=>{
            const d=nativeFullpostReview;
            const diff=(a,b)=>{const A=d.pixels.get(a),B=d.pixels.get(b);if(A.length!==B.length)throw Error('Pixel size mismatch');let pixels=0,maxError=0,sum=0;const examples=[];for(let i=0;i<A.length;i+=4){let changed=false;for(let k=0;k<4;k++){const e=Math.abs(A[i+k]-B[i+k]);maxError=Math.max(maxError,e);sum+=e;changed ||= e!==0;}if(changed){pixels++;if(examples.length<12)examples.push({index:i/4,a:Array.from(A.subarray(i,i+4)),b:Array.from(B.subarray(i,i+4))});}}return {a,b,changedPixels:pixels,maxChannelError:maxError,absoluteChannelSum:sum,examples};};
            return {view:d.view,self:['old-full','new-full','old-culled','new-culled'].map(v=>diff(v+'-0',v+'-1')),shader:diff('old-full-1','new-full-1'),culling:diff('new-full-1','new-culled-1'),oldShaderCulling:diff('old-full-1','old-culled-1'),wholeChange:diff('old-full-1','new-culled-1')};
          });
          stage.comparisons.push(comparisons);save();
          for(const self of comparisons.self)assert.equal(self.changedPixels,0,`${id}/${view}: self variation makes cross-cell result inconclusive`);
          // A shader difference is measured, retained for review, not auto-approved.
          assert.equal(comparisons.culling.changedPixels,0,`${id}/${view}: culling changed full-post pixels`);
          assert.equal(comparisons.oldShaderCulling.changedPixels,0,`${id}/${view}: culling changed old-shader pixels`);
        }
      } finally {stage.restoration=await page.evaluate(()=>nativeFullpostReview.restore());save();}
      assert.equal(stage.errors.length,0,JSON.stringify(stage.errors));
      assert(stage.frames.some(f=>f.inkCalls.some(c=>c.pass==='override')),'GTAO never drew the ink mesh');
      assert(stage.frames.some(f=>f.shadowMapAllocated),'No actual native shadow map was allocated');
      assert(stage.frames.some(f=>f.shadowDraws>0),'No source/actor shadow draw ran');
      const away=stage.frames.filter(f=>f.view==='away'&&f.phase==='compare');
      assert(away.every(f=>f.inkCalls.length===0),'Away view still submitted ink');
      assert(stage.frames.some(f=>f.view==='return'&&f.inkCalls.some(c=>c.indices>0)),'Ink did not return after leaving the view');
      stage.status=stage.setup.missingSurfaceCoverage.length?'coverage-incomplete':'comparison-complete';save();
    } catch(error){stage.status='failed-or-inconclusive';stage.error=error.stack;save();throw error;}
    finally{await context.close();}
  }
  result.status=result.stages.every(s=>s.status==='comparison-complete')?'comparison-complete':'coverage-incomplete';
  result.shaderDifferencesRequireReview=result.stages.flatMap(s=>s.comparisons).filter(c=>c.shader.changedPixels>0).length;
} catch(error){result.status='failed-or-inconclusive';result.error=error.stack;throw error;}
finally{save();await browser?.close();if(server.listening)await new Promise(r=>server.close(r));}
