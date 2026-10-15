#!/usr/bin/env node
// Visual review evidence for the per-main-weapon models: an orthographic side
// view matching the official 3D weapon renders (muzzle to the right, seen from
// the weapon's right side, transparent background), a 3/4 view, and the actual
// Actor/Runner/Character holding it while idle, carrying, firing and charging.
// The images are comparison evidence, not a retail-parity score.
//   node scripts/render-inkwave-weapon-gallery.mjs --site <built site> --out <dir> [--ids a,b] [--no-held]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { chromium } from 'playwright';

const arg = (name, fallback) => { const n = process.argv.indexOf(name); return n < 0 ? fallback : process.argv[n + 1]; };
const site = path.resolve(arg('--site', '_site')), out = path.resolve(arg('--out', '.ci-scratch/weapon-gallery'));
const ids = (arg('--ids', '') || '').split(',').filter(Boolean), held = !process.argv.includes('--no-held');
const size = Number(arg('--size', 600)), crowd = false; // visual/contracts only
if (process.argv.includes('--crowd')) throw Error('Use measure-inkwave-weapon-shell-cost.mjs for completed-output crowd timing');
const compareClearcoat = process.argv.includes('--compare-clearcoat');
const hostSnapshot = () => {
  const cpus = os.cpus(), times = { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
  for (const c of cpus) for (const k of Object.keys(times)) times[k] += c.times[k];
  return { utc: new Date().toISOString(), cpuModel: cpus[0]?.model, logicalCpus: cpus.length,
    cpuMHz: cpus.map(c => c.speed), cpuTimes: times, loadAverage: os.loadavg(), freeMemory: os.freemem(), totalMemory: os.totalmem() };
};
fs.mkdirSync(out, { recursive: true });
const identity = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const prefix = '/_versions/' + identity.build.revision + '/';
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (req.url === '/review') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);
    return;
  }
  const p = path.resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!p.startsWith(site + '/') || !fs.existsSync(p)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', /\.m?js$/.test(p) ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser; const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.exposeFunction('__weaponHostSnapshot', hostSnapshot);
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/review');
  await page.evaluate(async ({ prefix, size }) => {
    const THREE = await import('three'), { install } = await import(prefix + 'patches/splatoon3/runtime/install.mjs');
    const profile = await fetch(prefix + 'patches/splatoon3/profile.json').then(r => r.json());
    const api = install(profile), { G, Physics } = api;
    // bootstrap.mjs installs the catalogue main-weapon runtime after install(); without it s3-* weapons never fire
    const { installWeaponsFidelity } = await import(prefix + 'patches/splatoon3/runtime/weapons-fidelity.mjs');
    const { installMainWeaponCatalogRuntime } = await import(prefix + 'patches/splatoon3/runtime/main-weapon-catalog.mjs');
    installWeaponsFidelity(api, profile); installMainWeaponCatalogRuntime(api, profile);
    const W = await import(prefix + 'src/game/character-weapons.js'), Mt = await import(prefix + 'src/game/character-mats.js');
    const Kit = await import(prefix + 'patches/splatoon3/runtime/weapon-models/kit.mjs');
    const R = await import(prefix + 'patches/splatoon3/runtime/weapon-models/registry.mjs').catch(() => null); // absent in pre-registry builds
    const { WEAPONS } = await import(prefix + 'src/config.js');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size); renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    const px = new Uint8Array(1024 * 512 * 4); for (let y = 0; y < 512; y++) for (let x = 0; x < 1024; x++) { const v = y / 512 < 9 / 16 ? 235 : 130; px.set([v, v, Math.min(255, v + 12), 255], (y * 1024 + x) * 4); }
    const sky = new THREE.DataTexture(px, 1024, 512); sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace; sky.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromEquirectangular(sky).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x60718d, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(-3, 4, 2); scene.add(key);
    G.scene = scene; G.teamColors = [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')];
    G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, o) => { o.length = 0; return o; } };
    G.physics = new Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true }; G.time = 0;
    G.projectiles = new api.Projectiles({ add() {}, remove() {} }); // real emission path, projectiles not drawn
    G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
    const snap = () => renderer.domElement.toDataURL('image/png').split(',')[1];
    window.__gallery = { THREE, api, W, Mt, R, Kit, WEAPONS, renderer, scene, snap, G };
  }, { prefix, size });
  const all = await page.evaluate(() => Object.keys(window.__gallery.WEAPONS).filter(id => window.__gallery.WEAPONS[id]?.class !== undefined || window.__gallery.WEAPONS[id]?.catalogRecord));
  const list = ids.length ? ids : all;
  const rows = [];
  for (const id of list) {
    const hostBefore = hostSnapshot();
    const row = await page.evaluate(async ({ id, held, crowd, prefix, compareClearcoat }) => {
      const { THREE, api, W, Mt, R, Kit, WEAPONS, renderer, scene, snap, G } = window.__gallery;
      const { Actor, Character } = api;
      // r186 records zero-count drawElements calls for native override gates.
      // Separate actual nonempty draws from raw API calls without altering them.
      const observeDraws=renderer=>{
        const gl=renderer.getContext(),saved=[],counts={nonzero:0,zero:0};
        for(const [name,countAt,instancesAt] of [['drawElements',1],['drawArrays',2],['drawElementsInstanced',1,4],['drawArraysInstanced',2,3]]){
          const original=gl[name];saved.push([name,original]);gl[name]=function(...args){counts[args[countAt]>0&&(instancesAt===undefined||args[instancesAt]>0)?'nonzero':'zero']++;return original.apply(this,args);};
        }
        return{reset(){counts.nonzero=counts.zero=0;},read(){return{nonzero:counts.nonzero,zero:counts.zero};},restore(){for(const [name,fn]of saved)gl[name]=fn;}};
      };

      const t0 = performance.now(), d = W.getWeaponDef(id), buildMs = performance.now() - t0, color = G.teamColors[0];
      let bytes = 0; const geos = [d.body, d.ink, d.bodyStatic, d.inkStatic, d.drum, d.drumCaps, d.glow, d.glass, ...Object.values(d.parts || {}).map(p => p.geo)];
      for (const geo of new Set(geos.filter(Boolean))) { for (const a of Object.values(geo.attributes)) bytes += a.array.byteLength; if (geo.index) bytes += geo.index.array.byteLength; }
      // whole weapon at rest, including the parts and drum/glow channels
      const g = new THREE.Group();
      g.add(new THREE.Mesh(d.body, Mt.getPlasticMaterial()), new THREE.Mesh(d.ink, Mt.getInkMaterial(color)));
      if (d.drum) { const drum = new THREE.Group(); drum.position.copy(d.drumAt); drum.add(new THREE.Mesh(d.drum, Mt.getInkMaterial(color)), new THREE.Mesh(d.drumCaps, Mt.getPlasticMaterial())); g.add(drum); }
      if (d.glow) g.add(new THREE.Mesh(d.glow, new THREE.MeshStandardMaterial({ color: '#797d85', roughness: .3 })));
      Kit.attachWeaponGlass?.(d, g);
      scene.add(g); g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g), s = box.getSize(new THREE.Vector3());
      // Immutable authored framing is shared by baseline/candidate. Do not auto-fit each version.
      const dual=id.includes('maneuver'), ball=id==='s3-spinner-downpour', frame=dual?{x:.12,y:.30,z:.32}:ball?{x:.16,y:.24,z:.56}:{x:.24,y:.34,z:.38};
      const c=new THREE.Vector3(0,dual?.025:.045,dual?.025:ball?.16:.155);
      const half = Math.max(frame.y, frame.z) * 0.56;
      const ortho = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 20);
      ortho.position.set(c.x - 3, c.y, c.z); ortho.up.set(0, 1, 0); ortho.lookAt(c); renderer.render(scene, ortho); const side = snap();
      const top = new THREE.OrthographicCamera(-Math.max(frame.x, frame.z) * .56, Math.max(frame.x, frame.z) * .56, Math.max(frame.x, frame.z) * .56, -Math.max(frame.x, frame.z) * .56, .01, 20);
      top.position.set(c.x, c.y + 3, c.z); top.up.set(0, 0, 1); top.lookAt(c); renderer.render(scene, top); const above = snap();
      const front = new THREE.OrthographicCamera(-Math.max(frame.x, frame.y) * .56, Math.max(frame.x, frame.y) * .56, Math.max(frame.x, frame.y) * .56, -Math.max(frame.x, frame.y) * .56, .01, 20);
      front.position.set(c.x, c.y, c.z + 3); front.lookAt(c); renderer.render(scene, front); const muzzleView = snap();
      const span = Math.max(frame.x, frame.y, frame.z), cam = new THREE.PerspectiveCamera(30, 1, .01, 50);
      cam.position.copy(c).add(new THREE.Vector3(-0.9, 0.45, 1.1).normalize().multiplyScalar(span * 2.5)); cam.lookAt(c); renderer.render(scene, cam);
      const persp = snap(), perspCamera = cam.clone();
      cam.position.copy(c).add(new THREE.Vector3(.9,.45,-1.1).normalize().multiplyScalar(span*2.5));cam.lookAt(c);renderer.render(scene,cam);const rear = snap();
      const clearcoatImages = {};
      if (compareClearcoat && d.glass) {
        const material = Kit.getWeaponGlassMaterial(), original = material.clearcoat;
        try {
          material.clearcoat = 0;
          for (const [name, camera] of [['side', ortho], ['above', top], ['front', front], ['persp', perspCamera], ['rear', cam]]) {
            renderer.render(scene, camera); clearcoatImages['clearcoat-zero-' + name] = snap();
          }
        } finally { material.clearcoat = original; }
      }
      scene.remove(g);
      let tris = 0; for (const geo of [d.body, d.ink, d.drum, d.drumCaps, d.glow, d.glass]) if (geo) tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      const res = { id, family: R?.weaponBehaviorFamily(id) ?? WEAPONS[id]?.behaviorKind ?? WEAPONS[id]?.kind, modelKind: R?.weaponModelFamily(id) ?? WEAPONS[id]?.modelKind ?? WEAPONS[id]?.kind, own: !!R?.weaponModelSpec(id),
        size: s.toArray().map(v => +v.toFixed(4)), muzzle: d.muzzle.toArray().map(v => +v.toFixed(4)), tris: Math.round(tris), buildMs: +buildMs.toFixed(1), geometryKB: Math.round(bytes / 1024),
        images: { side, above, front: muzzleView, persp, rear, ...clearcoatImages } };
      if (!held) return res;
      // held: real Actor + WeaponRunner + Character (native + patched pose layers)
      const a = new Actor({ team: 0, weapon: id, isLocal: true, name: id, CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } }), ch = a.character;
      ch.actor = a; ch.onEvent = null; a.grounded = a.ground.hit = true; G.actors = [a]; scene.add(ch.root);
      if (ch._sourceMotionLoader) await ch._sourceMotionLoader; if (ch.sourceMotion?.ready) await ch.sourceMotion.ready; if(ch.sourceMotion?.status!=='ready')throw Error(id+' source motion failed');
      const look = (frame, side) => {
        const camera = new THREE.PerspectiveCamera(32, 1, .05, 30);
        const off = side === 'right' ? new THREE.Vector3(-2.6, 1.0, 0.35) : side === 'left' ? new THREE.Vector3(2.6, 1.0, 0.35) : side === 'back' ? new THREE.Vector3(-0.9, 1.5, -2.4) : new THREE.Vector3(-1.6, 1.15, 2.4);
        camera.position.copy(a.pos).add(off); camera.lookAt(a.pos.clone().add(new THREE.Vector3(0, .8, .15)));
        renderer.render(scene, camera); return snap();
      };
      const shots = {}; let maxGrip = 0, nonFinite = false, fired = 0;
      const C = api.CHARACTER_CHANNELS;
      for (let frame = 0; frame < 240; frame++) {
        const fire = frame >= 70 && frame < 200;
        a.ink = 100; a.intent.fire = fire; a.aimPitch = 0;
        if (frame >= 30 && frame < 60) { a.vel.set(0, 0, 2.4); a.pos.z += 2.4 / 60; } else a.vel.set(0, 0, 0);
        G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire, firePressed: frame === 70 }); a._finishFrame(1 / 60); ch.root.updateMatrixWorld(true);
        if (![...ch.P].every(Number.isFinite)) nonFinite = true;
        if (a.weaponRunner.firingT > 0 || a.weaponRunner.charging || a.weaponRunner.busy?.()) fired++;
        if (!ch.dual && ch.P[C.IKL] > .99 && ch.P[C.LTW] < .001) {
          const p = ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone());
          maxGrip = Math.max(maxGrip, p.distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));
        }
        if (frame === 25) { shots.idle = look(frame, 'front'); shots.idleSide = look(frame, 'right'); shots.idleLeft = look(frame, 'left'); }
        if (frame === 55) { shots.walk = look(frame, 'front'); shots.walkLeft = look(frame, 'left'); shots.walkRight = look(frame, 'right'); }
        if (frame === 110) { shots.fire = look(frame, 'front'); shots.fireSide = look(frame, 'right'); shots.fireLeft = look(frame, 'left'); }
        if (frame === 160) shots.fireLate = look(frame, 'back');
        if (frame === 215) shots.after = look(frame, 'front');
      }
      if (id === 's3-spinner-downpour') {
        const shell = ch.weapon.off.getObjectByName('weapon-glass');
        res.glass = shell ? { triangles: shell.geometry.index.count / 3, transparent: shell.material.transparent,
          depthWrite: shell.material.depthWrite, depthTest: shell.material.depthTest, side: shell.material.side,
          opacity: shell.material.opacity, castShadow: shell.castShadow, transmission: shell.material.transmission, clearcoat: shell.material.clearcoat } : null;
        for (const tier of ['game', 'far']) for (const background of ['#101321', '#eef3f8']) for (const inkColor of ['#ff8825', '#484ce8']) {
          ch.setLod(tier); ch.setColor(new THREE.Color(inkColor));
          for (let j = 0; j < 8; j++) a._finishFrame(1 / 60);
          scene.background = new THREE.Color(background);
          shots[`glass-${tier}-${background.slice(1)}-${inkColor.slice(1)}`] = look(240, 'right');
          if (shell && (!shell.visible || shell.material.depthWrite || shell.geometry !== d.glass)) throw Error('Glass lost its channel at ' + tier);
        }
        scene.background = null; ch.setColor(color); ch.setLod('hero');
        if (shell) {
          // Read actual production-shader pixels through the authored sleeve.
          const probe = new THREE.Scene(); probe.environment = scene.environment;
          probe.add(new THREE.HemisphereLight(0xffffff, 0x60718d, 2.1));
          const copy = Kit.attachWeaponGlass(d, probe);
          const camera = new THREE.OrthographicCamera(-.065, .065, .065, -.065, .01, 10);
          camera.position.set(-1, .07, .20); camera.lookAt(0, .07, .20);
          const target = new THREE.WebGLRenderTarget(16, 16), samples = [], edgeSamples = [];
          for (const bg of [0x000000, 0xffffff]) {
            probe.background = new THREE.Color(bg); renderer.setRenderTarget(target); renderer.render(probe, camera);
            const px = new Uint8Array(4); renderer.readRenderTargetPixels(target, 8, 8, 1, 1, px); samples.push([...px]);renderer.readRenderTargetPixels(target, 8, 2, 1, 1, px);edgeSamples.push([...px]);
          }
          renderer.setRenderTarget(null); target.dispose();
          res.glass.backgroundPixels = samples;res.glass.edgeBackgroundPixels = edgeSamples;
          if (samples[1][0] - samples[0][0] < 80) throw Error('Sleeve is not visibly transparent');
          if (samples[0][0] < 2 || samples[1][0] > 250) throw Error('Sleeve did not render at the centre');
          if (Kit.getWeaponGlassMaterial().customProgramCacheKey() === 'iw-weapon-glass-fresnel-1' && edgeSamples[1][0]-edgeSamples[0][0] >= samples[1][0]-samples[0][0]-10) throw Error('Glass silhouette does not gain reflection');
          // Exercise the real production GTAO implementation, including two
          // instances borrowing one definition geometry and override-only frames.
          const { GTAOPass } = await import('three/addons/postprocessing/GTAOPass.js');
          const second = Kit.attachWeaponGlass(d, probe); second.position.z = -.025;
          const backdropGeometry=new THREE.PlaneGeometry(.5,.5),backdropMaterial=new THREE.MeshBasicMaterial({color:'#708198'});
          const backdrop=new THREE.Mesh(backdropGeometry,backdropMaterial);backdrop.position.set(.12,.07,.20);backdrop.rotation.y=-Math.PI/2;probe.add(backdrop);
          // GTAO's Depth debug shader assumes a perspective projection. Use the
          // game's camera type and a tight depth interval so byte readback can
          // distinguish the clear shell from the backing surface.
          const aoCamera=new THREE.PerspectiveCamera(8,1,.5,2);aoCamera.position.copy(camera.position);aoCamera.lookAt(0,.07,.20);aoCamera.updateMatrixWorld(true);
          const aoTarget=new THREE.WebGLRenderTarget(64,64),ao=new GTAOPass(probe,aoCamera,64,64),beautyCount=d.glass.drawRange.count;
          const compare=(a,b)=>{let changed=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;return changed;};
          const read=pass=>{
            if(pass==='beauty'){renderer.setRenderTarget(aoTarget);renderer.render(probe,aoCamera);}
            else{ao.output=GTAOPass.OUTPUT[pass];ao.render(renderer,aoTarget,aoTarget);}
            const pixels=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(aoTarget,0,0,64,64,pixels);
            if(d.glass.drawRange.count!==beautyCount)throw Error('Shared glass draw range leaked after '+pass);
            return pixels;
          };
          const pair=pass=>{copy.visible=second.visible=false;const hidden=read(pass);copy.visible=second.visible=true;return compare(hidden,read(pass));};
          const safe={};for(const pass of ['Normal','Depth','AO','beauty'])safe[pass]=pair(pass);
          if(safe.Normal||safe.Depth||safe.AO||!safe.beauty)throw Error('Transparent shell pollutes real GTAO or disappeared: '+JSON.stringify(safe));
          const callbacks=[copy,second].map(m=>m.onBeforeRender),unsafe={};
          try{for(const mesh of [copy,second])mesh.onBeforeRender=()=>{d.glass.drawRange.count=beautyCount;};for(const pass of ['Normal','Depth','AO'])unsafe[pass]=pair(pass);}
          finally{[copy,second].forEach((mesh,i)=>mesh.onBeforeRender=callbacks[i]);d.glass.drawRange.count=beautyCount;}
          if(!unsafe.Normal||!unsafe.Depth)throw Error('GTAO counterexample did not detect unguarded shell: '+JSON.stringify({safe,unsafe}));
          res.glass.gtao={safeChangedPixels:safe,unguardedChangedPixels:unsafe,sharedGeometry:copy.geometry===second.geometry,rangeRestored:d.glass.drawRange.count===beautyCount};
          read('Normal');if(!pair('beauty'))throw Error('Glass failed to recover after override-only frame');
          renderer.setRenderTarget(null);ao.dispose();aoTarget.dispose();backdropGeometry.dispose();backdropMaterial.dispose();

        }
      }
      // No short gl.finish timing: this run produces visual and channel evidence only.
      if (!crowd && id === 's3-spinner-downpour') {
        // Render the actual emitted game post stack, not a studio substitute:
        // native HDR/MSAA, GTAO, bloom, colour grade and output on real Actor.
        const { Renderer } = await import(prefix + 'src/core/renderer.js');
        const container=document.createElement('div');document.body.append(container);
        const gameRenderer=new Renderer(container,{quality:'high',shadows:true,bloom:true});
        // Build native PMREM inside the very GL context that samples it. Never
        // reuse studio render-target textures across WebGL contexts.
        const { Environment } = await import(prefix+'src/world/environment.js');
        const savedEnvironment=scene.environment,savedIntensity=scene.environmentIntensity,savedGEnv=G.env,savedGRenderer=G.renderer;
        const savedLights=scene.children.filter(o=>o.isLight);for(const light of savedLights)scene.remove(light);
        const nativeScene=new THREE.Scene();
        G.renderer=gameRenderer.renderer;
        const nativeEnvironment=new Environment(gameRenderer.renderer,nativeScene,{theme:'day'});
        scene.environment=nativeEnvironment.envMap;scene.environmentIntensity=nativeScene.environmentIntensity;
        scene.add(nativeEnvironment.sun,nativeEnvironment.hemi);G.env=nativeEnvironment;
        gameRenderer.renderer.toneMapping=THREE.NeutralToneMapping;gameRenderer.renderer.toneMappingExposure=.94;
        if(scene.environment!==nativeEnvironment.envMap||scene.environment.image.width<256||scene.environment.image.height<256)throw Error('Invalid native same-context environment');
        res.environmentFixture={studio:{equirect:[1024,512],pmremCubeSize:256,ownContext:true},production:{theme:'day',pmremImage:[scene.environment.image.width,scene.environment.image.height],ownContext:true,intensity:scene.environmentIntensity,toneMapping:gameRenderer.renderer.toneMapping,exposure:gameRenderer.renderer.toneMappingExposure},scope:'isolated real Actor, native Environment lights/reflections/grade and high post stack; no arena geometry or gameplay FPS claim'};
        gameRenderer.renderer.debug.checkShaderErrors=true;
        const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.05,30);
        gameRenderer.setScene(scene,camera);
        if(!gameRenderer.gtao)throw Error('Production high-quality GTAO is not active');
        const shell=ch.weapon.off.getObjectByName('weapon-glass'),pipelineRows=[],pipelineFailures=[],draws=observeDraws(gameRenderer.renderer);
        for(const tier of ['game','far'])for(const background of ['#101321','#eef3f8'])for(const inkColor of ['#ff8825','#484ce8']){
          ch.setLod(tier);ch.setColor(new THREE.Color(inkColor));scene.background=new THREE.Color(background);
          for(let frame=0;frame<8;frame++)a._finishFrame(1/60);
          const distance=tier==='far'?8:2.6;
          camera.position.copy(a.pos).add(new THREE.Vector3(-distance,1,.35));camera.lookAt(a.pos.clone().add(new THREE.Vector3(0,.8,.15)));
          for(let k=0;k<2;k++)gameRenderer.render();
          const originalRange=d.glass?.drawRange.count;
          if(shell)shell.visible=false;gameRenderer.renderer.info.reset();draws.reset();gameRenderer.render();const hiddenCalls=gameRenderer.renderer.info.render.calls,hiddenDraws=draws.read();
          if(shell)shell.visible=true;gameRenderer.renderer.info.reset();draws.reset();gameRenderer.render();const calls=gameRenderer.renderer.info.render.calls,visibleDraws=draws.read();
          if(shell&&(calls!==hiddenCalls+2||visibleDraws.nonzero!==hiddenDraws.nonzero+1||visibleDraws.zero!==hiddenDraws.zero+1||d.glass.drawRange.count!==originalRange))pipelineFailures.push({tier,background,inkColor,calls,hiddenCalls,visibleDraws,hiddenDraws,rangeRestored:d.glass.drawRange.count===originalRange});
          if(calls!==visibleDraws.nonzero+visibleDraws.zero)throw Error('Production GL call tally mismatch');
          res.images['production-'+tier+'-'+background.slice(1)+'-'+inkColor.slice(1)]=gameRenderer.renderer.domElement.toDataURL('image/png').split(',')[1];
          if(compareClearcoat&&shell){
            const material=shell.material,original=material.clearcoat;
            try{
              material.clearcoat=0;gameRenderer.renderer.info.reset();draws.reset();gameRenderer.render();const zeroDraws=draws.read();
              if(zeroDraws.nonzero!==visibleDraws.nonzero||zeroDraws.zero!==visibleDraws.zero||d.glass.drawRange.count!==originalRange)throw Error('Clearcoat-only image changed draw/range contract');
              res.images['production-clearcoat-zero-'+tier+'-'+background.slice(1)+'-'+inkColor.slice(1)]=gameRenderer.renderer.domElement.toDataURL('image/png').split(',')[1];
            }finally{material.clearcoat=original;}
          }
          pipelineRows.push({glNonzeroDrawCalls:visibleDraws.nonzero,glZeroCountCalls:visibleDraws.zero,withoutGlassGlDraws:hiddenDraws,tier,background,inkColor,distance,drawCalls:calls,withoutGlassDrawCalls:hiddenCalls,glassVisible:!!shell?.visible,rangeRestored:!shell||d.glass.drawRange.count===originalRange});
        }
        res.productionPipeline={quality:'high',ao:!!gameRenderer.gtao,bloom:!!gameRenderer.bloom?.enabled,rows:pipelineRows,failures:pipelineFailures};
        draws.restore();scene.remove(nativeEnvironment.sun,nativeEnvironment.hemi);scene.add(...savedLights);
        scene.environment=savedEnvironment;scene.environmentIntensity=savedIntensity;G.env=savedGEnv;G.renderer=savedGRenderer;
        nativeEnvironment.dispose();gameRenderer._disposeComposer();gameRenderer.renderer.dispose();container.remove();
        scene.background=null;ch.setColor(color);ch.setLod('hero');
      }
      a.weaponRunner.reset(); scene.remove(ch.root); ch.dispose();
      Object.assign(res.images, shots); res.maxGrip = +maxGrip.toFixed(4); res.nonFinite = nonFinite; res.firingFrames = fired;
      res.weaponKind = ch.weaponKind; res.weaponModel = ch.weaponModel;
      return res;
    }, { id, held, crowd, prefix, compareClearcoat });
    row.hostBefore=hostBefore;row.hostAfter=hostSnapshot();
    for (const [k, b64] of Object.entries(row.images)) fs.writeFileSync(path.join(out, `${id}.${k}.png`), Buffer.from(b64, 'base64'));
    delete row.images; rows.push(row);
    if(row.productionPipeline?.failures?.length)errors.push('Production shell draw/range contract: '+JSON.stringify(row.productionPipeline.failures));
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(out, 'gallery.json'), JSON.stringify({ revision: identity.build.revision, compareClearcoat, rows, errors }, null, 2));
  if (errors.length) { console.error('page errors:', errors.slice(0, 10)); process.exitCode = 1; }
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
