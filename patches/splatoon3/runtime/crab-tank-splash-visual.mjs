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
  // Moving instances would otherwise retain an obsolete computed bound.
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.userData.crabSplashVisual = {
    capacity: CAPACITY, cannonDrawRadius: CANNON_DRAW_RADIUS,
    shooterDrawRadiusFallback: SHOOTER_DRAW_RADIUS_FALLBACK,
    shooterDrawRadiusStatus: 'local visual fallback; absent from pinned PvP JSON',
  };
  return { mesh, matrix: new THREE.Matrix4(), color: new THREE.Color() };
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
  let count = 0;
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
      pool.mesh.setColorAt(count, pool.color);
      count++;
    }
  }
  if (pool) {
    const mesh = pool.mesh;
    if (mesh.parent && mesh.parent !== scene) mesh.removeFromParent();
    mesh.count = count; mesh.visible = count > 0;
    if (count) {
      if (mesh.parent !== scene) scene.add(mesh);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
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
