// Practice Range — floor markings for the mural atlas (src/world/murals.js calls drawMurals when the stage loads).
// drawMurals(g, R, kit) paints into the stage region R (2048 × 1008 px) and returns the table for mural ids 4…11.
//
// Every marking is drawn in WORLD METRES through slabFrame(): the canvas transform of the slab's top face (u = −x from
// maxX, v = +z from minZ; murals.js samples v from the bottom), so a ring of radius 3 drawn here is a 3.000 m ring on the
// floor and a number drawn at z = 15 sits on the world z = 15 line. The fine metre grid itself is not a mural — it is
// the level shader's world grid (adapter.mjs) — these are the labels, rings, stands and lane lines on top of it.
// Markings sit under the ink (like any floor paint) and come back with RESET PAINT.
import {
  ZONES, FIRE_Z, GALLERY_TARGETS, GALLERY_BACKSTOP, LANE_BOARDS, BOMB_TARGET, BOMB_RINGS, BOMB_STAND, SPECIAL_CENTER, SPECIAL_RINGS,
  SPECIAL_TARGETS, DODGE_STAND, DODGE_TARGET, DODGE_RAIL, ROLL_STRIP, ROLL_STAND, FLICK_STAND, WALL_FACE_Z, WALL_STANDS, CAROUSEL,
  SPAWN_RAMP, NORTH_FACE_Z, LANE_STAND, X, SWIM,
} from './zones.mjs';
import { MURAL } from './layout.mjs';

const PI = Math.PI;
const INK = 'rgba(32,40,58,0.86)', SOFT = 'rgba(32,40,58,0.42)', WHITE = 'rgba(250,248,242,0.95)', YELLOW = 'rgba(236,190,48,0.96)';

// atlas rects (px) inside the stage region; each is one slab's top face (metres → px per axis)
const RECTS = {
  lane: { x: 2, y: 2, w: 284, h: 1004 },
  gallery: { x: 290, y: 2, w: 316, h: 694 },
  hub: { x: 610, y: 2, w: 556, h: 396 },
  special: { x: 1170, y: 2, w: 396, h: 556 },
  bomb: { x: 1570, y: 2, w: 396, h: 372 },
  roller: { x: 610, y: 402, w: 281, h: 476 },
  dualies: { x: 1170, y: 562, w: 296, h: 296 },
  squid: { x: 1570, y: 378, w: 296, h: 312 },
};
// the slab each mural covers (the gallery slab runs on under its backstop)
const SLABS = {
  lane: ZONES.lane.rect, hub: ZONES.hub.rect, special: ZONES.special.rect, bomb: ZONES.bomb.rect, roller: ZONES.roller.rect,
  dualies: ZONES.dualies.rect, squid: ZONES.squid.rect,
  gallery: [ZONES.gallery.rect[0], ZONES.gallery.rect[1], ZONES.gallery.rect[2], GALLERY_BACKSTOP.z[1]],
};

