import * as THREE from "three";
import { GEO } from "./units";
import { terrainObstacles } from "./terrain";

export interface SceneEnv {
  group: THREE.Group;
  dispose: () => void;
}

interface Palette {
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiTop: number;
  hemiBot: number;
  hemiInt: number;
  sunColor: number;
  sunInt: number;
  sunPos: [number, number, number];
  ground: [string, string, string, string];
  slab?: string;
}

const PALETTES: Record<number, Palette> = {
  1: {
    sky: 0x607185, fog: 0x6a7c8f, fogNear: 105, fogFar: 255,
    hemiTop: 0xbfd4e6, hemiBot: 0x354531, hemiInt: 1.15,
    sunColor: 0xffdca8, sunInt: 1.85, sunPos: [40, 62, 32],
    ground: ["#476843", "#3d5b3a", "#52754c", "#355033"],
  },
  2: {
    sky: 0xd09266, fog: 0xc8895c, fogNear: 115, fogFar: 270,
    hemiTop: 0xffe2c2, hemiBot: 0x693e28, hemiInt: 1.2,
    sunColor: 0xffc682, sunInt: 2.1, sunPos: [50, 72, 24],
    ground: ["#9c6342", "#885335", "#ad704d", "#78482e"],
  },
  3: {
    sky: 0xb6d4ec, fog: 0xc6dff2, fogNear: 120, fogFar: 275,
    hemiTop: 0xf0f8ff, hemiBot: 0x6c849c, hemiInt: 1.35,
    sunColor: 0xfff5e6, sunInt: 2.0, sunPos: [42, 76, 36],
    ground: ["#d5e4ef", "#c6d8e6", "#e3eef7", "#b8cde0"],
  },
  4: {
    sky: 0x45516b, fog: 0x525e7a, fogNear: 110, fogFar: 265,
    hemiTop: 0xc0cde6, hemiBot: 0x463e38, hemiInt: 1.22,
    sunColor: 0xffdea8, sunInt: 2.05, sunPos: [48, 78, 28],
    ground: ["#6c717a", "#60656e", "#777c86", "#565b64"],
    slab: "#484d57",
  },
};

