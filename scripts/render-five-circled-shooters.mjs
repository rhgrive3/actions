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
import { chromium } from 'playwright';

const arg = (name, fallback) => { const n = process.argv.indexOf(name); return n < 0 ? fallback : process.argv[n + 1]; };
const site = path.resolve(arg('--site', '_site')), out = path.resolve(arg('--out', '.ci-scratch/weapon-gallery'));
const ids = (arg('--ids', '') || '').split(',').filter(Boolean), held = !process.argv.includes('--no-held');
const size = Number(arg('--size', 640)), crowdOnly=process.argv.includes('--crowd-only');
const environmentMode=arg('--environment','studio1024');
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
  const page = await browser.newPage({ viewport: { width: size, height: size } });
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
    window.environmentEvidence={mode:environmentMode,inputWidth:environmentMode==='studio1024'?1024:null,cubeSize:environmentMode==='studio1024'?256:null,textureWidth:scene.environment.image.width,textureHeight:scene.environment.image.height,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,postprocessing:false};
    G.scene = scene; G.teamColors = [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')];
    G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, o) => { o.length = 0; return o; } };
    G.physics = new Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true }; G.time = 0;
    G.projectiles = new api.Projectiles({ add() {}, remove() {} }); // real emission path, projectiles not drawn
    G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
    const snap = () => renderer.domElement.toDataURL('image/png').split(',')[1];
    let postReview=null;
    if(environmentMode==='productionDay'){
      const {Renderer}=await import(prefix+'src/core/renderer.js'),{Environment}=await import(prefix+'src/world/environment.js');
      const post=new Renderer(document.body,{quality:'high',bloom:true,shadows:true}),postScene=new THREE.Scene(),envScene=new THREE.Scene();
      // A GPU PMREM cannot cross WebGL contexts. Generate this IBL on the post renderer itself.
      const env=new Environment(post.renderer,envScene);postScene.add(env.sun,env.hemi);postScene.environment=env.envMap;postScene.environmentIntensity=envScene.environmentIntensity;postScene.background=new THREE.Color('#b2d5ee');
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshStandardMaterial({color:'#bfc7c9',roughness:.85}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;postScene.add(floor);
      const camera=new THREE.PerspectiveCamera(32,1,.05,30);post.setScene(postScene,camera);postReview={post,postScene,camera,env};
    }
    window.__gallery = { THREE, api, W, Mt, R, WEAPONS, renderer, scene, snap, G, postReview, prefix };
  }, { prefix, size, environmentMode });
  const all = await page.evaluate(() => Object.keys(window.__gallery.WEAPONS).filter(id => window.__gallery.WEAPONS[id]?.class !== undefined || window.__gallery.WEAPONS[id]?.catalogRecord));
  const list = crowdOnly?[]:(ids.length ? ids : all);
  const rows = [];
  for (const id of list) {
    const row = await page.evaluate(async ({ id, held }) => {
      const { THREE, api, W, Mt, R, WEAPONS, renderer, scene, snap, G, postReview, prefix } = window.__gallery;
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
      const half = Math.max(.58,s.y,s.z)*.56;
      const ortho = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 20);
      ortho.position.set(c.x - 3, c.y, c.z); ortho.up.set(0, 1, 0); ortho.lookAt(c); renderer.render(scene, ortho); const side = snap();
      const top = new THREE.OrthographicCamera(-Math.max(s.x, s.z) * .56, Math.max(s.x, s.z) * .56, Math.max(s.x, s.z) * .56, -Math.max(s.x, s.z) * .56, .01, 20);
      top.position.set(c.x, c.y + 3, c.z); top.up.set(0, 0, 1); top.lookAt(c); renderer.render(scene, top); const above = snap();
      const front = new THREE.OrthographicCamera(-Math.max(s.x, s.y) * .56, Math.max(s.x, s.y) * .56, Math.max(s.x, s.y) * .56, -Math.max(s.x, s.y) * .56, .01, 20);
      front.position.set(c.x, c.y, c.z + 3); front.lookAt(c); renderer.render(scene, front); const muzzleView = snap();
      const span = Math.max(s.x, s.y, s.z), cam = new THREE.PerspectiveCamera(30, 1, .01, 50);
      cam.position.copy(c).add(new THREE.Vector3(-0.9, 0.45, 1.1).normalize().multiplyScalar(span * 2.5)); cam.lookAt(c); renderer.render(scene, cam);
      const persp = snap();
      const extra={};for(const[name,dir]of[['opposite',[3,0,0]],['rear',[0,0,-3]],['frontQuarter',[-2,.7,2]],['rearQuarter',[2,.7,-2]]]){const cc=new THREE.PerspectiveCamera(30,1,.01,50);cc.position.copy(c).add(new THREE.Vector3(...dir).normalize().multiplyScalar(span*2.7));cc.lookAt(c);renderer.render(scene,cc);extra[name]=snap();}
      const {farGeometry}=await import(prefix+'src/game/character-lod.js');
      const fg=new THREE.Group(),fb=farGeometry(d.body,700),fi=farGeometry(d.ink,300);fg.add(new THREE.Mesh(fb,Mt.getPlasticMaterial()),new THREE.Mesh(fi,Mt.getInkMaterial(G.teamColors[0])));
      scene.remove(g);scene.add(fg);
      for(let team=0;team<2;team++){fg.children[1].material=Mt.getInkMaterial(G.teamColors[team]);renderer.render(scene,ortho);extra['far'+team+'Side']=snap();renderer.render(scene,cam);extra['far'+team+'Persp']=snap();
        for(const distance of [8,16]){const dc=new THREE.PerspectiveCamera(40,1,.01,50);dc.position.copy(c).add(new THREE.Vector3(-.9,.45,1.1).normalize().multiplyScalar(distance));dc.lookAt(c);renderer.render(scene,dc);extra['far'+team+'Distance'+distance]=snap();}
      }
      scene.remove(fg);scene.add(g);g.children[1].material=Mt.getInkMaterial(G.teamColors[1]);renderer.render(scene,cam);extra.team1Persp=snap();g.children[1].material=Mt.getInkMaterial(G.teamColors[0]);scene.remove(g);
      let tris = 0; for (const geo of [d.body, d.ink, d.drum, d.drumCaps, d.glow]) if (geo) tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      const res = { id, family: R?.weaponBehaviorFamily(id) ?? WEAPONS[id]?.behaviorKind ?? WEAPONS[id]?.kind, modelKind: R?.weaponModelFamily(id) ?? WEAPONS[id]?.modelKind ?? WEAPONS[id]?.kind, own: !!R?.weaponModelSpec(id),
        size: s.toArray().map(v => +v.toFixed(4)), muzzle: d.muzzle.toArray().map(v => +v.toFixed(4)), tris: Math.round(tris), buildMs: +buildMs.toFixed(1), geometryKB: Math.round(bytes / 1024),
        images: { side, above, front: muzzleView, persp, ...extra }, environment:window.environmentEvidence };
      if (!held) return res;
      // held: real Actor + WeaponRunner + Character (native + patched pose layers)
      const a = new Actor({ team: 0, weapon: id, isLocal: true, name: id, CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } }), ch = a.character;
      ch.actor = a; ch.onEvent = null; a.grounded = a.ground.hit = true; G.actors = [a]; scene.add(ch.root);
      if (ch._sourceMotionLoader) await ch._sourceMotionLoader; if (ch.sourceMotion?.ready) await ch.sourceMotion.ready; if(ch.sourceMotion?.status!=='ready')throw Error(id+' source motion not ready'); res.sourceMotion=ch.sourceMotion.status;
      const look = (frame, side) => {
        const camera = new THREE.PerspectiveCamera(32, 1, .05, 30);
        const off = side === 'right' ? new THREE.Vector3(-2.6, 1.0, 0.35) : side === 'left' ? new THREE.Vector3(2.6, 1.0, 0.35) : side === 'back' ? new THREE.Vector3(-0.9, 1.5, -2.4) : new THREE.Vector3(-1.6, 1.15, 2.4);
        camera.position.copy(a.pos).add(off); camera.lookAt(a.pos.clone().add(new THREE.Vector3(0, .8, .15)));
        renderer.render(scene, camera); return snap();
      };
      const postShot=team=>{
        if(!postReview)return null;
        const {post,postScene,camera,env}=postReview,priorEnv=G.env;
        ch.setColor(G.teamColors[team]);postScene.add(ch.root);camera.position.copy(a.pos).add(new THREE.Vector3(-2.6,1.1,1.25));camera.lookAt(a.pos.clone().add(new THREE.Vector3(0,.86,.2)));G.env=env;post.render();
        const data=post.renderer.domElement.toDataURL('image/png').split(',')[1];scene.add(ch.root);ch.setColor(G.teamColors[0]);G.env=priorEnv;
        res.post={sameRendererEnvironment:true,pmrem:[env.envMap.image.width,env.envMap.image.height],gtao:!!post.gtao,bloom:!!post.bloom,grade:!!post.grade,exposure:env.grade.uExposure,scope:'Native post stack and day IBL in isolated real Actor scene; not a complete live stage'};return data;
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
        if (frame === 110) { shots.fire = look(frame, 'front'); shots.fireSide = look(frame, 'right'); shots.fireLeft = look(frame, 'left'); if(postReview){shots.postFireTeam0=postShot(0);shots.postFireTeam1=postShot(1);} }
        if (frame === 160) {shots.fireLate = look(frame, 'back');ch.setLod('far');a._finishFrame(1/60);shots.heldFar=look(frame,'front');if(postReview)shots.postFar=postShot(0);ch.setLod('game');a._finishFrame(1/60);}
        if (frame === 215) shots.after = look(frame, 'front');
      }
      a.weaponRunner.reset(); scene.remove(ch.root); ch.dispose();
      Object.assign(res.images, shots); res.maxGrip = +maxGrip.toFixed(4); res.nonFinite = nonFinite; res.firingFrames = fired;
      res.weaponKind = ch.weaponKind; res.weaponModel = ch.weaponModel;
      return res;
    }, { id, held });
    for (const [k, b64] of Object.entries(row.images)) fs.writeFileSync(path.join(out, `${id}.${k}.png`), Buffer.from(b64, 'base64'));
    delete row.images; rows.push(row);
    console.log(JSON.stringify(row));
  }
  if(crowdOnly){
    const crowd=await page.evaluate(async()=>{
      const{THREE,api,G,renderer,scene,snap}=window.__gallery;
      const ids=['s3-shooter-heavy','s3-shooter-quicklong','s3-shooter-triplequick','s3-shooter-triplemiddle','s3-shooter-flash'],actors=[];
      for(let k=0;k<8;k++){
        const a=new api.Actor({team:k%2,name:'Five-'+k,weapon:ids[k%5],isLocal:k===0,CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
        a.character.actor=a;a.character.onEvent=null;a.grounded=a.ground.hit=true;a.pos.set((k%4-1.5)*1.3,0,Math.floor(k/4)*1.6);scene.add(a.character.root);actors.push(a);
        if(a.character._sourceMotionLoader)await a.character._sourceMotionLoader;if(a.character.sourceMotion?.ready)await a.character.sourceMotion.ready;if(a.character.sourceMotion?.status!=='ready')throw Error('crowd source motion unavailable');
      }
      G.actors=actors;const camera=new THREE.PerspectiveCamera(40,1,.05,60);camera.position.set(-6,3.8,8);camera.lookAt(0,.8,.5);
      const gl=renderer.getContext(),quant=a=>{const s=[...a].sort((x,y)=>x-y);return{p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)]};},result={scope:'Eight real Actors, native day IBL, direct render; software-render timing is not a device FPS prediction',ids:actors.map(a=>a.weaponId),teams:actors.map(a=>a.team),environment:window.environmentEvidence,tiers:{}};
      for(const tier of['game','far','game-restored']){
        for(const a of actors)a.character.setLod(tier==='far'?'far':'game');
        const animation=[],complete=[];let maxGrip=0,nonFinite=0,labelError=0;
        for(let frame=0;frame<100;frame++){
          const t0=performance.now();G.time+=1/60;
          for(const a of actors){a.ink=100;a.intent.fire=frame<80;a.weaponRunner.update(1/60,{fire:frame<80,firePressed:frame===0});a._finishFrame(1/60);const ch=a.character;ch.root.updateMatrixWorld(true);
            if(![...ch.P].every(Number.isFinite))nonFinite++;
            if(ch.P[api.CHARACTER_CHANNELS.IKL]>.99&&ch.P[api.CHARACTER_CHANNELS.LTW]<.001)maxGrip=Math.max(maxGrip,ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));
            const c=ch.weapon.parts.can,l=ch.weapon.parts.canLabel;if(l&&tier!=='far')labelError=Math.max(labelError,c.position.distanceTo(l.position),c.scale.distanceTo(l.scale));
          }
          const t1=performance.now();renderer.render(scene,camera);gl.finish();const t2=performance.now();if(frame>=40){animation.push(t1-t0);complete.push(t2-t1);}
        }
        const geos=new Set();scene.traverseVisible(o=>{if(o.isMesh)geos.add(o.geometry)});let bytes=0;for(const g of geos){for(const a of Object.values(g.attributes))bytes+=a.array.byteLength;if(g.index)bytes+=g.index.array.byteLength;}
        if(nonFinite||maxGrip>.008||labelError>1e-8)throw Error(JSON.stringify({tier,nonFinite,maxGrip,labelError}));
        result.tiers[tier]={triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,visibleGeometryBytes:bytes,maxGrip,nonFinite,labelError,animationMs:quant(animation),renderCompleteMs:quant(complete),raw:{animation,complete},image:snap()};
      }
      for(const a of actors){a.weaponRunner.reset();scene.remove(a.character.root);a.character.dispose();}return result;
    });
    for(const[tier,row]of Object.entries(crowd.tiers)){fs.writeFileSync(path.join(out,'crowd-'+tier+'.png'),Buffer.from(row.image,'base64'));delete row.image;}
    fs.writeFileSync(path.join(out,'crowd.json'),JSON.stringify({revision:identity.build.revision,...crowd},null,2));console.log('FIVE_CROWD '+JSON.stringify(crowd));
  }
  fs.writeFileSync(path.join(out, 'gallery.json'), JSON.stringify({ revision: identity.build.revision, rows, errors }, null, 2));
  if (errors.length) { console.error('page errors:', errors.slice(0, 10)); process.exitCode = 1; }
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
