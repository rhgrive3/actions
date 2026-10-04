// Issue #460: visible Super Jump arrival countdown gauge (presentation layer).
//
// Splatoon 3 shows a landing marker whose arrow gauge drains as the jumper
// approaches, with the jumper's name above it. INKWAVE's native `fx.ring()`
// only reads radius/life/style/alpha/thickness — it silently ignores the
// `marker` payload a data-only pass stored — and the native `fx.jumpMarker`
// reticle never visualises arrival progress or jumper identity. This module
// turns the existing pure snapshots (issue-460-marker.mjs) into actual scene
// output at the committed destination:
//
//   * a ground track ring plus a progress arc whose fragment shader discards
//     every pixel beyond the remaining countdown (real geometry + GPU-level
//     progress, no per-frame geometry rebuild);
//   * a camera-facing label sprite (canvas texture) carrying jumper name and
//     countdown seconds, depth-tested so it never shows through walls;
//   * lifecycle bound to the same anchors as the native marker: armed only
//     while a live flight snapshot exists, detached on arrival, cancel,
//     splat and respawn/reset.
//
// Stealth/concealment: a `concealed` snapshot collapses the whole gauge
// (no arc sweep, no label, group hidden) while the gauge object stays bound
// for reuse, so hidden jumpers never leak a destination cue.
//
// Presentation-only: no gameplay, timing, protocol, collision, paint or
// damage state is read or written here. THREE is injected by the caller
// (actor.js and netmatch.js both import it), so this file carries no bare
// 'three' specifier and runs under plain `node --test`.
export const ARRIVAL_GAUGE_NAME = 'issue460-arrival-gauge';

