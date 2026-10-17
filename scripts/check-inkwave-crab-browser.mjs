#!/usr/bin/env node
// Emitted-build regression with real Actor, source Character, Physics,
// Projectiles and GPU/CPU PaintSystem. No retail hardware parity is implied.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const site = fs.realpathSync(opt('--site', '_site'));
const out = path.resolve(opt('--evidence-dir', 'work/crab-browser'));
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const hash = data => createHash('sha256').update(data).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
for (const [file, digest] of Object.entries(manifest.artifacts)) assert.equal(hash(fs.readFileSync(path.join(site, file))), digest, file);
const prefix = `/_versions/${manifest.build.revision}/`;
const server = http.createServer((req, res) => {
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
const watchdog = setTimeout(() => { errors.push('240-second browser watchdog'); void browser?.close(); }, 240_000);
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: opt('--browser-executable', undefined),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().startsWith('crab-check:')) console.log(m.text()); });
  await page.exposeFunction('crabSaveImage', (name, data) => fs.writeFileSync(path.join(out, name), Buffer.from(data.split(',')[1], 'base64')));
  await page.goto(`http://127.0.0.1:${server.address().port}/check`);
  const result = await page.evaluate(async prefix => {
    const THREE = await import('three');
    const { install } = await import(prefix + 'patches/splatoon3/runtime/install.mjs');
    const profile = await fetch(prefix + 'patches/splatoon3/profile.json').then(r => r.json());
    const api = install(profile), { G } = api;
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
    const { CRAB_TANK_RIG, crabTankShotGeometry } = await import(prefix + 'patches/splatoon3/runtime/crab-tank-aim.mjs');
    const { Level } = await import(prefix + 'src/world/level.js');
    const { createLevelMaterial } = await import(prefix + 'src/world/levelMaterial.js');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#d7e1eb');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(640, 480); document.body.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x637278, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2.8); light.position.set(-3, 8, 5); scene.add(light);
    const camera = new THREE.PerspectiveCamera(45, 4 / 3, .01, 200);
    Object.assign(G, { scene, renderer, camera, settings: { quality: 'high' }, mode: 'match', actors: [], time: 0,
      teamColors: [new THREE.Color('#ff7711'), new THREE.Color('#2255dd')], match: { state: 'playing', playing: () => true, canRespawn: () => false }, fx: null });
    const cases = [], images = [], captures = [], failures = [], records = [];
    const expect = (ok, name, detail = null) => { if (!ok) failures.push({ name, detail }); };
    const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
    const wallCases = [null, [1.5, 1.8], [.7, .9], [.5, .55], [.42, .50]];
    const oldPush = api.Projectiles.prototype._push;
    api.Projectiles.prototype._push = function(p) {
      if (p.s3AllSpecial === 'crabTank') {
        const origin = V(), direction = V(); crabTankShotGeometry(p.owner, p.s3AllSpecialMode, origin, direction);
        records.push({ owner: p.owner, mode: p.s3AllSpecialMode, origin: p.pos.clone(), direction: p.vel.clone().normalize(), expectedOrigin: origin, expectedDirection: direction, time: G.time });
      }
      return oldPush.call(this, p);
    };
    let levelMesh, paintElapsed = 0;
    function stage(wall = null) {
      G.projectiles?.clear(); G.paint?.dispose();
      if (levelMesh) { levelMesh.removeFromParent(); levelMesh.geometry.dispose(); levelMesh.material.dispose(); }
      const single = [{ kind: 'box', min: [-25, -.5, -25], max: [25, 0, 25], color: '#a8b3bf' }];
      if (wall) single.push({ kind: 'box', min: [-3, 0, wall[0]], max: [3, 3, wall[1]], color: '#b4c2cc' });
      G.level = new Level({ bounds: { minX: -25, maxX: 25, minZ: -25, maxZ: 25 }, spawnPads: [[-20, 0, 0], [20, 0, 0]], spawnBarrier: 0, half: [], single });
      G.physics = new api.Physics(G.level);
      G.paint = new api.PaintSystem(renderer, G.level, { atlasSize: 1024, maxDensity: 12, cell: .25 });
      levelMesh = new THREE.Mesh(G.level.buildGeometry(G.paint.size), createLevelMaterial(G.paint.texture, G.paint.size)); scene.add(levelMesh);
      G.projectiles = new api.Projectiles(scene); G.actors = [];
      paintElapsed = 0;
    }
    async function actor(team = 0) {
      const a = new api.Actor({ team, name: 'browser Crab', isLocal: false, weapon: 'shooter', CharacterClass: api.Character,
        style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
      scene.add(a.character.root); G.actors.push(a);
      if (a.character._sourceMotionLoader) await a.character._sourceMotionLoader;
      if (a.character.sourceMotion?.ready) await a.character.sourceMotion.ready;
      expect(a.character.sourceMotion?.status === 'ready', 'source motion ready');
      a.pos.set(team ? 15 : 0, 0, 0); a.grounded = a.ground.hit = true;
      for (let i = 0; i < 30; i++) { G.time += 1 / 60; a.update(1 / 60); }
      a.invuln = 0; a.pos.set(team ? 15 : 0, 0, 0); a.vel.set(0, 0, 0); a.aimPoint.copy(a.pos);
      return a;
    }
    const tick = (a, hz) => {
      const dt = 1 / hz; G.time += dt;
      const random = Math.random;
      if (a.intent.special) Math.random = () => .37; // Same activation seed for the rate comparison.
      try { a.update(dt); } finally { Math.random = random; }
      a.intent.special = false;
      // Ownership is claimed by the real splat path at its simulation tick.
      // Upload the GPU atlas at captures; software WebGL need not redraw an
      // unseen atlas on every intermediate logic frame.
      G.projectiles.update(dt); paintElapsed += dt;
    };
    function activate(a) {
      expect(applyCatalogueChoice(a, { sub: 'bomb', special: 'crabTank' }, api), 'catalogue Crab choice');
      a.special = a.specialCost(); a.intent.special = true;
    }
    function aim(a, yaw, pitch) {
      a.aimYaw = yaw; a.aimPitch = pitch;
      a.aimDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      a.aimPoint.copy(a.pos); // Explicitly test current aimDir, including pitch.
    }
    function gunSnapshot(a, mode) {
      const d = a.character.s3SpecialDevices()?.find(x => x.spec.crab), gun = CRAB_TANK_RIG[mode];
      if (!d) return null;
      const part = d.model.groups[gun.group]; part.updateWorldMatrix(true, true);
      return { d, part, axis: V(0, 0, 1).applyQuaternion(part.getWorldQuaternion(new THREE.Quaternion())),
        muzzle: part.localToWorld(V(...gun.muzzle).sub(V(...gun.pivot))) };
    }
    function capture(name, a, yaw = 0, overview = false) {
      const back = V(-Math.sin(yaw), 0, -Math.cos(yaw)), side = V(Math.cos(yaw), 0, -Math.sin(yaw));
      camera.position.copy(a.pos).addScaledVector(back, overview ? 9 : 3.8).addScaledVector(side, overview ? 7 : 2.5).add(V(0, overview ? 9 : 2.6, 0));
      camera.lookAt(a.pos.clone().add(V(0, .7, 0)));
      G.paint.flush(paintElapsed); paintElapsed = 0; renderer.render(scene, camera);
      const gl = renderer.getContext(); expect(gl.getError() === gl.NO_ERROR && !gl.isContextLost(), name + ' WebGL');
      const image = { name: name + '.png', data: renderer.domElement.toDataURL('image/png') };
      images.push(image); void globalThis.crabSaveImage(image.name, image.data);
      const before = new Uint8Array(640 * 480 * 4), after = new Uint8Array(before.length);
      gl.readPixels(0, 0, 640, 480, gl.RGBA, gl.UNSIGNED_BYTE, before);
      const objects = [a.character.root];
      // Ball presentation is world-mounted while the pilot/chassis are hidden.
      if (a.character.s3SpecialDevices()?.some(d => d.spec.crab && !d.holder.visible)) {
        for (const g of scene.children) if (g.children.some(c => c.userData.s3SubModel === 'spCrabBall')) objects.push(g);
      }
      const visibility = objects.map(o => o.visible); objects.forEach(o => { o.visible = false; });
      renderer.render(scene, camera); gl.readPixels(0, 0, 640, 480, gl.RGBA, gl.UNSIGNED_BYTE, after);
      objects.forEach((o, i) => { o.visible = visibility[i]; });
      let changed = 0;
      for (let i = 0; i < before.length; i += 4) if (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]) >= 9) changed++;
      expect(changed > 30, name + ' live actor/chassis contributes visible pixels', { changed });
      captures.push({ name, changedPixels: changed });
    }
    function retire(a) { G.actors = G.actors.filter(x => x !== a); a.character.dispose(); }

    // Actual catalogue admission and emission at every heading and both pitch
    // signs. Each mode gets its own lifecycle and cooldown; no clock rewriting.
    for (const hz of [30, 60, 120]) for (const mode of ['shooter', 'cannon']) for (const [heading, yaw] of [['north', 0], ['east', Math.PI / 2], ['south', Math.PI], ['west', -Math.PI / 2]]) {
      console.log(`crab-check: aim ${mode}/${heading}/${hz}Hz`);
      stage(); const a = await actor(); activate(a); tick(a, hz);
      for (const [tilt, pitch] of [['down', -.65], ['level', 0], ['up', .65]]) {
        aim(a, yaw, pitch); const start = records.length; a.intent[mode === 'shooter' ? 'fire' : 'sub'] = true;
        for (let frame = 0; frame < hz * 2 && records.length === start; frame++) tick(a, hz);
        a.intent.fire = a.intent.sub = false;
        const shot = records.slice(start).find(r => r.owner === a && r.mode === mode), gun = gunSnapshot(a, mode), label = `${mode}/${heading}/${tilt}/${hz}Hz`;
        expect(!!shot && !!gun, label + ' actual shot and model');
        if (shot && gun) {
          const originError = shot.origin.distanceTo(shot.expectedOrigin), directionError = shot.direction.distanceTo(shot.expectedDirection), boreError = gun.axis.distanceTo(a.aimDir);
          expect(originError < 1e-8 && directionError < 1e-8 && boreError < 1e-8, label + ' emission/aim/barrel agreement', { originError, directionError, boreError });
          expect(!a.character.weapon.pivot.visible, label + ' native gun hidden');
          const recoil = gun.part.position.clone().sub(gun.part.userData.rest);
          expect(a._s3SpecialMarks?.[mode === 'shooter' ? 'shot' : 'cannon'] === G.time && recoil.length() > 0, label + ' recoil follows real emission without FX');
          const otherMode = mode === 'shooter' ? 'cannon' : 'shooter', other = gunSnapshot(a, otherMode);
          expect(other.part.position.distanceTo(other.part.userData.rest) < 1e-8, label + ' other gun remains independent');
          cases.push({ kind: 'aim', hz, mode, heading, tilt, sourceMotion: a.character.sourceMotion.status, origin: shot.origin.toArray(), axis: shot.direction.toArray(), originError, directionError, boreError });
        }
        if (hz === 60) capture(`aim-${mode}-${heading}-${tilt}`, a, yaw);
        for (let i = 0; i < Math.ceil(hz * .05); i++) tick(a, hz);
      }
      retire(a);
    }
    // Real damage and CPU/GPU paint. A target behind a wall must remain safe,
    // including walls overlapping the neutral muzzle and thin walls entirely
    // between the actor and muzzle. These exercise different admission paths.
    for (const hz of [30, 60, 120]) for (const mode of ['shooter', 'cannon']) for (const wall of wallCases) {
      console.log(`crab-check: collision ${mode}/${wall?.[0] ?? 'target'}/${hz}Hz`);
      stage(wall); const a = await actor(), target = await actor(1);
      const targetDistance = mode === 'shooter' && !wall ? 18 : 4;
      target.pos.set(0, 0, targetDistance); target.character.root.position.copy(target.pos); target.invuln = 0; target.hp = 100;
      activate(a); aim(a, 0, 0); tick(a, hz);
      const start = records.length; a.intent[mode === 'shooter' ? 'fire' : 'sub'] = true;
      for (let i = 0; i < hz * 2 && records.length === start; i++) tick(a, hz);
      a.intent.fire = a.intent.sub = false;
      for (let i = 0; i < hz * 1.5; i++) tick(a, hz);
      const wallName = wall ? wall[0] < .45 ? 'behind-muzzle-wall' : wall[0] < .6 ? 'barrel-wall' : wall[0] < 1 ? 'muzzle-wall' : 'wall' : 'target';
      const damage = 100 - target.hp, painted = G.paint.counts[0], label = `${mode}/${wallName}/${hz}Hz`;
      expect(wall ? damage === 0 : damage > 0, label + ' target damage/occlusion', { damage, target: target.pos.toArray() });
      // The farther shooter target allows its first scheduled flight drop to
      // land before direct collision retires the head. Actor hits need no
      // invented impact splat beneath the victim.
      expect(painted > 0, label + ' real ownership grid follows contact/drop lifetime', { painted });
      expect(a.stats.turf === painted * G.paint.cell ** 2 && a.special === 0, label + ' exact owned turf without special refill', { turf: a.stats.turf, special: a.special, painted });
      cases.push({ kind: 'collision-paint-damage', hz, mode, wall, targetDistance, damage, painted, turf: a.stats.turf, special: a.special });
      if (hz === 60) capture(`impact-${mode}-${wallName}`, a, 0, true);
      retire(a); retire(target);
    }

    for (const hz of [30, 60, 120]) {
      console.log(`crab-check: roll/${hz}Hz`);
      stage(); const a = await actor(); activate(a); tick(a, hz);
      a.intent.squid = true; a.intent.move.set(1, 0, 0);
      for (let frame = 0; frame < hz * 1.5; frame++) tick(a, hz);
      const d = a.character.s3SpecialDevices()?.find(x => x.spec.crab), painted = G.paint.counts[0];
      expect(d?.holder.visible === false && Math.abs(a.pos.y) < .05, `rolling/${hz}Hz ball on floor`, { y: a.pos.y });
      expect(painted > 0 && a.stats.turf > 0, `rolling/${hz}Hz continuous owned floor paint`, { painted, turf: a.stats.turf });
      cases.push({ kind: 'roll', hz, painted, turf: a.stats.turf, position: a.pos.toArray() });
      if (hz === 60) capture('roll-floor', a, 0, true);
      a.intent.squid = false; a.intent.move.set(0, 0, 0); aim(a, -Math.PI / 2, .5);
      for (let i = 0; i < Math.ceil(hz * .4); i++) tick(a, hz);
      expect(gunSnapshot(a, 'shooter')?.d.holder.visible, `rolling/${hz}Hz tank returns`);
      retire(a);
    }
    for (const mode of ['shooter', 'cannon']) for (const wall of wallCases) {
      const rows = cases.filter(c => c.kind === 'collision-paint-damage' && c.mode === mode && JSON.stringify(c.wall) === JSON.stringify(wall));
      expect(rows.length === 3 && rows.every(c => c.damage === rows[0].damage && c.painted === rows[0].painted), `${mode}/${wall?.[0] ?? 'target'} identical damage and ownership at 30/60/120Hz`, rows);
    }
    const rolls = cases.filter(c => c.kind === 'roll');
    expect(rolls.length === 3 && rolls.every(c => c.painted === rolls[0].painted), 'rolling identical ownership at 30/60/120Hz', rolls);
    G.projectiles.clear(); G.paint.dispose(); levelMesh.geometry.dispose(); levelMesh.material.dispose(); renderer.dispose();
    api.Projectiles.prototype._push = oldPush;
    return { scope: 'emitted production composition, catalogue admission, source Character, real Physics/Projectiles and GPU/CPU PaintSystem; controlled floor and walls; GPU atlas uploads at captures; no Switch comparison',
      rig: CRAB_TANK_RIG, geometryStatus: 'INKWAVE authored mesh coordinates and presentation curves; not measured retail dimensions or joint limits', cases, captures, failures, images };
  }, prefix);
  for (const { name, data } of result.images) fs.writeFileSync(path.join(out, name), Buffer.from(data.split(',')[1], 'base64'));
  delete result.images;
  Object.assign(result, { errors, buildRevision: manifest.build.revision, contentHash: manifest.contentHash, browser: browser.version() });
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ evidence: out, cases: result.cases.length, failures: result.failures, errors }));
  assert.deepEqual(errors, [], 'browser errors');
  assert.deepEqual(result.failures, [], 'Crab Tank browser regressions');
} finally {
  clearTimeout(watchdog); await browser?.close(); await new Promise(resolve => server.close(resolve));
}
