import * as THREE from "three";
import { World, Box } from "../physics/World";
import { InkSystem } from "../ink/InkSystem";
import { TEAM_COLORS } from "../data/tuning";

/**
 * Scorch Gorge / ユノハナ大渓谷 — gameplay blockout.
 * Layout is 180° point-symmetric about the origin. Team 0 spawns at -Z, team 1 at +Z.
 * Key measurements (estimated from footage, see docs/STAGE_SPEC.md):
 *  - spawn-to-spawn ≈ 104 m, playable width ≈ 52 m
 *  - spawn platform +8.0 m, plaza +5.0, sniper perch +6.5, gorge floor +2.5, mid platform +4.5
 *  - left lane (from own spawn) low route +2.5, right lane high ledge +5.0
 */

const ROCK = 0xd9a86c, ROCK_DARK = 0xb8834e, METAL = 0x3d7d84, CRATE = 0xc98f5a, GRATE = 0x5a5f66, SPAWN = 0x8fa3ad, PLAZA = 0xe0b98a;

export interface StageInfo {
  spawns: THREE.Vector3[][]; // [team][slot]
  spawnYaw: number[];
  bounds: { x0: number; z0: number; x1: number; z1: number };
  paintPoints: THREE.Vector3[]; // strategic points for AI
}

