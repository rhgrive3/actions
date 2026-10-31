// A working neighbourhood market, dressed inside existing cover skins and on
// the separated exterior quay. Everything is static, opaque and merged by the
// MAP3 art builder. There are no gameplay solids, lights or per-frame updates.
import * as THREE from 'three';

const SHOP_TILES = ['market', 'bakery', 'drinks', 'poster'];
const CLOTH = ['#bb7357', '#eee2c7', '#7e9b88', '#d1b174'];

function face(o, side) {
  const [x0, x1, z0, z1] = o.rect, yaw = side * Math.PI / 2;
  const base = side === 0 ? [(x0 + x1) / 2, o.y0, z1]
    : side === 1 ? [x1, o.y0, (z0 + z1) / 2]
      : side === 2 ? [(x0 + x1) / 2, o.y0, z0] : [x0, o.y0, (z0 + z1) / 2];
  return {
    yaw, width: side % 2 ? z1 - z0 : x1 - x0, height: o.y1 - o.y0,
    at: (x, y, proud = 0.025) => [base[0] + x * Math.cos(yaw) + proud * Math.sin(yaw), base[1] + y,
      base[2] - x * Math.sin(yaw) + proud * Math.cos(yaw)],
  };
}

function coverShop(b, o) {
  const tile = /civic/.test(o.id) ? 'drinks' : /market/.test(o.id) ? 'bakery' : 'market';
  b.scope(o.id, 'obstacle-skin', () => {
    for (const side of [0, 2]) {
      const f = face(o, side), y = f.height * 0.65;
      // Four merchandise silhouettes sit on the existing opaque service window,
      // clear of its mullions. Only 0.032 WU of relief; no false shelf collision.
      for (const [i, t] of [-0.32, -0.12, 0.12, 0.32].entries()) {
        const xx = f.width * t, h = (tile === 'drinks' ? 0.28 : 0.20) + (i % 2) * 0.055;
        const col = tile === 'drinks' ? ['#b78c55', '#d7ceaf', '#a2aa7c', '#bc8660'][i]
          : ['#d8b16c', '#bd795b', '#e0c99a', '#98a173'][i];
        b.box('wood', col, ...f.at(xx, y - 0.11 + h / 2, 0.027), 0.14, h, 0.008, f.yaw);
        if (tile === 'drinks') b.box('metal', b.palette.stone, ...f.at(xx, y - 0.09 + h, 0.027), 0.09, 0.045, 0.009, f.yaw);
      }
      // A small menu on the lower corner leaves the central paintable wall open.
      const menuX = -f.width * 0.27, menuY = f.height * 0.29;
      b.box('wood', b.palette.dark, ...f.at(menuX, menuY, 0.020), 0.84, 0.48, 0.012, f.yaw);
      b.decal(tile, f.at(menuX, menuY, 0.032), 0.77, 0.385, [0, f.yaw, 0]);
      // Two paper delivery slips, placed as a cluster rather than uniform dirt.
      const slipX = f.width * 0.34;
      b.box('stone', '#ede3cc', ...f.at(slipX, f.height * 0.28, 0.025), 0.22, 0.28, 0.009, f.yaw);
      b.box('wood', '#b98967', ...f.at(slipX, f.height * 0.34, 0.032), 0.13, 0.035, 0.004, f.yaw);
    }
  });

  // This is the actual vendor sign already present in map3ArtAssemblies:
  // eight roof strips + four posts put the sign at part index 12. Its silhouette
  // and collider stay unchanged; only its existing face gains a printed identity.
  const s = o.id.startsWith('B_') ? -1 : 1, [x0, x1, z0, z1] = o.rect;
  b.scope(`${o.id}:vendor:12`, 'assembly-part', () => {
    const x = (x0 + x1) / 2, y = o.y1 + 0.85 * 0.62, z = s > 0 ? z1 - 0.012 : z0 + 0.012;
    b.decal(tile, [x, y, z], Math.min(1.12, x1 - x0 - 0.8), 0.34, [0, s > 0 ? 0 : Math.PI, 0]);
    for (const dx of [-0.84, 0.84]) {
      b.box('wood', '#dec18d', x + dx, y, z - s * 0.004, 0.16, 0.10, 0.008);
      b.box('metal', '#f0e5cb', x + dx, y - 0.095, z - s * 0.004, 0.24, 0.025, 0.008);
    }
  });
}

