// Squid Spawn presentation (Turf War): the floating spawner each player waits
// on, the squid-shaped landing arrow and the launch prompt. Presentation only:
// the aim target, launch, flight, armor and network state stay owned by
// respawn-lifecycle.mjs; nothing here writes gameplay state.
//
// Sources (Splatoon 3, read 2026-10-18): Inkipedia "Spawner" / "Squid Spawn" —
// each player has their own hovering spawner styled as an espresso machine; "a
// squid shaped arrow symbol is placed on the ground to show where the player
// will land", teammates' arrows are shown too; ZR launches; the spawner
// disappears a few seconds after the launch. Official first-preview images
// (S3_first_twitter_preview_-_spawner(s).jpg) show the chrome box with a
// pressure gauge, a portafilter handle and rail legs, the player standing on
// its top. All sizes, colours and timings below are INKWAVE calibration read
// from those images by eye, not extracted Nintendo values.
const INSTALLED = Symbol.for('inkwave.s3.squid-spawn-presentation.v1');
export const SPAWNER_LOOK = Object.freeze({
  width: 0.78, depth: 0.7, height: 0.62, vanishAfter: 1.6, vanishTime: 0.35,
  markerRadius: 0.75, markerLift: 0.04,
  aimPitch: -0.45, // radians, the follow camera's initial downward look on the spawner (INKWAVE)
  trailRadius: 0.35, trailTurns: 14,
});
const PROMPT = {
  ja: { kbm: 'クリックでとびだす', pad: 'ZRでとびだす', touch: '発射ボタンでとびだす' },
  en: { kbm: 'Click to launch', pad: 'ZR to launch', touch: 'Tap FIRE to launch' },
};
export function squidSpawnPrompt(lang, mode) {
  const table = PROMPT[lang === 'en' ? 'en' : 'ja'];
  return table[mode] || table.kbm;
}

function buildSpawnerGeometry(THREE) {
  const W = SPAWNER_LOOK.width, D = SPAWNER_LOOK.depth, H = SPAWNER_LOOK.height;
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const cyl = (r0, r1, h, x, y, z, rx = 0, rz = 0, seg = 18) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg);
    if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz);
    return g.translate(x, y, z);
  };
  // Top surface at y = 0 (the player's feet); the machine hangs below.
  const chrome = [
    box(W, H * 0.62, D, 0, -H * 0.31 - 0.04, 0),            // main body
    box(W * 1.04, 0.05, D * 1.04, 0, -0.025, 0),              // top plate
    box(W * 0.9, H * 0.22, D * 0.86, 0, -H * 0.8, 0),         // lower group head
  ];
  const dark = [
    box(W * 0.5, 0.012, D * 0.5, 0, 0.004, 0),                 // standing pad
    cyl(0.07, 0.07, 0.03, 0, -H * 0.36, D / 2 + 0.01, Math.PI / 2),   // gauge rim
    cyl(0.03, 0.03, 0.2, W * 0.26, -H * 0.82, D * 0.43 + 0.08, Math.PI / 2 - 0.25), // portafilter arm
  ];
  const rails = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    rails.push(cyl(0.014, 0.014, H * 0.55, sx * W * 0.52, -H * 0.72, sz * D * 0.52));
    rails.push(cyl(0.014, 0.014, 0.18, sx * W * 0.6, -H * 0.98, sz * D * 0.52, 0, sx * 0.9));
  }
  const gauge = cyl(0.058, 0.058, 0.012, 0, -H * 0.36, D / 2 + 0.027, Math.PI / 2);
  const tip = cyl(0.045, 0.04, 0.09, W * 0.26, -H * 0.86, D * 0.43 + 0.19, Math.PI / 2 - 0.25);
  const merge = list => {
    const out = new THREE.BufferGeometry();
    const parts = list.map(g => g.index ? g.toNonIndexed() : g);
    const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return out;
  };
  return { chrome: merge(chrome), dark: merge(dark), rails: merge(rails), gauge, tip };
}

