// S3 Blaster per-shot mechanism part channels (#915), model half. Adds the two
// moving parts S3 actuates on every shot — the left-side lever and the centre
// spring's front section — to the built Blaster def, so character.js
// instantiates them like every other procedural part (same
// position/normal/color/aMat attribute contract; merged into the at-rest body
// for the far LOD). Only the adapted character-weapons.js builder imports this
// module; the event-owned animation lives in weapon-detail-motion.mjs on top of
// the pure calibration in blaster-mechanism.mjs. Gameplay is read/written
// nowhere here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { superEllipsoid, lathe, finalize, torus } from '../../../src/game/character-geo.js';
import { WMAT } from '../../../src/game/character-mats.js';

const CREAM = '#f2ede1', METAL = '#c3c9d2';

// Same vertex contract as character-weapons.js' Parts.add so finishParts can
// merge these chunks into the complete at-rest body without any special case.
function chunk(list, geo, color, mat) {
  const g = geo.index ? geo : finalize(geo);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position.clone());
  out.setAttribute('normal', g.attributes.normal.clone());
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(n).fill(mat), 1));
  out.setIndex(g.index.clone());
  list.push(out);
  return out;
}

const merge = list => (list.length > 1 ? mergeGeometries(list, false) : list[0]);

// Left side of the weapon (+X; weapon space is character's right = -X), just
// behind the side vents where the body is narrow: a hinged paddle that pulls
// downward. Pivot = hinge so the part Group rotates about the mount.
const LEVER_PIVOT = new THREE.Vector3(0.058, 0.112, -0.008);
function buildLever() {
  const list = [];
  const arm = superEllipsoid(0.019, 0.0055, 0.007, 0.5, 0.6, 8, 6); // spans x .058..0.096
  arm.translate(0.077, 0.112, -0.008);
  chunk(list, arm, METAL, WMAT.metal);
  const boss = torus(0.0075, 0.0026, 5, 12); // hinge boss around the forward axis
  boss.translate(0.058, 0.112, -0.008);
  chunk(list, boss, METAL, WMAT.metal);
  return merge(list);
}

// Centre spring's front section: a collar band around the barrel between the
// rear fins (z 0.249) and the muzzle lip (z 0.335). Inner wall stays inside the
// bell flare, so the +forward thrust never opens a see-through gap.
const FRONT_PIVOT = new THREE.Vector3(0, 0.092, 0.275);
function buildFront() {
  const list = [];
  const collar = lathe([[0.048, 0.252], [0.0615, 0.252], [0.0755, 0.298], [0.0625, 0.298], [0.048, 0.252]], 18);
  collar.rotateX(Math.PI / 2); // lathe axis +Y → barrel axis +Z
  chunk(list, collar, CREAM, WMAT.gloss);
  return merge(list);
}

/** Wrap the built Blaster def with the two S3 mechanism part channels. */
export function blasterMechanism(d) {
  d.parts = {
    ...(d.parts || {}),
    lever: { src: buildLever(), pivot: LEVER_PIVOT.clone(), mat: 'body' },
    front: { src: buildFront(), pivot: FRONT_PIVOT.clone(), mat: 'body' },
  };
  return d;
}