function civicNotices(b, o) {
  const s = o.id.startsWith('B_') ? -1 : 1;
  b.scope(o.id, 'obstacle-skin', () => {
    // Notices live on the ends of tall civic cover. The clear central objective
    // and low bridge cover receive no extra high-contrast panels.
    const side = /mid_screen/.test(o.id) ? (s > 0 ? 3 : 1) : (s > 0 ? 0 : 2);
    const f = face(o, side), xx = -f.width * 0.22, yy = Math.min(1.4, f.height * 0.55);
    b.box('wood', '#9a7355', ...f.at(xx, yy, 0.021), 1.03, 0.63, 0.014, f.yaw);
    b.decal('poster', f.at(xx, yy, 0.032), 0.95, 0.475, [0, f.yaw, 0]);
    // A slightly offset note gives this board the rhythm of a used noticeboard.
    b.box('stone', '#e8dbc0', ...f.at(xx + 0.42, yy - 0.19, 0.030), 0.16, 0.19, 0.007, f.yaw);
  });
}

function clothFlag(b, x, y, z, s, color) {
  const g = new THREE.BufferGeometry();
  // Slightly folded, pointed cloth. Double-sided canopy material avoids alpha
  // sorting and alpha overdraw; four triangles make each hanging pennant.
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    x, y, z - 0.22, x, y, z + 0.22,
    x - s * 0.045, y - 0.25, z, x, y - 0.48, z - 0.04,
  ], 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 1, 3, 2]); g.computeVertexNormals();
  b.add('canopy', g, color); g.dispose();
}

function signBoard(b, tile, x, y, z, w, h, s) {
  const yaw = -s * Math.PI / 2;
  b.box('wood', '#977154', x, y, z, w + 0.12, h + 0.12, 0.09, yaw);
  b.decal(tile, [x - s * 0.052, y, z], w, h, [0, yaw, 0]);
}

function displayTray(b, sphere, x, y, z, s, kind, variation) {
  const p = b.palette;
  // The stock is outside the arena on a real market counter. All boxes are
  // open shallow slatted trays rather than another solid crate silhouette.
  const ww = 0.70, dd = 0.74;
  b.box('wood', '#ad8053', x, y + 0.035, z, dd, 0.07, ww);
  for (const dz of [-ww / 2, ww / 2]) b.box('wood', '#c09a6c', x, y + 0.14, z + dz, dd, 0.12, 0.055);
  for (const dx of [-dd / 2, dd / 2]) b.box('wood', '#8b6c4f', x + dx, y + 0.14, z, 0.05, 0.12, ww);
  for (let a = 0; a < 2; a++) for (let c = 0; c < 3; c++) {
    const xx = x + (a - 0.5) * 0.27, zz = z + (c - 1) * 0.20;
    if (kind === 2) {
      b.cylinder('metal', ['#bd9f6e', '#91a797', '#d2b48b'][variation], xx, y + 0.27, zz, 0.075, 0.33);
      b.cylinder('metal', p.stone, xx, y + 0.45, zz, 0.055, 0.045);
    } else {
      const color = kind === 1 ? ['#d7b784', '#bd905a', '#dfc18e'][variation]
        : ['#b06d50', '#b9a260', '#7e9366'][variation];
      b.add('foliage', sphere, color, [xx, y + 0.23 + ((a + c) % 2) * 0.025, zz],
        kind === 1 ? [0.13, 0.095, 0.08] : [0.105, 0.105, 0.105]);
    }
  }
  const yaw = -s * Math.PI / 2;
  b.box('stone', '#efe2c8', x - s * 0.39, y + 0.13, z, 0.22, 0.16, 0.018, yaw);
  for (let i = 0; i < 3; i++) b.box('wood', '#795e47', x - s * 0.405, y + 0.13, z - 0.055 + i * 0.05, 0.018, 0.055, 0.014, yaw);
}

function marketTree(b, crown, x, ground, z, variant) {
  const p = b.palette;
  b.cylinder('stone', '#b47e60', x, ground + 0.40, z, 0.69, 0.8);
  b.cylinder('stone', '#cfab83', x, ground + 0.80, z, 0.73, 0.13);
  b.cylinder('stone', '#665f43', x, ground + 0.875, z, 0.58, 0.025);
  b.beam('wood', '#866d50', [x, ground + 0.86, z], [x + 0.18, ground + 4.6, z - 0.12], 0.24, 0.21);
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5 + variant * 0.7, reach = 0.85 + (i % 2) * 0.30;
    const end = [x + Math.sin(angle) * reach, ground + 4.9 + (i % 3) * 0.38, z + Math.cos(angle) * reach];
    b.beam('wood', '#866d50', [x + 0.12, ground + 3.3 + (i % 2) * 0.4, z], end, 0.11, 0.09);
    b.add('foliage', crown, i % 2 ? '#738c62' : '#8e9d72', end, [1.12, 1.25 + (i % 2) * 0.18, 0.98], [0, angle, 0.2]);
  }
}

