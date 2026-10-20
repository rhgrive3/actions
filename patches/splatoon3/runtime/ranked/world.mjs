import { createRankedStage } from './stages.mjs';
import { createSmallClamResources, createSmallClamInventory, updateSmallClamInventory, SMALL_CLAM_HALF_HEIGHT } from './small-clam-model.mjs';
import { createPowerClamResources } from './power-clam-model.mjs';
import { createRainmakerModel, createRainmakerPresentation } from './rainmaker-model.mjs';

const TEAM_INK_FALLBACK = [0x35c9df, 0xf35bce];
const NEUTRAL = 0x9ceff2;
const EPSILON = 1e-6;

const finite = Number.isFinite;
const validTeam = team => team === 0 || team === 1;
const vec = value => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(finite)
  ? value.slice(0, 3) : null;
const idKey = value => value === null || value === undefined ? '' : String(value);

function setVec(target, value) {
  const p = vec(value);
  if (p) target.set(p[0], p[1], p[2]);
  else if (value && finite(value.x) && finite(value.y) && finite(value.z)) target.copy(value);
  else target.set(0, 0, 0);
  return target;
}

function segmentAt(path, progress) {
  if (!Array.isArray(path) || path.length < 2) return [0, 0, 1];
  const p = Math.max(0, Math.min(1, finite(progress) ? progress : 0.5));
  let total = 0;
  const lengths = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    lengths.push(length); total += length;
  }
  let at = total * p;
  for (let i = 0; i < lengths.length; i++) {
    if (at <= lengths[i] || i === lengths.length - 1) {
      const a = path[i], b = path[i + 1];
      const dx = b[0] - a[0], dz = b[2] - a[2], d = Math.hypot(dx, dz);
      return d > EPSILON ? [dx / d, dz / d] : [0, 1];
    }
    at -= lengths[i];
  }
  return [0, 1];
}

function floorCellCenter(face, i, j, out) {
  return out.copy(face.origin)
    .addScaledVector(face.u, (i + 0.5) * face.cu)
    .addScaledVector(face.v, (j + 0.5) * face.cv)
    .addScaledVector(face.n, 0.06);
}

function updateBlockBounds(block) {
  block.aabbMin.set(Infinity, Infinity, Infinity);
  block.aabbMax.set(-Infinity, -Infinity, -Infinity);
  const corner = block._rankedCorner || (block._rankedCorner = block.center.clone());
  for (let i = 0; i < 8; i++) {
    corner.copy(block.center)
      .addScaledVector(block.axes[0], (i & 1 ? 1 : -1) * block.half.x)
      .addScaledVector(block.axes[1], (i & 2 ? 1 : -1) * block.half.y)
      .addScaledVector(block.axes[2], (i & 4 ? 1 : -1) * block.half.z);
    block.aabbMin.min(corner);
    block.aabbMax.max(corner);
  }
}

function parseState(engine) {
  return engine?.rule?.state ?? engine?.state ?? {};
}

/**
 * Live ranked presentation and stage geometry for the active INKWAVE blockout.
 * Coordinates are calibrated to the current collision layouts; none are retail
 * Splatoon collision data. Rule state remains owned by the pure rule modules.
 */
export class RankedWorld {
  constructor(api, match, stage = createRankedStage(api?.G)) {
    this.api = api || {};
    this.G = api?.G || {};
    this.THREE = api?.THREE;
    if (!this.THREE) throw new TypeError('RankedWorld requires the runtime THREE namespace');
    this.match = match || null;
    this.mode = match?.mode ?? null;
    this.stage = stage;
    this.teamInk = [0, 1].map(team => {
      const value = this.G.teamColors?.[team]?.getHex?.() ?? this.G.teamHex?.[team];
      if (typeof value === 'string') return new this.THREE.Color(value).getHex();
      return finite(value) ? value : TEAM_INK_FALLBACK[team];
    });
    this.level = this.G.level || null;
    this.physics = this.G.physics || null;
    this.paint = this.G.paint || null;
    this.disposed = false;
    this._lastPosition = new this.THREE.Vector3();
    this._position = new this.THREE.Vector3();
    this._delta = new this.THREE.Vector3();
    this._forward = new this.THREE.Vector3(0, 0, 1);
    this._side = new this.THREE.Vector3(1, 0, 0);
    this._a = new this.THREE.Vector3();
    this._b = new this.THREE.Vector3();
    this._hit = api?.Hit ? new api.Hit() : undefined;
    this._towerProgress = this._centerProgress();
    this._towerPath = stage?.tower?.path || [];
    this._towerLengths = [0];
    for (let i = 1; i < this._towerPath.length; i++) {
      const a = this._towerPath[i - 1], b = this._towerPath[i];
      this._towerLengths.push(this._towerLengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    this._towerPathTotal = this._towerLengths.at(-1) || 0;
    this._towerHalfWidth = Math.max(0.8, Math.min(1.4, Number(stage?.tower?.halfSize) || 1.4));
    this._towerHalfLength = this._towerHalfWidth;
    this._towerDeckTop = 0;
    this._zoneMaterials = [];
    this._zoneCells = [];
    this._clamMarkers = new Map();
    this._inventoryMarkers = new Map();
    this.group = new this.THREE.Group();
    this.group.name = 'ranked-world';
    this.zoneGroup = new this.THREE.Group(); this.zoneGroup.name = 'ranked-zones';
    this.towerGroup = new this.THREE.Group(); this.towerGroup.name = 'ranked-tower-visuals';
    this.rainmakerGroup = new this.THREE.Group(); this.rainmakerGroup.name = 'ranked-rainmaker-visuals';
    this.clamsGroup = new this.THREE.Group(); this.clamsGroup.name = 'ranked-clams-visuals';
    this.group.add(this.zoneGroup, this.towerGroup, this.rainmakerGroup, this.clamsGroup);
    this.G.scene?.add?.(this.group);
    if (this.mode === 'zones') { this._makeZoneLines(); this._buildZoneIndex(); }
    if (this.mode === 'tower') {
      this._makeTower();
      this._installTowerCollider();
      this._syncTower(null, false);
      this._installTowerPaintFace();
    }
    if (this.mode === 'rainmaker' || this.mode === 'clams') this._makeObjectives();
  }

  _material(color, options = {}) {
    return new this.THREE.MeshStandardMaterial({ color, ...options });
  }

  _makeZoneLines() {
    for (const zone of this.stage?.zones || []) {
      const [x, y, z] = zone.center;
      const [width, depth] = zone.size;
      const hw = width / 2, hd = depth / 2;
      const points = [
        new this.THREE.Vector3(x - hw, y + 0.1, z - hd),
        new this.THREE.Vector3(x + hw, y + 0.1, z - hd),
        new this.THREE.Vector3(x + hw, y + 0.1, z + hd),
        new this.THREE.Vector3(x - hw, y + 0.1, z + hd),
      ];
      const geo = new this.THREE.BufferGeometry().setFromPoints(points);
      const mat = new this.THREE.LineBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.92 });
      const line = new this.THREE.LineLoop(geo, mat);
      line.name = `ranked-zone-${this._zoneMaterials.length}`;
      this.zoneGroup.add(line);
      this._zoneMaterials.push(mat);
    }
  }

