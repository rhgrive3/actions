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
import { chromium } from 'playwright';

const arg = (name, fallback) => { const n = process.argv.indexOf(name); return n < 0 ? fallback : process.argv[n + 1]; };
const site = path.resolve(arg('--site', '_site')), out = path.resolve(arg('--out', '.ci-scratch/weapon-gallery'));
const ids = (arg('--ids', '') || '').split(',').filter(Boolean), held = !process.argv.includes('--no-held');
const size = Number(arg('--size', 400)), crowd = process.argv.includes('--crowd');
fs.mkdirSync(out, { recursive: true });
const identity = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const prefix = '/_versions/' + identity.build.revision + '/';
const server = http.createServer((req, res) => {
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
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: size * 2, height: size * 2 } });
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
    const px = new Uint8Array(32 * 16 * 4); for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) { const v = y < 9 ? 235 : 130; px.set([v, v, Math.min(255, v + 12), 255], (y * 32 + x) * 4); }
    const sky = new THREE.DataTexture(px, 32, 16); sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace; sky.needsUpdate = true;
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
    const row = await page.evaluate(async ({ id, held, crowd }) => {
      const { THREE, api, W, Mt, R, Kit, WEAPONS, renderer, scene, snap, G } = window.__gallery;
      const { Actor, Character } = api;
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
      const persp = snap();
      cam.position.copy(c).add(new THREE.Vector3(.9,.45,-1.1).normalize().multiplyScalar(span*2.5));cam.lookAt(c);renderer.render(scene,cam);const rear = snap();
      scene.remove(g);
      let tris = 0; for (const geo of [d.body, d.ink, d.drum, d.drumCaps, d.glow, d.glass]) if (geo) tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      const res = { id, family: R?.weaponBehaviorFamily(id) ?? WEAPONS[id]?.behaviorKind ?? WEAPONS[id]?.kind, modelKind: R?.weaponModelFamily(id) ?? WEAPONS[id]?.modelKind ?? WEAPONS[id]?.kind, own: !!R?.weaponModelSpec(id),
        size: s.toArray().map(v => +v.toFixed(4)), muzzle: d.muzzle.toArray().map(v => +v.toFixed(4)), tris: Math.round(tris), buildMs: +buildMs.toFixed(1), geometryKB: Math.round(bytes / 1024),
        images: { side, above, front: muzzleView, persp, rear } };
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
          opacity: shell.material.opacity, castShadow: shell.castShadow, transmission: shell.material.transmission } : null;
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
          const copy = new THREE.Mesh(shell.geometry, shell.material); probe.add(copy);
          const camera = new THREE.OrthographicCamera(-.03, .03, .03, -.03, .01, 10);
          camera.position.set(-1, .07, .20); camera.lookAt(0, .07, .20);
          const target = new THREE.WebGLRenderTarget(16, 16), samples = [];
          for (const bg of [0x000000, 0xffffff]) {
            probe.background = new THREE.Color(bg); renderer.setRenderTarget(target); renderer.render(probe, camera);
            const px = new Uint8Array(4); renderer.readRenderTargetPixels(target, 8, 8, 1, 1, px); samples.push([...px]);
          }
          renderer.setRenderTarget(null); target.dispose();
          res.glass.backgroundPixels = samples;
          if (samples[1][0] - samples[0][0] < 80) throw Error('Sleeve is not visibly transparent');
        }
      }
      // Fixed-pose render submission including a GPU completion boundary. Same-runner A/B only.
      const benchCam=new THREE.PerspectiveCamera(32,1,.05,30);benchCam.position.copy(a.pos).add(new THREE.Vector3(-1.6,1.15,2.4));benchCam.lookAt(a.pos.clone().add(new THREE.Vector3(0,.8,.15)));
      const samples=[],gl=renderer.getContext();for(let j=0;j<100;j++){const t=performance.now();renderer.render(scene,benchCam);gl.finish();if(j>=20)samples.push(performance.now()-t);}
      samples.sort((a,b)=>a-b);res.renderMs={p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)]};
      res.drawCalls=renderer.info.render.calls;res.renderTriangles=renderer.info.render.triangles;
      if(crowd){
        const actors=[a], ids=['s3-spinner-downpour','s3-maneuver-short','s3-maneuver-gallon','s3-slosher-launcher'];
        for(let k=1;k<8;k++){
          const other=new Actor({team:k%2,weapon:ids[k%ids.length],CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),c=other.character;
          c.actor=other;c.onEvent=null;other.grounded=other.ground.hit=true;scene.add(c.root);actors.push(other);
          if(c._sourceMotionLoader)await c._sourceMotionLoader;if(c.sourceMotion?.ready)await c.sourceMotion.ready;
        }
        const shells=actors.map(o=>o.character.weapon.off.getObjectByName('weapon-glass')).filter(Boolean);
        if (shells.length && new Set(shells.map(s=>s.material)).size !== 1) throw Error('Glass material is not shared');
        res.glassMaterials = new Set(shells.map(s=>s.material)).size;
        G.actors=actors;const camera=new THREE.PerspectiveCamera(40,1,.05,60);camera.position.set(-5,3.5,8);camera.lookAt(0,.8,0);
        const quant=(arr)=>{arr.sort((a,b)=>a-b);return{p50:arr[Math.floor(arr.length*.5)],p95:arr[Math.floor(arr.length*.95)]};};
        res.crowd={};
        for(const tier of['game','far']){
          for(let k=0;k<actors.length;k++){const o=actors[k];o.pos.set((k%4-1.5)*1.15,0,Math.floor(k/4)*1.5);o.intent.fire=false;o.character.setLod(tier);for(let z=0;z<4;z++)o._finishFrame(1/60);}
          const cpu=[],done=[],anim=[];for(let k=0;k<80;k++){const t0=performance.now();for(const o of actors)o._finishFrame(1/60);const t1=performance.now();renderer.render(scene,camera);const t2=performance.now();gl.finish();const t3=performance.now();if(k>=20){anim.push(t1-t0);cpu.push(t2-t1);done.push(t3-t1);}}
          const geos=new Set();scene.traverseVisible(o=>{if(o.isMesh&&o.geometry)geos.add(o.geometry);});let geometryBytes=0;for(const g of geos){for(const a of Object.values(g.attributes))geometryBytes+=a.array.byteLength;if(g.index)geometryBytes+=g.index.array.byteLength;}
          res.crowd[tier]={actors:8,ids:actors.map(o=>o.weaponId||o.character.weaponModel),animationMs:quant(anim),renderSubmitMs:quant(cpu),renderCompleteMs:quant(done),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,visibleGeometryBytes:geometryBytes,rendererGeometries:renderer.info.memory.geometries};
          res.images['crowd-'+tier]=snap();
        }
        for(const other of actors.slice(1)){other.weaponRunner.reset();scene.remove(other.character.root);other.character.dispose();}
        G.actors=[a];
      }
      a.weaponRunner.reset(); scene.remove(ch.root); ch.dispose();
      Object.assign(res.images, shots); res.maxGrip = +maxGrip.toFixed(4); res.nonFinite = nonFinite; res.firingFrames = fired;
      res.weaponKind = ch.weaponKind; res.weaponModel = ch.weaponModel;
      return res;
    }, { id, held, crowd });
    for (const [k, b64] of Object.entries(row.images)) fs.writeFileSync(path.join(out, `${id}.${k}.png`), Buffer.from(b64, 'base64'));
    delete row.images; rows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(out, 'gallery.json'), JSON.stringify({ revision: identity.build.revision, rows, errors }, null, 2));
  if (errors.length) { console.error('page errors:', errors.slice(0, 10)); process.exitCode = 1; }
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