// Set g's transform so drawing in world metres (x, z) lands on the slab's face; returns px per metre (for text sizes).
function slabFrame(g, R, r, slab) {
  const [x0, x1, z0, z1] = slab;
  const sx = r.w / (x1 - x0), sz = r.h / (z1 - z0);
  // canvas x = R.x + r.x + (x1 − x)·sx ; canvas y = R.y + r.y + r.h − (z − z0)·sz
  g.setTransform(-sx, 0, 0, -sz, R.x + r.x + x1 * sx, R.y + r.y + r.h + z0 * sz);
  return [sx, sz];
}
// Text standing on the floor, readable facing north (+Z). Drawn in metres: cap height h.
function floorText(g, str, x, z, h, color, { weight = 800, align = 'center', rot = 0, family = 'Rubik' } = {}) {
  g.save();
  g.translate(x, z);
  g.scale(-1, -1);              // undo the slab frame's mirror so glyphs read upright for a north-facing player
  if (rot) g.rotate(rot);
  const px = 100;
  g.scale(h / px, h / px);
  g.font = `${weight} ${Math.round(px * 1.38)}px ${family}, "Arial Black", sans-serif`;
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  const w = g.measureText(str).width;
  g.fillText(str, align === 'center' ? -w / 2 : align === 'right' ? -w : 0, px / 2);
  g.restore();
}
const line = (g, x0, z0, x1, z1, w, color, dash = null) => {
  g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'butt';
  if (dash) g.setLineDash(dash);
  g.beginPath(); g.moveTo(x0, z0); g.lineTo(x1, z1); g.stroke(); g.restore();
};
const ring = (g, cx, cz, r, w, color, dash = null) => {
  g.save(); g.strokeStyle = color; g.lineWidth = w; if (dash) g.setLineDash(dash);
  g.beginPath(); g.arc(cx, cz, r, 0, PI * 2); g.stroke(); g.restore();
};
const disc = (g, cx, cz, r, color) => { g.fillStyle = color; g.beginPath(); g.arc(cx, cz, r, 0, PI * 2); g.fill(); };
// stand mark: a footprint plate with an arrow pointing to `yaw` (0 = north)
function stand(g, x, z, yaw = 0, color = INK, size = 0.55) {
  g.save(); g.translate(x, z); g.rotate(-yaw);
  g.fillStyle = color;
  g.beginPath(); g.roundRect ? g.roundRect(-size, -size, size * 2, size * 2, size * 0.25) : g.rect(-size, -size, size * 2, size * 2); g.fill();
  g.fillStyle = WHITE;
  g.beginPath(); g.moveTo(0, size * 0.72); g.lineTo(size * 0.5, 0); g.lineTo(size * 0.2, 0); g.lineTo(size * 0.2, -size * 0.6);
  g.lineTo(-size * 0.2, -size * 0.6); g.lineTo(-size * 0.2, 0); g.lineTo(-size * 0.5, 0); g.closePath(); g.fill();
  g.restore();
}
function chevron(g, x, z, yaw, s, color) {
  g.save(); g.translate(x, z); g.rotate(-yaw); g.fillStyle = color;
  g.beginPath(); g.moveTo(-s, -s * 0.5); g.lineTo(0, s * 0.5); g.lineTo(s, -s * 0.5); g.lineTo(s, -s * 0.05); g.lineTo(0, s * 0.95); g.lineTo(-s, -s * 0.05); g.closePath(); g.fill();
  g.restore();
}