export function buildScorchGorge(world: World, ink: InkSystem, scene: THREE.Scene): { info: StageInfo; stageMesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const half = (sign: 1 | -1) => {
    const S = (z: number) => z * sign;
    const X = (x: number) => x * sign;
    const B = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, o: Partial<Box> = {}) => world.addBox(X(x0), X(x1), S(z0), S(z1), y0, y1, o);
    const R = (x0: number, x1: number, z0: number, z1: number, h0: number, h1: number, axis: "x" | "z", o: Partial<Box> = {}) => {
      world.addRamp(X(x0), X(x1), S(z0), S(z1), h0, h1, axis, o);
      rampVisuals.push({ x0: X(x0), x1: X(x1), z0: S(z0), z1: S(z1), h0, h1, axis, color: o.color ?? ROCK, paint: o.paintFloor ?? true });
    };
    // Spawn platform (unpaintable metal deck, spawn area) with walls
    B(-9, 9, -60, -47, 0, 8, { kind: "spawn", color: SPAWN, paintFloor: false, paintWalls: false });
    B(-9.5, -9, -60, -47, 0, 10, { kind: "metal", color: METAL, paintFloor: false, paintWalls: false });
    B(9, 9.5, -60, -47, 0, 10, { kind: "metal", color: METAL, paintFloor: false, paintWalls: false });
    B(-9.5, 9.5, -60.5, -60, 0, 10, { kind: "metal", color: METAL, paintFloor: false, paintWalls: false });
    // Spawn ramp down to plaza 8 -> 5
    R(-6, 6, -47, -41, 8, 5, "z", { color: ROCK });
    B(-9, -6, -47, -41, 0, 8, { color: ROCK_DARK, paintFloor: true });
    B(6, 9, -47, -41, 0, 8, { color: ROCK_DARK, paintFloor: true });
    // Plaza +5
    B(-17, 17, -41, -29, 0, 5, { color: PLAZA });
    // Sniper perch +6.5 with ramp from plaza
    R(-4, 4, -31, -28, 5, 6.5, "z", { color: ROCK });
    B(-6, 6, -28, -22.5, 0, 6.5, { color: ROCK_DARK });
    B(-6, -4, -31, -28, 0, 6.5, { color: ROCK_DARK });
    B(4, 6, -31, -28, 0, 6.5, { color: ROCK_DARK });
    // Plaza sides leading down to gorge floor at +2.5 (two ramps flanking the perch)
    R(-13, -7, -29, -22, 5, 2.5, "z", { color: ROCK });
    R(7, 13, -29, -22, 5, 2.5, "z", { color: ROCK });
    B(-17, -13, -29, -22, 0, 5, { color: ROCK_DARK });
    B(13, 17, -29, -22, 0, 5, { color: ROCK_DARK });
    // Left low lane (x negative for team 0) +2.5, from plaza via ramp
    R(-17, -21, -41, -35, 5, 2.5, "x", { color: ROCK });
    B(-26, -21, -41, -8, 0, 2.5, { color: ROCK });
    B(-21, -17, -35, -8, 0, 2.5, { color: ROCK });
    // cover on left lane
    B(-24.5, -22.5, -24, -22, 2.5, 4.3, { kind: "crate", color: CRATE });
    B(-20, -18, -14, -12, 2.5, 4.1, { kind: "crate", color: CRATE });
    // Right high ledge +5 continuing to z=-8, then drops
    B(17, 26, -41, -10, 0, 5, { color: PLAZA });
    B(21.5, 24.5, -20, -17, 5, 6.6, { kind: "crate", color: CRATE });
    B(18, 20, -30, -28, 5, 6.4, { kind: "crate", color: CRATE });
    // ramp from right ledge down into the gorge (inner side)
    R(17, 13, -16, -10, 5, 2.5, "x", { color: ROCK });
    // Gorge floor (team half) +2.5
    B(-26, 26, -22.5, 0, 0, 2.5, { color: ROCK });
    // Grate bridge on the left, +4, unpaintable; access ramps
    B(-15, -11, -12, 0, 3.6, 4.0, { kind: "grate", color: GRATE, paintFloor: false, paintWalls: false });
    R(-15, -11, -16, -12, 2.5, 4.0, "z", { color: METAL, paintFloor: false });
    // Central mid platform (half) +4.5 with ramp on team side
    B(-7, 7, -4, 0, 0, 4.5, { color: ROCK_DARK });
    R(-4, 4, -9, -4, 2.5, 4.5, "z", { color: ROCK });
    B(-7, -4, -9, -4, 0, 4.5, { color: ROCK_DARK });
    B(4, 7, -9, -4, 0, 4.5, { color: ROCK_DARK });
    // Mid cover
    B(-2, 2, -2.2, -0.2, 4.5, 6.2, { kind: "crate", color: CRATE });
    // Gorge-side pillars (cover) on floor
    B(-11, -9, -20, -18, 2.5, 5.0, { kind: "crate", color: CRATE });
    B(9, 11, -8, -6, 2.5, 4.4, { kind: "crate", color: CRATE });
    // Outer cliff walls (unpaintable), tall
    B(-30, -26, -60, 0, 0, 14, { kind: "rock", color: ROCK_DARK, paintFloor: false, paintWalls: false });
    B(26, 30, -60, 0, 0, 14, { kind: "rock", color: ROCK_DARK, paintFloor: false, paintWalls: false });
    B(-26, -9.5, -62, -60, 0, 14, { kind: "rock", color: ROCK_DARK, paintFloor: false, paintWalls: false });
    B(9.5, 26, -62, -60, 0, 14, { kind: "rock", color: ROCK_DARK, paintFloor: false, paintWalls: false });
    B(-26, -9.5, -47, -41, 0, 9, { kind: "rock", color: ROCK_DARK, paintFloor: false, paintWalls: true });
    B(9.5, 26, -47, -41, 0, 9, { kind: "rock", color: ROCK_DARK, paintFloor: false, paintWalls: true });
  };
  const rampVisuals: { x0: number; x1: number; z0: number; z1: number; h0: number; h1: number; axis: "x" | "z"; color: number; paint: boolean }[] = [];
  half(1);
  half(-1);

  const bounds = { x0: -30, z0: -62, x1: 30, z1: 62 };
  ink.bounds = bounds;
  // Score mask: top-most surface at (x,z) must be a paintFloor box
  ink.buildScoreMask((x, z) => {
    let top: Box | null = null;
    for (const b of world.boxes) if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && (!top || b.max.y > top.max.y)) top = b;
    return !!top && top.paintFloor;
  });

  // ---- Render geometry
  const pos: number[] = [], nor: number[] = [], col: number[] = [], paint: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3, color: number, p: [number, number, number, number][]) => {
    const base = pos.length / 3; c.setHex(color);
    for (const v of [a, b, cc, d]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b); }
    for (const q of p) paint.push(...q);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const NONE: [number, number, number, number] = [0, 0, -1, 2];
  const FLOOR: [number, number, number, number] = [0, 0, -1, 0];
  for (const b of world.boxes) {
    if (!b.visual) continue;
    const { min, max } = b;
    const shade = (k: number) => { c.setHex(b.color).multiplyScalar(k); return c.getHex(); };
    // top
    pushQuad(V(min.x, max.y, max.z), V(max.x, max.y, max.z), V(max.x, max.y, min.z), V(min.x, max.y, min.z), V(0, 1, 0), b.color, b.paintFloor ? [FLOOR, FLOOR, FLOOR, FLOOR] : [NONE, NONE, NONE, NONE]);
    // sides
    const h = max.y - min.y;
    const sides: { a: THREE.Vector3; b: THREE.Vector3; n: THREE.Vector3 }[] = [
      { a: V(max.x, 0, max.z), b: V(max.x, 0, min.z), n: V(1, 0, 0) },
      { a: V(min.x, 0, min.z), b: V(min.x, 0, max.z), n: V(-1, 0, 0) },
      { a: V(min.x, 0, max.z), b: V(max.x, 0, max.z), n: V(0, 0, 1) },
      { a: V(max.x, 0, min.z), b: V(min.x, 0, min.z), n: V(0, 0, -1) },
    ];
    sides.forEach((s, si) => {
      const w = s.a.distanceTo(s.b);
      let tile = -1;
      // skip faces buried inside neighbouring geometry (probe just outside the face at mid-height and near the top)
      const mx = (s.a.x + s.b.x) / 2 + s.n.x * 0.15, mz = (s.a.z + s.b.z) / 2 + s.n.z * 0.15;
      const buried = !!world.boxAt(mx, max.y - 0.3, mz) && !!world.boxAt(mx, (min.y + max.y) / 2, mz);
      if (b.paintWalls && h >= 1.2 && w >= 0.8 && !buried) {
        const u = new THREE.Vector3().subVectors(s.b, s.a).normalize();
        tile = ink.registerWall(V(s.a.x, min.y, s.a.z), u, V(0, 1, 0), w, h, s.n);
        b.wallTiles[si] = tile;
      }
      const P = (u01: number, v01: number): [number, number, number, number] => tile >= 0 ? [u01, v01, tile, 1] : NONE;
      const color = shade(s.n.x !== 0 ? 0.82 : 0.9);
      pushQuad(V(s.a.x, min.y, s.a.z), V(s.b.x, min.y, s.b.z), V(s.b.x, max.y, s.b.z), V(s.a.x, max.y, s.a.z), s.n, color, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)]);
    });
  }
  for (const r of rampVisuals) {
    const cshade = new THREE.Color(r.color).multiplyScalar(0.95).getHex();
    const P = r.paint ? FLOOR : NONE;
    if (r.axis === "z") {
      const dir = Math.sign(r.z1 - r.z0);
      const n = V(0, Math.abs(r.z1 - r.z0), -dir * (r.h1 - r.h0)).normalize();
      pushQuad(V(r.x0, r.h0, r.z0), V(r.x1, r.h0, r.z0), V(r.x1, r.h1, r.z1), V(r.x0, r.h1, r.z1), n, cshade, [P, P, P, P]);
      // side skirts
      const lo = Math.min(r.h0, r.h1) - 0.5;
      pushQuad(V(r.x0, lo, r.z0), V(r.x0, r.h0, r.z0), V(r.x0, r.h1, r.z1), V(r.x0, lo, r.z1), V(-1, 0, 0), cshade, [NONE, NONE, NONE, NONE]);
      pushQuad(V(r.x1, lo, r.z1), V(r.x1, r.h1, r.z1), V(r.x1, r.h0, r.z0), V(r.x1, lo, r.z0), V(1, 0, 0), cshade, [NONE, NONE, NONE, NONE]);
    } else {
      const dir = Math.sign(r.x1 - r.x0);
      const n = V(-dir * (r.h1 - r.h0), Math.abs(r.x1 - r.x0), 0).normalize();
      pushQuad(V(r.x0, r.h0, r.z1), V(r.x0, r.h0, r.z0), V(r.x1, r.h1, r.z0), V(r.x1, r.h1, r.z1), n, cshade, [P, P, P, P]);
      const lo = Math.min(r.h0, r.h1) - 0.5;
      pushQuad(V(r.x0, lo, r.z0), V(r.x0, r.h0, r.z0), V(r.x1, r.h1, r.z0), V(r.x1, lo, r.z0), V(0, 0, -1), cshade, [NONE, NONE, NONE, NONE]);
      pushQuad(V(r.x1, lo, r.z1), V(r.x1, r.h1, r.z1), V(r.x0, r.h0, r.z1), V(r.x0, lo, r.z1), V(0, 0, 1), cshade, [NONE, NONE, NONE, NONE]);
    }
  }
  // fix winding for quads whose computed order is backwards: we render DoubleSide, lighting uses provided normals.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("aPaint", new THREE.Float32BufferAttribute(paint, 4));
  geo.setIndex(idx);
  const material = createStageMaterial(ink);
  const stageMesh = new THREE.Mesh(geo, material);
  stageMesh.frustumCulled = false;
  scene.add(stageMesh);

  buildEnvironment(scene);

  const spawns: THREE.Vector3[][] = [[], []];
  const slots = [[-4, -55], [-1.5, -53], [1.5, -53], [4, -55]];
  for (let t = 0; t < 2; t++) for (const [x, z] of slots) spawns[t].push(new THREE.Vector3(t === 0 ? x : -x, 8, t === 0 ? z : -z));
  const paintPoints: THREE.Vector3[] = [];
  for (const [x, z] of [[0, 0], [-22, -20], [22, -20], [0, -35], [-12, -15], [12, -5], [20, -32], [-20, -34], [0, -25]]) {
    paintPoints.push(new THREE.Vector3(x, world.groundHeight(x, z), z), new THREE.Vector3(-x, world.groundHeight(-x, -z), -z));
  }
  return { info: { spawns, spawnYaw: [0, Math.PI], bounds, paintPoints }, stageMesh, material };
}

