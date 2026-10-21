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

// Original, texture-free geometry calibrated against the official 2021 trailer
// front/rear views and the S3 locker decoration icon. See the comparison report.
// Five shared batches per pod; no geometries or materials are allocated by sync.
export function buildSpawnerGeometry(THREE) {
  const W = SPAWNER_LOOK.width, D = SPAWNER_LOOK.depth, H = SPAWNER_LOOK.height;
  const buckets = { chrome: [], dark: [], rails: [], gauge: [], tip: [] };
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const put = (key, g, color = 0xffffff) => {
    // Vertex tint permits the small original red badge without a sixth draw.
    const c = new THREE.Color(color), n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); buckets[key].push(g);
  };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // A 44-triangle chamfered box. Broad flat faces and narrow bevel highlights,
  // rather than inflated rounded primitives; no external geometry dependency.
  const bevelBox = (w, h, d, r, x, y, z) => {
    const half = [w / 2, h / 2, d / 2], inner = half.map(n => n - r), pos = [];
    const face = points => {
      const center = points.reduce((c, p) => c.add(p), v(0, 0, 0)).multiplyScalar(1 / points.length);
      if (v(0, 0, 0).crossVectors(points[1].clone().sub(points[0]), points[2].clone().sub(points[0])).dot(center) < 0) points.reverse();
      for (let i = 1; i < points.length - 1; i++) for (const p of [points[0], points[i], points[i + 1]]) pos.push(p.x, p.y, p.z);
    };
    for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
      const b = (a + 1) % 3, c = (a + 2) % 3;
      face([[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,t]) => { const p = [0,0,0]; p[a]=s*half[a];p[b]=u*inner[b];p[c]=t*inner[c];return v(...p); }));
    }
    for (let a = 0; a < 3; a++) for (const s of [-1, 1]) for (const t of [-1, 1]) {
      const b = (a + 1) % 3, c = (a + 2) % 3;
      face([[-1,0],[1,0],[1,1],[-1,1]].map(([u,k]) => { const p = [0,0,0];p[a]=u*inner[a];p[b]=s*(k?inner[b]:half[b]);p[c]=t*(k?half[c]:inner[c]);return v(...p); }));
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const signs = [sx, sy, sz];
      face([0,1,2].map(a => v(...half.map((n, k) => signs[k] * (a === k ? n : inner[k])))));
    }
    const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();return g.translate(x,y,z);
  };
  const cylinder = (r0, r1, h, x, y, z, rx = 0, rz = 0, segments = 16) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, segments);
    if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz);return g.translate(x, y, z);
  };
  const rod = (start, end, radius = 0.012, segments = 8) => {
    const delta = end.clone().sub(start), g = new THREE.CylinderGeometry(radius, radius, delta.length(), segments);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), delta.normalize()));
    return g.translate(...start.clone().add(end).multiplyScalar(0.5).toArray());
  };
  // y=0 remains the standing surface. A continuous stainless rear housing wraps
  // the inset front well; the old solid second box incorrectly filled this gap.
  put('chrome', bevelBox(W, H, D * .46, .014, 0, -H/2-.018, -D*.27));
  for (const sx of [-1,1]) put('chrome', bevelBox(.037,H*.98,D*.58,.008,sx*(W/2-.0185),-H/2-.018,D*.18));
  put('chrome', bevelBox(W*1.025,.038,D*1.02,.009,0,-.019,0));
  put('chrome', bevelBox(W*.9,H*.49,.028,.008,0,-H*.275,D*.5+.002));
  put('dark', box(W*.88,H*.47,.014,0,-H*.74,-D*.025));
  // Rounded group head projects from the fascia; gauge sits low-left inside
  // the well, with a central forward/downward portafilter and team-colour end.
  put('chrome', cylinder(.155,.155,.13,0,-H*.47,D*.48,0,0,24));
  put('chrome', cylinder(.135,.105,.065,0,-H*.63,D*.48,0,0,24));
  put('rails', cylinder(.117,.117,.018,0,-H*.69,D*.48,0,0,20));
  const handleFrom = v(0,-H*.66,D*.49), handleTo = v(.015,-H*.84,D*.87);
  put('dark', rod(handleFrom,handleTo,.034,12));
  put('tip', cylinder(.044,.040,.042,handleTo.x,handleTo.y,handleTo.z,Math.PI/2-.22,0,16));
  const gaugeX = -W*.245, gaugeY = -H*.735, gaugeZ = D*.17;
  put('rails', cylinder(.064,.064,.025,gaugeX,gaugeY,gaugeZ,Math.PI/2,0,24));
  put('gauge', cylinder(.052,.052,.008,gaugeX,gaugeY,gaugeZ+.016,Math.PI/2,0,24));
  for(let i=0;i<9;i++) {
    const angle = -.78 + i*Math.PI*1.5/8;
    const tick = box(.004,.011,.002,0,.040,0).rotateZ(-angle).translate(gaugeX,gaugeY,gaugeZ+.022);
    put('dark',tick);
  }
  put('dark',box(.004,.052,.003,0,.015,0).rotateZ(-.65).translate(gaugeX,gaugeY,gaugeZ+.024));
  put('dark',cylinder(.007,.007,.003,gaugeX,gaugeY,gaugeZ+.027,Math.PI/2,0,8));
  // Steam valve and short curved-looking outlet, both visible in front views.
  put('rails',cylinder(.025,.025,.022,W*.29,-H*.57,D*.19,Math.PI/2,0,12));
  put('dark',cylinder(.017,.017,.028,W*.29,-H*.57,D*.21,Math.PI/2,0,10));
  put('rails',rod(v(W*.22,-H*.69,D*.23),v(W*.27,-H*.79,D*.29),.009));
  put('rails',rod(v(W*.27,-H*.79,D*.29),v(W*.23,-H*.82,D*.32),.009));
  // Thin projecting drip tray, dark lip and three long slots.
  put('chrome',bevelBox(W*.95,.045,D*.48,.012,0,-H*.96,D*.27));
  put('dark',bevelBox(W*.91,.021,.028,.006,0,-H*.972,D*.51));
  for(const x of [-.18,0,.18]) put('dark',bevelBox(.115,.003,.024,.001,x,-H*.923,D*.30));
  // Closed trapezoid skids, not four disconnected vertical sticks.
  for(const sx of [-1,1]) {
    const points=[v(sx*W*.36,-H*.99,-D*.30),v(sx*W*.58,-H*1.20,-D*.37),v(sx*W*.58,-H*1.20,D*.39),v(sx*W*.36,-H*.99,D*.32)];
    for(let i=0;i<points.length;i++)put('rails',rod(points[i],points[(i+1)%points.length],.013));
    // The four corner antenna/guard rails rise above the top plate and bend
    // outward into silver tips. The broad top stays clear for the player.
    for(const sz of [-1,1]) {
      const lower=v(sx*W*.54,-H*.51,sz*D*.43), elbow=v(sx*W*.54,.055,sz*D*.43), tip=v(sx*W*.62,.12,sz*D*.48);
      put('rails',rod(lower,elbow,.011));put('rails',rod(elbow,tip,.014));
      put('rails',cylinder(.023,.016,.048,tip.x,tip.y,tip.z,0,-sx*.65,10));
    }
    put('rails',rod(v(sx*W*.54,-H*.51,D*.43),v(sx*W*.40,-H*.51,D*.43),.011));
  }
  // Low lid with a concentric brewing/standing grille. These are recessed
  // graphic strips, not holes through the player's support surface.
  put('dark',bevelBox(W*.69,.006,D*.71,.002,0,.003,0));
  for(const z of [-.18,-.09,0,.09,.18])put('chrome',bevelBox(W*.62,.003,.023,.001,0,.007,z));
  put('rails',new THREE.TorusGeometry(.145,.007,4,28).rotateX(Math.PI/2).translate(0,.008,0));
  // Back access seam and original, non-Nintendo nameplate/serial markings.
  put('dark',box(W*.88,.002,.001,0,-H*.69,-D*.502));
  put('dark',box(W*.25,.08,.001,W*.26,-H*.83,-D*.503));
  for(let i=0;i<3;i++)put('gauge',box(.118,.006,.001,W*.26,-H*.80-i*.017,-D*.504));
  put('chrome',bevelBox(.19,.034,.008,.004,0,-.083,D*.525),0x9b353c);
  for(let i=0;i<5;i++)put('gauge',box(.017,.006,.002,-.06+i*.03,-.083,D*.533));
  const merge = list => {
    const out = new THREE.BufferGeometry(), parts = list.map(g => g.index ? g.toNonIndexed() : g);
    const n = parts.reduce((s,g) => s+g.attributes.position.count,0);
    for(const name of ['position','normal','color']) {
      const array = new Float32Array(n*3);let offset=0;
      for(const g of parts){array.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
      out.setAttribute(name,new THREE.BufferAttribute(array,3));
    }
    // Dispose BOTH indexed construction originals and temporary expansions.
    for(let i=0;i<parts.length;i++){parts[i].dispose();if(parts[i]!==list[i])list[i].dispose();}
    out.computeBoundingBox();out.computeBoundingSphere();return out;
  };
  return Object.fromEntries(Object.entries(buckets).map(([name,list])=>[name,merge(list)]));
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
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.62, roughness: 0.28, vertexColors: true });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xe8edf0, metalness: 0.82, roughness: 0.22, vertexColors: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x30353a, metalness: 0.25, roughness: 0.48, vertexColors: true });
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
    for (const [g, m] of [[geo.chrome, chromeMat], [geo.dark, darkMat], [geo.rails, railMat], [geo.gauge, gaugeMat], [geo.tip, teamMat(actor.team)]]) {
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
