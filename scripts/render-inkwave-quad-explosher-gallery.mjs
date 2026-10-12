#!/usr/bin/env node
// Visual review evidence for the per-main-weapon models: an orthographic side
// view matching the official 3D weapon renders (muzzle to the right, seen from
// the weapon's right side, transparent background), a 3/4 view, and the actual
// Actor/Runner/Character holding it while idle, carrying, firing and charging.
// The images are comparison evidence, not a retail-parity score.
//   node scripts/render-inkwave-weapon-gallery.mjs --site <built site> --out <dir> [--ids a,b] [--no-held]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
const hostStart={at:new Date().toISOString(),load:os.loadavg(),cpuCount:os.cpus().length};
import { chromium } from 'playwright';

const arg = (name, fallback) => { const n = process.argv.indexOf(name); return n < 0 ? fallback : process.argv[n + 1]; };
const site = path.resolve(arg('--site', '_site')), out = path.resolve(arg('--out', '.ci-scratch/weapon-gallery'));
const ids = (arg('--ids', '') || '').split(',').filter(Boolean), held = !process.argv.includes('--no-held');
const environmentMode=arg('--environment','studio1024');
const size = Number(arg('--size', 400)), crowd = process.argv.includes('--crowd');
fs.mkdirSync(out, { recursive: true });
const identity = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const prefix = '/_versions/' + identity.build.revision + '/';
const server = http.createServer((req, res) => {
  if (req.url === '/review') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);
    return;
  }
  const p = path.resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!p.startsWith(site + '/') || !fs.existsSync(p)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', /\.m?js$/.test(p) ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser; const errors = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: size * 2, height: size * 2 } });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/review');
  await page.evaluate(async ({ prefix, size, environmentMode }) => {
    const THREE = await import('three'), { install } = await import(prefix + 'patches/splatoon3/runtime/install.mjs');
    const profile = await fetch(prefix + 'patches/splatoon3/profile.json').then(r => r.json());
    const api = install(profile), { G, Physics } = api;
    // bootstrap.mjs installs the catalogue main-weapon runtime after install(); without it s3-* weapons never fire
    const { installWeaponsFidelity } = await import(prefix + 'patches/splatoon3/runtime/weapons-fidelity.mjs');
    const { installMainWeaponCatalogRuntime } = await import(prefix + 'patches/splatoon3/runtime/main-weapon-catalog.mjs');
    installWeaponsFidelity(api, profile); installMainWeaponCatalogRuntime(api, profile);
    const W = await import(prefix + 'src/game/character-weapons.js'), Mt = await import(prefix + 'src/game/character-mats.js');
    const R = await import(prefix + 'patches/splatoon3/runtime/weapon-models/registry.mjs').catch(() => null); // absent in pre-registry builds
    const { WEAPONS } = await import(prefix + 'src/config.js');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(size, size); renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    const px = new Uint8Array(1024 * 512 * 4); for (let y = 0; y < 512; y++) for (let x = 0; x < 1024; x++) { const v = y < 288 ? 235 : 130; px.set([v, v, Math.min(255, v + 12), 255], (y * 1024 + x) * 4); }
    const sky = new THREE.DataTexture(px, 1024, 512); sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace; sky.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromEquirectangular(sky).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x60718d, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(-3, 4, 2); scene.add(key);
    if(environmentMode==='productionDay'){const {Environment}=await import(prefix+'src/world/environment.js'),nativeScene=new THREE.Scene(),env=new Environment(renderer,nativeScene);for(const light of scene.children.filter(o=>o.isLight))scene.remove(light);scene.add(env.sun,env.hemi);scene.environment=env.envMap;scene.environmentIntensity=nativeScene.environmentIntensity;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1;}
    const environmentMeta={mode:environmentMode,pmremWidth:scene.environment.image.width,pmremHeight:scene.environment.image.height,intensity:scene.environmentIntensity,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,postprocessing:false};
    G.scene = scene; G.teamColors = [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')];
    G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, o) => { o.length = 0; return o; } };
    G.physics = new Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true }; G.time = 0;
    G.projectiles = new api.Projectiles({ add() {}, remove() {} }); // real emission path, projectiles not drawn
    G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
    const snap = () => renderer.domElement.toDataURL('image/png').split(',')[1];
    window.__gallery = { THREE, api, W, Mt, R, WEAPONS, renderer, scene, snap, G, environmentMeta };
  }, { prefix, size, environmentMode });
  const all = await page.evaluate(() => Object.keys(window.__gallery.WEAPONS).filter(id => window.__gallery.WEAPONS[id]?.class !== undefined || window.__gallery.WEAPONS[id]?.catalogRecord));
  const list = ids.length ? ids : all;
  const references = {
  "s3-maneuver-stepper": {
    "target": "Dark Tetra Dualies (Splatoon 3)",
    "official": {
      "variant": "Dark Tetra Dualies",
      "path": "reports/inkwave-weapon-model-workspace/refs/s3-maneuver-stepper.3d.png",
      "gitBlob": "f8c10492e9a6c9dfc4fbb8a662e09619e2a90e3f",
      "use": "target shape and palette"
    },
    "turntable": {
      "variant": "Light Tetra Dualies",
      "path": "reports/inkwave-weapon-model-workspace/rotsheets/s3-maneuver-stepper.rot.jpg",
      "gitBlob": "674dbc64fb7e8d3e0a1ad5f241404717eabc3720",
      "use": "shared visible geometry only; NOT target palette",
      "sourceFile": "File:S3 Light Tetra Dualies model rotating.mp4"
    }
  },
  "s3-slosher-washtub": {
    "target": "Explosher (Splatoon 3, base kit)",
    "official": {
      "variant": "Explosher (base kit)",
      "path": "reports/inkwave-weapon-model-workspace/refs/s3-slosher-washtub.3d.png",
      "gitBlob": "b25b744f71a0a3bdf42d1c504a816ac86a80f668",
      "use": "target shape and palette"
    },
    "turntable": {
      "variant": "Explosher (base kit)",
      "path": "reports/inkwave-weapon-model-workspace/rotsheets/s3-slosher-washtub.rot.jpg",
      "gitBlob": "e087026509211d158e9161a39b321d180da046ff",
      "use": "target multiview shape and palette",
      "sourceFile": "File:S3 Explosher model rotating.mp4"
    }
  }
};
  const rows = [];
  for (const id of list) {
    const row = await page.evaluate(async ({ id, held, crowd }) => {
      const { THREE, api, W, Mt, R, WEAPONS, renderer, scene, snap, G } = window.__gallery;
      const { Actor, Character } = api;
      const t0 = performance.now(), d = W.getWeaponDef(id), buildMs = performance.now() - t0, color = new THREE.Color(id==='s3-maneuver-stepper'?'#58b22d':'#4b46ce'); // studio ink matches target render; real Actors below keep both game teams
      let bytes = 0; const geos = [d.body, d.ink, d.bodyStatic, d.inkStatic, d.drum, d.drumCaps, d.glow, ...Object.values(d.parts || {}).map(p => p.geo)];
      for (const geo of new Set(geos.filter(Boolean))) { for (const a of Object.values(geo.attributes)) bytes += a.array.byteLength; if (geo.index) bytes += geo.index.array.byteLength; }
      // whole weapon at rest, including the parts and drum/glow channels
      const g = new THREE.Group();
      g.add(new THREE.Mesh(d.body, Mt.getPlasticMaterial()), new THREE.Mesh(d.ink, Mt.getInkMaterial(color)));
      if (d.drum) { const drum = new THREE.Group(); drum.position.copy(d.drumAt); drum.add(new THREE.Mesh(d.drum, Mt.getInkMaterial(color)), new THREE.Mesh(d.drumCaps, Mt.getPlasticMaterial())); g.add(drum); }
      if (d.glow) g.add(new THREE.Mesh(d.glow, new THREE.MeshStandardMaterial({ color: '#797d85', roughness: .3 })));
      scene.add(g); g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g), s = box.getSize(new THREE.Vector3());
      // Immutable authored framing is shared by baseline/candidate. Do not auto-fit each version.
      const quad=id==='s3-maneuver-stepper', frame=quad?{x:.10,y:.31,z:.30}:{x:.24,y:.34,z:.38};
      const c=new THREE.Vector3(0,quad?.045:.035,quad?.045:.155);
      const half = Math.max(frame.y, frame.z) * 0.56;
      const ortho = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 20);
      ortho.position.set(c.x - 3, c.y, c.z); ortho.up.set(0, 1, 0); ortho.lookAt(c); renderer.render(scene, ortho); const side = snap();
      const top = new THREE.OrthographicCamera(-Math.max(frame.x, frame.z) * .56, Math.max(frame.x, frame.z) * .56, Math.max(frame.x, frame.z) * .56, -Math.max(frame.x, frame.z) * .56, .01, 20);
      top.position.set(c.x, c.y + 3, c.z); top.up.set(0, 0, 1); top.lookAt(c); renderer.render(scene, top); const above = snap();
      const front = new THREE.OrthographicCamera(-Math.max(frame.x, frame.y) * .56, Math.max(frame.x, frame.y) * .56, Math.max(frame.x, frame.y) * .56, -Math.max(frame.x, frame.y) * .56, .01, 20);
      front.position.set(c.x, c.y, c.z + 3); front.lookAt(c); renderer.render(scene, front); const muzzleView = snap();
      const span = Math.max(frame.x, frame.y, frame.z), cam = new THREE.PerspectiveCamera(30, 1, .01, 50);
      cam.position.copy(c).add(new THREE.Vector3(-0.9, 0.45, 1.1).normalize().multiplyScalar(span * 2.5)); cam.lookAt(c); renderer.render(scene, cam);
      const persp = snap();
      cam.position.copy(c).add(new THREE.Vector3(.9,.45,-1.1).normalize().multiplyScalar(span*2.5));cam.lookAt(c);renderer.render(scene,cam);const rear = snap();
      // Reference-paired cameras are independent from authored geometry. Both revisions use these exact poses.
      const referenceImages={},referenceCameras={},isQuad=id==='s3-maneuver-stepper';
      const refCenter=new THREE.Vector3(0,isQuad?.036:.027,isQuad?.039:.153);
      const refViews=isQuad?{refSide:[-3,.22,.45],refFront:[0,.12,3],refRear:[0,.12,-3],refOblique:[-.9,.53,1.1]}:{refSide:[-2.6,.35,-1.5],refFront:[-.20,1.15,3],refRear:[-.30,.50,-3],refOblique:[-.9,1.02,1.1]};
      for(const [name,eye]of Object.entries(refViews)){
        const isPair=isQuad&&['refOblique','refSide'].includes(name),span=isQuad?(isPair?.36:.34):.40;
        const distance=isQuad?(isPair?1.31:1.10):(name==='refSide'||name==='refOblique'?1.30:name==='refRear'?1.08:1.18);
        const camera=new THREE.PerspectiveCamera(18,1,.01,30),offset=new THREE.Vector3(...eye).normalize().multiplyScalar(distance),up=new THREE.Vector3(0,1,0);
        // The Explosher side crop is rear-oblique (about 120 degrees from the muzzle),
        // as the six-view turntable order and visible rear panel show. Align the display tilt in the camera basis.
        if(!isQuad&&name==='refSide'){offset.applyAxisAngle(new THREE.Vector3(1,0,0),.18);up.applyAxisAngle(new THREE.Vector3(1,0,0),.18);}
        const roll=isQuad?0:({refFront:-.22,refRear:.22,refSide:0,refOblique:-.30}[name]||0);up.applyAxisAngle(offset.clone().normalize(),roll);
        camera.position.copy(refCenter).add(offset);camera.up.copy(up);camera.lookAt(refCenter);
        let second;if(isPair){second=g.clone(true);g.position.set(-.064,-.010,-.022);second.position.set(.064,.010,.022);scene.add(second);}
        renderer.render(scene,camera);referenceImages[name]=snap();referenceCameras[name]={position:camera.position.toArray(),up:up.toArray(),target:refCenter.toArray(),fov:18,pair:isPair,roll};
        if(second){scene.remove(second);g.position.set(0,0,0);}
        // Sensitivity sweep, not a calibrated error bound: references have no known camera intrinsics.
        if(!isQuad&&name==='refSide')for(const [axis,degrees]of[['yaw',-4],['yaw',4],['pitch',-4],['pitch',4]]){
          const axisVector=axis==='yaw'?new THREE.Vector3(0,1,0):new THREE.Vector3().crossVectors(up,offset).normalize();
          const o=offset.clone().applyAxisAngle(axisVector,degrees*Math.PI/180),u=up.clone().applyAxisAngle(axisVector,degrees*Math.PI/180);
          camera.position.copy(refCenter).add(o);camera.up.copy(u);camera.lookAt(refCenter);
          const key='refSide'+axis+(degrees<0?'Minus':'Plus')+'4';renderer.render(scene,camera);referenceImages[key]=snap();
          referenceCameras[key]={position:camera.position.toArray(),up:u.toArray(),target:refCenter.toArray(),fov:18,roll,sensitivityAxis:axis,degrees,note:'manual nominal fit; +/-4 degree sensitivity sweep, not calibrated confidence bounds'};
        }
      }
      scene.remove(g);
      // Isolate only the authored metal triangles; compare the native shader with standard PBR
      // using the identical positions, normals, vertex colours, camera and lighting environment.
      const materialAudit={};
      if(!quad&&!crowd){
        const geo=d.body.clone(),ii=d.body.index.array,mm=d.body.attributes.aMat,selected=[];
        for(let j=0;j<ii.length;j+=3)if([ii[j],ii[j+1],ii[j+2]].every(i=>Math.round(mm.getX(i))===3))selected.push(ii[j],ii[j+1],ii[j+2]);
        geo.setIndex(selected);const mesh=new THREE.Mesh(geo,Mt.getPlasticMaterial()),camera=new THREE.PerspectiveCamera(18,1,.01,30);camera.position.copy(refCenter).add(new THREE.Vector3(-.9,1.02,1.1).normalize().multiplyScalar(1.30));camera.up.set(0,1,0).applyAxisAngle(camera.position.clone().sub(refCenter).normalize(),-.30);camera.lookAt(refCenter);scene.add(mesh);
        const native=Mt.getPlasticMaterial(),standard=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:1,roughness:.3,clearcoat:.2,clearcoatRoughness:.1}),satin=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:true,metalness:0,roughness:.42,clearcoat:.25,clearcoatRoughness:.1});
        for(const[label,mat]of[['metalNative',native],['metalStandard',standard],['metalSatinControl',satin]]){mesh.material=mat;renderer.render(scene,camera);referenceImages[label]=snap();const pixels=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4);renderer.getContext().readPixels(0,0,renderer.domElement.width,renderer.domElement.height,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);let sum=0,count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>240){sum+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;count++;}const props=renderer.properties.get(mat),shader=props.currentProgram?.fragmentShader,source=shader?(renderer.getContext().getShaderSource(shader)||''):'';materialAudit[label]={coveredPixels:count,meanSrgbByte:count?sum/count:0,envMapIntensity:mat.envMapIntensity,uniformEnvMapIntensity:props.uniforms?.envMapIntensity?.value,resolvedEnvironmentMapping:props.envMap?.mapping,shaderSourceAvailable:!!source,shaderUsesEnvMap:source?source.includes('#define USE_ENVMAP'):null,shaderUsesCubeUV:source?source.includes('#define ENVMAP_TYPE_CUBE_UV'):null,shaderHasMetalClassPatch:source.includes('metalnessFactor = iwM == 3.0'),environmentMapping:scene.environment?.mapping,environmentWidth:scene.environment?.image?.width,environmentHeight:scene.environment?.image?.height};}
        materialAudit.triangles=selected.length/3;scene.remove(mesh);geo.dispose();standard.dispose();satin.dispose();
      }
      let tris = 0; for (const geo of [d.body, d.ink, d.drum, d.drumCaps, d.glow]) if (geo) tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      const res = { id, family: R?.weaponBehaviorFamily(id) ?? WEAPONS[id]?.behaviorKind ?? WEAPONS[id]?.kind, modelKind: R?.weaponModelFamily(id) ?? WEAPONS[id]?.modelKind ?? WEAPONS[id]?.kind, own: !!R?.weaponModelSpec(id),
        size: s.toArray().map(v => +v.toFixed(4)), muzzle: d.muzzle.toArray().map(v => +v.toFixed(4)), tris: Math.round(tris), buildMs: +buildMs.toFixed(1), geometryKB: Math.round(bytes / 1024),
        referenceCameras, materialAudit, images: { side, above, front: muzzleView, persp, rear, ...referenceImages } };
      if (!held) return res;
      // held: real Actor + WeaponRunner + Character (native + patched pose layers)
      const a = new Actor({ team: 0, weapon: id, isLocal: true, name: id, CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } }), ch = a.character;
      ch.actor = a; ch.onEvent = null; a.grounded = a.ground.hit = true; G.actors = [a]; scene.add(ch.root);
      if (ch._sourceMotionLoader) await ch._sourceMotionLoader; if (ch.sourceMotion?.ready) await ch.sourceMotion.ready; if(ch.sourceMotion?.status!=='ready')throw Error(id+' source motion failed');
      const look = (frame, side) => {
        const camera = new THREE.PerspectiveCamera(32, 1, .05, 30);
        const off = side === 'right' ? new THREE.Vector3(-2.6, 1.0, 0.35) : side === 'left' ? new THREE.Vector3(2.6, 1.0, 0.35) : side === 'back' ? new THREE.Vector3(-0.9, 1.5, -2.4) : new THREE.Vector3(-1.6, 1.15, 2.4);
        camera.position.copy(a.pos).add(off); camera.lookAt(a.pos.clone().add(new THREE.Vector3(0, .8, .15)));
        renderer.render(scene, camera); return snap();
      };
      const shots = {}; let maxGrip = 0, nonFinite = false, fired = 0;
      const C = api.CHARACTER_CHANNELS;
      for (let frame = 0; frame < 240; frame++) {
        const fire = frame >= 70 && frame < 200;
        a.ink = 100; a.intent.fire = fire; a.aimPitch = 0;
        if (frame >= 30 && frame < 60) { a.vel.set(0, 0, 2.4); a.pos.z += 2.4 / 60; } else a.vel.set(0, 0, 0);
        G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire, firePressed: frame === 70 }); a._finishFrame(1 / 60); ch.root.updateMatrixWorld(true);
        if (![...ch.P].every(Number.isFinite)) nonFinite = true;
        if (a.weaponRunner.firingT > 0 || a.weaponRunner.charging || a.weaponRunner.busy?.()) fired++;
        if (!ch.dual && ch.P[C.IKL] > .99 && ch.P[C.LTW] < .001) {
          const p = ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone());
          maxGrip = Math.max(maxGrip, p.distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));
        }
        if (frame === 25) { shots.idle = look(frame, 'front'); shots.idleSide = look(frame, 'right'); }
        if (frame === 55) shots.walk = look(frame, 'front');
        if (frame === 110) { shots.fire = look(frame, 'front'); shots.fireSide = look(frame, 'right'); shots.fireLeft = look(frame, 'left'); }
        if (frame === 160) shots.fireLate = look(frame, 'back');
        if (frame === 215) shots.after = look(frame, 'front');
      }
      // Fixed-pose render submission including a GPU completion boundary. Same-runner A/B only.
      const benchCam=new THREE.PerspectiveCamera(32,1,.05,30);benchCam.position.copy(a.pos).add(new THREE.Vector3(-1.6,1.15,2.4));benchCam.lookAt(a.pos.clone().add(new THREE.Vector3(0,.8,.15)));
      const samples=[],gl=renderer.getContext();for(let j=0;j<100;j++){const t=performance.now();renderer.render(scene,benchCam);gl.finish();if(j>=20)samples.push(performance.now()-t);}
      samples.sort((a,b)=>a-b);res.renderMs={p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)]};
      res.drawCalls=renderer.info.render.calls;res.renderTriangles=renderer.info.render.triangles;
      if(crowd){
        const actors=[a], ids=['s3-maneuver-stepper','s3-slosher-washtub','dualies','slosher'];
        for(let k=1;k<8;k++){
          const other=new Actor({team:k%2,weapon:ids[k%ids.length],CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),c=other.character;
          c.actor=other;c.onEvent=null;other.grounded=other.ground.hit=true;scene.add(c.root);actors.push(other);
          if(c._sourceMotionLoader)await c._sourceMotionLoader;if(c.sourceMotion?.ready)await c.sourceMotion.ready;
        }
        G.actors=actors;const camera=new THREE.PerspectiveCamera(40,1,.05,60);camera.position.set(-5,3.5,8);camera.lookAt(0,.8,0);
        const quant=(arr)=>{arr.sort((a,b)=>a-b);return{p50:arr[Math.floor(arr.length*.5)],p95:arr[Math.floor(arr.length*.95)]};};
        res.crowd={};
        for(const tier of['game','far']){
          for(let k=0;k<actors.length;k++){const o=actors[k];o.pos.set((k%4-1.5)*1.15,0,Math.floor(k/4)*1.5);o.intent.fire=false;o.character.setLod(tier);for(let z=0;z<4;z++)o._finishFrame(1/60);}
          const cpu=[],done=[],anim=[];for(let k=0;k<80;k++){const t0=performance.now();for(const o of actors)o._finishFrame(1/60);const t1=performance.now();renderer.render(scene,camera);const t2=performance.now();gl.finish();const t3=performance.now();if(k>=20){anim.push(t1-t0);cpu.push(t2-t1);done.push(t3-t1);}}
          const geos=new Set();scene.traverseVisible(o=>{if(o.isMesh&&o.geometry)geos.add(o.geometry);});let geometryBytes=0;for(const g of geos){for(const a of Object.values(g.attributes))geometryBytes+=a.array.byteLength;if(g.index)geometryBytes+=g.index.array.byteLength;}
          res.crowd[tier]={actors:8,ids:actors.map(o=>o.weaponId||o.character.weaponModel),rawSamples:{animationMs:[...anim],renderSubmitMs:[...cpu],renderCompleteMs:[...done]},animationMs:quant(anim),renderSubmitMs:quant(cpu),renderCompleteMs:quant(done),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,visibleGeometryBytes:geometryBytes,rendererGeometries:renderer.info.memory.geometries};
          res.images['crowd-'+tier]=snap();
        }
        // Diagnostic phases are separate from the original, uninstrumented render/animation ABBA above.
        // The no-render control distinguishes per-frame geometry/pose work from renderer/SwiftShader contention.
        res.cpuDiagnostics={};
        const geometryState=()=>actors.map(o=>{const c=o.character,meshes=[];c.root.traverseVisible(m=>{if(m.isMesh)meshes.push({id:m.id,geometry:m.geometry.uuid,vertices:m.geometry.attributes.position.count});});return{id:c.weaponModel,rootVisible:c.root.visible,parentVisible:c.root.parent?.visible!==false,kidScale:c.kidScale,sourceActive:c.sourceMotion?.active,lod:c.lodTier,farDec:c.weapon.farDec,leftFarDec:c.weapon.left?.farDec,meshes};});
        for(const tier of['game','far']){
          for(const o of actors){o.character.setLod(tier);for(let j=0;j<25;j++)o._finishFrame(1/60);}
          const stateBefore=geometryState(),plain=[];
          for(let j=0;j<260;j++){const t=performance.now();for(const o of actors)o._finishFrame(1/60);if(j>=60)plain.push(performance.now()-t);}
          const stateAfter=geometryState();if(JSON.stringify(stateBefore)!==JSON.stringify(stateAfter))throw Error('CPU diagnostic changed visible mesh/geometry state');
          const restore=[],byMethod={},counts={};let frameTotals={};
          const wrap=(obj,key,label)=>{const fn=obj?.[key];if(typeof fn!=='function')return;const own=Object.hasOwn(obj,key);obj[key]=function(...args){const t=performance.now();try{return fn.apply(this,args);}finally{frameTotals[label]=(frameTotals[label]||0)+performance.now()-t;counts[label]=(counts[label]||0)+1;}};restore.push(()=>{if(own)obj[key]=fn;else delete obj[key];});};
          for(const o of actors){const c=o.character,id=c.weaponModel;wrap(o,'_finishFrame',id+'/_finishFrame');for(const key of['update','_buildPose','_applyPose','_animWeapon','_updateMaterials','_updateLod'])wrap(c,key,id+'/'+key);for(const key of['advance','applyBody','applyForm'])wrap(c.sourceMotion,key,id+'/sourceMotion.'+key);}
          try{for(let j=0;j<160;j++){frameTotals={};for(const o of actors)o._finishFrame(1/60);if(j>=40)for(const[k,v]of Object.entries(frameTotals))(byMethod[k]||=[]).push(v);}}finally{for(const fn of restore)fn();}
          res.cpuDiagnostics[tier]={noRenderRawMs:plain,noRenderAnimationMs:quant([...plain]),inclusiveMethodMs:Object.fromEntries(Object.entries(byMethod).map(([k,v])=>[k,quant(v)])),methodCalls:counts,geometryStable:true,state:stateAfter,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null};
        }
        for(const other of actors.slice(1)){other.weaponRunner.reset();scene.remove(other.character.root);other.character.dispose();}
        G.actors=[a];
      }
      a.weaponRunner.reset(); scene.remove(ch.root); ch.dispose();
      Object.assign(res.images, shots); res.maxGrip = +maxGrip.toFixed(4); res.nonFinite = nonFinite; res.firingFrames = fired;
      res.weaponKind = ch.weaponKind; res.weaponModel = ch.weaponModel;
      return res;
    }, { id, held, crowd });
    for (const [k, b64] of Object.entries(row.images)) fs.writeFileSync(path.join(out, `${id}.${k}.png`), Buffer.from(b64, 'base64'));
    delete row.images; rows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(out, 'gallery.json'), JSON.stringify({ revision: identity.build.revision, references, environment:await page.evaluate(()=>window.__gallery.environmentMeta),host:{start:hostStart,end:{at:new Date().toISOString(),load:os.loadavg()},timingClock:"performance.now; SwiftShader host; method diagnostics inclusive and separate from ABBA"}, rows, errors }, null, 2));
  if (errors.length) { console.error('page errors:', errors.slice(0, 10)); process.exitCode = 1; }
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