function buildEnvironment(scene: THREE.Scene) {
  // Sky dome (gradient) – Scorch Gorge is a bright arid canyon under a hazy sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.ShaderMaterial({    side: THREE.BackSide, depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.33,0.58,0.92); vec3 hor = vec3(0.93,0.86,0.72); vec3 c = mix(hor, top, smoothstep(-0.05, 0.5, h)); c = mix(c, vec3(0.86,0.63,0.42), smoothstep(0.0,-0.3,h)); gl_FragColor = vec4(c,1.0); }`,
  }));
  scene.add(sky);
  // Distant canyon mesas
  const mesaMat = new THREE.MeshLambertMaterial({ color: 0xc27b4e, fog: true });
  const mesaMat2 = new THREE.MeshLambertMaterial({ color: 0xa8623e, fog: true });
  const rnd = mulberry(7);
  const group = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const ang = rnd() * Math.PI * 2, d = 110 + rnd() * 160;
    const w = 18 + rnd() * 40, h = 14 + rnd() * 40;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.7, w, h, 7), rnd() > 0.5 ? mesaMat : mesaMat2);
    m.position.set(Math.cos(ang) * d, h / 2 - 8, Math.sin(ang) * d);
    m.rotation.y = rnd() * 3;
    group.add(m);
  }
  scene.add(group);
  // Hot-spring steam vents (Scorch Gorge landmark) — animated later via material opacity
  const ventMat = new THREE.MeshLambertMaterial({ color: 0x5f8f96 });
  for (const [x, z] of [[-24, -50], [24, 50], [24, -4], [-24, 4]]) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.2, 12), ventMat);
    v.position.set(x, 3.1, z); scene.add(v);
  }
  // Ground far below (void floor) so falls read as depth
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x8b5a3a }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -12; scene.add(floor);
  // Team-colored light towers near spawns (landmarks)
  for (let t = 0; t < 2; t++) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 16, 1.2), new THREE.MeshLambertMaterial({ color: 0x46545c }));
    tower.position.set(t === 0 ? -13 : 13, 8, t === 0 ? -58 : 58); scene.add(tower);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[t].hex }));
    lamp.position.set(tower.position.x, 17, tower.position.z); scene.add(lamp);
  }
}

