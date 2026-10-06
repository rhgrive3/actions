#!/usr/bin/env node
// Actual installed modules + Actor/Runner/Projectiles/full rig in software
// WebGL. Same-frame visibility pairs prove rendered activity of this rig;
// Nintendo joint curves and original image parity remain unknown.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Exported checks run against the same WebGL records in focused failure tests.
export function pixelDifference(a,b) {
  if (a.length !== b.length || !a.length || a.length % 4) throw Error('Invalid rendered pixel denominator');
  let changedPixels=0,totalRgbDifference=0,maxChannelDifference=0;
  for (let i=0;i<a.length;i+=4) {
    let changed=false;
    for(let c=0;c<3;c++) { const d=Math.abs(a[i+c]-b[i+c]); if(!Number.isFinite(d))throw Error('Non-finite rendered pixel'); totalRgbDifference+=d; maxChannelDifference=Math.max(maxChannelDifference,d); changed ||= d>=3; }
    if(changed)changedPixels++;
  }
  return {pixels:a.length/4,changedPixels,totalRgbDifference,maxChannelDifference};
}
export function validateDetailReceipts(loaded) {
  for (const module of ['bomb-motion','flow-motion','weapon-detail-motion'])
    if (!loaded.some(file=>file.endsWith('/patches/splatoon3/runtime/'+module+'.mjs'))) throw Error('Actual detail module not loaded: '+module);
}
export function validateDetailResult(result) {
  if(result.pixelControls?.dither!==false||result.pixelControls?.samples!==0||result.pixelControls?.target!=='explicit-srgb-rgba8')throw Error('Controlled detail pixel framebuffer');
  const finite=(v,path)=>{ if(typeof v!=='number'||!Number.isFinite(v))throw Error('Non-finite detail '+path); };
  const numericTree=(v,path)=>{ if(typeof v==='number')finite(v,path);else if(v&&typeof v==='object')for(const [key,value] of Object.entries(v))numericTree(value,path+'.'+key); };
  const expected=['bomb-standing','bomb-running','bomb-air','bomb-dualies','flow-kid','flow-squid','flow-air','flow-reset','bucket-repeat','blaster-repeat','charger-return','splatling-coast','shooter-recoil','shooter-detail-opt-out'];
  if(!Array.isArray(result.data)||result.data.length!==expected.length||new Set(result.data.map(r=>r.name)).size!==expected.length||expected.some(n=>!result.data.some(r=>r.name===n)))throw Error('Detail scenario denominator');
  const summary=[];
  for(const row of result.data) {
    const {name,scenario,samples,releaseFrames,events,renderMetrics,disposed}=row;
    const type=name.startsWith('bomb-')?'bomb':name.startsWith('flow-')?'flow':name==='bucket-repeat'?'bucket':name==='blaster-repeat'?'blaster':name==='charger-return'?'charger':name==='splatling-coast'?'splatling':'shooter';
    const kind=type==='bucket'?'slosher':['blaster','charger','splatling'].includes(type)?type:name==='bomb-dualies'?'dualies':'shooter';
    if(scenario?.name!==name||scenario.type!==type||scenario.kind!==kind)throw Error('Detail scenario identity: '+name);
    const frames=scenario.type==='splatling'?420:240;
    if(row.frames!==frames||!Array.isArray(samples)||samples.length!==frames)throw Error('Detail frame denominator: '+name);
    numericTree(row,name);
    for(const [frame,s] of samples.entries()) {
      if(s.frame!==frame||!Array.isArray(s.ik)||s.ik.length!==4)throw Error('Detail frame/IK denominator: '+name);
      s.ik.forEach(v=>finite(v,name+'.ik'));
      for(const key of ['right','left','leftTarget']){
        finite(s.gripWeights?.[key],name+'.gripWeights.'+key);
        if(s.gripWeights[key]<-1e-6||s.gripWeights[key]>1+1e-6)throw Error('Detail native grip weight range: '+name);
      }
      if(s.weapon?.kind!==scenario.kind||!['off','entry','active','expiry'].includes(s.flow?.phase))throw Error('Detail snapshot identity: '+name);
      for(const key of ['heldVisible','leftPistolVisible','runnerStreaming'])if(typeof s[key]!=='boolean')throw Error('Detail flag identity: '+name);
      for(const key of ['time','lastShot','lastRelease','aim','rcP','rcZ','projectileCount'])finite(s[key],name+'.'+key);
      for(const side of ['left','right']) { const p=s.hands?.[side]; if(!Array.isArray(p)||p.length!==3)throw Error('Detail hand denominator: '+name); p.forEach(v=>finite(v,name+'.hand')); }
      for(const key of ['opacity','resources','aliveParticles'])finite(s.flow?.[key],name+'.flow.'+key);
      if(typeof s.flow.active!=='boolean'||typeof s.flow.visible!=='boolean')throw Error('Detail Flow identity: '+name);
      if(s.flow.opacity<0||s.flow.opacity>1||s.flow.resources<0||s.flow.aliveParticles<0)throw Error('Detail Flow range: '+name);
    }
    const renderFrames=[21,29,30,45,75,95,110,111,145,160,165,200,239,310,360,419].filter(f=>f<frames);
    if(!Array.isArray(events)||!Array.isArray(releaseFrames)||!Array.isArray(renderMetrics)||renderMetrics.length!==renderFrames.length||new Set(renderMetrics.map(m=>m.frame)).size!==renderFrames.length||renderFrames.some(f=>!renderMetrics.some(m=>m.frame===f)))throw Error('Detail event/render denominator: '+name);
    for(const event of events){finite(event.frame,name+'.eventFrame');if(typeof event.name!=='string'||event.frame<0||event.frame>=frames)throw Error('Detail release event identity: '+name);}
    for(const release of releaseFrames){for(const key of ['frame','fuse','meshOriginError','releaseSnapshotError'])finite(release[key],name+'.release.'+key);for(const key of ['pos','velocity']){if(!Array.isArray(release[key])||release[key].length!==3)throw Error('Detail release vector denominator');release[key].forEach(v=>finite(v,name+'.releaseVector'));}}
    for(const m of renderMetrics) {
      if(m.renderClocksStable!==true)throw Error('Detail render changed native clocks/gameplay: '+name);
      finite(m.frame,name+'.renderFrame');
      for(const layer of ['rig',...(scenario.type==='flow'?['flow']:[])]){
        for(const key of ['pixels','changedPixels','totalRgbDifference','maxChannelDifference'])finite(m[layer]?.[key],name+'.render.'+layer+'.'+key);
        if(m[layer].pixels!==960*720||!Number.isInteger(m[layer].changedPixels)||m[layer].changedPixels<0||m[layer].changedPixels>m[layer].pixels)throw Error('Detail rendered pixel denominator: '+name);
      }
      if(m.rig.changedPixels<16)throw Error('Detail rig produced no visible pixels: '+name);
      for(const layer of ['weapon','heldBomb','releasedBomb'])if(m[layer]){
        for(const key of ['indexedVertices','nearestRight','nearestLeft'])finite(m[layer][key],name+'.'+layer+'.'+key);
        if(!Number.isInteger(m[layer].indexedVertices)||m[layer].indexedVertices<50)throw Error('Detail indexed-draw denominator: '+name);
      }
      if(!m.weapon){if(!(scenario.squid&&samples[m.frame]?.form==='squid'))throw Error('Missing drawn weapon: '+name);continue;}
      if(m.weapon.nearestRight>=.2)throw Error('Detail hand left actual drawn weapon: '+name);
      const grip=samples[m.frame].gripWeights;
      if(scenario.type!=='bomb'&&grip.left>.99&&grip.leftTarget<.001&&m.weapon.nearestLeft>=.2)
        throw Error('Detail held support hand left actual drawn weapon: '+name+' frame '+m.frame+' gap '+m.weapon.nearestLeft);
    }
    if(!disposed?.disposed||disposed.resources!==0||disposed.aliveParticles!==0)throw Error('Flow resources survived Character disposal: '+name);
    const peak=Math.max(...samples.map(s=>Math.abs(s.rcP))),tail=samples.slice(-24);
    if(scenario.type==='bomb') {
      if(releaseFrames.length!==1||releaseFrames[0].frame!==30||!samples[29].heldVisible||samples[30].heldVisible||samples.at(-1).bomb.throwing)throw Error('Actual bomb aim/release/recovery regression: '+name);
      if(scenario.kind==='dualies'&&(samples[29].leftPistolVisible||!samples.at(-1).leftPistolVisible))throw Error('Bomb dualies pistol recovery regression');
      const held=renderMetrics.find(m=>m.frame===29)?.heldBomb,released=renderMetrics.find(m=>m.frame===30)?.releasedBomb;
      if(!held||held.indexedVertices<50||held.nearestLeft>=.12||!released||released.indexedVertices<100||released.nearestLeft>=.22)throw Error('Actual indexed bomb/hand contact regression: '+name);
      if(samples[29].ik.slice(0,2).some(e=>e>=.015)||tail.some(s=>s.ik.slice(0,2).some(e=>e>=.015)))throw Error('Native bomb arm reach regression: '+name);
      if(releaseFrames[0].meshOriginError>1e-10||releaseFrames[0].releaseSnapshotError>1e-8)throw Error('Rendered/collision bomb release regression: '+name);
    }
    if(scenario.type==='flow') {
      if(renderMetrics.some(m=>m.flowIsolation?.nativeDepthOcclusion!==true||!(m.flowIsolation?.maskedMaterials>0)))throw Error('Native Flow exterior occlusion proof: '+name);
      const off=s=>!s.flow.active&&s.flow.phase==='off'&&!s.flow.visible&&s.flow.opacity===0&&s.flow.aliveParticles===0;
      if(!samples[45].flow.active||!(samples[45].flow.opacity>0)||!samples[75].flow.visible)throw Error('Compiled Flow did not appear: '+name);
      if(samples[95].flow.extensionCount!==1||samples[45].flow.activationCount!==1)throw Error('Compiled Flow entry/renewal event regression: '+name);
      const entry=renderMetrics.find(m=>m.frame===45),sustain=renderMetrics.find(m=>m.frame===75),retired=renderMetrics.find(m=>m.frame===200);
      if(!entry?.flow||entry.flow.changedPixels<8||!sustain?.flow||sustain.flow.changedPixels<1)throw Error('Compiled Flow exterior produced no visible pixels: '+name);
      if(!off(samples.at(-1))||!retired?.flow||retired.flow.changedPixels!==0)throw Error('Compiled Flow did not retire: '+name);
      if(scenario.reset) {
        if(!samples.slice(110).every(off))throw Error('Compiled Flow survived immediate Actor reset');
        for(const frame of [110,111])if(renderMetrics.find(m=>m.frame===frame)?.flow?.changedPixels!==0)throw Error('Compiled Flow reset left exterior pixels');
      } else if(samples[160].flow.phase!=='expiry'||!(samples[160].flow.opacity>0)||!off(samples[200]))throw Error('Compiled Flow expiry transition regression: '+name);
      if(samples.some(s=>s.flow.resources>samples[95].flow.resources)||samples[95].flow.resources<=0)throw Error('Flow fixture resources grew beyond its allocated set: '+name);
    }
    if(scenario.type==='bucket'&&(!samples.some(s=>s.weapon.bucketDrain>.1)||events.filter(e=>e.name==='fireSlosh').length<2))throw Error('Compiled bucket fill missed real repeated releases');
    if(scenario.type==='blaster'&&(samples.some(s=>s.weapon.pump!==0)||events.filter(e=>e.name==='fireBlaster').length<2))throw Error('Unsupported Blaster pump or missing repeated release');
    if(scenario.type==='splatling'&&(!samples.some(s=>s.weapon.barrelSpeed>40)||events.filter(e=>e.name==='fireSplatling').length<2||tail.some(s=>s.runnerStreaming||s.weapon.barrelSpeed!==0)||tail.some(s=>Math.abs(s.weapon.barrelAngle-tail[0].weapon.barrelAngle)>1e-10)))throw Error('Heavy cluster spin/coast did not finish');
    if(scenario.type==='shooter') {
      finite(row.fireInterval,name+'.fireInterval'); finite(row.firstShotDelay,name+'.firstShotDelay');
      const interval=Math.round(row.fireInterval*60),shots=events.filter(e=>e.name==='fireShooter');
      // The configured N-frame first-shot gate fires on the Nth simulation tick
      // (zero-based frame N-1); subsequent shots still follow native cadence.
      const first=Math.max(0,Math.ceil(row.firstShotDelay*60-1e-9)-1);
      const expectedShots=first<100?Math.floor((99-first)/interval)+1:0;
      if(interval<1||Math.abs(interval/60-row.fireInterval)>1e-8||shots.length!==expectedShots||shots.some((e,i)=>e.frame!==first+i*interval))throw Error('Shooter actual shot stream regression: '+name);
      if(!(peak>.003)||tail.some(s=>Math.abs(s.rcP)>=.001||Math.abs(s.rcZ)>=.001))throw Error('Shooter actual recoil/recovery regression: '+name);
      if(samples.some(s=>s.ik.slice(0,2).some(e=>e>=.02)))throw Error('Shooter native arm reach regression: '+name);
    }
    if(scenario.type==='charger') {
      const shots=events.filter(e=>e.name==='fireCharger');
      shots.forEach(e=>finite(e.charge,name+'.releasedCharge'));
      if(shots.length!==1||shots[0].frame!==80||shots[0].charge<.99||events.some(e=>e.frame<80)||samples[75].aim<.9)throw Error('Charger actual full-charge release regression');
      if(!(peak>.003)||samples[80].weapon.chargerReleaseAge==null||samples[110].aim>1e-8||tail.some(s=>s.aim>1e-8||Math.abs(s.rcP)>=.001||Math.abs(s.rcZ)>=.001))throw Error('Charger actual recoil/carry return regression');
      if(samples.some(s=>s.ik.slice(0,2).some(e=>e>=.025)))throw Error('Charger native arm reach regression');
    }
    summary.push({name,frames:samples.length,releases:events.length,peakNativeRecoil:peak,renderPairs:renderMetrics.length,minimumRigPixels:Math.min(...renderMetrics.map(m=>m.rig.changedPixels)),maxNativeArmReach:Math.max(...samples.flatMap(s=>s.ik.slice(0,2)))});
  }
  const shooter=summary.find(r=>r.name==='shooter-recoil'),baseline=summary.find(r=>r.name==='shooter-detail-opt-out');
  if(shooter.peakNativeRecoil>=baseline.peakNativeRecoil*.7)throw Error('Shooter detail did not reduce native recoil against same installed-rig opt-out');
  return summary;
}

