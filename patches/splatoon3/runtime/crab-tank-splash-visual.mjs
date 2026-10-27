// Detached Crab splash presentation only; the shared queue owns all motion,
// collision, landing paint and lifetime. Never advance or remove queue entries.
// S3 11.3.0 Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6:
// /GameParameters/CannonParam/SplashParam/DrawSizeCollisionPaintParam/DrawRadius=.1.
// Shooter splash draw radius is absent. .055 is a LOCAL VISUAL FALLBACK matching
// the existing InkFlight drop model, not an extracted Crab default. Length scale
// 1 follows INKWAVE's provisional bridge; retail mesh/size parity is unverified.
const CAPACITY = 512; // Shared splash queue's maximum; one bounded GPU batch.
const CANNON_DRAW_RADIUS = .1, SHOOTER_DRAW_RADIUS_FALLBACK = .055;
const FALLBACK_COLOR = 0xffcc33;
const pools = new WeakMap();

function validSystem(system) {
  return system !== null && (typeof system === 'object' || typeof system === 'function');
}

function createPool(THREE) {
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  // Opaque physical ink: no transmission, transparent second pass or shadows.
  // Instance colors multiply white and do not modify any gameplay/team Color.
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: .22, metalness: 0,
    clearcoat: .65, clearcoatRoughness: .14,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.name = 's3-crab-detached-splashes';
  mesh.count = 0; mesh.visible = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  // Refreshed from accepted positions in the existing upload scan.
  mesh.boundingSphere = new THREE.Sphere();
  mesh.frustumCulled = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.crabSplashVisual = {
    capacity: CAPACITY, cannonDrawRadius: CANNON_DRAW_RADIUS,
    shooterDrawRadiusFallback: SHOOTER_DRAW_RADIUS_FALLBACK,
    shooterDrawRadiusStatus: 'local visual fallback; absent from pinned PvP JSON',
  };
  return { mesh, matrix: new THREE.Matrix4(), color: new THREE.Color(),
    matrixRange: { start: 0, count: 0 }, colorRange: { start: 0, count: 0 } };
}

function setDropColor(color, drop, game) {
  const source = game?.teamColors?.[drop.team] ?? drop.owner?.color;
  if (source?.isColor && Number.isFinite(source.r) && Number.isFinite(source.g) && Number.isFinite(source.b)) {
    color.copy(source);
  } else if ((typeof source === 'number' && Number.isFinite(source)) || typeof source === 'string') {
    color.set(source);
  } else color.setHex(FALLBACK_COLOR);
}

/** Call after advanceSplashDrops, before drawing. Returns visible instance count. */
export function updateCrabSplashVisuals(system, game, THREE) {
  if (!validSystem(system)) return 0;
  let pool = pools.get(system);
  const scene = game?.scene;
  if (!scene?.isObject3D || !THREE?.InstancedMesh) {
    if (pool) {
      pool.mesh.count = 0; pool.mesh.visible = false;
      pool.mesh.removeFromParent();
    }
    return 0;
  }
  const queue = system._s3SplashDrops;
  let count = 0, minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let colorStart = Infinity, colorEnd = 0;
  if (Array.isArray(queue)) {
    // Both scan work and GPU storage are bounded even for an oversized fixture.
    const limit = Math.min(queue.length, CAPACITY);
    for (let i = 0; i < limit; i++) {
      const drop = queue[i], mode = drop?.spec?.crabMode, pos = drop?.pos;
      if ((mode !== 'shooter' && mode !== 'cannon') ||
          !Number.isFinite(pos?.x) || !Number.isFinite(pos?.y) || !Number.isFinite(pos?.z)) continue;
      if (!pool) { pool = createPool(THREE); pools.set(system, pool); }
      const radius = mode === 'cannon' ? CANNON_DRAW_RADIUS : SHOOTER_DRAW_RADIUS_FALLBACK;
      pool.matrix.makeScale(radius, radius, radius);
      pool.matrix.setPosition(pos.x, pos.y, pos.z);
      pool.mesh.setMatrixAt(count, pool.matrix);
      setDropColor(pool.color, drop, game);
      const colors = pool.mesh.instanceColor.array, offset = count * 3;
      const oldR = colors[offset], oldG = colors[offset + 1], oldB = colors[offset + 2];
      pool.mesh.setColorAt(count, pool.color);
      // Compare the stored Float32 values, not unrounded Color doubles.
      if (oldR !== colors[offset] || oldG !== colors[offset + 1] || oldB !== colors[offset + 2]) {
        colorStart = Math.min(colorStart, offset); colorEnd = offset + 3;
      }
      minX = Math.min(minX, pos.x - radius); minY = Math.min(minY, pos.y - radius); minZ = Math.min(minZ, pos.z - radius);
      maxX = Math.max(maxX, pos.x + radius); maxY = Math.max(maxY, pos.y + radius); maxZ = Math.max(maxZ, pos.z + radius);
      count++;
    }
  }
  if (pool) {
    const mesh = pool.mesh;
    if (mesh.parent && mesh.parent !== scene) mesh.removeFromParent();
    mesh.count = count; mesh.visible = count > 0;
    if (count) {
      mesh.boundingSphere.center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      mesh.boundingSphere.radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 1e-5;
      if (mesh.parent !== scene) scene.add(mesh);
      // Storage remains at queue capacity. Only the live prefix was rewritten;
      // Three still allocates the complete buffer on its first GPU upload.
      pool.matrixRange.count = count * mesh.instanceMatrix.itemSize;
      mesh.instanceMatrix.updateRanges.length = 0;
      mesh.instanceMatrix.updateRanges.push(pool.matrixRange);
      mesh.instanceMatrix.needsUpdate = true;
      if (colorEnd > colorStart) {
        // A culled frame has not consumed its ranges. Union those changes
        // before reusing the single range record, including shrinking rosters.
        for (const range of mesh.instanceColor.updateRanges) {
          colorStart = Math.min(colorStart, range.start);
          colorEnd = Math.max(colorEnd, range.start + range.count);
        }
        pool.colorRange.start = colorStart; pool.colorRange.count = colorEnd - colorStart;
        mesh.instanceColor.updateRanges.length = 0;
        mesh.instanceColor.updateRanges.push(pool.colorRange);
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }
  return count;
}

/** Idempotent teardown, including GPU instance attributes; queue stays untouched. */
export function clearCrabSplashVisuals(system, game) {
  if (!validSystem(system)) return false;
  const pool = pools.get(system);
  if (!pool) return false;
  pools.delete(system);
  const mesh = pool.mesh;
  mesh.count = 0; mesh.visible = false;
  // Use the actual parent, so teardown also works after G.scene was replaced.
  mesh.removeFromParent();
  mesh.dispose();
  mesh.geometry.dispose();
  mesh.material.dispose();
  return true;
}