export function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function createStageMaterial(ink: InkSystem) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFloor: { value: ink.floorRT.texture },
      uWall: { value: ink.wallRT.texture },
      uBounds: { value: new THREE.Vector4(ink.bounds.x0, ink.bounds.z0, ink.bounds.x1 - ink.bounds.x0, ink.bounds.z1 - ink.bounds.z0) },
      uTeamA: { value: new THREE.Color(TEAM_COLORS[0].hex) },
      uTeamB: { value: new THREE.Color(TEAM_COLORS[1].hex) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uCamPos: { value: new THREE.Vector3() },
      uFogColor: { value: new THREE.Color(0xe8d2b0) },
    },
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec4 aPaint;
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor; varying vec4 vPaint;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vNormal = normal; vColor = color; vPaint = aPaint;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uFloor; uniform sampler2D uWall; uniform vec4 uBounds;
      uniform vec3 uTeamA; uniform vec3 uTeamB; uniform vec3 uSunDir; uniform vec3 uCamPos; uniform vec3 uFogColor;
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vColor; varying vec4 vPaint;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec3 n = normalize(vNormal);
        vec4 inkS = vec4(0.0);
        float mode = vPaint.w;
        if (mode < 0.5) {
          vec2 uv = (vWorld.xz - uBounds.xy) / uBounds.zw;
          inkS = texture2D(uFloor, uv);
        } else if (mode < 1.5) {
          float tile = vPaint.z; float tx = mod(tile, 16.0), ty = floor(tile / 16.0);
          vec2 uv = (vec2(tx, ty) + 0.02 + vPaint.xy * 0.96) / 16.0;
          inkS = texture2D(uWall, uv);
        }
        // base surface: stylised concrete/rock with subtle grain
        float grain = hash(floor(vWorld.xz * 6.0) + floor(vWorld.y * 6.0)) * 0.06;
        vec3 base = vColor * (0.97 + grain);
        // grid lines on floors for readable scale (painted concrete slabs)
        if (n.y > 0.9) { vec2 g = abs(fract(vWorld.xz / 4.0) - 0.5); float line = smoothstep(0.47, 0.49, max(g.x, g.y)); base *= 1.0 - line * 0.12; }
        float painted = step(0.5, inkS.a);
        vec3 inkCol = inkS.r > inkS.g ? uTeamA : uTeamB;
        // ink edge darkening + wet variation
        float wet = inkS.b;
        vec3 inkShade = inkCol * (0.9 + 0.2 * wet);
        vec3 albedo = mix(base, inkShade, painted);
        // lighting: sun lambert + hemisphere ambient
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 amb = mix(vec3(0.42, 0.36, 0.32), vec3(0.62, 0.68, 0.78), n.y * 0.5 + 0.5);
        vec3 lit = albedo * (amb + vec3(1.0, 0.95, 0.85) * ndl * 0.9);
        // wet specular on ink
        vec3 v = normalize(uCamPos - vWorld); vec3 h = normalize(v + uSunDir);
        float spec = pow(max(dot(n, h), 0.0), mix(12.0, 48.0, wet)) * painted * (0.35 + 0.4 * wet);
        lit += vec3(spec);
        // fresnel sheen on ink
        lit += inkCol * painted * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.25;
        // distance fog
        float d = length(uCamPos - vWorld);
        lit = mix(lit, uFogColor, smoothstep(60.0, 220.0, d));
        gl_FragColor = vec4(lit, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}
