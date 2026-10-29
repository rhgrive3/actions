// Visual references: Nintendo's normal Splatoon 3 Rainmaker illustration
// https://www.nintendo.com/jp/bankara-king/assets_final/img/rule_step02_img_hoko.png
// and its beginner-guide gameplay. These are procedural approximations; sizes,
// particle lifetimes and the impact animation are local presentation choices.
// No collision, damage, paint, charge timers or actor materials are owned here.
const TAU = Math.PI * 2;
const unit = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const step = dt => Number.isFinite(dt) ? Math.max(0, dt) : 0;

function wetInkMaterial(THREE, color, membrane = false) {
  const clock = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ color, roughness: .17,
    metalness: .08, emissive: color, emissiveIntensity: membrane ? .04 : .18,
    ...(membrane ? { transparent: true, opacity: .64, depthWrite: false } : {}) });
  material.onBeforeCompile = shader => {
    shader.uniforms.uHokoTime = clock;
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vHokoLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHokoLocal = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying vec3 vHokoLocal; uniform float uHokoTime;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 hp = vHokoLocal;
        float flow = sin(hp.x*4.2 + hp.y*3.7 + sin(hp.z*5.0 + hp.y*2.0) + uHokoTime*.6)
          + sin(hp.z*4.4 - hp.y*4.8 + sin(hp.x*5.1) - uHokoTime*.45)*.62;
        float inkPatch = smoothstep(.05, .55, flow);
        vec3 paleInk = mix(diffuseColor.rgb, vec3(1.0, .98, .63), .70);
        diffuseColor.rgb = mix(diffuseColor.rgb*.80, paleInk, inkPatch*${membrane ? '.86' : '.32'});
      `);
  };
  material.customProgramCacheKey = () => membrane ? 'rainmaker-wet-membrane-v1' : 'rainmaker-wet-shot-v1';
  material.userData.rainmakerClock = clock;
  return material;
}

export function createRainmakerBarrier(THREE) {
  const geometry = new THREE.SphereGeometry(1.45, 40, 24);
  // A smooth liquid shell. The shot's torn/patchy ink shader made the large
  // shield look mottled and muddy; its surface now uses lighting and a thin
  // view-dependent rim, rather than painted-on pale regions.
  const material = new THREE.MeshStandardMaterial({
    color: 0xffe585, emissive: 0xffe585, emissiveIntensity: .12,
    roughness: .12, metalness: 0, transparent: true, opacity: .24, depthWrite: false,
  });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      float hokoRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1.0), .35), hokoRim*.35);
      diffuseColor.a = mix(diffuseColor.a, min(1.0, diffuseColor.a+.50), hokoRim);
      totalEmissiveRadiance += diffuseColor.rgb * hokoRim * .28;
    `);
  };
  material.customProgramCacheKey = () => 'rainmaker-smooth-barrier-v2';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'rainmaker-barrier'; mesh.position.y = 1;
  let lastColor;
  function update(barrier = {}, color = 0xffe585) {
    const max = Math.max(1, Number.isFinite(barrier.max) ? barrier.max : 1000);
    const pressure = Number.isFinite(barrier.balance) ? unit(Math.abs(barrier.balance) / max)
      : 1 - unit((Number.isFinite(barrier.health) ? barrier.health : max) / max);
    // Match the established collision sphere, including its fixed ground cut.
    const scale = (1.5 + 1.2 * pressure) / 1.45;
    if (mesh.scale.x !== scale || mesh.scale.y !== scale || mesh.scale.z !== scale) mesh.scale.setScalar(scale);
    const visible = barrier.active !== false;
    if (mesh.visible !== visible) mesh.visible = visible;
    if (lastColor !== color) { material.color.setHex(color); material.emissive.setHex(color); lastColor = color; }
    const opacity = .24 + .66 * pressure;
    if (material.opacity !== opacity) material.opacity = opacity;
    mesh.userData.pressure = pressure;
  }
  update();
  return { mesh, update };
}

