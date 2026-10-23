// Temporary rain footprint. Own geometry/material; never writes the paint atlas
// or collision data. Native chart rectangles are not used as surface geometry.
import { excludeFromOverridePasses } from './special-vfx-kit.mjs';
import { stormBoundarySceneState, clipStormBoundary, collectStormBoundaryTriangles } from './storm-boundary-occlusion.mjs';

export function updateStormBoundary(cloud, G, scene, radius, THREE) {
  const center = cloud.group.position;
  if (cloud._released || cloud.t >= cloud.dur || !G.level?.faces || !G.level.queryBlocks) {
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
  const state=mesh.userData;state.reach=radius+1;
  const collisionKey=stormBoundarySceneState(level,center,state.reach,state);
  if (state.level !== level || state.collisionKey !== collisionKey || state.rainTop !== center.y-.8 || anchor.distanceToSquared(center) > .75 * .75) {
    const reach = radius + 1, positions = [], seen = new Set();state.receiverFaces=[];
    const ids=state.sceneOverflow?[]:state.ids;
    collectStormBoundaryTriangles(level,center,reach,state,THREE);
    const append = (p, n) => positions.push(p.x + n.x * .006, p.y + n.y * .006, p.z + n.z * .006);
    const point = new THREE.Vector3();
    if(level.native && !state.sourceFallback)for(const triangle of state.triangleIds){
      const faceId=level.data.triangleFace[triangle], f=level.faces[faceId];
      if(!f?.paintable || f.ceiling || level.blocks[f.block]?.hidden)continue;
      state.receiverFaces.push(faceId);
      for(let k=0;k<3;k++)append(point.fromArray(level.triangleWorld.triangles,triangle*9+k*3),f.n);
    }
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
        // Native static triangles come directly from the bounded BVH above.
        if(f.triangles)continue;
        state.receiverFaces.push(faceId,faceId);
        for(const [u,v] of [[0,0],[f.su,0],[f.su,f.sv],[0,0],[f.su,f.sv],[0,f.sv]])
          append(point.copy(f.origin).addScaledVector(f.u,u).addScaledVector(f.v,v),f.n);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(clipStormBoundary(positions,cloud,G,state,THREE), 3));
    geometry.computeBoundingSphere();
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    anchor.copy(center); state.level=level;state.collisionKey=collisionKey;state.rainTop=center.y-.8;
  }
  const u = mesh.material.uniforms;
  u.center.value.copy(center); u.radius.value = radius * cloud.group.scale.x;
  u.alpha.value = .72 * Math.min(1, cloud.t / .35);
  mesh.visible = u.alpha.value > 0 && !state.occlusion?.fallback;
}

export function disposeStormBoundary(cloud) {
  const mesh = cloud.rainBoundary;
  if (!mesh) return;
  mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose();
  cloud.rainBoundary = null;
}