export function buildStageEnv(scene: THREE.Scene, sceneId: number): SceneEnv {
  const pal = PALETTES[sceneId] ?? PALETTES[1];
  const group = new THREE.Group();
  const localGeos: THREE.BufferGeometry[] = [];
  const localMats: THREE.Material[] = [];
  const localTex: THREE.Texture[] = [];

  const mat = (color: number, rough = 0.88, metal = 0.06, basic = false) => {
    const m = basic
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    localMats.push(m);
    return m;
  };
  const add = (
    geo: THREE.BufferGeometry, m: THREE.Material,
    sx: number, sy: number, sz: number,
    x: number, y: number, z: number,
    ry = 0, cast = true,
  ) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = cast;
    mesh.receiveShadow = !cast;
    group.add(mesh);
    return mesh;
  };

  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.Fog(pal.fog, pal.fogNear, pal.fogFar);

  const hemi = new THREE.HemisphereLight(pal.hemiTop, pal.hemiBot, pal.hemiInt);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(pal.sunColor, pal.sunInt);
  sun.position.set(...pal.sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 65, bottom: -65, near: 5, far: 220 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  group.add(sun, sun.target);

  // Ground texture (falls back to flat colour in headless Node tests)
  let groundTex: THREE.CanvasTexture | undefined;
  if (typeof document !== "undefined") {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    if (g) {
      g.fillStyle = pal.ground[0];
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 650; i++) {
        g.fillStyle = pal.ground[i % pal.ground.length];
        g.fillRect((i * 53) % 128, (i * 97) % 128, 3, 2);
      }
      if (pal.slab) {
        g.strokeStyle = pal.slab;
        g.lineWidth = 2;
        for (let y = 0; y < 128; y += 32) {
          g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
          const off = (y / 32) % 2 ? 16 : 0;
          for (let x = off; x < 128; x += 32) {
            g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke();
          }
        }
      }
      groundTex = new THREE.CanvasTexture(cv);
      groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
      groundTex.repeat.set(24, 18);
      groundTex.colorSpace = THREE.SRGBColorSpace;
      localTex.push(groundTex);
    }
  }

  const groundGeo = new THREE.PlaneGeometry(260, 180);
  const groundMat = groundTex
    ? new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96 })
    : new THREE.MeshStandardMaterial({ color: pal.ground[0], roughness: 0.96 });
  localGeos.push(groundGeo);
  localMats.push(groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  localGeos.push(rockGeo);

  // Render physical battlefield obstacles matching terrainObstacles(sceneId)
  const obsStone = mat(sceneId === 2 ? 0xa56b47 : sceneId === 3 ? 0x7995a6 : 0x7a828c, 0.92);
  const obsAccent = mat(sceneId === 2 ? 0xc89665 : sceneId === 3 ? 0xeaf4fa : 0x9da39a, 0.85);
  const obsBase = mat(0x5b626d, 0.9);
  for (const obstacle of terrainObstacles(sceneId)) {
    const { x, z, radius: r, height: h } = obstacle;
    if (sceneId === 4) {
      add(GEO.cyl, obsBase, r, 0.6, r, x, 0.3, z);
      add(GEO.cyl, obsStone, r * 0.68, h, r * 0.68, x, h / 2, z);
      add(GEO.cyl, obsAccent, r * 0.86, 0.6, r * 0.86, x, h + 0.1, z);
      for (let j = 1; j < 5; j++) add(GEO.cyl, obsBase, r * 0.72, 0.12, r * 0.72, x, (h * j) / 5, z);
    } else if (sceneId === 1) {
      add(GEO.cyl, obsStone, r, 0.7, r, x, 0.35, z);
      add(GEO.box, obsAccent, r * 1.15, 3.1, r * 0.48, x, 1.7, z, 0.35);
      add(GEO.box, obsStone, r * 1.4, 0.4, r * 0.55, x, 3.2, z, 0.35);
      add(rockGeo, obsBase, 1.4, 1.0, 1.2, x + r * 0.45, 0.65, z + r * 0.25);
    } else {
      add(rockGeo, obsStone, r * 0.9, h * 0.7, r * 0.9, x, h * 0.34, z, 0.3);
      add(rockGeo, obsAccent, r * 0.58, h * 0.4, r * 0.58, x - r * 0.16, h * 0.68, z, 0.8);
      if (sceneId === 3) add(rockGeo, obsAccent, r * 0.48, 0.8, r * 0.48, x - r * 0.16, h * 0.91, z);
    }
  }

  if (sceneId === 1) {
    // Borderland graveyard: weathered stones, dead trees, fences, mossy rocks
    const stone = mat(0x7d838a, 0.95);
    const wood = mat(0x4b3828, 0.9);
    const pine = mat(0x28472b, 0.95);
    const trunk = mat(0x4e3928, 0.95);
    const mtn = mat(0x495b6c, 1, 0);
    for (const [x, z] of [[-68, -48], [68, -48], [-64, 48], [64, 48], [-22, -49], [22, 49], [-40, 48], [40, -48]]) {
      add(GEO.cyl, trunk, 0.35, 2.6, 0.35, x, 1.3, z);
      add(GEO.cone, pine, 1.5, 3.2, 1.5, x, 3.6, z);
      add(GEO.cone, pine, 1.0, 2.2, 1.0, x, 4.9, z);
    }
    for (let x = -60; x <= 60; x += 20) {
      for (const z of [-47, 47]) {
        const tilt = ((x * 7) % 3) * 0.08;
        const t = add(GEO.box, stone, 0.9, 1.7, 0.3, x + (z > 0 ? 4 : -4), 0.85, z, tilt);
        t.rotation.z = tilt;
        if (Math.abs(x) === 20 || Math.abs(x) === 60) {
          add(GEO.box, stone, 0.35, 2.2, 0.28, x + (z > 0 ? -3 : 3), 1.1, z);
          add(GEO.box, stone, 1.1, 0.3, 0.28, x + (z > 0 ? -3 : 3), 1.55, z);
        }
        add(GEO.box, wood, 4.5, 0.14, 0.14, x + 8, 0.7, z);
        add(GEO.box, wood, 0.16, 1.2, 0.16, x + 6, 0.6, z);
        add(GEO.box, wood, 0.16, 1.2, 0.16, x + 10, 0.6, z);
      }
    }
    for (const [x, z] of [[-75, -18], [76, 16], [-32, -47], [44, 47], [-10, 48]]) {
      add(rockGeo, stone, 1.4, 0.85, 1.2, x, 0.45, z, x);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const size = 36 + ((i * 13) % 28);
      add(GEO.cone, mtn, size, size * 1.1, size, Math.sin(a) * 200, 0, Math.cos(a) * 150, i, false);
    }
  } else if (sceneId === 2) {
    // Rift Canyon: tall red sandstone mesas, dry scrub, warband bonfires
    const cliff = mat(0x9a5234, 0.95);
    const cliffDark = mat(0x7c3e26, 0.95);
    const scrub = mat(0x6e6a32, 0.95);
    const trunk = mat(0x523b26, 0.95);
    const fire = mat(0xff9c38, 1, 0, true);
    const ember = mat(0xffe178, 1, 0, true);
    const mtn = mat(0x9b5a3c, 1, 0);
    for (const [x, z, h] of [
      [-66, -49, 7], [-24, -50, 5.5], [18, -50, 6.5], [64, -49, 8],
      [-58, 49, 6], [-12, 50, 5], [32, 49, 7.5], [70, 49, 6.5],
      [-78, -16, 6], [-78, 22, 5.5], [78, -20, 6], [78, 18, 7],
    ] as [number, number, number][]) {
      add(GEO.cyl, cliff, 3.6, h, 3.2, x, h / 2, z, x);
      add(GEO.box, cliffDark, 4.2, 1.1, 3.6, x, h + 0.3, z, z);
    }
    for (const [x, z] of [[-42, -48], [46, -47], [-38, 48], [50, 48]]) {
      add(GEO.cyl, trunk, 0.28, 2.2, 0.28, x, 1.1, z);
      add(GEO.cyl, scrub, 2.1, 0.55, 2.1, x, 2.3, z);
      // campfire next to dry tree
      add(rockGeo, cliffDark, 0.9, 0.35, 0.9, x + 3, 0.2, z);
      add(GEO.cone, fire, 0.5, 1.0, 0.5, x + 3, 0.65, z, 0, false);
      add(GEO.sph, ember, 0.28, 0.28, 0.28, x + 3, 0.5, z, 0, false);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const size = 40 + ((i * 17) % 30);
      add(GEO.cyl, mtn, size * 0.85, size * 1.1, size * 0.85, Math.sin(a) * 205, size * 0.4, Math.cos(a) * 155, i, false);
    }
  } else if (sceneId === 3) {
    // Frost Pass: snow-capped pines, blue ice crystals, icy boulders, alpine peaks
    const pine = mat(0x2a5440, 0.9);
    const snow = mat(0xeef6fc, 0.8);
    const trunk = mat(0x4b3828, 0.9);
    const ice = mat(0x73c2f5, 0.25, 0.3);
    const rock = mat(0x6d7d8f, 0.9);
    const mtn = mat(0x88a4bd, 1, 0);
    for (const [x, z] of [[-68, -48], [68, -48], [-62, 48], [62, 48], [-26, -49], [26, 49], [-44, 48], [44, -48]]) {
      add(GEO.cyl, trunk, 0.36, 2.2, 0.36, x, 1.1, z);
      add(GEO.cone, pine, 1.9, 2.6, 1.9, x, 3.0, z);
      add(GEO.cone, snow, 1.45, 1.3, 1.45, x, 3.9, z);
      add(GEO.cone, pine, 1.35, 2.1, 1.35, x, 4.4, z);
      add(GEO.cone, snow, 1.0, 1.2, 1.0, x, 5.2, z);
    }
    for (const [x, z] of [[-75, -18], [75, 20], [-48, -48], [54, 48], [-10, -49], [12, 49]]) {
      const c1 = add(GEO.quadCone, ice, 1.1, 3.6, 1.1, x, 1.8, z, x);
      c1.rotation.z = 0.16;
      const c2 = add(GEO.quadCone, ice, 0.8, 2.5, 0.8, x + 1.1, 1.2, z - 0.5, z);
      c2.rotation.z = -0.22;
      add(rockGeo, rock, 1.5, 0.9, 1.3, x - 2.2, 0.45, z);
      add(rockGeo, snow, 1.2, 0.45, 1.0, x - 2.2, 0.95, z);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const size = 42 + ((i * 19) % 34);
      add(GEO.cone, mtn, size, size * 1.45, size, Math.sin(a) * 200, 0, Math.cos(a) * 150, i, false);
      add(GEO.cone, snow, size * 0.45, size * 0.65, size * 0.45, Math.sin(a) * 200, size * 0.88, Math.cos(a) * 150, i, false);
    }
  } else {
    // Scene 4: Royal Citadel courtyard: stone battlements, pillars with fire braziers, banners
    const wall = mat(0x5b616e, 0.85, 0.1);
    const trim = mat(0x7c8494, 0.75, 0.15);
    const gold = mat(0xd9a53c, 0.4, 0.7);
    const flame = mat(0xffaa38, 1, 0, true);
    const bannerBlue = mat(0x3f7fd6, 0.8);
    const bannerRed = mat(0xd0453a, 0.8);
    const citadel = mat(0x384154, 1, 0);
    for (const z of [-49, 49]) {
      add(GEO.box, wall, 152, 3.6, 1.8, 0, 1.8, z);
      for (let x = -72; x <= 72; x += 6) {
        add(GEO.box, trim, 2.4, 1.1, 2.0, x, 4.15, z);
      }
      for (let x = -60; x <= 60; x += 24) {
        add(GEO.cyl, trim, 0.85, 6.2, 0.85, x, 3.1, z > 0 ? z - 2 : z + 2);
        add(GEO.box, gold, 1.3, 0.4, 1.3, x, 6.3, z > 0 ? z - 2 : z + 2);
        add(GEO.cone, flame, 0.65, 1.3, 0.65, x, 7.1, z > 0 ? z - 2 : z + 2, 0, false);
        add(GEO.box, x < 0 ? bannerBlue : bannerRed, 1.1, 2.6, 0.08, x, 4.1, z > 0 ? z - 2.9 : z + 2.9);
      }
    }
    for (const x of [-77, 77]) {
      add(GEO.box, wall, 2.2, 4.4, 100, x, 2.2, 0);
      for (const z of [-36, 0, 36]) {
        add(GEO.box, trim, 4.4, 8.0, 4.4, x, 4.0, z);
        add(GEO.cone, x < 0 ? bannerBlue : bannerRed, 3.4, 3.2, 3.4, x, 9.6, z);
      }
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const w = 26 + ((i * 11) % 24);
      const h = 38 + ((i * 17) % 35);
      add(GEO.box, citadel, w, h, w, Math.sin(a) * 195, h / 2, Math.cos(a) * 145, i * 0.4, false);
    }
  }

  scene.add(group);
  let disposed = false;

  return {
    group,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      group.clear();
      sun.shadow.map?.dispose();
      sun.shadow.dispose();
      for (const g0 of localGeos) g0.dispose();
      for (const m0 of localMats) m0.dispose();
      for (const t0 of localTex) t0.dispose();
      localGeos.length = 0;
      localMats.length = 0;
      localTex.length = 0;
    },
  };
}
