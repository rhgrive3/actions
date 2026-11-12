export interface TerrainObstacle {
  x: number;
  z: number;
  radius: number;
  height: number;
}

// Shared footprints drive 3D stage obstacles, placement checks, minimap rendering, and unit steering.
const OBSTACLES: Record<number, TerrainObstacle[]> = {
  0: [],
  1: [{ x: 0, z: -19, radius: 3.6, height: 3 }, { x: 0, z: 19, radius: 3.6, height: 3 }],
  2: [{ x: 0, z: -18, radius: 8, height: 11 }, { x: 0, z: 18, radius: 8, height: 11 }],
  3: [{ x: -2, z: -12, radius: 5.5, height: 5 }, { x: 6, z: 15, radius: 5.5, height: 5 }],
  4: [
    { x: 0, z: -12, radius: 3.4, height: 7 },
    { x: 0, z: 12, radius: 3.4, height: 7 },
    { x: 16, z: -27, radius: 3.4, height: 7 },
    { x: 16, z: 27, radius: 3.4, height: 7 },
  ],
};

export function terrainObstacles(scene: number): readonly TerrainObstacle[] {
  return OBSTACLES[scene] ?? OBSTACLES[0];
}

export function terrainClear(scene: number, x: number, z: number, radius = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius)) return false;
  const r = Math.max(0, radius);
  return terrainObstacles(scene).every(o => Math.hypot(x - o.x, z - o.z) >= o.radius + r + 0.1);
}