// Squid-shaped arrow lying on the ground: a pointed mantle with two fins,
// tapering to the tip that marks the landing point (local +Z is "ahead").
function buildMarkerGeometry(THREE) {
  const r = SPAWNER_LOOK.markerRadius, s = new THREE.Shape();
  s.moveTo(0, r * 1.15);
  s.lineTo(r * 0.36, r * 0.55); s.lineTo(r * 0.78, r * 0.32); s.lineTo(r * 0.36, r * 0.16);
  s.lineTo(r * 0.3, -r * 0.55); s.lineTo(0, -r * 0.82); s.lineTo(-r * 0.3, -r * 0.55);
  s.lineTo(-r * 0.36, r * 0.16); s.lineTo(-r * 0.78, r * 0.32); s.lineTo(-r * 0.36, r * 0.55);
  s.lineTo(0, r * 1.15);
  const fill = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  const rim = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2).scale(1.18, 1, 1.18).translate(0, -0.002, 0);
  return { fill, rim };
}

export function installSquidSpawnPresentation({ Actor, THREE, G, LANG, TXT }) {
  if (!Actor || !THREE || !G) throw new Error('Squid Spawn presentation requires the native Actor and THREE');
  const A = Actor.prototype;
  if (Object.hasOwn(A, INSTALLED)) return;
  Object.defineProperty(A, INSTALLED, { value: true });
  let geo = null, marks = null, root = null, prompt = null, promptText = '';
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.35, roughness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3d43, metalness: 0.2, roughness: 0.55 });
  const gaugeMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ea, roughness: 0.4 });
  const teamMats = new Map(), markerMats = new Map();
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
  const records = new Map(), trailAt = new THREE.Vector3();
  const teamColor = team => G.teamColors?.[team] || new THREE.Color(0xffffff);
  const teamMat = team => {
    let m = teamMats.get(team);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }); teamMats.set(team, m); }
    m.color.copy(teamColor(team));
    return m;
  };
  const markerMat = team => {
    let m = markerMats.get(team);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false }); markerMats.set(team, m); }
    m.color.copy(teamColor(team));
    return m;
  };
  const ensureRoot = () => {
    if (!G.scene) return null;
    if (!root) { root = new THREE.Group(); root.name = 's3SquidSpawn'; }
    if (root.parent !== G.scene) G.scene.add(root);
    return root;
  };
  const make = actor => {
    geo ||= buildSpawnerGeometry(THREE); marks ||= buildMarkerGeometry(THREE);
    const pod = new THREE.Group(); pod.name = 's3Spawner';
    for (const [g, m] of [[geo.chrome, chromeMat], [geo.dark, darkMat], [geo.rails, chromeMat], [geo.gauge, gaugeMat], [geo.tip, teamMat(actor.team)]]) {
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; pod.add(mesh);
    }
    const marker = new THREE.Group(); marker.name = 's3SquidSpawnMarker';
    const rim = new THREE.Mesh(marks.rim, rimMat), fill = new THREE.Mesh(marks.fill, markerMat(actor.team));
    rim.renderOrder = 2; fill.renderOrder = 3; marker.add(rim, fill);
    const rec = { pod, marker, launchedAt: -1, phase: null };
    ensureRoot()?.add(pod, marker);
    records.set(actor, rec);
    return rec;
  };
  const drop = (actor, rec) => { rec.pod.removeFromParent(); rec.marker.removeFromParent(); records.delete(actor); };
  const showPrompt = text => {
    const doc = globalThis.document;
    if (!doc?.body) return;
    if (!prompt) {
      if (!text) return;
      prompt = doc.createElement('div'); prompt.id = 's3-squid-spawn-prompt'; prompt.setAttribute('role', 'status');
      Object.assign(prompt.style, { position: 'fixed', left: '50%', top: '17%', transform: 'translateX(-50%)', zIndex: '6',
        pointerEvents: 'none', font: '800 clamp(16px,2.6vw,26px)/1.2 system-ui,sans-serif', color: '#fff',
        textShadow: '0 2px 0 #000,0 0 6px #000', padding: '.35em .9em', borderRadius: '999px', background: 'rgba(0,0,0,.35)' });
      doc.body.appendChild(prompt);
    }
    if (text !== promptText) { promptText = text; prompt.textContent = text; prompt.style.display = text ? '' : 'none'; }
  };
  const sync = (actor, dt) => {
    const s = actor.s3?.squidSpawn;
    let rec = records.get(actor);
    const local = G.local || G.actors?.find(a => a.isLocal);
    if (actor === local) {
      // Sweep records of actors that left the match (or a previous match).
      for (const [a, r] of records) if (!G.actors?.includes(a)) drop(a, r);
      const aiming = !!s && s.phase === 'aim' && actor.alive && G.match?.state === 'playing';
      showPrompt(aiming ? squidSpawnPrompt(LANG, TXT?.mode) : '');
    }
    if (!s && !rec) return;
    if (s && !rec) rec = make(actor);
    const parent = ensureRoot();
    if (parent && rec.pod.parent !== parent) parent.add(rec.pod, rec.marker);
    const time = Number.isFinite(G.time) ? G.time : 0;
    if (s?.phase === 'aim') {
      // Waiting: the spawner sits under the player's feet; a fresh wait resets it.
      // The local follow camera starts each wait looking down at the stage, so
      // the landing arrow ahead is not hidden behind the player standing on top.
      const rig = G.rig;
      if (actor === local && rec.camWait !== s && rig?.mode === 'follow' && rig.target === actor && Number.isFinite(rig.pitch)) {
        rec.camWait = s; rig.pitch = Math.min(rig.pitch, SPAWNER_LOOK.aimPitch);
      }
      rec.launchedAt = -1; rec.pod.visible = true; rec.pod.scale.setScalar(1);
      rec.pod.position.copy(actor.pos); rec.pod.rotation.y = actor.team === 0 ? 0 : Math.PI;
    } else if (rec.launchedAt < 0 && (s?.phase === 'flight' || s?.phase === 'landing' || !s)) rec.launchedAt = time;
    if (rec.launchedAt >= 0) {
      // Left behind, then gone "a few seconds" later (shrinks away).
      const k = (time - rec.launchedAt - SPAWNER_LOOK.vanishAfter) / SPAWNER_LOOK.vanishTime;
      rec.pod.visible = k < 1;
      rec.pod.scale.setScalar(Math.max(0.001, 1 - Math.max(0, Math.min(1, k))));
    }
    // Landing arrow: own and teammates' while aiming and flying.
    const target = s?.phase === 'aim' ? s.target : (s?.phase === 'flight' || s?.phase === 'landing') ? s.to : null;
    const friendly = !local || local.team === actor.team;
    rec.marker.visible = !!target && friendly && actor.alive !== false;
    if (rec.marker.visible) {
      const origin = s.from || actor.pos;
      rec.marker.position.set(target.x, target.y + SPAWNER_LOOK.markerLift, target.z);
      rec.marker.rotation.y = Math.atan2(target.x - origin.x, target.z - origin.z);
      rec.marker.scale.setScalar(1 + 0.08 * Math.sin(time * 7));
    }
    // Ejected squid trails ink: two strands winding round the flight path
    // (official preview art); the native Super Jump trail particles are reused.
    if (s?.phase === 'flight' && actor.form === 'squid' && G.fx?.superJumpTrail && actor.character?.root?.visible !== false) {
      if (!rec.launchFx) { rec.launchFx = true; G.fx.superJumpLaunch?.(actor.pos, actor.color); }
      const v = actor.vel, speed = Math.hypot(v.x, v.y, v.z);
      if (speed > 1e-3) {
        const fx = v.x / speed, fy = v.y / speed, fz = v.z / speed;
        let ux = -fz, uz = fx; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;   // across the path
        const wx = fy * uz, wy = fz * ux - fx * uz, wz = -fy * ux;                         // the path's second normal
        for (const side of [0, Math.PI]) {
          const a = time * SPAWNER_LOOK.trailTurns + side, c = Math.cos(a) * SPAWNER_LOOK.trailRadius, d = Math.sin(a) * SPAWNER_LOOK.trailRadius;
          trailAt.set(actor.pos.x + ux * c + wx * d, actor.pos.y + 0.25 + wy * d, actor.pos.z + uz * c + wz * d);
          G.fx.superJumpTrail(trailAt, v, actor.color);
        }
      }
    } else if (s?.phase !== 'flight') rec.launchFx = false;
    if (!s && !rec.pod.visible) drop(actor, rec);
  };
  const update = A.update;
  A.update = function (dt) {
    const result = update.call(this, dt);
    try { sync(this, dt); } catch (error) { console.warn('[INKWAVE squid spawn presentation]', error); }
    return result;
  };
}
