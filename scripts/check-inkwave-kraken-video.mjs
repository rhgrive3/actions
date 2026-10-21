#!/usr/bin/env node
// Actual catalogue activation, Actor/Physics/Projectiles and source-loaded
// Character in the emitted build. This is an INKWAVE regression check, not a
// comparison with a retail Switch recording.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const site = fs.realpathSync(opt('--site', '_site'));
const out = path.resolve(opt('--evidence-dir', '.ci-scratch/kraken-video'));
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const hash = data => createHash('sha256').update(data).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
for (const [file, digest] of Object.entries(manifest.artifacts)) assert.equal(hash(fs.readFileSync(path.join(site, file))), digest, file);
const prefix = `/_versions/${manifest.build.revision}/`;
const server = http.createServer((req, res) => {
  if (req.url === '/check') {
    res.setHeader('content-type', 'text/html');
    res.end(`<html><head><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);
    return;
  }
  const file = path.resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(site + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const errors = [];
let browser;
const watchdog = setTimeout(() => { errors.push('180-second browser watchdog'); void browser?.close(); }, 180_000);
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/check`);
  await page.evaluate(async prefix => {
    let seed=1130;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const THREE = await import('three');
    const { install } = await import(prefix + 'patches/splatoon3/runtime/install.mjs');
    const profile = await fetch(prefix + 'patches/splatoon3/profile.json').then(r => r.json());
    const api = install(profile), { G } = api;
    // The same post-install order as bootstrap.mjs, without starting the menu
    // or a second game loop around this controlled flat-floor scene.
    for (const [name, file] of [
      ['installIssueFiveHotfixA', 'splatoon3/runtime/issue-five-hotfix-a.mjs'],
      ['installIssueFiveHotfixB', 'splatoon3/runtime/issue-five-hotfix-b.mjs'],
      ['installIssueFiveHotfixC', 'splatoon3/runtime/issue-five-hotfix-c.mjs'],
      ['installDisconnectFidelity', 'splatoon3/runtime/disconnect-fidelity.mjs'],
      ['installSlosherIntermediatePaint', 'splatoon3/runtime/slosher-intermediate-paint.mjs'],
      ['installQuality', 'local-quality/install.mjs'],
      ['installWeaponsFidelity', 'splatoon3/runtime/weapons-fidelity.mjs'],
      ['installIssueEightFollowup', 'splatoon3/runtime/issue-eight-followup.mjs'],
      ['installMainWeaponCatalogRuntime', 'splatoon3/runtime/main-weapon-catalog.mjs'],
      ['installWeaponAudioRuntime', 'splatoon3/runtime/audio/runtime.mjs'],
    ]) {
      const m = await import(prefix + 'patches/' + file);
      if (name === 'installQuality') m[name](profile); else m[name](api, profile);
    }
    const { applyCatalogueChoice } = await import(prefix + 'patches/splatoon3/runtime/catalogue.mjs');
    const { specialPresentationSnapshot } = await import(prefix + 'patches/splatoon3/runtime/special-motion.mjs');
    const { createLevelMaterial } = await import(prefix + 'src/world/levelMaterial.js');
    const { Level } = await import(prefix + 'src/world/level.js');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#d7e1eb');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(960, 720); document.body.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x637278, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 2.8); light.position.set(-3, 8, 5); scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#a8b3bf', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.005; scene.add(floor);
    const camera = new THREE.PerspectiveCamera(45, 4 / 3, .01, 200);
    camera.position.set(12, 10, 15); camera.lookAt(0, 3, 2);
    const level = new Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, spawnPads: [[-40, 0, 0], [40, 0, 0]], spawnBarrier: 0, half: [], single: [{ kind: 'box', min: [-50, -.5, -50], max: [50, 0, 50] }] });
    Object.assign(G, { scene, renderer, camera, level, physics: new api.Physics(level), settings: { quality: 'high' }, mode: 'match', actors: [], time: 0,
      teamColors: [new THREE.Color('#ff7711'), new THREE.Color('#2255dd')], match: { state: 'playing', playing: () => true }, paint: { sample: () => 1, splat: () => 0 } });

    scene.remove(floor);floor.geometry.dispose();floor.material.dispose();
    G.paint=new api.PaintSystem(renderer,level,{atlasSize:2048,maxDensity:16});
    const material=createLevelMaterial(G.paint.texture,G.paint.size);
    scene.add(new THREE.Mesh(level.buildGeometry(G.paint.size),material));
    scene.add(new THREE.GridHelper(100,100,0x56616b,0x89939c));
    G.projectiles=new api.Projectiles(scene);G.fx=null;
    const a=new api.Actor({team:0,name:'Kraken comparison',weapon:'shooter',CharacterClass:api.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
    G.actors=[a];scene.add(a.character.root);
    if(a.character._sourceMotionLoader)await a.character._sourceMotionLoader;
    if(a.character.sourceMotion?.ready)await a.character.sourceMotion.ready;
    if(a.character.sourceMotion?.status!=='ready')throw Error('source motion not ready');
    for(let i=0;i<40;i++){G.time+=1/60;a.update(1/60);}
    a.pos.set(0,0,-20);a.vel.set(0,0,0);a.grounded=true;a.ground.hit=true;
    if(!applyCatalogueChoice(a,{sub:'bomb',special:'krakenRoyale'},api))throw Error('catalogue');
    a.special=a.specialCost();a.intent.special=true;
    a.aimYaw=a.yaw=0;a.aimPitch=0;
    const hud=document.createElement('div');Object.assign(hud.style,{position:'absolute',left:'12px',top:'12px',color:'black',background:'#ffffffdd',font:'16px monospace',padding:'8px',whiteSpace:'pre'});document.body.appendChild(hud);
    let frame=0;const samples=[];
    window.krakenFrame=label=>{
      for(let n=0;n<2;n++){
        const t=frame*2/60+n/60;
        a.intent.move.set(0,0,t>=1&&t<3?1:0);
        a.intent.fire=t>=3&&t<3.8;
        G.time+=1/60;a.update(1/60);a.intent.special=false;G.projectiles.update(1/60);
        G.paint.flush(1/60);
      }
      const t=(frame+1)/30;
      camera.position.set(a.pos.x+8,6,a.pos.z+10);camera.lookAt(a.pos.x,.8,a.pos.z+1);
      material.userData.uniforms.uTime.value=G.time;G.paint.setView(camera.position);
      hud.textContent=label+' | INKWAVE controlled scene (not Switch)\n'+
        'simulation '+t.toFixed(2)+' s | 60 Hz updates / 30 fps frames\n'+
        (a.specialActive?.phase||'ended')+' | z '+a.pos.z.toFixed(3)+' | speed '+Math.hypot(a.vel.x,a.vel.z).toFixed(3);
      renderer.render(scene,camera);
      const gl=renderer.getContext();if(gl.getError()!==gl.NO_ERROR||gl.isContextLost())throw Error('WebGL');
      samples.push({frame:frame++,time:t,phase:a.specialActive?.phase||null,pos:a.pos.toArray(),velocity:a.vel.toArray(),grounded:a.grounded,paintVersion:G.paint.version});
      return samples.at(-1);
    };
    window.krakenSamples=samples;
  },prefix);
  const label=opt('--label',manifest.build.revision);
  const frameDir=path.join(out,'frames');fs.mkdirSync(frameDir,{recursive:true});
  for(let i=0;i<300;i++){
    await page.evaluate(label=>window.krakenFrame(label),label);
    await page.screenshot({path:path.join(frameDir,String(i).padStart(5,'0')+'.png')});
  }
  const samples=await page.evaluate(()=>window.krakenSamples);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({scope:'Actual emitted Actor/Physics/Character/PaintSystem in a controlled floor scene, not retail fidelity acceptance',buildRevision:manifest.build.revision,contentHash:manifest.contentHash,label,fps:30,simulationHz:60,samples,errors},null,2));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({out,frames:300,encode:'ffmpeg -framerate 30 -i '+frameDir+'/%05d.png -c:v libx264 -pix_fmt yuv420p '+out+'/kraken.mp4'}));
}finally{
  clearTimeout(watchdog);await browser?.close();await new Promise(resolve=>server.close(resolve));
}