  _makeTower() {
    const THREE = this.THREE;
    const path = this.stage?.tower?.path || [];
    if (path.length >= 2) {
      const railGeo = new THREE.BufferGeometry().setFromPoints(path.map(p => new THREE.Vector3(p[0], p[1] + 0.18, p[2])));
      const rail = new THREE.Line(railGeo, new THREE.LineBasicMaterial({ color: 0xffd85a, transparent: true, opacity: 0.75 }));
      rail.name = 'ranked-tower-route';
      this.towerGroup.add(rail);
    }
    this.tower = new THREE.Group();
    this.tower.name = 'ranked-moving-tower';
    const deck = new THREE.Mesh(new THREE.BoxGeometry(this._towerHalfWidth * 2, 0.24, this._towerHalfLength * 2),
      this._material(0x47454b, { metalness: 0.3, roughness: 0.68 }));
    deck.position.y = -0.12;
    deck.name = 'tower-solid-floor';
    this.tower.add(deck);
    const grate = new THREE.Group();
    const points = [];
    for (let i = -4; i <= 4; i++) {
      const v = i * (this._towerHalfWidth / 4);
      points.push(new THREE.Vector3(-this._towerHalfWidth, 0.012, v), new THREE.Vector3(this._towerHalfWidth, 0.012, v));
      points.push(new THREE.Vector3(v, 0.012, -this._towerHalfLength), new THREE.Vector3(v, 0.012, this._towerHalfLength));
    }
    const grateGeo = new THREE.BufferGeometry().setFromPoints(points);
    const grateLines = new THREE.LineSegments(grateGeo, new THREE.LineBasicMaterial({ color: 0x9ba2a8, transparent: true, opacity: 0.55 }));
    grateLines.name = 'tower-grate-lines';
    grate.add(grateLines);
    this.tower.add(grate);
    this.towerInkGeometry = new THREE.BufferGeometry();
    const hw = this._towerHalfWidth, hl = this._towerHalfLength;
    this.towerInkGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      hw, 0.009, -hl, -hw, 0.009, -hl, -hw, 0.009, hl, hw, 0.009, hl,
    ], 3));
    this.towerInkGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    this.towerInkGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.towerInkMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uPaint: { value: this.paint?.texture || null },
        uAtlasOrigin: { value: new THREE.Vector2() },
        uAtlasScale: { value: new THREE.Vector2() },
        uTeam0: { value: new THREE.Color(this.teamInk[0]) },
        uTeam1: { value: new THREE.Color(this.teamInk[1]) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D uPaint; uniform vec2 uAtlasOrigin; uniform vec2 uAtlasScale; uniform vec3 uTeam0; uniform vec3 uTeam1; varying vec2 vUv; void main(){ vec4 ink=texture2D(uPaint,uAtlasOrigin+vUv*uAtlasScale); if(ink.a<0.025) discard; float share=clamp(ink.r/max(ink.a,0.001),0.0,1.0); vec3 color=mix(uTeam0,uTeam1,step(0.5,share)); gl_FragColor=vec4(color,clamp(ink.a,0.0,0.94)); }',
      transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, toneMapped: false,
    });
    this.towerInkMesh = new THREE.Mesh(this.towerInkGeometry, this.towerInkMaterial);
    this.towerInkMesh.name = 'tower-paintable-floor';
    this.towerInkMesh.visible = false;
    this.tower.add(this.towerInkMesh);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.9, 10), this._material(0xd2a840, { metalness: 0.55, roughness: 0.4 }));
    pole.position.set(0, 0.95, 0);
    pole.name = 'tower-pole';
    this.tower.add(pole);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.2, 0.12, 12), this._material(0xffdf66, { metalness: 0.3, roughness: 0.42 }));
    cap.position.y = 1.95;
    this.tower.add(cap);
    this.towerGroup.add(this.tower);
  }

  _makeObjectives() {
    const THREE = this.THREE;
    if (this.mode === 'rainmaker') {
      this.rainmaker = new THREE.Group();
      this.rainmaker.name = 'ranked-rainmaker';
      const core = createRainmakerModel(THREE);
      this.rainmakerPresentation = createRainmakerPresentation(THREE, core);
      core.position.y = 1;
      core.name = 'rainmaker-core';
      this.rainmaker.add(core);
      const shield = new THREE.Mesh(new THREE.SphereGeometry(1.45, 20, 12), new THREE.MeshStandardMaterial({
        color: 0xffdc5c, transparent: true, opacity: 0.16, wireframe: true,
        metalness: 0.05, roughness: 0.4,
      }));
      shield.position.y = 1;
      shield.name = 'rainmaker-barrier';
      this.rainmaker.add(shield);
      this.rainmakerCore = core;
      this.rainmakerShield = shield;
      this.rainmakerGroup.add(this.rainmaker);
      this.rainmakerCarrier = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.07, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0xffe77a, transparent: true, opacity: 0.9 }));
      this.rainmakerCarrier.rotation.x = Math.PI / 2;
      this.rainmakerCarrier.name = 'rainmaker-carrier-marker';
      this.rainmakerGroup.add(this.rainmakerCarrier);
      this.rainmakerMarkers = { checkpoints: [], goals: [] };
      const makeObjectiveMarker = ({ pos, team, kind, index = 0, radius }) => {
        const group = new THREE.Group();
        group.position.set(pos[0], pos[1], pos[2]);
        group.name = `rainmaker-${kind}-${team}${kind === 'checkpoint' ? `-${index}` : ''}`;
        const color = this.teamInk[team];
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, kind === 'goal' ? 0.08 : 0.055, 8, 28),
          this._material(color, { transparent: true, opacity: 0.9, emissive: color, emissiveIntensity: 0.12 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.08;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, kind === 'goal' ? 1.8 : 1.2, 8),
          this._material(0x555860, { metalness: 0.25, roughness: 0.6 }));
        post.position.y = kind === 'goal' ? 0.9 : 0.6;
        group.add(ring, post);
        if (kind === 'goal') {
          const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.48, 8), this._material(color, { emissive: color, emissiveIntensity: 0.18 }));
          arrow.position.y = 1.95;
          arrow.rotation.x = team === 0 ? Math.PI / 2 : -Math.PI / 2;
          group.add(arrow);
        }
        this.rainmakerGroup.add(group);
        return { group, ring, team, kind, index };
      };
      for (let team = 0; team < 2; team++) {
        const checkpoints = this.stage?.rainmaker?.checkpoints?.[team] || [];
        for (let index = 0; index < checkpoints.length; index++) {
          this.rainmakerMarkers.checkpoints.push(makeObjectiveMarker({
            pos: checkpoints[index], team, kind: 'checkpoint', index, radius: 1.15,
          }));
        }
        const goal = this.stage?.rainmaker?.goals?.[team];
        if (goal) this.rainmakerMarkers.goals.push(makeObjectiveMarker({ pos: goal, team, kind: 'goal', radius: 1.8 }));
      }
    }
    if (this.mode === 'clams') {
      this.baskets = [];
      for (let team = 0; team < 2; team++) {
        const marker = new THREE.Group();
        const color = this.teamInk[team];
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 10, 28),
          this._material(color, { transparent: true, opacity: 0.88, emissive: color, emissiveIntensity: 0.12 }));
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = 0.14;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.5, 8),
          this._material(0x4a4b4d, { metalness: 0.2, roughness: 0.7 }));
        post.position.y = 0.75;
        const gate = new THREE.Mesh(new THREE.SphereGeometry(1.3, 18, 12), new THREE.MeshStandardMaterial({
          color, transparent: true, opacity: 0.12, wireframe: true, metalness: 0.05, roughness: 0.5,
        }));
        gate.position.y = 0.8;
        marker.add(hoop, post, gate);
        marker.name = `ranked-clam-basket-${team}`;
        this.clamsGroup.add(marker);
        this.baskets.push({ marker, gate, hoop });
      }
      this.smallClamResources = createSmallClamResources(THREE);
      this.powerClamResources = createPowerClamResources(THREE);
      this.clamGeometry = this.smallClamResources.geometry;
      this.clamMaterials = [this.smallClamResources.material, this.powerClamResources.material];
    }
  }

  _towerPosition(engine) {
    const state = engine?.rule?.state;
    if (vec(state?.position)) return state.position;
    const path = this.stage?.tower?.path || [];
    if (path.length < 2) return [0, 0, 0];
    const progress = Math.max(0, Math.min(1, finite(state?.progress) ? state.progress : this._centerProgress()));
    let total = 0;
    const segmentLengths = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      segmentLengths.push(d); total += d;
    }
    let at = progress * total;
    for (let i = 0; i < segmentLengths.length; i++) {
      const length = segmentLengths[i];
      if (at <= length || i === segmentLengths.length - 1) {
        const t = length > EPSILON ? Math.max(0, Math.min(1, at / length)) : 0;
        const a = path[i], b = path[i + 1];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
      at -= length;
    }
    return path[path.length - 1].slice();
  }

  _centerProgress() {
    const path = this.stage?.tower?.path || [];
    if (path.length < 2) return 0.5;
    let total = 0, center = 0;
    const centerIndex = Math.max(0, Math.min(path.length - 1, Math.trunc(this.stage?.tower?.centerIndex ?? Math.floor(path.length / 2))));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      total += length;
      if (i <= centerIndex) center += length;
    }
    return total > EPSILON ? center / total : 0.5;
  }

  _installTowerCollider() {
    const level = this.level;
    if (!level || typeof level._addBlock !== 'function' || !Array.isArray(level.blocks) || !Array.isArray(level.hash)) return;
    const point = this._towerPosition(null);
    const size = [this._towerHalfWidth * 2, 0.24, this._towerHalfLength * 2];
    level._addBlock({ kind: 'obox', center: [point[0], point[1] - 0.12, point[2]], size, rotY: 0,
      paint: false, hidden: true, color: '#47454b', tag: 'ranked-tower', grate: false });
    this.towerBlock = level.blocks[level.blocks.length - 1];
    this.towerBlockId = this.towerBlock?.id ?? -1;
    this.towerBlock.faces.fill(-1);
    level._addBlock({ kind: 'obox', center: [point[0], point[1] + 0.945, point[2]], size: [0.56, 2.13, 0.56], rotY: 0,
      paint: false, hidden: true, color: '#d2a840', tag: 'ranked-tower-pole', grate: false });
    this.towerPoleBlock = level.blocks[level.blocks.length - 1];
    this.towerPoleBlockId = this.towerPoleBlock?.id ?? -1;
    this.towerPoleBlock.faces.fill(-1);
    const stamps = new Uint32Array(level.blocks.length);
    if (level.blockStamp) stamps.set(level.blockStamp.subarray(0, Math.min(level.blockStamp.length, stamps.length)));
    level.blockStamp = stamps;
    this._indexTowerRoute();
  }

  _installTowerPaintFace() {
    const level = this.level, paint = this.paint, block = this.towerBlock;
    if (!level || !paint || !block || !Array.isArray(level.faces) || !Array.isArray(paint.paintFaces)
      || !paint.grid || !paint.dead || typeof paint.splat !== 'function' || !paint.texture
      || !Number.isFinite(paint.size) || !Number.isFinite(paint.ppm)) return false;

    const su = this._towerHalfWidth * 2, sv = this._towerHalfLength * 2;
    const pad = Math.max(0, Math.trunc(paint.pad || 0));
    let baseY = Number.isFinite(paint.usedHeight) ? paint.usedHeight : 0;
    if (!Number.isFinite(paint.usedHeight)) {
      for (const f of paint.paintFaces) {
        const atlas = f?.atlas;
        if (atlas && Number.isFinite(atlas.y) && Number.isFinite(atlas.h)) baseY = Math.max(baseY, atlas.y + atlas.h);
      }
    }
    let atlasX = 0, atlasY = baseY;
    let spareSide = paint.size - baseY;
    if (spareSide < pad * 2 + 1) {
      const free = this._findFreePaintSquare(paint.size, paint.paintFaces);
      if (!free) return false;
      atlasX = free.x; atlasY = free.y; spareSide = free.size;
    }
    const dynamicPpm = Math.min(paint.ppm, (spareSide - pad * 2) / Math.max(su, sv));
    if (!Number.isFinite(dynamicPpm) || dynamicPpm < 0.5) return false;
    const width = Math.ceil(su * dynamicPpm) + pad * 2;
    const height = Math.ceil(sv * dynamicPpm) + pad * 2;
    if (width > spareSide || height > spareSide || atlasX + width > paint.size || atlasY + height > paint.size) return false;

    const oldGrid = paint.grid, oldDead = paint.dead;
    const nu = Math.max(1, Math.round(su / (paint.cell || 0.25)));
    const nv = Math.max(1, Math.round(sv / (paint.cell || 0.25)));
    const cellCount = nu * nv;
    const face = {
      id: level.faces.length, block: block.id,
      n: new this.THREE.Vector3(0, 1, 0), u: new this.THREE.Vector3(-1, 0, 0), v: new this.THREE.Vector3(0, 0, 1),
      origin: new this.THREE.Vector3(), su, sv, wall: false, turf: true, ceiling: false,
      paintable: true, pattern: block.pattern, color: block.color,
      groundedBottom: false, atlas: { x: atlasX, y: atlasY, w: width, h: height, ppm: dynamicPpm, pad },
      grid: oldGrid.length, nu, nv, cu: su / nu, cv: sv / nv,
    };
    const grid = new Uint8Array(oldGrid.length + cellCount);
    grid.set(oldGrid);
    const dead = new Uint8Array(oldDead.length + cellCount);
    dead.set(oldDead);
    this.towerPaintBase = { oldGrid, oldDead, oldTurfTotal: paint.turfTotal, oldTurfArea: paint.turfArea,
      oldUsedHeight: paint.usedHeight, paint, level, face, cellCount, oldGridLength: oldGrid.length };
    paint.grid = grid;
    paint.dead = dead;
    paint.paintFaces.push(face);
    level.faces.push(face);
    block.faces[2] = face.id;
    paint.turfTotal = (paint.turfTotal || 0) + cellCount;
    paint.turfArea = (paint.turfArea || 0) + su * sv;
    paint.usedHeight = Math.max(Number.isFinite(paint.usedHeight) ? paint.usedHeight : 0, atlasY + height);
    this.towerInkMaterial.uniforms.uPaint.value = paint.texture;
    const atlas = face.atlas;
    this.towerInkMaterial.uniforms.uAtlasOrigin.value.set((atlas.x + pad) / paint.size, (atlas.y + pad) / paint.size);
    this.towerInkMaterial.uniforms.uAtlasScale.value.set((su * dynamicPpm) / paint.size, (sv * dynamicPpm) / paint.size);
    this.towerInkMesh.visible = true;
    this.towerPaintFace = face;
    this.towerPaintReady = true;
    this._extendPaintDryRegion(paint.usedHeight);
    this._updateTowerPaintGeometry();
    const buried = paint.dead.subarray(face.grid, face.grid + cellCount);
    let deadCells = 0;
    for (let i = 0; i < buried.length; i++) if (buried[i]) deadCells++;
    const liveCells = cellCount - deadCells;
    paint.turfTotal -= cellCount - liveCells;
    paint.turfArea -= (cellCount - liveCells) * face.cu * face.cv;
    this.towerPaintBase.liveCells = liveCells;
    return true;
  }

  _findFreePaintSquare(size, faces) {
    const occupied = new Uint8Array(size * size);
    for (const face of faces || []) {
      const rect = face?.atlas;
      if (!rect) continue;
      const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
      const x1 = Math.min(size, Math.ceil(rect.x + rect.w)), y1 = Math.min(size, Math.ceil(rect.y + rect.h));
      for (let y = y0; y < y1; y++) occupied.fill(1, y * size + x0, y * size + x1);
    }
    let previous = new Uint16Array(size + 1), current = new Uint16Array(size + 1);
    let best = 0, bestX = 0, bestY = 0;
    for (let y = 0; y < size; y++) {
      current[0] = 0;
      const row = y * size;
      for (let x = 0; x < size; x++) {
        if (!occupied[row + x]) {
          const side = 1 + Math.min(previous[x + 1], current[x], previous[x]);
          current[x + 1] = side;
          if (side > best) { best = side; bestX = x + 1 - side; bestY = y + 1 - side; }
        } else current[x + 1] = 0;
      }
      const swap = previous; previous = current; current = swap;
    }
    return best ? { x: bestX, y: bestY, size: best } : null;
  }

  _extendPaintDryRegion(usedHeight) {
    const geometry = this.paint?.dryMesh?.geometry;
    const positions = geometry?.getAttribute?.('position');
    if (!positions || !Number.isFinite(usedHeight)) return;
    const yTop = Math.min(1, ((usedHeight + 2) / this.paint.size) * 2 - 1);
    positions.setY(2, yTop);
    positions.setY(3, yTop);
    positions.needsUpdate = true;
  }

  _clearTowerPaintAtlasRect() {
    const state = this.towerPaintBase, renderer = state?.paint?.renderer, rect = state?.face?.atlas;
    if (!renderer || !state.paint.rt || !rect || typeof renderer.setRenderTarget !== 'function'
      || typeof renderer.setScissor !== 'function' || typeof renderer.setScissorTest !== 'function'
      || typeof renderer.setClearColor !== 'function' || typeof renderer.clear !== 'function') return;
    const viewport = renderer.getViewport?.(new this.THREE.Vector4());
    const scissor = renderer.getScissor?.(new this.THREE.Vector4());
    const scissorTest = renderer.getScissorTest?.() ?? false;
    const target = renderer.getRenderTarget?.() ?? null;
    const color = renderer.getClearColor?.(new this.THREE.Color()) || null;
    const alpha = renderer.getClearAlpha?.() ?? 1;
    try {
      renderer.setRenderTarget(state.paint.rt);
      renderer.setScissor(rect.x, rect.y, rect.w, rect.h);
      renderer.setScissorTest(true);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
    } finally {
      renderer.setRenderTarget(target);
      if (viewport && typeof renderer.setViewport === 'function') renderer.setViewport(viewport.x, viewport.y, viewport.z, viewport.w);
      if (scissor) renderer.setScissor(scissor.x, scissor.y, scissor.z, scissor.w);
      renderer.setScissorTest(scissorTest);
      if (color) renderer.setClearColor(color, alpha);
    }
  }

  _updateTowerPaintGeometry() {
    const face = this.towerPaintFace, block = this.towerBlock;
    if (!face || !block) return;
    face.n.copy(block.axes[1]);
    face.v.copy(block.axes[2]);
    if (face.v.z < 0 && Math.abs(face.v.z) > 0.3) face.v.negate();
    face.u.crossVectors(face.v, face.n).normalize();
    face.origin.copy(block.center)
      .addScaledVector(face.n, block.half.y)
      .addScaledVector(face.u, -face.su / 2)
      .addScaledVector(face.v, -face.sv / 2);
    if (!this._towerPaintDeadInitialized && face.id >= 0 && this.towerPoleBlockId >= 0) {
      const p = this._paintSampleScratch || (this._paintSampleScratch = new this.THREE.Vector3());
      this._towerPaintDeadInitialized = true;
      for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
        const k = face.grid + j * face.nu + i;
        p.copy(face.origin).addScaledVector(face.u, (i + 0.5) * face.cu).addScaledVector(face.v, (j + 0.5) * face.cv).addScaledVector(face.n, 0.06);
        if (this.level.pointInside(p, 0, block.id)) this.paint.dead[k] = 1;
      }
    }
  }

  _indexTowerRoute() {
    const level = this.level, block = this.towerBlock;
    if (!level || !block || this.towerBlockId < 0) return;
    const path = this.stage?.tower?.path || [];
    if (!path.length) return;
    const radius = Math.hypot(this._towerHalfWidth, this._towerHalfLength) + 0.2;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of path) {
      minX = Math.min(minX, p[0] - radius); maxX = Math.max(maxX, p[0] + radius);
      minZ = Math.min(minZ, p[2] - radius); maxZ = Math.max(maxZ, p[2] + radius);
    }
    const x0 = level._hxi(minX), x1 = level._hxi(maxX), z0 = level._hzi(minZ), z1 = level._hzi(maxZ);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const bucket = level.hash[z * level.hw + x];
      if (!bucket.includes(this.towerBlockId)) bucket.push(this.towerBlockId);
      if (this.towerPoleBlockId >= 0 && !bucket.includes(this.towerPoleBlockId)) bucket.push(this.towerPoleBlockId);
    }
  }

  _riderOnBlock(actor) {
    return actor?.grounded === true && actor?.ground?.hit === true && actor.ground.block === this.towerBlockId;
  }

  _inTowerVolume(actor, allowAir = false) {
    if (!actor?.pos || !this.towerBlock) return false;
    const p = actor.pos;
    const dx = p.x - this.towerBlock.center.x, dz = p.z - this.towerBlock.center.z;
    const localX = dx * this.towerBlock.axes[0].x + dz * this.towerBlock.axes[0].z;
    const localZ = dx * this.towerBlock.axes[2].x + dz * this.towerBlock.axes[2].z;
    const footY = p.y;
    const top = this._towerDeckTop;
    const pad = allowAir ? 0.12 : 0.02;
    return Math.abs(localX) <= this._towerHalfWidth + pad
      && Math.abs(localZ) <= this._towerHalfLength + pad
      && footY >= top - 0.32 && footY <= top + (allowAir ? 3.0 : 0.28);
  }

  _refreshRideLatches() {
    for (const actor of this.match?.actors || []) {
      if (!actor || actor.alive === false) { if (actor) actor._rankedOnTower = false; continue; }
      const directContact = this._riderOnBlock(actor);
      if (directContact) actor._rankedOnTower = true;
      else if (actor.grounded) actor._rankedOnTower = false;
      else if (actor._rankedOnTower && !this._inTowerVolume(actor, true)) actor._rankedOnTower = false;
    }
  }

  _carryRiders(delta) {
    if (!delta) return;
    for (const actor of this.match?.actors || []) {
      if (!actor || actor.alive === false) continue;
      const directContact = this._riderOnBlock(actor);
      const latchedAir = !actor.grounded && actor._rankedOnTower && this._inTowerVolume(actor, true);
      if (!directContact && !latchedAir) continue;
      if (!actor.pos) continue;
      actor.pos.add(delta);
      actor.character?.root?.position?.add?.(delta);
    }
  }

  _collectRiderOffsets() {
    const offsets = [];
    if (!this.towerBlock) return offsets;
    const block = this.towerBlock;
    for (const actor of this.match?.actors || []) {
      if (!actor || actor.alive === false || !actor.pos) continue;
      const directContact = this._riderOnBlock(actor);
      const latchedAir = !actor.grounded && actor._rankedOnTower && this._inTowerVolume(actor, true);
      if (!directContact && !latchedAir) continue;
      const rel = this._a.copy(actor.pos).sub(block.center);
      offsets.push({ actor, x: rel.dot(block.axes[0]), y: rel.dot(block.axes[1]), z: rel.dot(block.axes[2]) });
    }
    return offsets;
  }

  _syncTower(engine, carry = true) {
    if (this.mode !== 'tower' || !this.towerBlock) return;
    this._refreshRideLatches();
    const riders = carry ? this._collectRiderOffsets() : [];
    const target = this._towerPosition(engine);
    setVec(this._position, target);
    const [dx, dz] = segmentAt(this.stage?.tower?.path || [], engine?.rule?.state?.progress ?? this._towerProgress);
    this._forward.set(dx, 0, dz).normalize();
    this._side.set(this._forward.z, 0, -this._forward.x).normalize();
    const yaw = Math.atan2(dx, dz);
    this.towerBlock.center.set(this._position.x, this._position.y - 0.12, this._position.z);
    this.towerBlock.axes[0].set(Math.cos(yaw), 0, -Math.sin(yaw));
    this.towerBlock.axes[1].set(0, 1, 0);
    this.towerBlock.axes[2].set(Math.sin(yaw), 0, Math.cos(yaw));
    updateBlockBounds(this.towerBlock);
    if (this.towerPoleBlock) {
      this.towerPoleBlock.center.set(this._position.x, this._position.y + 0.945, this._position.z);
      this.towerPoleBlock.axes[0].copy(this.towerBlock.axes[0]);
      this.towerPoleBlock.axes[1].copy(this.towerBlock.axes[1]);
      this.towerPoleBlock.axes[2].copy(this.towerBlock.axes[2]);
      updateBlockBounds(this.towerPoleBlock);
    }
    this._towerDeckTop = this._position.y;
    this.tower.position.copy(this._position);
    this.tower.rotation.y = yaw;
    this.tower.updateMatrixWorld(true);
    this._updateTowerPaintGeometry();
    for (const rider of riders) {
      const { actor, x, y, z } = rider;
      actor.pos.copy(this.towerBlock.center)
        .addScaledVector(this.towerBlock.axes[0], x)
        .addScaledVector(this.towerBlock.axes[1], y)
        .addScaledVector(this.towerBlock.axes[2], z);
      const root = actor.character?.root?.position;
      if (root) root.copy(actor.pos).setY(actor.pos.y + (actor.smoothY || 0));
    }
    this._refreshRideLatches();
    this._towerProgress = finite(engine?.rule?.state?.progress) ? engine.rule.state.progress : this._towerProgress;
    this._lastPosition.copy(this._position);
  }

  beforeActors(engine) {
    if (this.disposed) return;
    this._syncTower(engine, true);
  }

  update(engine, dt = 0) {
    if (this.disposed) return;
    if (this.mode === 'tower') this._syncTower(engine, true);
    if (this.mode === 'zones') this._updateZoneColors(engine);
    if (this.mode === 'rainmaker') this._updateRainmaker(engine);
    if (this.mode === 'clams') {
      this._updateBaskets(engine);
      this._updateClams(engine);
      this._updateInventories(engine);
    }
  }

  _updateZoneColors(engine) {
    const state = parseState(engine);
    const zones = state?.zones;
    for (let i = 0; i < this._zoneMaterials.length; i++) {
      const team = Array.isArray(zones) ? zones[i]?.team : -1;
      this._zoneMaterials[i].color.setHex(validTeam(team) ? this.teamInk[team] : NEUTRAL);
    }
  }

  _findActor(id) {
    if (id === null || id === undefined) return null;
    const key = idKey(id);
    return (this.match?.actors || []).find(actor => idKey(actor?.nid ?? `${actor?.team}:${actor?.slot}`) === key) || null;
  }

  _updateRainmaker(engine) {
    const rainmaker = engine?.rule?.state;
    if (this.mode !== 'rainmaker' || !this.rainmaker) return;
    let position = vec(rainmaker?.pos) || this.stage?.rainmaker?.center || [0, 0, 0];
    const carrier = this._findActor(rainmaker?.carrier);
    if (carrier?.pos && validTeam(carrier.team)) position = [carrier.pos.x, carrier.pos.y, carrier.pos.z];
    this.rainmaker.position.set(position[0], position[1], position[2]);
    if (carrier) this.rainmaker.rotation.y = 0;
    else this.rainmaker.rotation.y += 0.018;
    const barrier = rainmaker?.barrier || {};
    const shield = barrier.active !== false;
    const max = Math.max(1, finite(barrier.max) ? barrier.max : 1000);
    const health = Math.max(0, Math.min(max, finite(barrier.health) ? barrier.health : max));
    const pressure = 1 - health / max;
    const radius = 1.5 + 1.2 * pressure;
    this.rainmakerShield.visible = shield;
    this.rainmakerShield.scale.setScalar(radius / 1.45);
    this.rainmakerShield.material.color.setHex(validTeam(barrier.team) ? this.teamInk[barrier.team] : 0xffdc5c);
    this.rainmakerShield.material.opacity = 0.12 + 0.14 * pressure;
    this.rainmakerCarrier.visible = !!carrier;
    if (carrier?.pos) this.rainmakerCarrier.position.set(carrier.pos.x, carrier.pos.y + 2.45, carrier.pos.z);
    else this.rainmakerCarrier.position.copy(this.rainmaker.position).add(new this.THREE.Vector3(0, 2.2, 0));
    const charge = rainmaker?.charge?.value || 0;
    this.rainmakerPresentation.update(carrier, charge);
    const checkpoints = rainmaker?.checkpoint?.passed;
    this.rainmakerCore.material.color.setHex(0xffffff);
    this.rainmaker.userData.checkpointsPassed = Array.isArray(checkpoints) ? checkpoints.slice() : [];
    const opened = rainmaker?.checkpoint?.goalOpen || [];
    for (const marker of this.rainmakerMarkers?.checkpoints || []) {
      const passed = !!checkpoints?.[marker.team]?.[marker.index];
      marker.ring.material.opacity = passed ? 0.28 : 0.9;
      marker.group.userData.passed = passed;
    }
    for (const marker of this.rainmakerMarkers?.goals || []) {
      const isOpen = !!opened[marker.team];
      marker.ring.material.opacity = isOpen ? 0.95 : 0.3;
      marker.group.userData.open = isOpen;
    }
  }

  _updateBaskets(engine) {
    if (this.mode !== 'clams' || !this.baskets) return;
    const baskets = engine?.rule?.state?.baskets || [];
    for (let team = 0; team < this.baskets.length; team++) {
      const item = this.baskets[team], state = baskets[team] || {};
      const goal = vec(state.goalPos) || vec(state.goal) || this.stage?.clams?.goals?.[team] || [0, 0, team ? 25 : -25];
      item.marker.position.set(goal[0], goal[1], goal[2]);
      const open = !!state.barrierOpen;
      item.gate.visible = !open;
      item.hoop.material.color.setHex(open ? 0x8dffcf : this.teamInk[team]);
      item.marker.userData.barrierOpen = open;
      item.marker.userData.openTimer = finite(state.openTimer) ? state.openTimer : 0;
      item.marker.userData.cooldown = finite(state.cooldown) ? state.cooldown : 0;
    }
  }

  _clamMarker(clam) {
    const THREE = this.THREE;
    const key = idKey(clam.id);
    let marker = this._clamMarkers.get(key);
    const power = clam.kind === 'power';
    const resources = power ? this.powerClamResources : this.smallClamResources;
    if (marker) {
      marker.mesh.geometry = resources.geometry; marker.mesh.material = resources.material;
      marker.kind = clam.kind;
      marker.mesh.name = power ? `power-clam-${key}` : `clam-${key}`;
      return marker;
    }
    const mesh = new THREE.Mesh(resources.geometry, resources.material);
    mesh.name = power ? `power-clam-${key}` : `clam-${key}`;
    this.clamsGroup.add(mesh);
    marker = { mesh, kind: clam.kind };
    this._clamMarkers.set(key, marker);
    return marker;
  }

  _updateClams(engine) {
    if (this.mode !== 'clams' || !this.clamGeometry) return;
    const state = engine?.rule?.state;
    const clams = [...(state?.clams || [])];
    for (const basket of state?.baskets || []) if (basket.pendingBreak)
      clams.push({ id: `drill-${basket.team}`, kind: 'power', team: basket.team, pos: basket.pendingBreak.pos, drilling: true });
    const present = new Set();
    for (const clam of clams) {
      if (!clam || clam.id === undefined || clam.carrier !== null && clam.carrier !== undefined) continue;
      const p = vec(clam.pos);
      if (!p) continue;
      const key = idKey(clam.id), marker = this._clamMarker(clam);
      present.add(key);
      marker.mesh.visible = true;
      marker.mesh.position.set(p[0], p[1] + (clam.kind === 'power' ? .255 : SMALL_CLAM_HALF_HEIGHT), p[2]);
      const velocity = vec(clam.velocity);
      const clock = finite(this.G.time) ? this.G.time : 0;
      if (velocity) marker.mesh.rotation.set(velocity[0] * 0.04, velocity[1] * 0.04 + clock * 1.4, velocity[2] * 0.04);
      else marker.mesh.rotation.y = clock * 1.4;
      if (clam.drilling) marker.mesh.rotation.z = clock * 24;
    }
    for (const [key, marker] of this._clamMarkers) {
      if (!present.has(key)) marker.mesh.visible = false;
    }
  }

  _updateInventories(engine) {
    if (this.mode !== 'clams' || !this.smallClamResources) return;
    const inventories = engine?.rule?.state?.inventories || {};
    const present = new Set();
    for (const [id, inventory] of Object.entries(inventories)) {
      if (!inventory || !(inventory.small > 0 || inventory.power)) continue;
      const actor = this._findActor(id);
      if (!actor?.pos) continue;
      present.add(id);
      let marker = this._inventoryMarkers.get(id);
      if (!marker) {
        marker = new this.THREE.Group();
        const small = createSmallClamInventory(this.THREE, this.smallClamResources);
        const power = new this.THREE.Mesh(this.powerClamResources.geometry, this.powerClamResources.material);
        marker.add(small, power);
        marker.userData.smallClams = small; marker.userData.powerClam = power;
        marker.name = `ranked-clam-inventory-${id}`;
        this.clamsGroup.add(marker);
        this._inventoryMarkers.set(id, marker);
      }
      marker.visible = true;
      const small = marker.userData.smallClams, power = marker.userData.powerClam;
      updateSmallClamInventory(this.THREE, small, inventory.power ? 0 : inventory.small);
      small.visible = !inventory.power && small.count > 0;
      power.visible = !!inventory.power;
      // A carried clam trails behind the carrier; this is presentation only.
      // Local visual offsets do not change rule positions or throw origins.
      const yaw = finite(actor.yaw) ? actor.yaw : 0;
      marker.position.set(actor.pos.x - Math.sin(yaw) * .72,
        actor.pos.y + (inventory.power ? .34 : .16), actor.pos.z - Math.cos(yaw) * .72);
      marker.rotation.y = yaw;

    }
    for (const [id, marker] of this._inventoryMarkers) if (!present.has(id)) marker.visible = false;
  }

  _buildZoneIndex() {
    const faces = this.paint?.paintFaces;
    const zones = this.stage?.zones || [];
    this._zoneCells = zones.map(() => []);
    if (!Array.isArray(faces) || !this.paint?.grid) return;
    const p = new this.THREE.Vector3();
    for (const face of faces) {
      // PaintSystem includes walls and overhangs in its atlas. Turf ratios use
      // only exposed, upward paint cells, excluding cells hidden by geometry.
      if (!face?.turf || face.n?.y <= 0.7 || !Number.isInteger(face.grid) || face.grid < 0) continue;
      for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
        const cell = face.grid + j * face.nu + i;
        if (this.paint.dead?.[cell]) continue;
        floorCellCenter(face, i, j, p);
        for (let index = 0; index < zones.length; index++) {
          const zone = zones[index], [cx, cy, cz] = zone.center, [width, depth] = zone.size;
          // Source-calibrated zones mark a floor band. Do not count a box top
          // or another storey merely because it overlaps that floor in X/Z.
          if (finite(zone.heightTolerance) && Math.abs(p.y - cy) > Math.max(0, zone.heightTolerance) + EPSILON) continue;
          if (p.x < cx - width / 2 - EPSILON || p.x > cx + width / 2 + EPSILON
            || p.z < cz - depth / 2 - EPSILON || p.z > cz + depth / 2 + EPSILON) continue;
          this._zoneCells[index].push({ face, cell, area: face.cu * face.cv, center: p.clone() });
        }
      }
    }
  }

  zoneCoverage() {
    const zones = this.stage?.zones || [];
    return zones.map((_, index) => {
      const area = [0, 0, 0];
      for (const entry of this._zoneCells[index] || []) {
        area[0] += entry.area;
        const team = this.paint.grid[entry.cell];
        if (team === 1) area[1] += entry.area;
        else if (team === 2) area[2] += entry.area;
      }
      if (area[0] <= 0) return [0, 0];
      return [area[1] / area[0], area[2] / area[0]];
    });
  }

  captureZone(index, team) {
    if (!validTeam(team) || typeof this.paint?.splat !== 'function') return 0;
    let claimed = 0;
    for (const entry of this._zoneCells[index] || []) {
      const { face, cell, center } = entry;
      // Use the native splat path (CPU grid, ink atlas, and online splat
      // recording) restricted to each live turf face. Each exposed cell gets a
      // centered stamp, so capture never reaches walls or a hidden floor.
      const radius = Math.max(0.08, Math.min(0.42, Math.hypot(face.cu, face.cv) * 0.72));
      claimed += this.paint.splat(center, radius, team, {
        seed: ((index + 1) * 0x9e3779b1 + (cell + 1) * 0x85ebca6b) >>> 0,
        kind: 'blast', instant: true, face: face.id,
      }) || 0;
    }
    return claimed;
  }

  floorAt(x, z, yMax) {
    const y = this.level?.groundHeight?.(x, z, yMax);
    return finite(y) ? y : null;
  }

  // #1648: a moving Tower deck is solid footing the static floor lookup lacks.
  supportedAt(pos) {
    return this.mode === 'tower' && !!this.towerBlock && Array.isArray(pos)
      && this._inTowerVolume({ pos: { x: pos[0], y: pos[1], z: pos[2] } }, false);
  }

  blocked(a, b) {
    const segment = this.physics?.segment;
    if (typeof segment !== 'function') return false;
    setVec(this._a, a); setVec(this._b, b);
    return !!segment.call(this.physics, this._a, this._b, this._hit, false)?.hit;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.rainmakerPresentation?.release();
    this.group?.parent?.remove?.(this.group);
    this.group?.traverse?.(object => {
      if (object.isInstancedMesh) object.dispose?.();
      if (object.geometry && object.geometry !== this.smallClamResources?.geometry && object.geometry !== this.powerClamResources?.geometry) object.geometry.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
      else if (object.material && !this.clamMaterials?.includes(object.material)) object.material.dispose?.();
    });
    this.smallClamResources?.geometry.dispose?.(); this.powerClamResources?.geometry.dispose?.();
    this.clamMaterials?.forEach(material => material.dispose?.());
    const paintState = this.towerPaintBase;
    if (paintState) {
      const { paint, level, face, oldGrid, oldDead, oldGridLength, liveCells } = paintState;
      this._clearTowerPaintAtlasRect();
      for (let i = 0; i < paintState.cellCount; i++) {
        const cell = face.grid + i, owner = paint.grid[cell];
        if (!paint.dead[cell] && owner === 1) paint.counts[0] = Math.max(0, paint.counts[0] - 1);
        if (!paint.dead[cell] && owner === 2) paint.counts[1] = Math.max(0, paint.counts[1] - 1);
      }
      oldGrid.set(paint.grid.subarray(0, oldGridLength));
      oldDead.set(paint.dead.subarray(0, oldGridLength));
      paint.grid = oldGrid;
      paint.dead = oldDead;
      paint.turfTotal = Math.max(0, paint.turfTotal - liveCells);
      paint.turfArea = Math.max(0, paint.turfArea - liveCells * face.cu * face.cv);
      const paintFaceIndex = paint.paintFaces.indexOf(face);
      if (paintFaceIndex >= 0) paint.paintFaces.splice(paintFaceIndex, 1);
      if (level.faces[level.faces.length - 1] === face) level.faces.pop();
      else level.faces[face.id] = null;
      const block = level.blocks[face.block];
      if (block?.faces?.[2] === face.id) block.faces[2] = -1;
      paint.usedHeight = paintState.oldUsedHeight;
      if (Number.isFinite(paintState.oldUsedHeight)) this._extendPaintDryRegion(paintState.oldUsedHeight);
      this.towerPaintReady = false;
    }
    const level = this.level;
    const removal = [[this.towerPoleBlockId, this.towerPoleBlock], [this.towerBlockId, this.towerBlock]];
    if (level) for (const [id, block] of removal) {
      if (!block || !Number.isInteger(id) || id < 0) continue;
      for (const bucket of level.hash || []) {
        const at = bucket.indexOf(id);
        if (at >= 0) bucket.splice(at, 1);
      }
      if (level.blocks?.[id] === block && id === level.blocks.length - 1) {
        level.blocks.pop();
      } else {
        block.solid = false;
        block.paint = false;
        block.tag = null;
      }
    }
    if (level && removal.some(([id, block]) => Number.isInteger(id) && id >= 0 && level.blocks?.[id] === block)) {
      // A non-ranked block was appended after the tower; keep array indices stable and leave both colliders inert.
      for (const [id, block] of removal) {
        if (Number.isInteger(id) && id >= 0 && level.blocks?.[id] === block) {
          block.solid = false; block.paint = false; block.tag = null;
        }
      }
    }
    if (level?.blocks) {
      level.blockStamp = new Uint32Array(level.blocks.length);
      level._stamp = 1;
    }
    for (const actor of this.match?.actors || []) actor._rankedOnTower = false;
  }
}

export { createRankedStage };
