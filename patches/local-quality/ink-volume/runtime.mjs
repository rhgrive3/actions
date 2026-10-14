import * as THREE from 'three';

const VERT = `
varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; varying vec3 vColor;
void main(){
  vUv=uv; vColor=instanceColor;
  // Inverse transpose for rotation * positive nonuniform scale (no shear).
  // A long rod/film must retain its actual curved normals after stretching.
  mat3 basis=mat3(instanceMatrix);
  vec3 scale2=vec3(dot(basis[0],basis[0]),dot(basis[1],basis[1]),dot(basis[2],basis[2]));
  vNormal=normalize(normalMatrix*basis*(normal/max(scale2,vec3(1e-12))));
  vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.0);
  vView=-p.xyz; gl_Position=projectionMatrix*p;
}`;
const FRAG = `
uniform sampler2D uMap; uniform vec4 uFrameBounds; uniform vec3 uSunDirV; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uUpV;
varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; varying vec3 vColor;
void main(){
  vec4 tex=texture2D(uMap,clamp(vUv,uFrameBounds.xy,uFrameBounds.zw)); if(tex.a<.5/255.0)discard;
  #ifdef INK_OPAQUE_PASS
    if(tex.a<.99999)discard;
  #else
    if(tex.a>=.99999)discard;
  #endif
  vec3 n=normalize(vNormal), eye=normalize(vView), h=normalize(uSunDirV+eye);
  vec3 ambient=mix(uGround,uSky,dot(n,uUpV)*.5+.5);
  vec3 base=tex.rgb*vColor*(.3+ambient*.5+uSunCol*max(dot(n,uSunDirV),0.0)*.45);
  float fres=.025+.07*pow(1.0-max(dot(n,eye),0.0),4.0);
  vec3 col=base+uSunCol*pow(max(dot(n,h),0.0),32.0)*.07+ambient*fres;
  gl_FragColor=vec4(col,tex.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function animationFrame(age, count, fps) {
  if (!Number.isFinite(age) || !Number.isInteger(count) || count < 1 || !Number.isFinite(fps) || fps <= 0) throw Error('Invalid ink animation');
  return Math.min(count - 1, Math.max(0, Math.floor(age * fps + 1e-8)));
}

// Bounded frame/LOD batches. No geometry/material allocation in gameplay.
// No physics, RNG, camera-facing orientation, paint or damage authority here.
export class InkVolumes {
  constructor(root, lighting, { capacity = 128, maxDistance = 65, lodDistance = 22, triangleBudget = 600000 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1024) throw Error('Invalid volume capacity');
    if (!Number.isFinite(maxDistance) || maxDistance <= 0 || !Number.isFinite(lodDistance) || lodDistance <= 0 || lodDistance > maxDistance || !Number.isFinite(triangleBudget) || triangleBudget < 0) throw Error('Invalid volume budget or distance');
    this.isInkVolumes = true; this.root = root; this.light = lighting; this.capacity = capacity; this.maxDistance = maxDistance; this.lodDistance = lodDistance; this.triangleBudget = triangleBudget;
    this.assets = new Map(); this.camera = null; this.disposed = false;
    this.bindings = new WeakMap(); this.matrix = new THREE.Matrix4(); this.scale = new THREE.Vector3();
    this.singlePart = { name: '', size: 1, pattern: 0 }; this.singleParts = [this.singlePart];
    this.plans = Array.from({ length: 8 }, () => ({ matrix: new THREE.Matrix4(), batch: null, culled: false }));
    this.dir = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.z = new THREE.Vector3(0, 0, 1);
    this.clip = new THREE.Matrix4(); this.frustum = new THREE.Frustum(); this.sphere = new THREE.Sphere();
    this.metrics = { active: 0, culled: 0, overflow: 0, triangles: 0, bytes: 0, batches: 0 };
  }
  // The caller owns a decoded pack; register creates owned GPU resources.
  register(name, pack) {
    if (this.disposed || this.assets.has(name)) throw Error('Ink volume name already registered or engine disposed');
    if (!pack || pack.schema !== 'inkwave-volume-v1' || !Array.isArray(pack.patterns) || !pack.patterns.length || pack.patterns.length > 8) throw Error('Invalid volume pack');
    const asset = { patterns: [], resources: [], bytes: 0 };
    try {
      for (const p of pack.patterns) {
        if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width < 1 || p.height < 1 || p.width > 512 || p.height > 512 || !Array.isArray(p.frames) || p.frames.length < 1 || p.frames.length > 32 || !(p.fps > 0 && p.fps <= 120)) throw Error('Invalid volume pattern');
        const cols = Math.ceil(Math.sqrt(p.frames.length)), rows = Math.ceil(p.frames.length / cols), atlas = new Uint8Array(p.width * cols * p.height * rows * 4);
        for (let f = 0; f < p.frames.length; f++) {
          const rgba = p.frames[f].rgba; if (rgba.length !== p.width * p.height * 4) throw Error('Invalid source pixels');
          for (let y = 0; y < p.height; y++) atlas.set(rgba.subarray(y * p.width * 4, (y + 1) * p.width * 4), (((Math.floor(f / cols) * p.height + p.height - 1 - y) * p.width * cols) + f % cols * p.width) * 4);
        }
        const texture = new THREE.DataTexture(atlas, p.width * cols, p.height * rows);
        texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
        asset.resources.push(texture); asset.bytes += atlas.byteLength;
        const L = this.light, uniforms = { uMap: { value: texture }, uFrameBounds: { value: new THREE.Vector4() }, uSunDirV: { value: new THREE.Vector3() }, uUpV: { value: new THREE.Vector3() }, uSunCol: { value: L.sunCol }, uSky: { value: L.sky }, uGround: { value: L.ground } };
        const material = new THREE.ShaderMaterial({ uniforms, defines: { INK_OPAQUE_PASS: 1 }, vertexShader: VERT, fragmentShader: FRAG, transparent: false, depthWrite: true, side: THREE.FrontSide });
        const fringeMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.FrontSide });
        asset.resources.push(material,fringeMaterial);
        const aspect=p.meshAspect??p.width/p.height;if(!(aspect>0)||!Number.isFinite(aspect))throw Error('Invalid ink mesh aspect');
        const pattern = { fps: p.fps, frames: [], uniforms, radius: 0, aspect };
        for (let f = 0; f < p.frames.length; f++) {
          const levels = [];
          if (!Array.isArray(p.frames[f].levels) || p.frames[f].levels.length !== 2) throw Error('Expected two ink LODs');
          for (const data of p.frames[f].levels) {
            validateMesh(data);
            const g = new THREE.BufferGeometry(); asset.resources.push(g);
            const uv = data.uvs.slice(); for (let i = 0; i < uv.length; i += 2) { uv[i] = (uv[i] + f % cols) / cols; uv[i + 1] = (uv[i + 1] + Math.floor(f / cols)) / rows; }
            const opaque=data.opaqueIndices||data.indices,partial=data.fringeIndices||data.indices,drawIndices=new data.indices.constructor(opaque.length+partial.length);drawIndices.set(opaque);drawIndices.set(partial,opaque.length);
            // Packed views share one large source buffer, including unused
            // master indices/source UVs. Retain just the required attributes
            // so registration does not pin that complete decode in memory.
            g.setAttribute('position', new THREE.BufferAttribute(data.positions.slice(), 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(drawIndices, 1)); g.setAttribute('normal', new THREE.BufferAttribute(data.normals.slice(), 3, data.normals instanceof Int16Array)); g.setDrawRange(0,opaque.length);g.computeBoundingSphere();
            pattern.radius = Math.max(pattern.radius, g.boundingSphere.radius + g.boundingSphere.center.length());
            const mesh = new THREE.InstancedMesh(g, material, this.capacity);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, new THREE.Color()); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
            // Opaque ink writes depth; source-alpha fringe blends against that
            // depth without hiding the solid surface behind it. Both passes
            // share all geometry and instance buffers, never duplicate sprites.
            const fg=new THREE.BufferGeometry();asset.resources.push(fg);for(const [key,a] of Object.entries(g.attributes))fg.setAttribute(key,a);fg.setIndex(g.index);fg.setDrawRange(opaque.length,partial.length);
            const fringe = new THREE.InstancedMesh(fg,fringeMaterial,1); fringe.instanceMatrix=mesh.instanceMatrix; fringe.instanceColor=mesh.instanceColor;
            const bounds=[(f%cols+.5/p.width)/cols,(Math.floor(f/cols)+.5/p.height)/rows,(f%cols+1-.5/p.width)/cols,(Math.floor(f/cols)+1-.5/p.height)/rows];
            const before=(_renderer,_scene,_camera,_geometry,mat)=>{uniforms.uFrameBounds.value.set(...bounds);mat.uniformsNeedUpdate=true;};mesh.onBeforeRender=fringe.onBeforeRender=before;
            mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.name = 'InkVolume:' + name + ':' + f + ':' + levels.length;
            fringe.count=0;fringe.frustumCulled=false;fringe.castShadow=false;fringe.name=mesh.name+':fringe';
            // Empty batches stay out of the render list: an instanced mesh with count 0 draws nothing, but a visible one
            // still costs three.js its program/state/VAO setup and this onBeforeRender's full uniform upload every frame.
            mesh.visible=fringe.visible=false;
            const batch = { mesh, fringe, triangles:drawIndices.length/3, n: 0, matrixRange: { start: 0, count: 0 }, colorRange: { start: 0, count: 0 } }; levels.push(batch);
            asset.bytes += data.positions.byteLength + data.normals.byteLength + uv.byteLength + drawIndices.byteLength + this.capacity * 19 * 4;
          }
          pattern.frames.push(levels);
        }
        asset.patterns.push(pattern);
      }
      for (const p of asset.patterns) for (const levels of p.frames) for (const b of levels) this.root.add(b.mesh,b.fringe);
      this.assets.set(name, asset); this.metrics.bytes += asset.bytes;
      return asset;
    } catch (error) { for (const r of asset.resources) r.dispose(); throw error; }
  }
  begin(camera = this.camera) {
    this.camera = camera; this.metrics.active = this.metrics.culled = this.metrics.overflow = this.metrics.triangles = this.metrics.batches = 0;
    if (camera) { camera.updateMatrixWorld(); this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.clip); }
    for (const a of this.assets.values()) for (const p of a.patterns) {
      if (camera) { p.uniforms.uSunDirV.value.copy(this.light.sunDir).transformDirection(camera.matrixWorldInverse); p.uniforms.uUpV.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse); }
      for (const ls of p.frames) for (const b of ls) { b.n = 0; b.mesh.count = b.fringe.count = 0; b.mesh.visible = b.fringe.visible = false; }
    }
  }
  submit(name, source, size, patternIndex = 0) {
    this.singlePart.name=name; this.singlePart.size=size; this.singlePart.pattern=patternIndex;
    return this.submitComposite(source, this.singleParts);
  }
  // Atomic presentation: either all visible components fit or the caller can
  // draw its existing effect. Parts and scratch matrices are reused in flight.
  submitComposite(source, parts) {
    if (this.disposed || !Array.isArray(parts) || parts.length < 1 || parts.length > this.plans.length || !Number.isFinite(source.age)) return false;
    let binding = this.bindings.get(source);
    const generation = source.generation ?? source._qualityGeneration ?? 0;
    if (!binding || binding.generation !== generation || source.age < binding.age) {
      this.dir.copy(source._inkVolumeDirection || source.vel); if (this.dir.lengthSq() < 1e-10) this.dir.set(0, 0, 1); this.dir.normalize(); this.q.setFromUnitVectors(this.z, this.dir);
      if (!binding) { binding = { generation, age: source.age, q: this.q.clone() }; this.bindings.set(source, binding); }
      else { binding.generation = generation; binding.age = source.age; binding.q.copy(this.q); }
    }
    binding.age = source.age;
    let active=0,triangles=0,culled=0;
    for(let i=0;i<parts.length;i++) {
      const part=parts[i],asset=this.assets.get(part.name),size=part.size;
      if(!asset || !(size>0) || !Number.isFinite(size)) return false;
      const p=asset.patterns[Math.abs((part.pattern||0)|0)%asset.patterns.length],pos=part.position||source.pos;
      if(part.stretch)this.scale.copy(part.stretch).multiplyScalar(size);else this.scale.setScalar(size);
      if(!finiteVector(this.scale)||!finiteVector(pos)||Math.min(this.scale.x,this.scale.y,this.scale.z)<=0)return false;
      const q=part.rotation||binding.q;if(!Number.isFinite(q.x)||!Number.isFinite(q.y)||!Number.isFinite(q.z)||!Number.isFinite(q.w)||Math.abs(q.lengthSq()-1)>.001)return false;
      const distance=this.camera?this.camera.position.distanceToSquared(pos):0,plan=this.plans[i];
      this.sphere.center.copy(pos);this.sphere.radius=Math.max(this.scale.x,this.scale.y,this.scale.z)*p.radius;
      plan.culled=distance>this.maxDistance**2||(this.camera&&!this.frustum.intersectsSphere(this.sphere));
      if(plan.culled){culled++;continue;}
      plan.batch=p.frames[animationFrame(source.age,p.frames.length,p.fps)][distance>this.lodDistance**2?1:0];
      plan.matrix.compose(pos,q,this.scale);active++;triangles+=plan.batch.triangles;
    }
    if(this.metrics.active+active>this.capacity||this.metrics.triangles+triangles>this.triangleBudget){this.metrics.overflow++;return false;}
    for(let i=0;i<parts.length;i++) {
      const plan=this.plans[i];if(plan.culled)continue;const b=plan.batch;
      b.mesh.setMatrixAt(b.n,plan.matrix);b.mesh.setColorAt(b.n,source.owner.color);b.n++;
    }
    this.metrics.active+=active;this.metrics.triangles+=triangles;this.metrics.culled+=culled;return true;
  }
  end() {
    for (const a of this.assets.values()) for (const p of a.patterns) for (const ls of p.frames) for (const b of ls) {
      b.mesh.count = b.mesh.geometry.drawRange.count ? b.n : 0; b.fringe.count = b.fringe.geometry.drawRange.count ? b.n : 0;
      b.mesh.visible = b.mesh.count > 0; b.fringe.visible = b.fringe.count > 0; if (!b.n) continue; this.metrics.batches+=Number(b.mesh.count>0)+Number(b.fringe.count>0);
      upload(b.mesh.instanceMatrix, b.matrixRange, b.n);
      upload(b.mesh.instanceColor, b.colorRange, b.n);
    }
  }
  clear() { this.bindings = new WeakMap(); this.begin(); }
  unregister(name) {
    const a = this.assets.get(name); if (!a) return;
    for (const p of a.patterns) for (const ls of p.frames) for (const b of ls) { this.root.remove(b.mesh,b.fringe); b.mesh.dispose(); b.fringe.dispose(); }
    for (const r of a.resources) r.dispose(); this.metrics.bytes -= a.bytes; this.assets.delete(name);
    // Preflight scratch must not retain the disposed batch/buffer graph.
    for(const plan of this.plans)plan.batch=null;
  }
  dispose() { for (const name of this.assets.keys()) this.unregister(name); this.bindings = new WeakMap(); this.disposed = true; }
}
function validateMesh(d) {
  if (!(d.positions instanceof Float32Array) || !(d.normals instanceof Float32Array || d.normals instanceof Int16Array) || d.normals.length !== d.positions.length || !(d.uvs instanceof Float32Array) || !(d.indices instanceof Uint16Array || d.indices instanceof Uint32Array) || d.positions.length % 3 || d.uvs.length !== d.positions.length / 3 * 2 || d.indices.length % 3 || d.positions.length > 1500000 || d.indices.length > 3000000) throw Error('Invalid ink mesh buffers');
  for (const x of d.positions) if (!Number.isFinite(x)) throw Error('Invalid ink vertex');
  const normalScale=d.normals instanceof Int16Array?32767:1;
  for (let i = 0; i < d.normals.length; i += 3) { const length = Math.hypot(d.normals[i]/normalScale, d.normals[i + 1]/normalScale, d.normals[i + 2]/normalScale); if (!Number.isFinite(length) || Math.abs(length - 1) > .001) throw Error('Invalid ink normal'); }
  for (const x of d.uvs) if (!Number.isFinite(x) || x < -.01 || x > 1.01) throw Error('Invalid ink UV');
  for (const x of d.indices) if (x >= d.positions.length / 3) throw Error('Invalid ink index');
  if(d.opaqueIndices||d.fringeIndices)for(const a of [d.opaqueIndices,d.fringeIndices]){if(!(a instanceof d.indices.constructor)||a.length%3||a.length>3000000)throw Error('Invalid ink opacity indices');for(const x of a)if(x>=d.positions.length/3)throw Error('Invalid ink opacity index');}
}

function upload(attribute, range, count) {
  range.count = count * attribute.itemSize; attribute.updateRanges.length = 0; attribute.updateRanges.push(range); attribute.needsUpdate = true;
}
function finiteVector(v) { return Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z); }