function drawLane(g) {
  // lane edges + the 50 m centre line (dashed every metre: half on, half off — itself a ruler)
  line(g, 0.12, 0, 0.12, NORTH_FACE_Z, 0.08, SOFT);
  line(g, 11.88, 0, 11.88, NORTH_FACE_Z, 0.08, SOFT);
  line(g, LANE_STAND[0], 0, LANE_STAND[0], NORTH_FACE_Z, 0.06, SOFT, [0.5, 0.5]);
  for (const z of LANE_BOARDS) {
    if (z >= NORTH_FACE_Z) continue;
    floorText(g, String(z), 8.6, z + 0.25 + 1.1, 2.2, INK, { align: 'center' });
    floorText(g, 'm', 8.6 - (String(z).length * 0.78 + 0.55), z + 0.25 + 0.45, 0.9, INK, { align: 'center' });   // to its right (−X)
    floorText(g, String(z), 2.6, z + 0.25 + 0.55, 1.1, SOFT, { align: 'center' });
  }
}
function drawGallery(g) {
  for (const t of GALLERY_TARGETS) {
    // the column: a dashed guide from the stand mark on the firing line to the target's plinth
    line(g, t.x, FIRE_Z + 1.4, t.x, t.z - 1.6, 0.07, SOFT, [0.45, 0.55]);
    floorText(g, `${t.z} m`, t.x, t.z - 1.25, 0.62, INK);
    ring(g, t.x, t.z, 0.85, 0.06, INK);
  }
  for (const z of LANE_BOARDS) if (z < GALLERY_BACKSTOP.z[0]) floorText(g, String(z), -15.0, z + 0.25 + 0.5, 1.0, SOFT);
}
function drawHub(g) {
  // the firing line: a bold white line exactly on z = 0 with a yellow/charcoal band behind it (z −0.5 … 0)
  g.fillStyle = YELLOW; g.fillRect(-16, -0.55, 28, 0.42);
  g.save(); g.beginPath(); g.rect(-16, -0.55, 28, 0.42); g.clip();
  g.fillStyle = 'rgba(36,40,52,0.92)';
  for (let x = -16; x < 12; x += 0.8) { g.beginPath(); g.moveTo(x, -0.55); g.lineTo(x + 0.4, -0.55); g.lineTo(x + 0.82, -0.13); g.lineTo(x + 0.42, -0.13); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = WHITE; g.fillRect(-16, -0.13, 28, 0.13);
  floorText(g, 'FIRING LINE · 0 m', -2.2, -1.35, 0.55, INK);
  // stand marks behind the line: one for the long lane, one per gallery column (each target dead ahead)
  stand(g, LANE_STAND[0], -1.0, 0, '#3f6f9a');
  for (const t of GALLERY_TARGETS) { stand(g, t.x, -1.0, 0, '#b5523f', 0.42); floorText(g, String(t.z), t.x, -1.9, 0.45, INK); }
  // lane call-outs just behind the line + the facility name across the walkway
  for (const [x, letter, c] of [[6, 'A', 'rgba(63,111,154,0.9)'], [-8, 'B', 'rgba(181,82,63,0.9)']]) {
    floorText(g, letter, x + 0.55, -3.4, 1.2, c);
    g.fillStyle = c; g.beginPath(); g.moveTo(x - 0.75, -2.55); g.lineTo(x - 1.3, -3.5); g.lineTo(x - 0.2, -3.5); g.closePath(); g.fill();
  }
  floorText(g, 'PRACTICE RANGE', 0.5, -5.9, 0.9, SOFT);
  // weapon carousel ring + console box
  ring(g, CAROUSEL.center[0], CAROUSEL.center[1], CAROUSEL.r + 1.35, 0.1, SOFT);
  ring(g, CAROUSEL.center[0], CAROUSEL.center[1], CAROUSEL.r + 1.6, 0.04, SOFT);
  floorText(g, 'WEAPONS', CAROUSEL.center[0], CAROUSEL.center[1] - CAROUSEL.r - 2.2, 0.7, INK);
  g.save(); g.strokeStyle = SOFT; g.lineWidth = 0.08; g.setLineDash([0.4, 0.3]); g.strokeRect(3.9, -13.3, 6.8, 6.8); g.restore();
  floorText(g, 'CONTROL', 7.3, -14.1, 0.6, INK);
  // way-finding chevrons toward the side openings
  for (let i = 0; i < 3; i++) chevron(g, 10.2 + i * 0.7, -11, PI / 2, 0.32, SOFT);   // → paint test (+X)
  for (let i = 0; i < 3; i++) chevron(g, -14.2 - i * 0.7, -7, -PI / 2, 0.32, SOFT);   // → swim course (−X)
  // ramp foot
  line(g, SPAWN_RAMP.x - SPAWN_RAMP.w / 2, SPAWN_RAMP.zLow - 0.25, SPAWN_RAMP.x + SPAWN_RAMP.w / 2, SPAWN_RAMP.zLow - 0.25, 0.06, SOFT);
}
function drawSpecial(g) {
  const [cx, cz] = SPECIAL_CENTER;
  for (const r of SPECIAL_RINGS) ring(g, cx, cz, r, r % 4 === 0 ? 0.1 : 0.07, r % 4 === 0 ? INK : SOFT);
  line(g, cx - 10.5, cz, cx + 10.5, cz, 0.04, SOFT); line(g, cx, cz - 10.5, cx, cz + 10.5, 0.04, SOFT);
  for (const r of SPECIAL_RINGS) floorText(g, `${r} m`, cx + 0.15, cz + r + 0.1, 0.5, INK, { align: 'left' });
  disc(g, cx, cz, 0.35, INK);
  for (const t of SPECIAL_TARGETS) { ring(g, t.x, t.z, 0.85, 0.06, INK); floorText(g, `r ${Math.round(t.r * 10) / 10} m`, t.x, t.z - 1.3, 0.48, INK); }
}
function drawBomb(g) {
  const [cx, cz] = BOMB_TARGET;
  for (const r of BOMB_RINGS) ring(g, cx, cz, r, r % 2 ? 0.05 : 0.08, r % 2 ? SOFT : INK);
  disc(g, cx, cz, 0.22, INK);
  for (const r of BOMB_RINGS) floorText(g, `${r}`, cx - r - 0.05, cz + 0.1, 0.42, INK, { align: 'right' });
  floorText(g, 'm', cx - BOMB_RINGS[BOMB_RINGS.length - 1] - 0.62, cz + 0.62, 0.42, INK, { align: 'right' });
  stand(g, BOMB_STAND[0], BOMB_STAND[1], 0, '#a9822a');
  floorText(g, `${Math.round(Math.hypot(cx - BOMB_STAND[0], cz - BOMB_STAND[1]) * 10) / 10} m`, BOMB_STAND[0] + 1.2, BOMB_STAND[1] - 0.2, 0.42, INK, { align: 'left' });
}
function drawRoller(g) {
  const [x0, x1] = ROLL_STRIP.x, [z0, z1] = ROLL_STRIP.z;
  line(g, x0, z0, x0, z1, 0.08, INK); line(g, x1, z0, x1, z1, 0.08, INK);
  g.fillStyle = INK; g.fillRect(x0, z0 - 0.08, x1 - x0, 0.16); g.fillRect(x0, z1 - 0.08, x1 - x0, 0.16);
  for (let d = 5; d < z1 - z0; d += 5) floorText(g, `${d}`, x1 - 0.3, z0 + d + 0.4, 0.55, SOFT, { align: 'right' });
  floorText(g, `${z1 - z0} m`, (x0 + x1) / 2, z1 + 0.5, 0.6, INK);
  floorText(g, 'ROLL', (x0 + x1) / 2, z0 - 1.0, 0.6, INK);
  stand(g, ROLL_STAND[0], ROLL_STAND[1] - 1.2, 0, '#6e5fb6', 0.45);
  // the S-bend: two 6 m-radius arcs (curve practice) + a 90° corner on the open court
  g.save(); g.strokeStyle = SOFT; g.lineWidth = 0.6; g.lineCap = 'round';
  g.beginPath(); g.arc(-29, 14, 5, -PI / 2, PI / 2, false); g.stroke();
  g.beginPath(); g.arc(-29, 24, 5, PI * 1.5, PI / 2, true); g.stroke();
  g.lineWidth = 0.08; g.strokeStyle = INK; g.setLineDash([0.3, 0.3]);
  g.beginPath(); g.arc(-29, 14, 5, -PI / 2, PI / 2, false); g.stroke();
  g.beginPath(); g.arc(-29, 24, 5, PI * 1.5, PI / 2, true); g.stroke();
  g.restore();
  stand(g, FLICK_STAND[0], FLICK_STAND[1] - 1.2, 0, '#6e5fb6', 0.45);
  floorText(g, 'FLICK', FLICK_STAND[0], FLICK_STAND[1] - 2.3, 0.5, INK);
}
function drawDualies(g) {
  const [cx, cz] = DODGE_STAND;
  for (let r = 1; r <= 4; r++) ring(g, cx, cz, r, r === 4 ? 0.07 : 0.04, r % 2 ? SOFT : INK);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2; line(g, cx + Math.sin(a) * 0.6, cz + Math.cos(a) * 0.6, cx + Math.sin(a) * 4.4, cz + Math.cos(a) * 4.4, 0.05, SOFT); }
  stand(g, cx, cz, 0, '#3d8a63', 0.45);
  for (let r = 1; r <= 4; r++) floorText(g, `${r}`, cx + r + 0.08, cz + 0.12, 0.32, INK, { align: 'left' });
  ring(g, DODGE_TARGET.x, DODGE_TARGET.z, 0.85, 0.06, INK);
  floorText(g, `${DODGE_TARGET.z - cz} m`, DODGE_TARGET.x, DODGE_TARGET.z - 1.3, 0.48, INK);
  line(g, DODGE_RAIL.x[0], DODGE_RAIL.z, DODGE_RAIL.x[1], DODGE_RAIL.z, 0.12, INK);
  floorText(g, `RAIL ${DODGE_RAIL.z - cz} m`, DODGE_RAIL.x[1] + 0.2, DODGE_RAIL.z - 0.75, 0.42, INK, { align: 'right' });
}
function drawSquid(g) {
  const { straight, island } = SWIM;
  const cx = (straight.x[0] + straight.x[1]) / 2;
  // the speed straight: centre line + the 5 m gates' distances (the bold world lines ARE the gates: z = −20 + 5k)
  line(g, cx, straight.z[0] + 0.2, cx, straight.z[1] - 0.2, 0.06, SOFT, [0.5, 0.5]);
  for (let d = 0; d <= 20; d += 5) {
    const z = straight.z[0] + d;
    floorText(g, `${d}`, straight.x[1] - 0.25, Math.min(z + 0.25, straight.z[1] - 0.15) + (d === 20 ? -0.9 : 0.25), 0.5, INK, { align: 'right' });
  }
  floorText(g, 'm', straight.x[1] - 0.25, straight.z[0] + 1.2, 0.36, SOFT, { align: 'right' });
  // the racing line round the island (clockwise seen from above: south down the straight, north up the ramps)
  g.save(); g.strokeStyle = 'rgba(44,127,145,0.55)'; g.lineWidth = 0.14; g.setLineDash([0.9, 0.6]);
  g.beginPath();
  g.moveTo(-20, -2.0); g.lineTo(-20, -16.5);
  g.arc(-26, -16.5, 6, 0, Math.PI, true);
  g.lineTo(-32, -2.0);
  g.moveTo(-32, -1.2); g.lineTo(-23.7, -1.2); g.lineTo(-23.7, -3.3); g.lineTo(-20, -3.3); g.lineTo(-20, -2.0);
  g.stroke(); g.restore();
  for (const [x, z, yaw] of [[-20, -8, Math.PI], [-26, -18.6, -Math.PI / 2], [-32.2, -16, 0], [-28, -1.2, Math.PI / 2]]) chevron(g, x, z, yaw, 0.42, 'rgba(44,127,145,0.8)');
  floorText(g, 'WIDE TURN', -26, -14.0 - 0.6, 0.55, INK);
  floorText(g, `NARROW ${SWIM.chicane.gap} m`, -23.7, -4.6, 0.4, INK);
  floorText(g, 'SWIM', cx, straight.z[0] + 3.2, 0.9, SOFT);
  void island;
}

const DRAW = { lane: drawLane, gallery: drawGallery, hub: drawHub, special: drawSpecial, bomb: drawBomb, roller: drawRoller, dualies: drawDualies, squid: drawSquid };

export function drawMurals(g, R) {
  const out = [];
  for (const [key, r] of Object.entries(RECTS)) {
    const slab = SLABS[key];
    g.save();
    g.beginPath(); g.rect(R.x + r.x, R.y + r.y, r.w, r.h); g.clip();
    slabFrame(g, R, r, slab);
    try { DRAW[key](g); } catch (e) { console.error('[range] mural', key, e); }
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    out.push({ id: MURAL[key], x: R.x + r.x, y: R.y + r.y, w: r.w, h: r.h, place: [0, slab[1] - slab[0], 0, slab[3] - slab[2]], fx: [0.25, 0.35] });
  }
  return out;
}