async function main() {
const option = name => {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) throw Error('Required ' + name);
  return path.resolve(process.argv[i + 1]);
};
let site = option('--site');
const output = option('--evidence-dir'), profileDir = option('--profile-dir');
const physical = p => fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p));
for (const dir of [output, profileDir]) {
  const resolved = physical(dir);
  if (['/tmp', '/var/tmp', '/dev/shm'].some(p => resolved === p || resolved.startsWith(p + '/'))) throw Error('Persistent storage required');
  fs.mkdirSync(dir, { recursive: true });
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const publish=value=>{fs.writeFileSync(path.join(output,'motion-detail-result.json.writing'),JSON.stringify(value,null,2)+'\n');fs.renameSync(path.join(output,'motion-detail-result.json.writing'),path.join(output,'motion-detail-result.json'));};
let manifest,browser,server,page,result,failure,lastProgress;const errors=[],loaded=[];
const recordError=value=>{if(errors.length<20)errors.push(String(value).slice(0,1500));};
publish({status:'running',gate:'motion-detail',startedAt:new Date().toISOString()});
try {
  site=fs.realpathSync(site);manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
  if(hash(JSON.stringify(manifest.artifacts))!==manifest.contentHash)throw Error('Build identity mismatch');
  for(const [file,digest] of Object.entries(manifest.artifacts))if(hash(fs.readFileSync(path.join(site,file)))!==digest)throw Error('Artifact mismatch: '+file);
  const prefix='/_versions/'+manifest.build.revision+'/';
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
server = http.createServer((req, res) => {
  if (req.url === '/motion-detail') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`);
    return;
  }
  const file = path.resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(site + '/') || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: 960, height: 720 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage();
  page.on('pageerror', error => recordError(error.message));
  page.on('crash', () => recordError('Chromium detail page crashed'));
  page.on('console', message => {
    if (message.type() === 'error') recordError(message.text());
    const text = message.text(), prefix = '[motion-detail-progress] ';
    if (text.startsWith(prefix)) {
      try { lastProgress = JSON.parse(text.slice(prefix.length)); } catch {}
    }
  });
  await page.route('http://127.0.0.1:' + server.address().port + '/**', async route => {
    try {
      const response = await route.fetch(), body = await response.body();
      const key = decodeURIComponent(new URL(response.url()).pathname).slice(1);
      if (manifest.artifacts[key]) {
        if (hash(body) !== manifest.artifacts[key]) throw Error('Active artifact mismatch: ' + key);
        loaded.push(key);
      }
      await route.fulfill({ response, body });
    } catch (error) { recordError(error.message); await route.abort(); }
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/motion-detail');
  await page.addScriptTag({content:'globalThis.motionPixelDifference = '+pixelDifference.toString()+';'});
  result = await page.evaluate(async ({ prefix, contentHash }) => {
    const THREE = await import('three');
    const profile = await fetch(prefix + 'patches/splatoon3/profile.json').then(r => r.json());
    const { install } = await import(prefix + 'patches/splatoon3/runtime/install.mjs');
    const api = install(profile), { Actor, Character, Projectiles, G, CHARACTER_CHANNELS: C } = api;
    const { bombMotionSnapshot } = await import(prefix + 'patches/splatoon3/runtime/bomb-motion.mjs');
    const { flowMotionSnapshot } = await import(prefix + 'patches/splatoon3/runtime/flow-motion.mjs');
    const { weaponDetailMotionSnapshot } = await import(prefix + 'patches/splatoon3/runtime/weapon-detail-motion.mjs');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#dfe7e9');
    const camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.05, -1.05, .01, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(960, 720); renderer.setPixelRatio(1); document.body.appendChild(renderer.domElement);
    const glControl = renderer.getContext();
    const defaultDither = glControl.isEnabled(glControl.DITHER); glControl.disable(glControl.DITHER);
    // Read the same explicit single-sample framebuffer for every pair. Canvas
    // drawing buffers may rotate between render calls; preserve native shaders.
    const pixelTarget = new THREE.WebGLRenderTarget(960, 720, { samples: 0 });
    pixelTarget.texture.colorSpace = THREE.SRGBColorSpace;
    renderer.setRenderTarget(pixelTarget);
    const evidenceCanvas = document.createElement('canvas'); evidenceCanvas.width = 960; evidenceCanvas.height = 720;
    const evidenceContext = evidenceCanvas.getContext('2d');
    function frameImage() {
      const rgba = pixels(), flipped = new Uint8ClampedArray(rgba.length);
      for (let y = 0; y < 720; y++) flipped.set(rgba.subarray(y * 960 * 4, (y + 1) * 960 * 4), (719 - y) * 960 * 4);
      evidenceContext.putImageData(new ImageData(flipped, 960, 720), 0, 0);
      return evidenceCanvas.toDataURL('image/png');
    }

    Object.assign(G, { scene, camera, renderer, settings: { quality: 'high', shadows: false }, mode: 'match', actors: [], time: 0,
      teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
      level: { blocks: [], groundHeight: () => 0 }, paint: { sample: () => 1, splat: () => 0 },
      match: { playing: () => true }, physics: { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } } });
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667477, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(3, 5, 4); scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xbfcbd0, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.004; scene.add(floor);
    const projectiles = G.projectiles = new Projectiles(scene);
    const cases = [
      { name: 'bomb-standing', kind: 'shooter', type: 'bomb' },
      { name: 'bomb-running', kind: 'shooter', type: 'bomb', speed: 5.76 },
      { name: 'bomb-air', kind: 'shooter', type: 'bomb', air: true },
      { name: 'bomb-dualies', kind: 'dualies', type: 'bomb' },
      { name: 'flow-kid', kind: 'shooter', type: 'flow' },
      // The squid swims: a squid resting in its own ink is drawn under the surface
      // (swim-motion.test.mjs), so Flow on the squid form is proven while it glides.
      { name: 'flow-squid', kind: 'shooter', type: 'flow', squid: true, squidSpeed: 4 },
      { name: 'flow-air', kind: 'shooter', type: 'flow', air: true },
      { name: 'flow-reset', kind: 'shooter', type: 'flow', reset: true },
      { name: 'bucket-repeat', kind: 'slosher', type: 'bucket' },
      { name: 'blaster-repeat', kind: 'blaster', type: 'blaster' },
      { name: 'charger-return', kind: 'charger', type: 'charger' },
      { name: 'splatling-coast', kind: 'splatling', type: 'splatling' },
      { name: 'shooter-recoil', kind: 'shooter', type: 'shooter' },
      { name: 'shooter-detail-opt-out', kind: 'shooter', type: 'shooter', detailEnabled: false },
    ];
    const data = [], images = [];
    const pixels=()=>{const gl=renderer.getContext(),p=new Uint8Array(960*720*4);renderer.readRenderTargetPixels(pixelTarget,0,0,960,720,p);return p;};
    const drawable=root=>{for(let node=root;node;node=node.parent)if(!node.visible)return false;return true;};
    function drawnContact(root,left,right) {
      if(!drawable(root))throw Error('Attempt to measure an invisible indexed draw');
      let indexedVertices=0,nearestLeft=Infinity,nearestRight=Infinity;const point=new THREE.Vector3();
      root.updateMatrixWorld(true);
      root.traverseVisible(mesh=>{
        if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.geometry?.index)return;
        const g=mesh.geometry,ix=g.index,start=Math.max(0,g.drawRange.start||0),end=Math.min(ix.count,start+g.drawRange.count);
        const ranges=Array.isArray(mesh.material)?g.groups.filter(group=>mesh.material[group.materialIndex]?.visible!==false):[{start:0,count:ix.count}];
        if(!Array.isArray(mesh.material)&&mesh.material?.visible===false)return;
        for(const range of ranges)for(let i=Math.max(start,range.start);i<Math.min(end,range.start+range.count);i++){
          mesh.getVertexPosition(ix.getX(i),point);point.applyMatrix4(mesh.matrixWorld);indexedVertices++;
          nearestLeft=Math.min(nearestLeft,point.distanceTo(left));nearestRight=Math.min(nearestRight,point.distanceTo(right));
        }
      });
      if(!indexedVertices||!Number.isFinite(nearestLeft)||!Number.isFinite(nearestRight))throw Error('Empty/non-finite indexed contact draw');
      return {indexedVertices,nearestLeft,nearestRight};
    }
    function capture(scenario,frame,ch,actor) {
      const nativeRenderState=()=>JSON.stringify({time:G.time,characterTime:ch.t,pose:Array.from(ch.P),timers:Array.from(ch.tr),root:ch.root.position.toArray(),position:actor.pos.toArray(),velocity:actor.vel.toArray(),hp:actor.hp,ink:actor.ink,invuln:actor.invuln,flow:actor.s3.flow,runner:Object.fromEntries(['cooldown','chargeT','charge','lockT','streaming','aimingSub','fuse','subFuse'].map(k=>[k,actor.weaponRunner[k]]))});
      const beforeRender=nativeRenderState();
      projectiles._draw();camera.position.copy(ch.root.position).add(new THREE.Vector3(2.6,1.3,3.4));
      camera.lookAt(ch.root.position.clone().add(new THREE.Vector3(0,.62,0)));camera.updateMatrixWorld();renderer.render(scene,camera);
      const actual=pixels(),image=frameImage(),visible=ch.root.visible;
      let rig;
      try{ch.root.visible=false;renderer.render(scene,camera);rig=globalThis.motionPixelDifference(actual,pixels());}
      finally{ch.root.visible=visible;}
      let flow=null,wholeSceneFlow=null,flowIsolation=null;
      if(scenario.type==='flow'){
        // Each visibility pair owns a fresh baseline. The preceding rig-hidden
        // render must not supply the baseline for a different counterfactual.
        renderer.render(scene,camera);const flowActual=pixels();
        const nodes=[];ch.root.traverse(node=>{if(node.name.startsWith('s3-flow-'))nodes.push({node,visible:node.visible});});
        try{for(const item of nodes)item.node.visible=false;renderer.render(scene,camera);wholeSceneFlow=globalThis.motionPixelDifference(flowActual,pixels());}
        finally{for(const item of nodes)item.node.visible=item.visible;}
        // Exterior geometry must be measured against the native body's depth,
        // without unrelated skin/coating color noise after a reset. Keep the
        // original whole-scene comparison as a diagnostic; thresholds stay fixed.
        const bodyMaterials=new Map();
        ch.root.traverse(node=>{
          if(!node.isMesh)return;
          for(let p=node;p;p=p.parent)if(p.name.startsWith('s3-flow-'))return;
          for(const mat of Array.isArray(node.material)?node.material:[node.material])if(mat&&!bodyMaterials.has(mat))bodyMaterials.set(mat,mat.colorWrite);
        });
        try{
          for(const mat of bodyMaterials.keys())mat.colorWrite=false;
          renderer.render(scene,camera);const exteriorActual=pixels();
          images.push({name:scenario.name+'-'+String(frame).padStart(3,'0')+'-exterior-visible',image:frameImage()});
          for(const item of nodes)item.node.visible=false;
          renderer.render(scene,camera);flow=globalThis.motionPixelDifference(exteriorActual,pixels());
          images.push({name:scenario.name+'-'+String(frame).padStart(3,'0')+'-exterior-hidden',image:frameImage()});
          flowIsolation={nativeDepthOcclusion:true,maskedMaterials:bodyMaterials.size};
        }finally{
          for(const [mat,colorWrite] of bodyMaterials)mat.colorWrite=colorWrite;
          for(const item of nodes)item.node.visible=item.visible;
        }
      }
      renderer.render(scene,camera);
      images.push({name:scenario.name+'-'+String(frame).padStart(3,'0'),image});
      const left=ch.bones.handL.getWorldPosition(new THREE.Vector3()),right=ch.bones.handR.getWorldPosition(new THREE.Vector3());
      if(nativeRenderState()!==beforeRender)throw Error('Rendered pair advanced native clocks/gameplay: '+scenario.name+' frame '+frame);
      return {frame,renderClocksStable:true,rig,flow,wholeSceneFlow,flowIsolation,weapon:drawable(ch.weapon.off)?drawnContact(ch.weapon.off,left,right):null,heldBomb:drawable(ch.bomb.group)?drawnContact(ch.bomb.group,left,right):null,releasedBomb:scenario.type==='bomb'&&frame===30?drawnContact(projectiles.bombs.at(-1).mesh,left,right):null};
    }
    try {
    for (const scenario of cases) {
      projectiles.clear();
      const actor = new Actor({ team: 0, name: scenario.name, weapon: scenario.kind, CharacterClass: Character,
        style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
      const ch = actor.character; ch.actor = actor; ch.s3WeaponDetailMotionEnabled = scenario.detailEnabled !== false; ch.onEvent = null; G.actors = [actor]; scene.add(ch.root);
      actor.grounded = true; actor.ground.hit = true; actor.vel.set(0, 0, 0);
      const frames=scenario.type==='splatling'?420:240,samples=[],releaseFrames=[],events=[],renderMetrics=[],methods=new Map();
      let frame=-1;
      for(const name of ['throwBomb','fireShooter','fireCharger','fireBlaster','fireSlosh','fireSplatling']){
        const native=projectiles[name];methods.set(name,native);
        projectiles[name]=function(...args){
          const value=native.apply(this,args);
          if(args[0]===actor){
            events.push({name,frame,charge:name==='fireCharger'?args[2]:null});
            if(name==='throwBomb'){
              const b=this.bombs.at(-1),snap=bombMotionSnapshot(ch),release=new THREE.Vector3().fromArray(snap.releasePosition||[]);
              if(!b||!snap.releasePosition)throw Error('Missing actual bomb release origin');
              releaseFrames.push({frame,pos:b.pos.toArray(),velocity:b.vel.toArray(),fuse:b.fuse,meshOriginError:b.mesh.position.distanceTo(b.pos),releaseSnapshotError:release.distanceTo(b.pos)});
            }
          }
          return value;
        };
      }
      const tick = input => {
        actor.ink = 100; actor.intent.fire = !!input.fire; actor.intent.sub = !!input.sub;
        G.time += 1 / 60; actor.weaponRunner.update(1 / 60, input); actor._finishFrame(1 / 60);
        ch.root.updateMatrixWorld(true);
        if (!Array.from(ch.P).every(Number.isFinite)) throw Error('Non-finite ' + scenario.name + ' pose');
      };
      try {
        for (let i = 0; i < 90; i++) tick({});
        actor.pos.set(0, scenario.air ? .8 : 0, 0); actor.grounded = !scenario.air;
        for (frame = 0; frame < frames; frame++) {
          let fire = ['bucket', 'blaster', 'shooter'].includes(scenario.type) && frame < 100;
          if (scenario.type === 'charger') fire = frame < 80;
          if (scenario.type === 'splatling') fire = frame < 140;
          const sub = scenario.type === 'bomb' && frame < 30;
          if (scenario.type === 'flow') {
            if (frame === 20) { actor.s3.flow.active = true; actor.s3.flow.remaining = 10; }
            if (frame === 90) actor.s3.flow.remaining += 5;
            if (frame === 160 && !scenario.reset) { actor.s3.flow.active = false; actor.s3.flow.remaining = 0; }
            if (scenario.squid && frame === 70) { actor.form = 'squid'; actor.submerged = true; }
            if (scenario.squid && frame === 120) { actor.form = 'kid'; actor.submerged = false; }
            if (scenario.reset && frame === 110) { actor.reset(); actor.grounded = true; }
          }
          const v = actor.form === 'squid' && scenario.squidSpeed ? scenario.squidSpeed : scenario.speed || 0; actor.vel.set(0, 0, v); actor.pos.z += v / 60;
          tick({ fire, sub, subReleased: scenario.type === 'bomb' && frame === 30 });
          const bomb = bombMotionSnapshot(ch), flow = flowMotionSnapshot(ch), weapon = weaponDetailMotionSnapshot(ch);
          const left = ch.bones.handL.getWorldPosition(new THREE.Vector3()).toArray();
          const right = ch.bones.handR.getWorldPosition(new THREE.Vector3()).toArray();
          samples.push({ frame, form: actor.form, bomb, flow, weapon, hands: { left, right }, ik: Array.from(ch.ikErr),
            gripWeights:{right:ch.P[C.IKR],left:ch.P[C.IKL],leftTarget:ch.P[C.LTW]},
            heldVisible: ch.bomb.group.visible, leftPistolVisible: !!ch.weapon.left?.pivot.visible,
            lastShot: ch.lastShot, lastRelease: ch.lastRelease, aim: ch.wAim, rcP: ch.rcP, rcZ: ch.rcZ, time: ch.t, projectileCount: projectiles.list.length,
            runnerStreaming: !!actor.weaponRunner.streaming });
          globalThis.motionProbeProgress={scenario:scenario.name,frame,casesFinished:data.length,flow,weapon,ik:Array.from(ch.ikErr),nativeRecoil:ch.rcP};
          if(frame%60===0||frame===frames-1){
            console.info('[motion-detail-progress] '+JSON.stringify(globalThis.motionProbeProgress));
            // Yield the browser event loop without changing the fixed native
            // simulation step. Preserve the last completed frame on a crash.
            await new Promise(resolve=>setTimeout(resolve,0));
          }
          if([21,29,30,45,75,95,110,111,145,160,165,200,239,310,360,419].includes(frame))renderMetrics.push(capture(scenario,frame,ch,actor));
        }
        data.push({name:scenario.name,scenario,frames,fireInterval:actor.weapon.fireInterval,firstShotDelay:actor.weapon.firstShotDelay||0,samples,releaseFrames,events,renderMetrics});
      } finally {
        for(const [name,native] of methods)projectiles[name]=native; scene.remove(ch.root); ch.dispose();
        const disposed = flowMotionSnapshot(ch);
        if(data.at(-1)?.name===scenario.name)data.at(-1).disposed=disposed;
        if (!disposed.disposed || disposed.resources !== 0) throw Error('Flow resources survived Character disposal');
      }
    }
    return {contentHash,cases:data.length,data,images,pixelControls:{defaultDither,dither:glControl.isEnabled(glControl.DITHER),samples:pixelTarget.samples,target:'explicit-srgb-rgba8'},
      fixture:{source:'production install once; actual Actor/Runner/Projectiles/full native rig',driver:'WeaponRunner.update + Actor._finishFrame only; no Actor.update or Projectiles.update',terrain:'flat diagnostic plane; raycast hit=false',flow:'active/remaining assigned manually; gameplay activation, extension and duration not measured',air:'height=.8 and vertical velocity=0 throughout; no jump/landing physics',render:'60Hz single-sample software WebGL; independent same-frame visible/hidden pairs with native clock/gameplay transactions',parity:'calibrated INKWAVE regression; Nintendo curves unknown; not Switch/iOS or original image parity'}};
    }finally{
      projectiles.clear();
      const geometries=new Set(),materials=new Set();scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const m of (Array.isArray(node.material)?node.material:[node.material]))if(m)materials.add(m);});
      for(const key of ['bombGeo','bombCapGeo','ribbonGeo','arcGeo','cloudGeo'])if(projectiles[key])geometries.add(projectiles[key]);
      for(const m of projectiles.bombMatCache.values())materials.add(m);
      for(const g of geometries)g.dispose();for(const m of materials)m.dispose();pixelTarget.dispose();renderer.dispose();renderer.domElement.remove();
    }
  }, { prefix, contentHash: manifest.contentHash });
  result.summary=validateDetailResult(result);validateDetailReceipts(loaded);
  if(errors.length)throw Error('Detail animation/shader errors: '+errors.join('; '));
  for(const entry of result.images)fs.writeFileSync(path.join(output,entry.name+'.png'),Buffer.from(entry.image.split(',')[1],'base64'));delete result.images;
}catch(error){failure=error;try{if(page)result={...(result||{}),progress:await page.evaluate(()=>globalThis.motionProbeProgress||null)};}catch{};try{await page?.screenshot({path:path.join(output,'motion-detail-failed.png'),timeout:10000});}catch{}}
finally{for(const cleanup of [()=>browser?.close(),()=>server?.listening?new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())):null])try{await cleanup();}catch(error){failure ||= error;}}
if(failure){if(result?.data){const diagnostic={...result,status:'failed',message:String(failure.message||failure).slice(0,2500)};delete diagnostic.images;fs.writeFileSync(path.join(output,'motion-detail-failed-native.json.writing'),JSON.stringify(diagnostic,null,2)+'\n');fs.renameSync(path.join(output,'motion-detail-failed-native.json.writing'),path.join(output,'motion-detail-failed-native.json'));}publish({status:'failed',contentHash:manifest?.contentHash||null,build:manifest?.build||null,message:String(failure.message||failure).slice(0,2500),errors,loaded:[...new Set(loaded)].slice(0,200),progress:result?.progress||lastProgress||null,casesFinished:result?.data?.length||lastProgress?.casesFinished||0});console.error(JSON.stringify({status:'failed',message:String(failure.message||failure).slice(0,1200),evidence:path.join(output,'motion-detail-result.json')}));process.exitCode=1;return;}
Object.assign(result,{errors,loaded:[...new Set(loaded)],build:manifest.build,status:'passed'});publish(result);
console.log(JSON.stringify({status:result.status,contentHash:result.contentHash,cases:result.cases,verifiedModules:result.loaded.length,summary:result.summary}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