const clamp01 = (x) => {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

const ARC_VERT = /* glsl */`
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Countdown arc: fragments past uProgress (measured clockwise from 12
// o'clock) are discarded, so the visible sweep *is* the remaining arrival
// countdown and drains to nothing exactly at progress = 1.
const ARC_FRAG = /* glsl */`
precision mediump float;
uniform float uProgress;   // remaining countdown 0..1 (drains as landing nears)
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vLocal;
void main() {
  float ang = atan(vLocal.x, vLocal.y);   // 0 at 12 o'clock, +PI/2 at 3 o'clock
  float t = ang < 0.0 ? (ang + 6.28318530718) / 6.28318530718 : ang / 6.28318530718;
  if (t > uProgress) discard;             // pixel gated by the countdown
  gl_FragColor = vec4(uColor, uAlpha);
}`;

// Builds one gauge (track ring + progress arc + optional label sprite).
// `doc` is injectable for tests; browser callers get the real document.
export function createArrivalGauge(opts = {}) {
  const THREE = opts.THREE;
  if (!THREE) throw new Error('INKWAVE issue-460 gauge: THREE namespace required');
  const doc = opts.doc !== undefined ? opts.doc : (typeof document !== 'undefined' ? document : null);


  const group = new THREE.Group();
  group.name = ARRIVAL_GAUGE_NAME;
  group.userData.issue460Gauge = true;

  const ringGeo = new THREE.RingGeometry(1.16, 1.4, 64);
  const trackMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.22,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const track = new THREE.Mesh(ringGeo, trackMat);
  track.userData.issue460Track = true;
  track.rotation.x = -Math.PI / 2;

  const arcMat = new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 1 }, uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0.95 } },
    vertexShader: ARC_VERT,
    fragmentShader: ARC_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const arc = new THREE.Mesh(ringGeo, arcMat);   // shared geometry: one allocation
  arc.userData.issue460Arc = true;
  arc.rotation.x = -Math.PI / 2;

  group.add(track, arc);

  // name + countdown label (canvas texture on a sprite, depth-tested so the
  // destination identity cannot leak through walls)
  let canvas = null, ctx = null, texture = null, label = null;
  if (doc && typeof doc.createElement === 'function') {
    canvas = doc.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (ctx) {
      texture = new THREE.CanvasTexture(canvas);
      label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      label.userData.issue460Label = true;
      label.position.set(0, 0.9, 0);
      label.scale.set(1.6, 0.4, 1);
      group.add(label);
    }
  }

  const gauge = {
    group, track, arc, label, texture,
    labelText: '',      // name + countdown seconds currently drawn (or '')
    countdown: 1,       // uProgress mirror, 0..1
    _canvas: canvas, _ctx: ctx,
    update(snapshot, color) { return updateGauge(gauge, snapshot, color); },
    clear() { clearGauge(gauge); },
    dispose() { disposeGauge(gauge); },
  };
  group.visible = false;   // inert until the first live snapshot
  return gauge;
}

function setText(gauge, text) {
  gauge.labelText = text;
  const ctx = gauge._ctx;
  if (!ctx) return;
  const c = gauge._canvas;
  ctx.clearRect(0, 0, c.width, c.height);
  if (text) {
    ctx.fillStyle = 'rgba(10, 12, 16, 0.72)';
    ctx.fillRect(6, 12, 244, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
  }
  if (gauge.texture) gauge.texture.needsUpdate = true;
}

// Applies one presentation snapshot. Returns true while visible, false when
// cleared/concealed. Never touches gameplay state.
function updateGauge(gauge, snapshot, color) {
  if (!snapshot || typeof snapshot !== 'object') { clearGauge(gauge); return false; }
  const concealed = snapshot.concealed === true;
  const p = clamp01(snapshot.progress);
  const countdown = concealed
    ? 0
    : clamp01(snapshot.countdown !== undefined ? snapshot.countdown : 1 - p);
  gauge.countdown = countdown;
  gauge.arc.material.uniforms.uProgress.value = countdown;
  if (color !== undefined && color !== null) {
    gauge.arc.material.uniforms.uColor.value.set(color);
    gauge.track.material.color.set(color);
  }
  if (concealed) {
    // stealth: no arc, no name, no track — the destination must not leak,
    // but the gauge handle stays bound so the lifecycle can still clear it.
    gauge.group.visible = false;
    setText(gauge, '');
    return false;
  }
  gauge.group.visible = true;
  const secs = Math.max(0, Number(snapshot.remaining) || 0).toFixed(1);
  const name = String(snapshot.label ?? '');
  setText(gauge, name ? `${name} · ${secs}s` : `${secs}s`);
  return true;
}


function clearGauge(gauge) {
  gauge.countdown = 0;
  gauge.arc.material.uniforms.uProgress.value = 0;
  gauge.group.visible = false;
  setText(gauge, '');
}

function disposeGauge(gauge) {
  clearGauge(gauge);
  if (gauge.group.parent) gauge.group.parent.remove(gauge.group);
  gauge.track.geometry.dispose();
  gauge.track.material.dispose();
  gauge.arc.material.dispose();
  if (gauge.texture) gauge.texture.dispose();
  if (gauge.label) gauge.label.material.dispose();
}

// owner key -> gauge, one gauge per jumper, reused across jumps.
const GAUGES = new WeakMap();

// Renders (or re-renders) the arrival gauge for `owner` inside flight at the
// committed destination `dest`. `snapshot` null/absent => clear + detach.
// Called every frame from the native flight branches (owner actor.js and
// remote netmatch.js) with the existing flight duration/event data only.
export function renderJumpGauge460(G, owner, snapshot, dest, color, THREE) {
  if (!owner || !dest) return null;
  if (!snapshot) { clearJumpGauge460(owner); return null; }
  const scene = G && G.scene;
  if (!scene) return null;
  let gauge = GAUGES.get(owner);
  if (!gauge) {
    if (!THREE) return null;
    gauge = createArrivalGauge({ THREE });
    GAUGES.set(owner, gauge);
  }
  if (gauge.group.parent !== scene) scene.add(gauge.group);
  gauge.group.position.set(dest.x, dest.y + 0.05, dest.z);   // same lift as the native pulse ring
  gauge.update(snapshot, color);
  return gauge;
}

// Lifecycle: arrival, cancel, splat, reset/respawn. Detaches the gauge from
// the scene and collapses every cue. Repeats are no-ops; true iff attached.
export function clearJumpGauge460(owner) {
  const gauge = owner && GAUGES.get(owner);
  if (!gauge) return false;
  const attached = !!gauge.group.parent;
  clearGauge(gauge);
  if (gauge.group.parent) gauge.group.parent.remove(gauge.group);
  return attached;
}

// Acceptance probe: returns the visible gauge group in `scene`, or null.
// Requires real arc geometry (non-empty position attribute), a live
// uProgress uniform and a visible group — stored marker data or a legacy
// unnamed pulse-ring mesh can never satisfy it (negative baseline control).
export function findArrivalGauge(scene) {
  if (!scene || typeof scene.traverse !== 'function') return null;
  let hit = null;
  scene.traverse((o) => {
    if (hit || o.name !== ARRIVAL_GAUGE_NAME || !o.visible) return;
    const arc = o.children.find((c) => c.userData && c.userData.issue460Arc);
    if (!arc || !arc.visible) return;
    const pos = arc.geometry && arc.geometry.getAttribute && arc.geometry.getAttribute('position');
    if (!pos || pos.count < 3) return;
    const u = arc.material && arc.material.uniforms;
    if (!u || !u.uProgress || !Number.isFinite(u.uProgress.value)) return;
    hit = o;
  });
  return hit;
}

