#!/usr/bin/env node
// Visual review evidence for the special-weapon models in the built game: the
// real Actor/Character starts each all-specials action, presses fire on a fixed
// schedule and the device, deployed objects and rounds are drawn on a flat
// floor. The images are comparison evidence, not a retail-parity score.
//   node scripts/render-inkwave-special-gallery.mjs --site <built site> --out <dir> [--ids a,b]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const arg = (name, fallback) => { const n = process.argv.indexOf(name); return n < 0 ? fallback : process.argv[n + 1]; };
const site = path.resolve(arg('--site', '_site')), out = path.resolve(arg('--out', '.ci-scratch/special-gallery'));
const ALL = ['tentaMissiles', 'inkjet', 'booyahBomb', 'ultraStamp', 'zipcaster', 'killerWail', 'crabTank', 'reefslider', 'tripleInkstrike', 'superChump', 'krakenRoyale', 'splattercolorScreen', 'waveBreaker'];
const ids = (arg('--ids', '') || '').split(',').filter(Boolean);
const size = Number(arg('--size', 360));
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd8dce4);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x60718d, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-3, 5, 3); scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    G.scene = scene; G.teamColors = [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')];
    G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, o) => { o.length = 0; return o; } };
    G.physics = new Physics(G.level);
    // Flat floor at y = 0 for every sweep the sub pipelines use.
    G.physics.segment = (a, b, o) => {
      o.hit = false;
      if (a.y >= 0 && b.y < 0) { const t = a.y / (a.y - b.y); o.hit = true; o.point = new THREE.Vector3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t); o.normal = new THREE.Vector3(0, 1, 0); o.dist = t; }
      return o;
    };
    G.physics.raycast = (o, d, len, out) => {
      out.hit = false;
      if (d.y < 0 && o.y >= 0 && o.y + d.y * len <= 0) { const t = o.y / -d.y; out.hit = true; out.point = new THREE.Vector3(o.x + d.x * t, 0, o.z + d.z * t); out.normal = new THREE.Vector3(0, 1, 0); out.dist = t; }
      return out;
    };
    G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true }; G.time = 0;
    G.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 80);
    G.projectiles = new api.Projectiles(scene);
    window.__subs = { THREE, api, G, renderer, scene, snap: () => renderer.domElement.toDataURL('image/png').split(',')[1] };
  }, { prefix, size });
  const rows = [];
  for (const id of ids.length ? ids : ALL) {
    const row = await page.evaluate(async (id) => {
      const { THREE, api, G, renderer, scene, snap } = window.__subs;
      const { Actor, Character } = api;
      const a = new Actor({ team: 0, weapon: 'shooter', isLocal: true, name: id, CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
      const ch = a.character;
      ch.actor = a; ch.onEvent = null; a.grounded = a.ground.hit = true; G.actors = [a]; scene.add(ch.root);
      if (ch._sourceMotionLoader) await ch._sourceMotionLoader; if (ch.sourceMotion?.ready) await ch.sourceMotion.ready;
      a.weapon = { ...a.weapon, special: id }; a.weaponRunner.reset();
      a.pos.set(0, 0, 0); a.aimYaw = 0; a.aimPitch = 0.1; a.yaw = 0;
      const cam = G.camera, images = {};
      const look = (target, off, at = new THREE.Vector3(0, 0.9, 0)) => {
        cam.position.copy(target).add(off); cam.lookAt(target.clone().add(at)); renderer.render(scene, cam); return snap();
      };
      a.special = a.specialCost(); a._startSpecial();
      const started = a.specialActive?.id || null;
      const objects = () => (G.projectiles._s3AllSpecialObjects || []);
      let shots = 0;
      for (let f = 0; f < 200; f++) {
        G.time += 1 / 60;
        a.intent.fire = (f >= 30 && f < 34) || (f >= 70 && f < 74) || (f >= 110 && f < 114) || (id === 'booyahBomb' && f < 60);
        a.aimDir.set(Math.sin(a.aimYaw) * Math.cos(a.aimPitch), Math.sin(a.aimPitch), Math.cos(a.aimYaw) * Math.cos(a.aimPitch));
        if (a.specialActive) a._updateSpecial(1 / 60);
        a._finishFrame(1 / 60); G.projectiles.update(1 / 60); ch.root.updateMatrixWorld(true);
        if (f === 20) { images.device = look(a.pos, new THREE.Vector3(-1.9, 1.3, 2.6)); images.deviceBack = look(a.pos, new THREE.Vector3(-1.6, 1.6, -2.4)); }
        if (f === 45) images.action = look(a.pos, new THREE.Vector3(-2.6, 1.6, 3.2));
        const o = objects().at(-1);
        if (o && (f === 90 || f === 150)) images['object' + f] = look(o.target || o.pos, new THREE.Vector3(-4, 3, 6), new THREE.Vector3(0, 1, 0));
        const round = (G.projectiles.list || []).find(p => p.wid === id);
        if (round && !images.round) images.round = look(round.pos, new THREE.Vector3(-1.4, 0.6, 1.8), new THREE.Vector3(0, 0, 0));
      }
      const row = { id, started, objects: objects().map(o => o.kind) };
      a.reset?.(); scene.remove(ch.root); ch.dispose();
      G.projectiles.clear?.();
      for (const o of [...scene.children]) if (o.userData?.s3SpecialObject) scene.remove(o);
      return { ...row, images };
    }, id);
    for (const [k, b64] of Object.entries(row.images)) fs.writeFileSync(path.join(out, `${id}.${k}.png`), Buffer.from(b64, 'base64'));
    delete row.images; rows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(out, 'special-gallery.json'), JSON.stringify({ revision: identity.build.revision, rows, errors }, null, 2));
  if (errors.length) { console.error('page errors:', errors.slice(0, 10)); process.exitCode = 1; }
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