function glowMaterial(THREE, rays = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uPower: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vHokoUv;
      void main(){vHokoUv=uv;vec4 p=modelViewMatrix*vec4(0.,0.,0.,1.);
        p.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));
        gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vHokoUv; uniform float uPower; uniform float uTime;
      void main(){vec2 p=(vHokoUv-.5)*2.;float r=length(p);if(r>1.)discard;
        float a=exp(-r*r*6.)*(1.-smoothstep(.35,1.,r));
        ${rays ? 'float angle=atan(p.y,p.x);a+=pow(max(0.,cos(angle*13.+uTime*.25)),36.)*pow(1.-r,1.5)*.8;' : ''}
        gl_FragColor=vec4(mix(vec3(1.,.52,.035),vec3(1.,.96,.46),exp(-r*5.)),a*uPower);}`,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

export function createRainmakerChargeAura(THREE) {
  const group = new THREE.Group(); group.name = 'rainmaker-carrier-aura'; group.visible = false;
  const body = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.8), glowMaterial(THREE, true));
  body.name = 'rainmaker-body-glow'; body.position.y = 1.05; body.frustumCulled = false;
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), glowMaterial(THREE, true));
  mouth.name = 'rainmaker-muzzle-glow'; mouth.frustumCulled = false;
  const material = new THREE.MeshBasicMaterial({ color: 0xffed8b, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const motes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), material, 16);
  motes.name = 'rainmaker-charge-motes'; motes.frustumCulled = false;
  group.add(body, mouth, motes);
  const transform = new THREE.Object3D(), point = new THREE.Vector3();
  let age = 0, flash = 0, lastSequence = null;
  function update(carrier, charge, core, dt = 0, sequence = 0) {
    const delta = step(dt); age += delta;
    group.visible = !!carrier && carrier.alive !== false && core.visible && carrier.form !== 'squid';
    if (!group.visible) { lastSequence = null; flash = 0; return; }
    if (lastSequence !== null && sequence !== lastSequence) flash = .18;
    lastSequence = sequence; flash = Math.max(0, flash - delta);
    const q = unit(charge), power = .26 + .48 * q + .5 * unit(flash / .18);
    point.copy(carrier.pos); group.parent?.worldToLocal(point); group.position.copy(point);
    group.updateWorldMatrix(true, false); core.updateWorldMatrix(true, false);
    point.fromArray(core.userData.rainmakerModel.muzzle); core.localToWorld(point); group.worldToLocal(point);
    mouth.position.copy(point);
    body.material.uniforms.uPower.value = power;
    mouth.material.uniforms.uPower.value = .22 + .75 * q + unit(flash / .18);
    body.material.uniforms.uTime.value = mouth.material.uniforms.uTime.value = age;
    for (let i = 0; i < 16; i++) {
      const phase = (age * (.30 + q * .25) + i / 16) % 1, angle = i * 2.39996 + age * .35;
      const radius = .25 + .35 * ((i * 7 % 13) / 13);
      transform.position.set(Math.cos(angle) * radius, .15 + phase * 1.8, Math.sin(angle) * radius);
      transform.scale.setScalar((.018 + (i % 3) * .008) * (.6 + q) * Math.sin(phase * Math.PI));
      transform.updateMatrix(); motes.setMatrixAt(i, transform.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;
    group.userData.charge = q;
  }
  return { group, update };
}

function inkTailGeometry(THREE) {
  const positions = [], indices = [], rings = 6, sides = 18;
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= sides; i++) {
    const t = j / rings, angle = i / sides * TAU + t * .75;
    const r = (.07 + .36 * t) * (1 + .16 * Math.sin(angle * 5 + t * 8));
    positions.push(Math.cos(angle) * r, Math.sin(angle) * r, -1.6 * (1 - t) - .12);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) {
    // Open gaps give the stretching sheet the torn liquid silhouette in the
    // reference. They are geometry, so low quality/bloom-off still shows them.
    if (j > 0 && j < rings - 1 && (i * 7 + j * 11) % 17 < 3) continue;
    const a = j * (sides + 1) + i, b = a + sides + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

// A bounded pool for detonation/impact droplets, shared immutable shot geometry,
// and one cached material per team color. No per-frame geometry/material churn.
export function createRainmakerAttackVisuals(THREE, scene) {
  let headGeometry, tailGeometry, dropletGeometry, burstRoot;
  const materials = new Map(), bursts = [], transform = new THREE.Object3D();
  const forward = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  function resources(color) {
    const key = color?.isColor ? `${color.r}:${color.g}:${color.b}` : String(color);
    let material = materials.get(key);
    if (!material) { material = wetInkMaterial(THREE, color); material.side = THREE.DoubleSide;
      material.forceSinglePass = true; materials.set(key, material); }
    headGeometry ||= new THREE.SphereGeometry(1, 20, 12);
    tailGeometry ||= inkTailGeometry(THREE);
    dropletGeometry ||= new THREE.SphereGeometry(1, 7, 5);
    return material;
  }
  function shot(color, charge, position = null) {
    const material = resources(color), group = new THREE.Group(), q = unit(charge);
    group.name = 'rainmaker-shot';
    const head = new THREE.Mesh(headGeometry, material); head.name = 'rainmaker-shot-head';
    const tail = new THREE.Mesh(tailGeometry, material); tail.name = 'rainmaker-shot-ink-sheet';
    const drops = new THREE.InstancedMesh(dropletGeometry, material, 12);
    drops.name = 'rainmaker-shot-droplets'; drops.frustumCulled = false;
    group.add(head, tail, drops);
    group.userData.rainmakerShot = { head, tail, drops, q };
    if (position) group.position.fromArray(position);
    scene.add(group); return group;
  }
  function updateShot(group, velocity, age, landed = false, wait = 0) {
    const { head, tail, drops, q } = group.userData.rainmakerShot;
    const radius = .20 + .25 * q;
    if (landed) {
      group.quaternion.identity(); head.position.y = .08;
      const pulse = 1 + .12 * Math.sin(wait * 60);
      head.scale.set(radius * pulse, radius * .4, radius * pulse);
      tail.visible = drops.visible = false;
    } else {
      direction.copy(velocity); if (direction.lengthSq() < 1e-8) direction.copy(forward);
      group.quaternion.setFromUnitVectors(forward, direction.normalize());
      head.scale.set(radius, radius * .96, radius * 1.05); head.position.y = 0;
      tail.visible = drops.visible = true;
      tail.scale.set(.5 + .5 * q, .5 + .5 * q, Math.min(1, Math.max(.04, age * velocity.length() / 1.6)));
      transform.quaternion.identity();
      for (let i = 0; i < 12; i++) {
        const a = i * 2.39996 + age * 2, spread = .20 + (i % 4) * .10;
        transform.position.set(Math.cos(a) * spread, Math.sin(a) * spread, -.12 - ((i / 12 + age * .6) % 1) * 1.25);
        const size = (.035 + (i % 3) * .018) * (.6 + .4 * q);
        transform.scale.set(size, size, size * (1.6 + i % 2));
        transform.updateMatrix(); drops.setMatrixAt(i, transform.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
    }
    group.visible = true; group.userData.phase = landed ? 'armed' : 'flight';
  }
  function splash(position, color, radius, kind = 'blast') {
    const material = resources(color);
    if (!burstRoot) { burstRoot = new THREE.Group(); burstRoot.name = 'rainmaker-ink-splashes'; scene.add(burstRoot); }
    let burst = bursts.find(b => !b.mesh.visible);
    if (!burst && bursts.length < 8) {
      const mesh = new THREE.InstancedMesh(dropletGeometry, material, 32);
      mesh.name = 'rainmaker-impact-splash'; mesh.frustumCulled = false;
      burst = { mesh, age: 0 }; bursts.push(burst); burstRoot.add(mesh);
    }
    burst ||= bursts.reduce((a, b) => a.age > b.age ? a : b);
    burst.age = 0; burst.radius = Math.max(.35, Math.min(7, radius));
    burst.kind = kind; burst.mesh.material = material;
    burst.mesh.position.copy(position); burst.mesh.visible = true;
    burst.mesh.userData.phase = kind;
    updateBurst(burst);
  }
  function updateBurst(burst) {
    const { age, mesh, radius, kind } = burst;
    const life = kind === 'impact' ? .34 : .62, t = unit(age / life);
    mesh.visible = t < 1; if (!mesh.visible) return;
    for (let i = 0; i < 32; i++) {
      const a = i * 2.39996, speed = .5 + (i * 7 % 13) / 17;
      const travel = radius * speed * (1 - Math.pow(1 - t, 2));
      transform.position.set(Math.cos(a) * travel,
        .05 + radius * (.25 + i % 5 * .10) * 4 * t * (1 - t), Math.sin(a) * travel);
      const size = radius * (.045 + (i % 4) * .016) * (1 - t) + .001;
      transform.quaternion.setFromAxisAngle(up, -a);
      transform.scale.set(size * (1 + 2 * (1 - t)), size * .75, size);
      // The first lobes remain a connected, rising ink mass while the rest
      // peel off as droplets. A ring of tiny beads alone loses the detonation.
      if (i < (kind === 'blast' ? 8 : 5)) {
        const lobe = radius * (kind === 'blast' ? .26 : .17) * Math.sqrt(1 - t);
        const spread = radius * (.12 + .55 * t);
        transform.position.set(Math.cos(a) * spread,
          lobe * .65 + radius * .55 * Math.sin(Math.PI * t), Math.sin(a) * spread);
        transform.scale.set(lobe * (1.4 + t), lobe * (1.35 + (i % 3) * .23), lobe);
      }
      transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  function update(dt) {
    const delta = step(dt);
    for (const material of materials.values()) material.userData.rainmakerClock.value += delta;
    for (const burst of bursts) if (burst.mesh.visible) { burst.age += delta; updateBurst(burst); }
  }
  function dispose() {
    if (burstRoot) scene.remove(burstRoot);
    for (const burst of bursts) burst.mesh.dispose();
    bursts.length = 0; burstRoot = null;
    headGeometry?.dispose(); tailGeometry?.dispose(); dropletGeometry?.dispose();
    headGeometry = tailGeometry = dropletGeometry = undefined;
    for (const material of materials.values()) material.dispose(); materials.clear();
  }
  return { shot, updateShot, splash, update, dispose };
}
