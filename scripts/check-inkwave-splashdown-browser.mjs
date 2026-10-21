#!/usr/bin/env node
// Actual catalogue activation, Actor/Physics/Projectiles and source-loaded
// Character in the emitted build. This is an INKWAVE regression check, not a
// comparison with a retail Switch recording.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const site = fs.realpathSync(opt('--site', '_site'));
const inkjet = process.argv.includes('--inkjet') ? { hz:Number(opt('--hz','60')), actorCount:Number(opt('--actors','1')), layout:opt('--layout','near') } : null;
if(inkjet){assert.ok([30,60,120].includes(inkjet.hz));assert.ok([1,2,4].includes(inkjet.actorCount));assert.ok(['near','mixed'].includes(inkjet.layout));}
const overlayPath=opt('--baseline-overlay',null);
const overlayReceipt=overlayPath?JSON.parse(fs.readFileSync(path.join(path.dirname(overlayPath),'receipt.json'),'utf8')):null;
const overlayCode=overlayPath?fs.readFileSync(overlayPath):null;
if(overlayPath){assert.ok(inkjet,'baseline overlay is diagnostic Inkjet only');assert.equal(createHash('sha256').update(overlayCode).digest('hex'),overlayReceipt.baselineEmittedSha256);}
const budgetPath=opt('--budget-overlay',null);
const budgetReceipt=budgetPath?JSON.parse(fs.readFileSync(path.join(path.dirname(budgetPath),'receipt.json'),'utf8')):null;
const budgetCode=budgetPath?fs.readFileSync(budgetPath):null;
if(budgetPath){assert.ok(inkjet&&!overlayPath,'optimized budget overlay is exclusive diagnostic Inkjet mode');assert.equal(createHash('sha256').update(budgetCode).digest('hex'),budgetReceipt.optimizedEmittedSha256);}
if(inkjet)inkjet.optimized=!!budgetPath;
if(inkjet){inkjet.videoFrames=process.argv.includes('--video-frames');inkjet.timingOnly=process.argv.includes('--timing-only');inkjet.baseline=!!overlayPath;inkjet.warmupSeconds=Number(opt('--warmup-seconds','1'));inkjet.sampleSeconds=Number(opt('--sample-seconds','1'));assert.ok(Number.isInteger(inkjet.warmupSeconds)&&inkjet.warmupSeconds>=1&&inkjet.warmupSeconds<=5);assert.ok(Number.isInteger(inkjet.sampleSeconds)&&inkjet.sampleSeconds>=1&&inkjet.sampleSeconds<=5);}
const out = path.resolve(opt('--evidence-dir', '.ci-scratch/splashdown-browser'));
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const hash = data => createHash('sha256').update(data).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
for (const [file, digest] of Object.entries(manifest.artifacts)) assert.equal(hash(fs.readFileSync(path.join(site, file))), digest, file);
const prefix = `/_versions/${manifest.build.revision}/`;
if(budgetReceipt){
 assert.equal(budgetReceipt.modulePath,'patches/splatoon3/runtime/inkjet-vfx-budget.mjs','budget-only overlay');
 assert.equal(budgetReceipt.contentHash,manifest.contentHash,'optimized overlay bound to this emitted site');
 assert.equal(budgetReceipt.buildRevision,manifest.build.revision,'optimized overlay revision');
 assert.equal(budgetReceipt.candidateEmittedSha256,hash(fs.readFileSync(path.join(site,prefix,budgetReceipt.modulePath))),'optimized overlay original budget bytes');
}
const server = http.createServer((req, res) => {
  if(budgetCode && req.url===prefix+'patches/splatoon3/runtime/inkjet-vfx-budget.mjs'){res.setHeader('content-type','text/javascript');res.end(budgetCode);return;}
  if(overlayCode && req.url===prefix+'patches/splatoon3/runtime/special-vfx.mjs'){res.setHeader('content-type','text/javascript');res.end(overlayCode);return;}
  if (req.url === '/check') {
    res.setHeader('content-type', 'text/html');
    res.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);
    return;
  }
  const file = path.resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(site + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const errors = [];
let browser;
const watchdog = setTimeout(() => { errors.push('180-second browser watchdog'); void browser?.close(); }, 180_000);
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if(inkjet)await page.addInitScript(()=>{let seed=0x12345678,calls=0;Math.random=()=>{calls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};globalThis.__inkjetQaRandom={snapshot:()=>({state:seed,calls}),reset:()=>{seed=0x12345678;calls=0;}};});
  await page.goto(`http://127.0.0.1:${server.address().port}/check`);
  const servedHashes = {};
  if(inkjet) for(const file of ['patches/splatoon3/runtime/special-vfx.mjs','patches/splatoon3/runtime/inkjet-vfx-budget.mjs','patches/splatoon3/runtime/inkjet-vfx-clock.mjs']) {
    const response=await page.request.get(`http://127.0.0.1:${server.address().port}${prefix}${file}`);
    assert.equal(response.status(),200);servedHashes[file]=hash(await response.body());assert.equal(servedHashes[file],overlayCode && file.endsWith('/special-vfx.mjs')?overlayReceipt.baselineEmittedSha256:budgetCode && file.endsWith('/inkjet-vfx-budget.mjs')?budgetReceipt.optimizedEmittedSha256:hash(fs.readFileSync(path.join(site,prefix,file))),file+' served bytes');
  }
  const result = await page.evaluate(async ({prefix,inkjet}) => {
    const THREE = await import('three');
    const { install } = await import(prefix + 'patches/splatoon3/runtime/install.mjs');
    const profile = await fetch(prefix + 'patches/splatoon3/profile.json').then(r => r.json());
    const api = install(profile), { G } = api;
    // The same post-install order as bootstrap.mjs, without starting the menu
    // or a second game loop around this controlled flat-floor scene.
    for (const [name, file] of [
      ['installIssueFiveHotfixA', 'splatoon3/runtime/issue-five-hotfix-a.mjs'],
      ['installIssueFiveHotfixB', 'splatoon3/runtime/issue-five-hotfix-b.mjs'],
      ['installIssueFiveHotfixC', 'splatoon3/runtime/issue-five-hotfix-c.mjs'],
      ['installDisconnectFidelity', 'splatoon3/runtime/disconnect-fidelity.mjs'],
      ['installSlosherIntermediatePaint', 'splatoon3/runtime/slosher-intermediate-paint.mjs'],
      ['installQuality', 'local-quality/install.mjs'],
      ['installWeaponsFidelity', 'splatoon3/runtime/weapons-fidelity.mjs'],
      ['installIssueEightFollowup', 'splatoon3/runtime/issue-eight-followup.mjs'],
      ['installMainWeaponCatalogRuntime', 'splatoon3/runtime/main-weapon-catalog.mjs'],
      ['installWeaponAudioRuntime', 'splatoon3/runtime/audio/runtime.mjs'],
    ]) {
      const m = await import(prefix + 'patches/' + file);
      if (name === 'installQuality') m[name](profile); else m[name](api, profile);
    }
    const { applyCatalogueChoice } = await import(prefix + 'patches/splatoon3/runtime/catalogue.mjs');
    const { specialPresentationSnapshot } = await import(prefix + 'patches/splatoon3/runtime/special-motion.mjs');
    const { Level } = await import(prefix + 'src/world/level.js');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#d7e1eb');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(960, 720); document.body.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x637278, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2.8); light.position.set(-3, 8, 5); scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#a8b3bf', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.005; scene.add(floor);
    const camera = new THREE.PerspectiveCamera(45, 4 / 3, .01, 200);
    camera.position.set(12, 10, 15); camera.lookAt(0, 3, 2);
    const level = new Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, spawnPads: [[-40, 0, 0], [40, 0, 0]], spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-50, -.5, -50], max: [50, 0, 50] }] });
    Object.assign(G, { scene, renderer, camera, level, physics: new api.Physics(level), settings: { quality: 'high' }, mode: 'match', actors: [], time: 0,
      teamColors: [new THREE.Color('#ff7711'), new THREE.Color('#2255dd')], match: { state: 'playing', playing: () => true }, paint: { sample: () => 1, splat: () => 0 } });
    const cases = [], images = [], failures = [];
    const expect = (ok, name) => { if (!ok) failures.push(name); };
    const draw = () => {
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      expect(gl.getError() === gl.NO_ERROR && !gl.isContextLost(), 'WebGL draw');
    };
    const pixels = () => {
      draw(); const gl = renderer.getContext(), data = new Uint8Array(960 * 720 * 4);
      gl.readPixels(0, 0, 960, 720, gl.RGBA, gl.UNSIGNED_BYTE, data); return data;
    };
    const changed = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) >= 9) n++;
      return n;
    };

    if (inkjet) {
      const { hz, actorCount, layout } = inkjet;
      G.time = 0;
      G.projectiles = new api.Projectiles(scene);
      G.fx = new api.FX(scene, { quality: .35 }); G.fx.setCollider(() => null);
      const d = G.fx.s3SpecialVfx, actors = [];
      expect(!!d, 'emitted Inkjet director installed');
      for (let i=0;i<actorCount;i++) {
        const a = new api.Actor({ team:0, name:'Inkjet probe '+i, weapon:'shooter', CharacterClass:api.Character, style:{hair:0,skin:2,outfit:0,eyes:0} });
        scene.add(a.character.root); actors.push(a); G.actors=actors;
        if (a.character._sourceMotionLoader) await a.character._sourceMotionLoader;
        if (a.character.sourceMotion?.ready) await a.character.sourceMotion.ready;
        a.pos.set((i-(actorCount-1)/2)*2,2,0); a.vel.set(0,0,0); a.character.root.position.copy(a.pos);
        expect(applyCatalogueChoice(a,{sub:'bomb',special:'inkjet'},api),'Inkjet catalogue choice');
      }
      // Finish asynchronous setup before the deterministic simulation boundary.
      // Reset only this QA page's existing Math.random LCG, never production or VFX RNG.
      const startupRng=globalThis.__inkjetQaRandom.snapshot();
      globalThis.__inkjetQaRandom.reset();
      const activationRngBefore=globalThis.__inkjetQaRandom.snapshot();
      for (const a of actors) {
        a.special=a.specialCost(); a._startSpecial(); const track=d.track(a);
        expect(a.specialActive?.id==='inkjet' && track?.id==='inkjet','actual Inkjet activation and exhaust track');
      }
      const activationRngAfter=globalThis.__inkjetQaRandom.snapshot();
      const rngBoundary={name:'after all actor/source-motion setup, immediately before synchronous activation',activationRngBefore,activationRngAfter};
      // Controlled continuous-presentation probe: gameplay is deliberately
      // frozen, matching the source/emitted integration test, not full play.
      // Stationary flight records isolate the admission/culling boundary.
      const projectile=(owner,x)=>({wid:'inkjet',owner,team:0,seed:1234+x,dead:false,pos:new THREE.Vector3(x,2,4),vel:new THREE.Vector3(0,0,5)});
      G.projectiles.list=actors.map(a=>projectile(a,a.pos.x));
      const farOwner={team:0,alive:false};
      if(layout==='mixed')G.projectiles.list.push(projectile(farOwner,180));
      const cpu=[], submit=[], rows=[];
      let accepted=0, evictions=0; const exhaustGlows=actors.map(()=>0);
      const originalPuff=d.puff, originalEvict=d.kit.puffs._evict, originalSpark=d.spark;
      d.spark=function(...args){const x=args[1]?.x;const index=actors.findIndex(a=>Math.abs(a.pos.x-x)<.6);if(index>=0)exhaustGlows[index]++;return originalSpark.apply(this,args);};
      d.puff=function(...args){accepted++;return originalPuff.apply(this,args);};
      d.kit.puffs._evict=function(...args){evictions++;return originalEvict.apply(this,args);};
      // Drain activation bursts before the sampled continuous-emission window.
      for(let frame=0;frame<hz*inkjet.warmupSeconds;frame++){G.time+=1/hz;G.fx.update(1/hz,camera);draw();}
      draw(); accepted=0;evictions=0;exhaustGlows.fill(0);
      const phaseSnapshot=()=>actors.map(a=>({id:a.specialActive?.id??null,phase:a._s3AllSpecialState?.phase??a.specialActive?.phase??null,trackPhase:d.tracks.get(a)?.phase??null,gameplaySeed:a._s3AllSpecialState?.seed??null,gameplayTime:a._s3AllSpecialState?.t??null}));
      const phaseBefore=phaseSnapshot();
      const before=pixels();
      for(let frame=0;frame<hz*inkjet.sampleSeconds;frame++){
        const dt=1/hz;G.time+=dt;
        const start=performance.now();G.fx.update(dt,camera);cpu.push(performance.now()-start);
        const drawStart=performance.now();draw();submit.push(performance.now()-drawStart);
        rows.push({frame:frame+1,time:G.time,puffs:d.kit.puffs.n,sparks:d.kit.sparks.n,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
        if(!inkjet.timingOnly && (inkjet.videoFrames || (hz===60 && frame<12) || (hz!==60 && frame===0)))images.push({name:'inkjet-'+layout+'-'+actorCount+'p-f'+String(frame+1).padStart(3,'0')+'.png',data:renderer.domElement.toDataURL('image/png')});
      }
      const phaseAfter=phaseSnapshot();expect(JSON.stringify(phaseBefore)===JSON.stringify(phaseAfter),'frozen gameplay phase and seed stay unchanged');
      const after=pixels(), changedPixels=changed(before,after);
      if(inkjet.timingOnly)images.push({name:'inkjet-timing-postsample.png',data:renderer.domElement.toDataURL('image/png')});
      expect(exhaustGlows.length===actorCount && exhaustGlows.every(n=>n===2*(inkjet.baseline?hz:Math.min(hz,60))*inkjet.sampleSeconds),'each expected actor emits both exhaust glows; flight-only cannot pass');
      expect(changedPixels>10,'Inkjet presentation changes rendered pixels');
      expect(d.errors===0,'no swallowed special VFX errors');
      expect(rows.every(r=>r.puffs<=d.kit.puffs.cap),'continuous puff occupancy bounded');
      if(!inkjet.baseline)expect(evictions===0,'continuous Inkjet probe causes no eviction');
      const sorted=a=>[...a].sort((a,b)=>a-b);
      const stats=a=>{const q=sorted(a);return{mean:a.reduce((n,x)=>n+x,0)/a.length,p50:q[Math.floor(q.length*.5)],p95:q[Math.floor(q.length*.95)],max:q.at(-1)};};
      const gl=renderer.getContext(), debug=gl.getExtension('WEBGL_debug_renderer_info');
      cases.push({hz,actorCount,layout,phaseBefore,phaseAfter,startupRng,rngBoundary,variant:inkjet.baseline?'baseline-overlay':inkjet.optimized?'optimized-budget-overlay':'candidate',clock:{warmupSeconds:inkjet.warmupSeconds,sampleSeconds:inkjet.sampleSeconds,dt:1/hz,mode:'simulated fixed dt, not real display refresh'},seed:'VFX module initial 0x9e3779b9 in a fresh page per case; fixed setup order; Math.random LCG reset 0x12345678 after all asynchronous setup before synchronous activation',camera:camera.position.toArray(),viewport:{width:960,height:720},quality:.35,puffCap:d.kit.puffs.cap,accepted,evictions,exhaustGlows,changedPixels,cpuFxUpdateMs:stats(cpu),cpuRenderSubmissionMs:stats(submit),gpuTiming:null,allocations:null,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),farOwnerQuota:d.inkjetAdmissionBudget?.records.get(farOwner)?.puffs??null,frames:rows});
      for(const a of actors)a.character.dispose();
      G.projectiles.list=[];G.projectiles.clear();G.fx.dispose();G.actors=[];G.fx=null;
    } else for (const fxMode of ['none', 'disabled', 'enabled']) for (const hz of [30, 60, 120]) {
      G.projectiles = new api.Projectiles(scene);
      G.fx = fxMode === 'none' ? null : new api.FX(scene, { quality: .35 });
      if (G.fx) { G.fx.setCollider(() => null); G.fx.s3SpecialVfxEnabled = fxMode !== 'disabled'; }
      const a = new api.Actor({ team: 0, name: 'catalogue splashdown', weapon: 'shooter', CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
      G.actors = [a]; scene.add(a.character.root); a.pos.set(0, 0, 0);
      if (a.character._sourceMotionLoader) await a.character._sourceMotionLoader;
      if (a.character.sourceMotion?.ready) await a.character.sourceMotion.ready;
      expect(a.character.sourceMotion?.status === 'ready', 'source motion ready');
      for (let i = 0; i < 40; i++) { G.time += 1 / 60; a.update(1 / 60); }
      a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.grounded = true; a.ground.hit = true;
      expect(applyCatalogueChoice(a, { sub: 'bomb', special: 'tripleSplashdown' }, api), 'catalogue choice');
      a.special = a.specialCost(); a.intent.special = true;
      const captures = [], phases = new Set(), fistPixels = []; let maxY = 0, primitiveFrames = 0, armedFrames = 0, fistFrames = 0, endedAt = null, fistSampled = false, normalPass = null;
      for (let frame = 0; frame < hz * 3; frame++) {
        const dt = 1 / hz; G.time += dt; a.update(dt); a.intent.special = false; G.projectiles.update(dt);
        const fists = G.projectiles._catalogueFists || [];
        // Intentionally inspect and render before FX gets a chance to replace
        // any primitive placeholder created by the gameplay owner.
        const primitive = fists.some(f => f.mesh?.geometry?.type === 'BoxGeometry');
        primitiveFrames += Number(primitive); fistFrames += Number(fists.length > 0);
        if (a.specialActive?.id === 'tripleSplashdown') {
          phases.add(a.specialActive.phase); maxY = Math.max(maxY, a.pos.y);
          armedFrames += Number(a.character.weapon.pivot.visible);
        } else if (endedAt === null && frame > 0) endedAt = (frame + 1) / hz;
        if (!fistSampled && (frame + 1) / hz >= .5) {
          fistSampled = true;
          const before = pixels();
          for (const f of fists) {
            const mesh = f.mesh, visible = mesh?.visible;
            if (mesh) mesh.visible = false;
            fistPixels.push(changed(before, pixels()));
            if (mesh) mesh.visible = visible;
          }
          draw();
          expect(fistPixels.length === 2 && fistPixels.every(n => n > 30), `${fxMode}/${hz}Hz both fists actually draw before optional FX`);
          if (fxMode === 'none' && hz === 60 && fists.length === 2) {
            // GTAO uses this override type. The transparent energy shell must
            // not turn into an opaque sphere in its normal/depth input.
            const override = new THREE.MeshNormalMaterial(); scene.overrideMaterial = override;
            const energies = fists.map(f => f.mesh?.userData.energy).filter(Boolean);
            const visible = energies.map(e => e.visible), ranges = energies.map(e => e.geometry.drawRange.count);
            try {
              const withEnergy = pixels(); energies.forEach(e => { e.visible = false; });
              const energyPixels = changed(withEnergy, pixels());
              energies.forEach((e, i) => { e.visible = visible[i]; });
              const mesh = fists[0].mesh, shown = mesh?.visible;
              if (mesh) mesh.visible = false;
              const solidPixels = changed(withEnergy, pixels());
              if (mesh) mesh.visible = shown;
              normalPass = { energyPixels, solidPixels };
              expect(energies.length === 2 && energyPixels === 0 && solidPixels > 30, 'normal override hides energy spheres and retains solid fists');
              expect(energies.every((e, i) => e.geometry.drawRange.count === ranges[i]), 'normal override restores shared draw ranges');
            } finally { energies.forEach((e, i) => { e.visible = visible[i]; }); scene.overrideMaterial = null; override.dispose(); }
            draw();
          }
        }
        // Exercise the opt-out flag with the ordinary FX update still running.
        if (G.fx) G.fx.update(dt, camera);
        if (hz === 60 && [0, 29, 59, 69, 79, 86, 119].includes(frame)) {
          draw();
          const snap = specialPresentationSnapshot(a.character);
          captures.push({ frame: frame + 1, phase: a.specialActive?.phase || null, pos: a.pos.toArray(), fists: fists.length, armed: a.character.weapon.pivot.visible, presentation: snap?.kind || null });
          if (fxMode === 'none') images.push({ name: `splashdown-f${String(frame + 1).padStart(3, '0')}.png`, data: renderer.domElement.toDataURL('image/png') });
        }
      }
      draw();
      const label = `${fxMode}/${hz}Hz`;
      expect(phases.has('rise') && phases.has('drop') && endedAt !== null, label + ' complete actual lifecycle');
      expect(maxY > 5 && maxY < 8 && Math.abs(a.pos.y) < .1, label + ' physical rise and grounded finish');
      expect(fistFrames > 0 && primitiveFrames === 0, label + ' fists never expose a placeholder box');
      expect(armedFrames === 0, label + ' ordinary weapon hidden throughout activation');
      expect((G.projectiles._catalogueFists || []).length === 0, label + ' fists retired');
      expect(a.character.weapon.pivot.visible, label + ' ordinary weapon restored');
      cases.push({ fxMode, hz, sourceMotion: a.character.sourceMotion?.status, phases: [...phases], maxY, endedAt, primitiveFrames, armedFrames, fistFrames, fistPixels, normalPass, captures });
      a.character.dispose(); G.projectiles.clear(); G.fx?.dispose(); G.actors = []; G.fx = null;
    }
    renderer.dispose();
    return { scope: inkjet ? 'Diagnostic SwiftShader continuous-presentation probe with frozen gameplay and stationary live flight records; no baseline performance acceptance or Switch comparison' : 'production-composed emitted runtime, real Actor/Physics/Projectiles/Character on a controlled flat floor; no Switch recording comparison', cases, failures, images };
  }, {prefix,inkjet});
  for (const { name, data } of result.images) fs.writeFileSync(path.join(out, name), Buffer.from(data.split(',')[1], 'base64'));
  if(inkjet)assert.equal(result.images.length,inkjet.timingOnly?1:inkjet.videoFrames?inkjet.hz*inkjet.sampleSeconds:inkjet.hz===60?12:1,'nonempty per-case capture sequence');
  if(inkjet) for(const {name,data} of result.images)assert.ok(Buffer.from(data.split(',')[1],'base64').length>1000,name+' nonempty PNG');
  delete result.images;
  result.servedHashes=servedHashes;
  if(overlayReceipt){assert.equal(manifest.contentHash,overlayReceipt.contentHash,'overlay built for this exact emitted site');result.baselineOverlay=overlayReceipt;}
  if(budgetReceipt)result.optimizedBudgetOverlay=budgetReceipt;
  result.errors = errors; result.buildRevision = manifest.build.revision; result.contentHash = manifest.contentHash;
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ evidence: out, cases: result.cases.length, failures: result.failures, errors }));
  assert.deepEqual(errors, [], 'browser errors');
  assert.deepEqual(result.failures, [], 'catalogue splashdown lifecycle regressions');
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
