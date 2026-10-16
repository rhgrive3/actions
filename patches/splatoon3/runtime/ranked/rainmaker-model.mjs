// Lightweight objective presentation. Rule state, shot origins and collision are
// owned by ranked/rainmaker.mjs and combat.mjs, never by this visual model.
// Broad silhouette reference: Nintendo's Splatoon 3 beginner guide, 03/006_en.
export function createRainmakerModel(THREE) {
  const position = [], normal = [], color = [];
  const gold = new THREE.Color(0xe5b52f), rim = new THREE.Color(0xffd85e);
  const dark = new THREE.Color(0x352b19);
  function append(geometry, tint) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      position.push(p.getX(i), p.getY(i), p.getZ(i));
      normal.push(n.getX(i), n.getY(i), n.getZ(i));
      color.push(tint.r, tint.g, tint.b);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  function oval(center, scale, tint = gold, segments = 8, rings = 5) {
    const g = new THREE.SphereGeometry(1, segments, rings);
    g.scale(...scale); g.translate(...center); append(g, tint);
  }
  function fin(points, thickness = .025) {
    // Closed, low-sided prism: broad fins, without engraved detail or textures.
    const a = points.map(p => [p[0] - thickness / 2, p[1], p[2]]);
    const b = points.map(p => [p[0] + thickness / 2, p[1], p[2]]);
    const p = [], tri = (x, y, z) => p.push(...x, ...y, ...z);
    for (let i = 1; i < points.length - 1; i++) { tri(a[0], a[i + 1], a[i]); tri(b[0], b[i], b[i + 1]); }
    for (let i = 0; i < points.length; i++) { const j = (i + 1) % points.length; tri(a[i], a[j], b[j]); tri(a[i], b[j], b[i]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals(); append(g, gold);
  }
  // +Z is the mouth/aim direction; the origin sits at the existing right grip.
  oval([0, .25, -.10], [.25, .29, .44]);
  // Keep the head behind the open muzzle instead of sealing its dark aperture.
  oval([0, .28, .25], [.29, .31, .19]);
  const mouth = new THREE.TorusGeometry(.207, .045, 4, 12);
  mouth.scale(1, 1.12, 1); mouth.translate(0, .24, .47); append(mouth, rim);
  const inside = new THREE.CircleGeometry(.205, 12); inside.scale(1, 1.12, 1);
  inside.translate(0, .24, .455); append(inside, dark);
  for (const side of [-1, 1]) {
    oval([side * .226, .455, .267], [.069, .080, .066], rim, 6, 4);
    oval([side * .258, .455, .292], [.025, .035, .032], dark, 5, 3);
    fin([[side * .20, .20, -.20], [side * .47, .15, -.45], [side * .38, .10, -.02]], .035);
  }
  // Upturned tail and dorsal fan define the recognisable gold-fish outline.
  oval([0, .39, -.49], [.12, .20, .14], gold, 6, 4);
  fin([[0, .40, -.46], [0, .82, -.72], [0, .90, -.97], [0, .63, -.85], [0, .52, -1.00], [0, .32, -.62]], .045);
  fin([[0, .49, -.34], [0, .68, -.28], [0, .62, .05], [0, .50, .16]], .04);
  // Broad grip support is part of the same mesh, with no separate draw call.
  const grip = new THREE.BoxGeometry(.105, .25, .12); grip.translate(0, .025, -.035); append(grip, gold);
  // Merge the primitives once and index identical vertices. No per-frame geometry.
  const unique = new Map(), indices = [], p = [], n = [], c = [];
  for (let i = 0; i < position.length; i += 3) {
    const key = [position[i], position[i + 1], position[i + 2], normal[i], normal[i + 1], normal[i + 2], color[i], color[i + 1], color[i + 2]].join(',');
    let index = unique.get(key);
    if (index === undefined) {
      index = p.length / 3; unique.set(key, index);
      p.push(position[i], position[i + 1], position[i + 2]);
      n.push(normal[i], normal[i + 1], normal[i + 2]);
      c.push(color[i], color[i + 1], color[i + 2]);
    }
    indices.push(index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .65, roughness: .34 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'rainmaker-core'; mesh.castShadow = true;
  mesh.userData.rainmakerModel = { revision: 1, grip: [0, 0, 0], muzzle: [0, .24, .515] };
  return mesh;
}

/** Borrow a live hand anchor without changing the Character or its pose/weapon. */
export function createRainmakerPresentation(THREE, mesh) {
  const hidden = new Map(), current = new Set();
  const point = new THREE.Vector3(), aim = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, 1);
  const parentQ = new THREE.Quaternion(), aimQ = new THREE.Quaternion();
  let actor = null;
  function release() {
    for (const [pivot, visible] of hidden) pivot.visible = visible;
    hidden.clear(); actor = null;
  }
  function update(carrier, charge = 0) {
    const ch = carrier?.character, hand = ch?.bones?.handR;
    const available = carrier?.alive !== false && hand?.getWorldPosition && ch?.weapon?.pivot && mesh.parent;
    if (actor !== carrier || !available) release();
    mesh.visible = true;
    if (available) {
      actor = carrier;
      // Retain each original value, including intentionally hidden weapons.
      // Reconcile a weapon change while carrying instead of leaking invisibility.
      current.clear();
      for (let w = ch.weapon; w; w = w.left) current.add(w.pivot);
      for (const [pivot, visible] of hidden) if (!current.has(pivot)) { pivot.visible = visible; hidden.delete(pivot); }
      for (const pivot of current) { if (!hidden.has(pivot)) hidden.set(pivot, pivot.visible); pivot.visible = false; }
      hand.updateWorldMatrix(true, false);
      hand.getWorldPosition(point); mesh.parent.worldToLocal(point); mesh.position.copy(point);
      const dir = carrier.aimDir;
      if (dir && Number.isFinite(dir.x) && Number.isFinite(dir.y) && Number.isFinite(dir.z) && dir.lengthSq() > 1e-12) aim.copy(dir).normalize();
      else { const yaw = Number.isFinite(carrier.yaw) ? carrier.yaw : 0; aim.set(Math.sin(yaw), 0, Math.cos(yaw)); }
      aimQ.setFromUnitVectors(forward, aim);
      mesh.parent.getWorldQuaternion(parentQ); mesh.quaternion.copy(parentQ.invert()).multiply(aimQ);
      // Swimming/death presentation follows the existing hand's visibility tree.
      for (let node = hand; node; node = node.parent) if (!node.visible) mesh.visible = false;
      mesh.userData.carrier = String(carrier.nid ?? `${carrier.team}:${carrier.slot}`);
    } else {
      mesh.position.set(0, 1, 0); mesh.quaternion.identity(); delete mesh.userData.carrier;
    }
    mesh.material.emissive.setHex(charge >= 1 ? 0xffdc5c : 0x000000);
    mesh.material.emissiveIntensity = charge >= 1 ? .45 : 0;
  }
  return { update, release };
}
