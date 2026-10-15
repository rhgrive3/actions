#!/usr/bin/env node
// Isolated studio render of the S3 projectile-shape meshes (no game loop):
// fixed fake projectiles, several camera angles. Presentation diagnostics only.
// Usage: node scripts/render-inkwave-shape-studio.mjs <site> <out.png>
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
const [siteArg, outArg] = process.argv.slice(2);
const site = path.resolve(siteArg), root = path.resolve('.');
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/studio') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><body style="margin:0;background:#888"><script type="importmap">{"imports":{"three":"/inkwave-public/vendor/three/build/three.module.js","three/addons/":"/inkwave-public/vendor/three/jsm/"}}</script></body>'); return; }
  const file = u.startsWith('/site/') ? path.join(site, u.slice(6)) : path.join(root, u);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('console', m => console.log('console', m.text()));
  page.on('pageerror', e => console.log('pageerror', String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/studio`);
  const dataURL = await page.evaluate(async () => {
    const THREE = await import('three');
    const S = await import('/patches/splatoon3/runtime/s3-projectile-shapes.mjs');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(400, 300); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9aa3ad);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 2); scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0xd8d8d8 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const yellow = new THREE.Color(0.95, 0.85, 0.05), blue = new THREE.Color(0.2, 0.25, 0.95);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const mk = (id, extra) => ({ type: 'shot', wid: id, owner: { color: yellow }, age: 3 / 60, delay: 0, seed: 0.37, life: 1,
      pos: V(0, 1, 0), start: V(0, 1, -6), vel: V(0, 0, 130), vis: 0.1, size: 0.2, ...extra });
    const rec = (id, key, c, extra = {}) => ({ r: { family: { brella: 'brella', stringer: 'stringer', splatana: 'splatana', slosher: 'slosher' }[extra.family], sourceActor: extra.actor }, descriptor: { key, c } });
    const cases = {
      shot: [mk('shooter', {})],
      shotLate: [mk('shooter', { age: 10 / 60, vel: V(0, -5, 60), start: V(0, 1.2, -12) })],
      pellet: [mk('s3-shelter-normal', { catalog: rec('', 'pellet', { InitRadiusForPlayer: 0.185 }, { family: 'brella' }), vel: V(0, 0, 156) })],
      arrow: [mk('s3-stringer-normal', { catalog: rec('', 'arrow', { InitRadiusForPlayer: 0.205 }, { family: 'stringer' }), vel: V(0, 0, 231), start: V(0, 1, -10) })],
      slashH: [mk('s3-saber-normal', { catalog: rec('', 'saber-horizontal', {}, { family: 'splatana' }), vel: V(0, 0, 169), life: 0.1 })],
      slashV: [mk('s3-saber-normal', { catalog: rec('', 'saber-vertical', {}, { family: 'splatana' }), vel: V(0, 0, 48), life: 0.43, pos: V(0, 2, 0), age: 4 / 60 })],
      bubble: [mk('s3-slosher-bathtub', { catalog: rec('', 'slosh', {}, { family: 'slosher', actor: 'WeaponSlosherBathtub' }), vis: 0.6, vel: V(0, 2, 40), age: 0.2 })],
      machine: [mk('s3-slosher-launcher', { catalog: rec('', 'slosh', {}, { family: 'slosher', actor: 'WeaponSlosherLauncher' }), vel: V(0, 3, 50), age: 0.25 })],
      explosher: [mk('s3-slosher-washtub', { catalog: rec('', 'slosh', {}, { family: 'slosher', actor: 'WeaponSlosherWashtub' }), vel: V(0, 3, 40), age: 0.25 })],
    };
    const views = [['side', V(-1, 0.04, 0)], ['oblique', V(-0.62, 0.45, 0.62)], ['front', V(0.15, 0.12, 1)], ['top', V(0.002, 1, 0)]];
    const frame = { shot: [V(0, 1, -1.2), 3.2], shotLate: [V(0, 1, -0.5), 2], pellet: [V(0, 1, -1.2), 3.2], arrow: [V(0, 1, -1.6), 4],
      slashH: [V(0, 1, -0.2), 3.6], slashV: [V(0, 2, -0.2), 5], bubble: [V(0, 1, -0.4), 2.6], machine: [V(0, 1, -0.6), 2.2], explosher: [V(0, 1, -0.2), 2.6] };
    const out = document.createElement('canvas'), names = Object.keys(cases);
    out.width = 400 * views.length; out.height = 300 * names.length; const ctx = out.getContext('2d');
    const cam = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 100);
    // Minimal Projectiles stand-in sharing the real blob path is not needed for
    // dedicated meshes; glob-type shapes are drawn through a tiny blob mesh.
    const blobs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1 }), 64);
    blobs.setColorAt(0, yellow); blobs.frustumCulled = false; scene.add(blobs);
    for (let i = 0; i < names.length; i++) {
      const system = { scene, list: cases[names[i]] };
      for (const p of system.list) p.s3Shape = S.s3ShapeKind(p) || (p.catalog?.descriptor?.key === 'slosh' ? { WeaponSlosherBathtub: 'bubble', WeaponSlosherLauncher: 'machine', WeaponSlosherWashtub: 'explosher' }[p.catalog.r.sourceActor] : null);
      S.drawS3Shapes(system, THREE, { camera: cam });
      const shp = new Float32Array(256), look = new Float32Array(256), pet = new Float32Array(128);
      blobs.count = S.appendS3ShapeBlobs(system, blobs, shp, look, pet, 0, 64, new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
      blobs.instanceMatrix.needsUpdate = true; if (blobs.instanceColor) blobs.instanceColor.needsUpdate = true;
      for (let j = 0; j < views.length; j++) {
        const [target, dist] = frame[names[i]];
        cam.position.copy(views[j][1]).normalize().multiplyScalar(dist).add(target); cam.lookAt(target);
        renderer.render(scene, cam);
        ctx.drawImage(renderer.domElement, j * 400, i * 300);
        ctx.fillStyle = '#000'; ctx.font = '16px sans-serif'; ctx.fillText(names[i] + ' / ' + views[j][0], j * 400 + 6, i * 300 + 18);
      }
      system.list.length = 0; S.drawS3Shapes(system, THREE, { camera: cam });
    }
    return out.toDataURL('image/png');
  });
  fs.writeFileSync(outArg, Buffer.from(dataURL.split(',')[1], 'base64'));
} finally { await browser.close(); server.close(); }
