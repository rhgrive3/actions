#!/usr/bin/env node
// Reuse the existing native range driver. Only the diagnostic copy receives
// deterministic clocks and receipts; neither production checkout is rewritten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const [siteArg,outArg,sourceSha,sourceRootArg]=process.argv.slice(2);
if(!siteArg||!outArg||!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('Usage: <built-site> <evidence-dir> <source-sha>');
const root=fileURLToPath(new URL('../',import.meta.url)),site=path.resolve(siteArg),out=path.resolve(outArg);
const sourceRoot=sourceRootArg?path.resolve(sourceRootArg):root;
fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('capture anchor mismatch: '+a);return s.replace(a,b);};
let driver=fs.readFileSync(path.join(root,'scripts/render-inkwave-projectile-shapes.mjs'),'utf8');
const originalHash=hash(driver);
driver=driver.replace(/^#!.*\n/,'');
driver=once(driver,"from 'playwright'","from "+JSON.stringify(import.meta.resolve('playwright')));
driver=once(driver,"  await page.goto(base + '/?range&skipTitle');",`  await page.addInitScript(() => {
    window.resetExplosherRandom = () => { let n=0x515e7021;Math.random=()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}; };
    window.resetExplosherRandom();
  });
  await page.goto(base + '/?range&skipTitle');`);
driver=once(driver,'      g.debug.fire(true);',`      window.resetExplosherRandom();
      G.time=0;g.time=0;g.rig.time=0;
      g.debug.fire(true);`);
driver=once(driver,"        const file = `\${label}-t\${String(tick).padStart(2, '0')}-\${view}.png`;",`        const measurement = await page.evaluate(() => {
          const G=window.__G,g=window.__inkwave,r=g.R.renderer;
          const physical=()=>JSON.stringify(G.projectiles.list.map(p=>({wid:p.wid,age:p.age,delay:p.delay,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),damage:p.damage,life:p.life,travel:p.catalog?.travel})));
          const initial=physical(),buffers=G.projectiles._s3Shapes;
          const pos=buffers?.sparkPos.array,size=buffers?.sparkSize.array;
          for(let j=0;j<30;j++)G.projectiles._draw();
          const start=performance.now();for(let j=0;j<200;j++)G.projectiles._draw();
          const drawMs=(performance.now()-start)/200;
          if(initial!==physical()||pos!==buffers?.sparkPos.array||size!==buffers?.sparkSize.array)throw Error('draw changes physics or replaces sparkle buffers');
          r.info.reset();const t=performance.now();g.R.render();const submitMs=performance.now()-t;
          const lighting=[];g.R.scene.traverse(o=>{if(o.isLight)lighting.push({type:o.type,color:o.color?.getHex(),intensity:o.intensity,position:o.position.toArray()});});
          return {lighting,viewport:{width:r.domElement.width,height:r.domElement.height,pixelRatio:r.getPixelRatio()},physical:JSON.parse(initial),camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),fov:G.camera.fov},
            time:G.time,inkHex:G.local.color.getHex(),render:{...r.info.render},memory:{...r.info.memory},
            sparkles:G.projectiles.s3ShapeCounts?.sparkles??0,drawCpuMs:drawMs,renderSubmitMs:submitMs,
            gpuTimerMs:null,gpuTimerStatus:'not measured; submit CPU time is not GPU time',
            reusedSparkleBuffers:true};
        });
        const file = \`\${label}-t\${String(tick).padStart(2, '0')}-\${view}.png\`;`);
driver=once(driver,'manifest.push({ label, tick, view, file, ...info });','manifest.push({ label, tick, view, file, ...info, measurement });');
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
if(hash(JSON.stringify(build.artifacts))!==build.contentHash)throw Error('Build content hash mismatch');
const shapePath='patches/splatoon3/runtime/s3-projectile-shapes.mjs';
const emittedPaths=Object.keys(build.artifacts).filter(p=>p===shapePath||p.endsWith('/'+shapePath));
if(!emittedPaths.length)throw Error('Shape missing from manifest');
const emitted=emittedPaths.map(p=>{const sha256=hash(fs.readFileSync(path.join(site,p)));if(sha256!==build.artifacts[p])throw Error('Emitted shape hash mismatch');return {path:p,sha256};});
driver="import crypto from 'node:crypto';\n"+driver;
driver=once(driver,'let browser;',"const servedShapes=[],pendingShapes=new Set();\nlet browser;");
driver=once(driver,"  page.setDefaultTimeout(240000);",`  page.setDefaultTimeout(240000);
  page.on('response',res=>{
    if(!new URL(res.url()).pathname.endsWith('/patches/splatoon3/runtime/s3-projectile-shapes.mjs'))return;
    const pending=res.body().then(body=>servedShapes.push({url:res.url(),sha256:crypto.createHash('sha256').update(body).digest('hex')}));
    pendingShapes.add(pending);pending.finally(()=>pendingShapes.delete(pending));
  });`);
driver=once(driver,"  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));",`  await Promise.all([...pendingShapes]);
  const accepted=${JSON.stringify(emitted.map(e=>e.sha256))};
  if(!servedShapes.length||servedShapes.some(r=>!accepted.includes(r.sha256)))throw Error('Served shape identity mismatch');
  fs.writeFileSync(path.join(out,'served-shapes.json'),JSON.stringify(servedShapes,null,2));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));`);
const copy=path.join(out,'native-capture-driver.mjs');fs.writeFileSync(copy,driver);
const receipt={sourceSha,build,originalDriverSha256:originalHash,diagnosticDriverSha256:hash(driver),
  sourceShapeSha256:hash(fs.readFileSync(path.join(sourceRoot,'patches/splatoon3/runtime/s3-projectile-shapes.mjs'))),
  emittedShapes:emitted,seed:0x515e7021,
  boundaries:['Real emitted game and native renderer; fixed range input.','No historical source/character rewrite.','Only flight glitter changes; muzzle/impact, hit/paint/speed unchanged.','Render CPU and resource counts measured; GPU elapsed time and allocations not measured.']};
fs.writeFileSync(path.join(out,'source-receipt.json'),JSON.stringify(receipt,null,2));
const run=spawnSync(process.execPath,[copy,site,out,'s3-slosher-washtub'],{stdio:'inherit',env:{...process.env,TICKS:'0,3,8,14,22,30',VIEWS:'behind,tele-side,tele-oblique'}});
if(run.status!==0)process.exit(run.status||1);
const captures=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8'));
for(const c of captures)c.sha256=hash(fs.readFileSync(path.join(out,c.file)));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(captures,null,2));
if(captures.length!==18||!captures.some(c=>c.tick===3&&c.measurement.sparkles>0))throw Error('Incomplete native Explosher capture');
