// Static presentation only: the existing deck, paint face, route and colliders
// remain owned by RankedWorld. No actor, rule state or per-frame allocation.
// Silhouette reference: Nintendo's Splatoon 3 Tower Control guide screenshots.
export function createTowerModel(THREE, halfWidth, halfLength) {
  const positions = [], normals = [], colors = [];
  const dark = new THREE.Color(0x252a2b);
  const column = new THREE.Color(0x4e5547);
  const rim = new THREE.Color(0x646e70);
  const white = new THREE.Color(0xe2ebe5);
  function append(geometry, tint) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(tint.r, tint.g, tint.b);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
  }
  function box(x, y, z, sx, sy, sz, tint) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(x, y, z); append(g, tint);
  }
  function bar(a, b, radius, tint) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const g = new THREE.CylinderGeometry(radius, radius, direction.length(), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    append(g, tint);
  }
  // Broad square mast and pale bolted collars replace the thin golden rod.
  // Entire mast remains inside the original 0.56-wide, 2.13-high pole volume.
  box(0, 0.89, 0, 0.37, 1.54, 0.37, column);
  box(0, 0.105, 0, 0.50, 0.17, 0.50, white);
  box(0, 1.685, 0, 0.50, 0.15, 0.50, white);
  for (const y of [0.105, 1.685]) for (const side of [-1, 1]) {
    box(side * 0.13, y, 0.253, 0.055, 0.055, 0.008, dark);
    box(side * 0.13, y, -0.253, 0.055, 0.055, 0.008, dark);
    box(0.253, y, side * 0.13, 0.008, 0.055, 0.055, dark);
    box(-0.253, y, side * 0.13, 0.008, 0.055, 0.055, dark);
  }
  // Open, four-sided triangular crown: keep the recognisable negative spaces.
  for (const x of [-0.21, 0.21]) for (const z of [-0.21, 0.21]) {
    bar([x, 1.76, z], [0, 1.99, 0], 0.026, dark);
  }
  // Perimeter trim stays within the existing deck silhouette. Its top sits
  // at .003/.004 to avoid coplanar deck faces, below paint .009 and grate .012;
  // it never creates a walkable overhang or changes the original deck y=0.
  for (const side of [-1, 1]) {
    box(0, -0.042, side * (halfLength - 0.035), halfWidth * 2, 0.09, 0.07, rim);
    box(side * (halfWidth - 0.035), -0.042, 0, 0.07, 0.09, halfLength * 2, rim);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    box(x * (halfWidth - 0.10), -0.046, z * (halfLength - 0.10), 0.20, 0.10, 0.20, white);
  }
  // Index identical position/normal/color tuples: a single static draw, with
  // no textures, cloned materials, transparent overlays or retained builders.
  const unique = new Map(), indices = [], p = [], n = [], c = [];
  for (let i = 0; i < positions.length; i += 3) {
    const key = [positions[i], positions[i + 1], positions[i + 2], normals[i], normals[i + 1], normals[i + 2], colors[i], colors[i + 1], colors[i + 2]].join(',');
    let index = unique.get(key);
    if (index === undefined) {
      index = p.length / 3; unique.set(key, index);
      p.push(...positions.slice(i, i + 3)); n.push(...normals.slice(i, i + 3)); c.push(...colors.slice(i, i + 3));
    }
    indices.push(index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.62 }));
  mesh.name = 'tower-pole';
  return mesh;
}
