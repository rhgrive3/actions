#!/usr/bin/env node
// Visual review evidence for the per-main-weapon models: an orthographic side
// view matching the official 3D weapon renders (muzzle to the right, seen from
// the weapon's right side, transparent background), a 3/4 view, and the actual
// Actor/Runner/Character holding it while idle, carrying, firing and charging.
// The images are comparison evidence, not a retail-parity score.
//   node scripts/render-inkwave-brella-gallery.mjs --site <built site> --out <dir> [--ids a,b] [--no-held]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const arg = (name, fallback) => { const n = process.argv.indexOf(name); return n < 0 ? fallback : process.argv[n + 1]; };
const site = path.resolve(arg('--site', '_site')), out = path.resolve(arg('--out', '.ci-scratch/weapon-gallery'));
const ids = (arg('--ids', '') || '').split(',').filter(Boolean), held = !process.argv.includes('--no-held');
const size = Number(arg('--size', 400)), crowd=process.argv.includes('--crowd');
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
  await page.evaluate(async ({ prefix, size }) => {
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
    const px = new Uint8Array(32 * 16 * 4); for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) { const v = y < 9 ? 235 : 130; px.set([v, v, Math.min(255, v + 12), 255], (y * 32 + x) * 4); }
    const sky = new THREE.DataTexture(px, 32, 16); sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace; sky.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromEquirectangular(sky).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x60718d, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(-3, 4, 2); scene.add(key);
    G.scene = scene; G.teamColors = [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')];
    G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, o) => { o.length = 0; return o; } };
    G.physics = new Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true }; G.time = 0;
    G.projectiles = new api.Projectiles({ add() {}, remove() {} }); // real emission path, projectiles not drawn
    G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
    const snap = () => renderer.domElement.toDataURL('image/png').split(',')[1];
    window.__gallery = { THREE, api, W, Mt, R, WEAPONS, renderer, scene, snap, G };
  }, { prefix, size });
  const all = await page.evaluate(() => Object.keys(window.__gallery.WEAPONS).filter(id => window.__gallery.WEAPONS[id]?.class !== undefined || window.__gallery.WEAPONS[id]?.catalogRecord));
  const list = ids.length ? ids : all;
  const rows = [];
  for (const id of list) {
    const row = await page.evaluate(async ({ id, held, crowd }) => {
      const { THREE, api, W, Mt, R, WEAPONS, renderer, scene, snap, G } = window.__gallery;
      const { Actor, Character } = api;
      const t0 = performance.now(), d = W.getWeaponDef(id), buildMs = performance.now() - t0, color = G.teamColors[0];
      let bytes = 0; const geos = [d.body, d.ink, d.bodyStatic, d.inkStatic, d.drum, d.drumCaps, d.glow, ...Object.values(d.parts || {}).map(p => p.geo)];
      for (const geo of new Set(geos.filter(Boolean))) { for (const a of Object.values(geo.attributes)) bytes += a.array.byteLength; if (geo.index) bytes += geo.index.array.byteLength; }
      // whole weapon at rest, including the parts and drum/glow channels
      const g = new THREE.Group();
      g.add(new THREE.Mesh(d.body, Mt.getPlasticMaterial()), new THREE.Mesh(d.ink, Mt.getInkMaterial(color)));
      if (d.drum) { const drum = new THREE.Group(); drum.position.copy(d.drumAt); drum.add(new THREE.Mesh(d.drum, Mt.getInkMaterial(color)), new THREE.Mesh(d.drumCaps, Mt.getPlasticMaterial())); g.add(drum); }
      if (d.glow) g.add(new THREE.Mesh(d.glow, new THREE.MeshStandardMaterial({ color: '#797d85', roughness: .3 })));
      scene.add(g); g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      const half = id === "s3-shelter-wide" ? .56 : .43; c.set(0,.02,id === "s3-shelter-wide" ? .40 : .27);
      const ortho = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 20);
      ortho.position.set(c.x - 3, c.y, c.z); ortho.up.set(0, 1, 0); ortho.lookAt(c); renderer.render(scene, ortho); const side = snap();
      const top = new THREE.OrthographicCamera(-half,half,half,-half, .01, 20);
      top.position.set(c.x, c.y + 3, c.z); top.up.set(0, 0, 1); top.lookAt(c); renderer.render(scene, top); const above = snap();
      const front = new THREE.OrthographicCamera(-half,half,half,-half, .01, 20);
      front.position.set(c.x, c.y, c.z + 3); front.lookAt(c); renderer.render(scene, front); const muzzleView = snap();
      const span = half / .56, cam = new THREE.PerspectiveCamera(30, 1, .01, 50);
      cam.position.copy(c).add(new THREE.Vector3(-0.9, 0.45, 1.1).normalize().multiplyScalar(span * 2.5)); cam.lookAt(c); renderer.render(scene, cam);
      const persp = snap(); scene.remove(g);
      let tris = 0; for (const geo of [d.body, d.ink, d.drum, d.drumCaps, d.glow]) if (geo) tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      const res = { id, family: R?.weaponBehaviorFamily(id) ?? WEAPONS[id]?.behaviorKind ?? WEAPONS[id]?.kind, modelKind: R?.weaponModelFamily(id) ?? WEAPONS[id]?.modelKind ?? WEAPONS[id]?.kind, own: !!R?.weaponModelSpec(id),
        size: s.toArray().map(v => +v.toFixed(4)), muzzle: d.muzzle.toArray().map(v => +v.toFixed(4)), tris: Math.round(tris), buildMs: +buildMs.toFixed(1), geometryKB: Math.round(bytes / 1024),
        images: { side, above, front: muzzleView, persp } };
      // Open reference views use the actual registered canopy animation on the real part geometries.
      // This state-controlled pass is separate from the real Actor/Runner sequence below.
      const openModel = new THREE.Group(), wp = { def:d, parts:{}, ps:{} };
      wp.ink=new THREE.Mesh(d.inkStatic,Mt.getInkMaterial(color));openModel.add(new THREE.Mesh(d.bodyStatic,Mt.getPlasticMaterial()),wp.ink);
      for(const [name,p] of Object.entries(d.parts)){
        const mesh=new THREE.Mesh(p.geo,p.mat==='ink'?Mt.getInkMaterial(color):p.mat==='lamp'?new THREE.MeshStandardMaterial({color:p.lamp?.color||0xffffff,emissive:p.lamp?.emissive||0xffffff}):Mt.getPlasticMaterial());
        mesh.position.copy(p.pivot);openModel.add(mesh);wp.parts[name]=mesh;
      }
      const openState={dt:1/60,runner:{catalogState:{canopy:{open:true,launched:false},naked:0}}};
      for(let j=0;j<180;j++)R.weaponModelSpec(id).animate(wp,openState);
      scene.add(openModel);openModel.updateMatrixWorld(true);
      const ob=new THREE.Box3().setFromObject(openModel),oc=ob.getCenter(new THREE.Vector3()),os=ob.getSize(new THREE.Vector3()),oh=id === "s3-shelter-wide" ? .66 : .56;oc.set(0,.075,id === "s3-shelter-wide" ? .42 : .30);
      for(const [name,dir]of Object.entries({openFront:[0,0,3],openRear:[0,0,-3],openSide:[-3,0,0],openAbove:[0,3,.001],openPersp:[-2,1.1,2],openBack:[2,.8,-2]})){
        const camera=new THREE.OrthographicCamera(-oh,oh,oh,-oh,.01,20);camera.position.copy(oc).add(new THREE.Vector3(...dir));camera.lookAt(oc);renderer.render(scene,camera);res.images[name]=snap();
      }
      res.openSize=os.toArray();res.openPartScales=Object.fromEntries(Object.entries(wp.parts).filter(([n])=>n.startsWith('canopy')).map(([n,m])=>[n,m.scale.toArray()]));
      // Neutral ink variant makes fixed cloth/print regions comparable to the grey reference render.
      const neutral=Mt.getInkMaterial(new THREE.Color('#c1c6c2'));wp.ink.material=neutral;
      for(const [name,p]of Object.entries(d.parts))if(p.mat==='ink')wp.parts[name].material=neutral;
      for(const [name,dir]of Object.entries({openReferenceInk:[-2,1.1,2],openReferenceBackInk:[2,.8,-2]})){
        const camera=new THREE.OrthographicCamera(-oh,oh,oh,-oh,.01,20);camera.position.copy(oc).add(new THREE.Vector3(...dir));camera.lookAt(oc);renderer.render(scene,camera);res.images[name]=snap();
      }
      scene.remove(openModel);
      if (!held) return res;
      // held: real Actor + WeaponRunner + Character (native + patched pose layers)
      const a = new Actor({ team: 0, weapon: id, isLocal: true, name: id, CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } }), ch = a.character;
      ch.actor = a; ch.onEvent = null; ch.setLod('game'); a.grounded = a.ground.hit = true; G.actors = [a]; scene.add(ch.root);
      if (ch._sourceMotionLoader) await ch._sourceMotionLoader; if (ch.sourceMotion?.ready) await ch.sourceMotion.ready;
      const look = (frame, side) => {
        const camera = new THREE.PerspectiveCamera(42, 1, .05, 30);
        const off = side === 'right' ? new THREE.Vector3(-2.6, 1.0, 0.35) : side === 'left' ? new THREE.Vector3(2.6, 1.0, 0.35) : side === 'back' ? new THREE.Vector3(-0.9, 1.5, -2.4) : new THREE.Vector3(-1.6, 1.15, 2.4);
        camera.position.copy(a.pos).add(off.multiplyScalar(1.15)); camera.lookAt(a.pos.clone().add(new THREE.Vector3(0, .8, .25)));
        renderer.render(scene, camera); return snap();
      };
      const shots = {}; let maxGrip = 0, nonFinite = false, fired = 0, sawOpen=false,sawLaunched=false,sawHidden=false,sawFolded=false;
      const benchCam=new THREE.PerspectiveCamera(42,1,.05,30);benchCam.position.set(-1.6,1.15,2.4);benchCam.lookAt(0,.8,.25);
      const bench=()=>{benchCam.position.copy(a.pos).add(new THREE.Vector3(-1.6,1.15,2.4).multiplyScalar(1.15));benchCam.lookAt(a.pos.clone().add(new THREE.Vector3(0,.8,.25)));const gl=renderer.getContext(),ms=[];for(let j=0;j<50;j++){const t=performance.now();renderer.render(scene,benchCam);gl.finish();if(j>=10)ms.push(performance.now()-t);}ms.sort((a,b)=>a-b);return{lod:ch.lodTier,weaponNear:ch.weapon.near,p50:ms[Math.floor(ms.length*.5)],p95:ms[Math.floor(ms.length*.95)],drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};};
      const C = api.CHARACTER_CHANNELS;
      const firstEnd=70+({"s3-shelter-normal":50,"s3-shelter-wide":85,"s3-shelter-focus":40}[id]||60),secondStart=firstEnd+80;
      for (let frame = 0; frame < secondStart+750; frame++) {
        const fire = frame>=70&&frame<firstEnd||frame>=secondStart&&frame<secondStart+300;
        a.ink = 100; a.intent.fire = fire; a.aimPitch = 0;
        if (frame >= 30 && frame < 60) { a.vel.set(0, 0, 2.4); a.pos.z += 2.4 / 60; } else a.vel.set(0, 0, 0);
        G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire, firePressed: frame === 70||frame===secondStart }); a._finishFrame(1 / 60); ch.root.updateMatrixWorld(true);
        if (![...ch.P].every(Number.isFinite)) nonFinite = true;
        if (a.weaponRunner.firingT > 0 || a.weaponRunner.charging || a.weaponRunner.busy?.()) fired++;
        if (!ch.dual && ch.P[C.IKL] > .99 && ch.P[C.LTW] < .001) {
          const p = ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone());
          maxGrip = Math.max(maxGrip, p.distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));
        }
        if (frame === 25) { shots.idle = look(frame, 'front'); shots.idleSide = look(frame, 'right'); }
        if (frame === 55) shots.walk = look(frame, 'front');



        const cs=a.weaponRunner.catalogState,c=cs?.canopy;
        if(frame===25)res.closedRender=bench();
        if(c?.open&&!c.launched&&ch.weapon.ps.bo>.9&&!sawOpen){sawOpen=true;shots.heldOpen=look(frame,'front');shots.heldOpenRear=look(frame,'back');shots.heldOpenSide=look(frame,'right');res.openFrame=frame;res.openRender=bench();}
        if(c?.launched)sawLaunched=true;
        if(sawLaunched&&!ch.weapon.parts.canopy.visible&&!sawHidden){sawHidden=true;shots.launched=look(frame,'front');res.hiddenFrame=frame;}
        if(frame>firstEnd+10&&ch.weapon.parts.canopy.visible&&ch.weapon.ps.bo<.02&&!sawFolded){sawFolded=true;shots.folded=look(frame,'front');}

      }
      if(!crowd){
        res.guardCases=[];
        for(const [name,yaw,speed]of[['guardLeft',-.8,1.4],['guardRight',.8,1.4]]){
          a.weaponRunner.reset();a.pos.set(0,0,0);a.yaw=a.aimYaw=yaw;a.aimPitch=0;a.aimDir.set(Math.sin(yaw),0,Math.cos(yaw));
          const frames={'s3-shelter-normal':85,'s3-shelter-wide':100,'s3-shelter-focus':46}[id];
          for(let j=0;j<frames;j++){a.ink=100;a.intent.fire=true;a.vel.set(speed*Math.cos(yaw),0,-speed*Math.sin(yaw));a.pos.addScaledVector(a.vel,1/60);G.time+=1/60;a.weaponRunner.update(1/60,{fire:true,firePressed:j===0});a._finishFrame(1/60);ch.root.updateMatrixWorld(true);}
          const can=a.weaponRunner.catalogState.canopy,plane={'s3-shelter-normal':.5,'s3-shelter-wide':.74,'s3-shelter-focus':.525}[id];
          if(!can?.open||can.launched)throw new Error('Guard case is not a live open canopy');
          const dir=new THREE.Vector3(0,0,1).transformDirection(ch.weapon.off.matrixWorld),centre=new THREE.Vector3(0,.075,plane).applyMatrix4(ch.weapon.off.matrixWorld);
          res.guardCases.push({name,yaw,speed,angleDeg:Math.acos(Math.max(-1,Math.min(1,dir.dot(can.dir))))*180/Math.PI,centreOffset:centre.distanceTo(can.pos)});shots[name]=look(0,'front');
        }
      }
      if(!crowd){
        // Diagnostic coverage for native Actor turning toward reverse travel after firing expires.
        // This is intentionally reported separately from the accepted strafe-alignment gate.
        res.reverseCases=[];ch.root.visible=false;
        for(const [name,mx]of[['reverseLeft',-.05],['reverseRight',.05]]){
          const r=new Actor({team:0,weapon:id,isLocal:true,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),rc=r.character;
          rc.actor=r;rc.onEvent=null;rc.setLod('game');r.grounded=r.ground.hit=true;G.actors=[r];scene.add(rc.root);
          if(rc._sourceMotionLoader)await rc._sourceMotionLoader;if(rc.sourceMotion?.ready)await rc.sourceMotion.ready;
          r.aimDir.set(0,0,1);r.intent.move.set(mx,0,-1).normalize();
          let guardAt=null,maxAngle=0,maxCentre=0,maxGrip=0,count=0,captured=false;
          const plane={'s3-shelter-normal':.5,'s3-shelter-wide':.74,'s3-shelter-focus':.525}[id],at={'s3-shelter-normal':.9,'s3-shelter-wide':1.83,'s3-shelter-focus':.75}[id];
          for(let j=0;j<180;j++){
            r.ink=100;r.intent.fire=true;r.vel.copy(r.intent.move).multiplyScalar(1.4);r.pos.addScaledVector(r.vel,1/60);
            G.time+=1/60;r.weaponRunner.update(1/60,{fire:true,firePressed:j===0});r._finishFrame(1/60);rc.root.updateMatrixWorld(true);
            if(![...rc.P].every(Number.isFinite))throw Error('Nonfinite reverse pose');
            const can=r.weaponRunner.catalogState.canopy;if(!can?.open||can.launched||r.anim.firing)continue;
            guardAt??=j/60;
            if(j/60-guardAt>.20){
              count++;const dir=new THREE.Vector3(0,0,1).transformDirection(rc.weapon.off.matrixWorld),centre=new THREE.Vector3(0,.075,plane).applyMatrix4(rc.weapon.off.matrixWorld);
              maxAngle=Math.max(maxAngle,Math.acos(Math.max(-1,Math.min(1,dir.dot(can.dir))))*180/Math.PI);maxCentre=Math.max(maxCentre,centre.distanceTo(can.pos));
              if(rc.P[C.IKL]>.99)maxGrip=Math.max(maxGrip,rc.weapon.off.localToWorld(rc.weapon.def.handL.pos.clone()).distanceTo(rc.bones.handL.getWorldPosition(new THREE.Vector3())));
            }
            if(!captured&&j/60>=at){
              captured=true;const camera=new THREE.PerspectiveCamera(42,1,.05,30);camera.position.copy(r.pos).add(new THREE.Vector3(-1.6,1.15,2.4).multiplyScalar(1.15));camera.lookAt(r.pos.clone().add(new THREE.Vector3(0,.8,.25)));renderer.render(scene,camera);shots[name]=snap();
            }
          }
          if(!captured||!count)throw Error('Missing reverse diagnostic '+id+' '+name);
          res.reverseCases.push({name,moveX:mx,count,maxAngle,maxCentre,maxGrip,meetsGuardBounds:maxAngle<6&&maxCentre<.05&&maxGrip<.008});
          r.weaponRunner.reset();scene.remove(rc.root);rc.dispose();
        }
        ch.root.visible=true;G.actors=[a];
      }
      if(crowd){
        const actors=[a], ids=['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus'];
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
          const gl=renderer.getContext(),cpu=[],done=[],anim=[];for(let k=0;k<80;k++){const t0=performance.now();for(const o of actors)o._finishFrame(1/60);const t1=performance.now();renderer.render(scene,camera);const t2=performance.now();gl.finish();const t3=performance.now();if(k>=20){anim.push(t1-t0);cpu.push(t2-t1);done.push(t3-t1);}}
          const geos=new Set();scene.traverseVisible(o=>{if(o.isMesh&&o.geometry)geos.add(o.geometry);});let geometryBytes=0;for(const g of geos){for(const a of Object.values(g.attributes))geometryBytes+=a.array.byteLength;if(g.index)geometryBytes+=g.index.array.byteLength;}
          res.crowd[tier]={weaponNear:actors.map(o=>o.character.weapon.near),actors:8,ids:actors.map(o=>o.weaponId||o.character.weaponModel),animationMs:quant(anim),renderSubmitMs:quant(cpu),renderCompleteMs:quant(done),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,visibleGeometryBytes:geometryBytes,rendererGeometries:renderer.info.memory.geometries};
          res.images['crowd-'+tier]=snap();
        }
        for(const other of actors.slice(1)){other.weaponRunner.reset();scene.remove(other.character.root);other.character.dispose();}
        G.actors=[a];
      }
      a.weaponRunner.reset(); scene.remove(ch.root); ch.dispose();
      Object.assign(res.images, shots); res.maxGrip = +maxGrip.toFixed(4); res.nonFinite = nonFinite; res.firingFrames = fired;
      Object.assign(res,{sawOpen,sawLaunched,sawHidden,sawFolded});
      if(nonFinite||maxGrip>.008||!sawOpen||!sawLaunched||!sawHidden||!sawFolded)throw new Error(id+' Actor/canopy lifecycle failed: '+JSON.stringify({nonFinite,maxGrip,sawOpen,sawLaunched,sawHidden,sawFolded}));
      res.weaponKind = ch.weaponKind; res.weaponModel = ch.weaponModel;
      return res;
    }, { id, held, crowd });
    for (const [k, b64] of Object.entries(row.images)) fs.writeFileSync(path.join(out, `${id}.${k}.png`), Buffer.from(b64, 'base64'));
    delete row.images; rows.push(row);
    console.log(JSON.stringify(row));
  }
  fs.writeFileSync(path.join(out, 'gallery.json'), JSON.stringify({ revision: identity.build.revision, rows, errors }, null, 2));
  if (errors.length) { console.error('page errors:', errors.slice(0, 10)); process.exitCode = 1; }
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