function quayBench(b, x, ground, z, s) {
  // Timber slats, dark cast feet and a backrest read as a seat from the arena.
  for (const dz of [-0.82, 0.82]) {
    b.box('metal', b.palette.dark, x, ground + 0.28, z + dz, 0.54, 0.55, 0.12);
    b.beam('metal', b.palette.dark, [x + s * 0.24, ground + 0.48, z + dz], [x + s * 0.29, ground + 1.12, z + dz], 0.09);
  }
  for (const dx of [-0.22, 0, 0.22]) b.box('wood', '#ac8359', x + dx, ground + 0.58, z, 0.18, 0.12, 2.2);
  for (const yy of [0.88, 1.12]) b.box('wood', '#b99167', x + s * 0.30, ground + yy, z, 0.10, 0.16, 2.2);
}

function marketPavilion(b, sphere, crown, s, index, centerZ) {
  const x = s * 49, z = centerZ * s, ground = 1.4, kind = index % 4;
  b.scope(`market-life-${s}-${index}`, 'exterior', () => {
    const inward = x - s * 2.55;
    // Shop identity faces the playable market, with an attached timber fascia.
    signBoard(b, SHOP_TILES[kind], x - s * 2.235, ground + 1.59, z, 2.45, 1.225, s);
    // Three stock trays or folded cloth rolls, placed on a supported counter.
    b.box('wood', '#b68a5d', inward, ground + 0.99, z, 0.92, 0.16, 3.10);
    for (const dz of [-1.25, 1.25]) b.box('wood', '#8e6c4f', inward, ground + 0.48, z + dz, 0.13, 0.96, 0.14);
    for (let i = 0; i < 3; i++) {
      const zz = z + (i - 1) * 0.94;
      if (kind === 3) {
        for (let k = 0; k < 3; k++) b.cylinder('canopy', CLOTH[(i + k) % CLOTH.length], inward, ground + 1.21 + k * 0.15, zz,
          0.13, 0.66, [0, 0, Math.PI / 2]);
      } else displayTray(b, sphere, inward, ground + 1.07, zz, s, kind, i);
    }
    // The existing canopy columns are the endpoints; restrained cloth flags
    // hang over the separated walkway, never over a playable sightline.
    const cableX = x - s * 3.42;
    b.tube('wood', '#655d47', [[cableX, ground + 4.48, z - 2.38], [cableX, ground + 4.22, z], [cableX, ground + 4.48, z + 2.38]], 0.018, 4);
    for (let i = 0; i < 5; i++) {
      const zz = (i - 2) * 0.76, yy = ground + 4.22 + 0.26 * (zz / 2.38) ** 2;
      clothFlag(b, cableX, yy, z + zz, s, CLOTH[(i + kind) % CLOTH.length]);
    }
    if (index % 2 === 0) marketTree(b, crown, x + s * 2.85, ground, z + 3.55, index);
    else quayBench(b, x + s * 0.7, ground, z + 3.5, s);
    // A notice on the outer post gives the building another inhabited face.
    signBoard(b, 'poster', x - s * 3.42, ground + 2.10, z - 2.37, 0.70, 0.35, s);
  });
}

export function dressTidewaterLife(b, layout) {
  if (layout?.map3?.id !== 'tidewater') return;
  for (const o of layout.map3.obstacles) {
    if (/market_screen|civic_screen|arrival_screen/.test(o.id)) coverShop(b, o);
    else if (/mid_screen|spawn_front_screen/.test(o.id)) civicNotices(b, o);
  }
  // These are build-time templates. ArtBuilder clones/transforms each instance,
  // then merges it into the existing material buckets; release the templates now.
  const sphere = new THREE.SphereGeometry(1, 6, 4), crown = new THREE.IcosahedronGeometry(1, 1);
  try {
    for (const s of [-1, 1]) for (const [i, z] of [-53, -29, 11, 40].entries()) marketPavilion(b, sphere, crown, s, i, z);
  } finally { sphere.dispose(); crown.dispose(); }
}
