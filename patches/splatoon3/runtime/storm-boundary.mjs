// Temporary rain footprint. Own geometry/material; never writes the paint atlas
// or collision data. Native chart rectangles are not used as surface geometry.
import { excludeFromOverridePasses } from './special-vfx-kit.mjs';

export function updateStormBoundary(cloud, G, scene, radius, THREE) {
  const center = cloud.group.position;
  if (cloud._released || cloud.t >= cloud.dur - 0.3 || !G.level?.faces || !G.level.queryBlocks) {
    if (cloud.rainBoundary) cloud.rainBoundary.visible = false;
    return;
  }
  let mesh = cloud.rainBoundary;
  if (!mesh) {
    const material = new THREE.ShaderMaterial({
      uniforms: { center: { value: center.clone() }, radius: { value: 0 }, alpha: { value: 0 }, color: { value: G.teamColors[cloud.team].clone() } },
      vertexShader: `varying vec3 surface; void main() {
        surface = (modelMatrix * vec4(position, 1.)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(surface, 1.);
      }`,
      fragmentShader: `uniform vec3 center; uniform float radius; uniform float alpha; uniform vec3 color;
        varying vec3 surface;
        void main() {
          float edge = abs(length(surface.xz - center.xz) - radius);
          float aa = max(fwidth(edge), .005);
          float line = 1. - smoothstep(.025, .025 + aa, edge);
          if (surface.y > center.y - .8 || surface.y < center.y - 12.8 || line < .01) discard;
          gl_FragColor = vec4(color * .65 + vec3(.35), line * alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
    });
    mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.name = 'storm-rain-boundary';
    excludeFromOverridePasses(mesh);
    mesh.renderOrder = 5;
    mesh.userData.anchor = new THREE.Vector3(Infinity, Infinity, Infinity);
    cloud.rainBoundary = mesh;
    scene.add(mesh);
  }
  const anchor = mesh.userData.anchor, level = G.level;
  // Keep a margin around the queried surfaces so a moving edge needs only
  // occasional geometry refreshes. The cylinder itself follows every tick.
  if (mesh.userData.level !== level || anchor.distanceToSquared(center) > .75 * .75) {
    const reach = radius + 1, positions = [], seen = new Set();
    const ids = level.queryBlocks(center.x - reach, center.z - reach, center.x + reach, center.z + reach, []);
    const append = (p, n) => positions.push(p.x + n.x * .006, p.y + n.y * .006, p.z + n.z * .006);
    const point = new THREE.Vector3();
    for (const id of ids) {
      const block = level.blocks[id];
      // Collision-only/moving hardware (including the tower) is not a
      // static rain receiver. Do not leave cached geometry floating behind it.
      if (block.hidden) continue;
      for (const faceId of block.faces) {
        if (faceId < 0 || seen.has(faceId)) continue;
        seen.add(faceId);
        const f = level.faces[faceId];
        if (!f?.paintable || f.ceiling) continue;
        if (f.triangles && level.data?.triangles) {
          const source = level.data.triangles;
          for (const triangle of f.triangles) {
            const i = triangle * 9;
            if (Math.max(source[i], source[i+3], source[i+6]) < center.x-reach ||
                Math.min(source[i], source[i+3], source[i+6]) > center.x+reach ||
                Math.max(source[i+2], source[i+5], source[i+8]) < center.z-reach ||
                Math.min(source[i+2], source[i+5], source[i+8]) > center.z+reach ||
                Math.min(source[i+1], source[i+4], source[i+7]) > center.y-.8 ||
                Math.max(source[i+1], source[i+4], source[i+7]) < center.y-12.8) continue;
            for (let k = 0; k < 3; k++) append(point.fromArray(source, i + k * 3), f.n);
          }
        } else {
          for (const [u, v] of [[0,0],[f.su,0],[f.su,f.sv],[0,0],[f.su,f.sv],[0,f.sv]]) {
            append(point.copy(f.origin).addScaledVector(f.u,u).addScaledVector(f.v,v), f.n);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    anchor.copy(center); mesh.userData.level = level;
  }
  const u = mesh.material.uniforms;
  u.center.value.copy(center); u.radius.value = radius * cloud.group.scale.x;
  u.alpha.value = .72 * Math.min(1, cloud.t / .35, Math.max(0, (cloud.dur - .3 - cloud.t) / .3));
  mesh.visible = u.alpha.value > 0;
}

export function disposeStormBoundary(cloud) {
  const mesh = cloud.rainBoundary;
  if (!mesh) return;
  mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose();
  cloud.rainBoundary = null;
}
