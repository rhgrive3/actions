// Controlled emitted-app diagnostics; CPU projection and browser animation are
// reported separately from trusted live input and retail comparison.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { enterRangeFromMenu } from './lib/inkwave-range-menu-entry.mjs';

const site = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, { recursive: true });
const probe=fs.readFileSync(new URL(import.meta.url));fs.writeFileSync(path.join(out,'probe.mjs.txt'),probe);
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req,res) => {
  const file = path.resolve(site, '.' + new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const receipt = { probeScriptSha256:crypto.createHash('sha256').update(probe).digest('hex'),build: JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash, errors:[], conditions:'Controlled app diagnostic: range travel, weapon and camera set through existing app APIs. No claim of natural input, hardware GPU or Switch parity.', scenarios:[] };
let browser, page;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  page = await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror', e => receipt.errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en',shadows:false,bloom:false,minimap:false})); document.addEventListener('pointerlockerror',()=>{window.__projectionPointerErrors=(window.__projectionPointerErrors||0)+1;}); });
  receipt.entry = await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{onProgress:r=>console.log(r.route.join('/'))});
  // Range state becomes playing before shader preparation has released the
  // native full-screen fade. Wait for the actual visible app, not a timed guess.
  await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('fade')).opacity)<.001,null,{timeout:240000});
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const G=window.__G,g=window.__inkwave; g.debug.freeze(); g.debug.freezeBots(); G.match.range.travel('lane');
    await G.local.character.sourceMotion.ready;
    const {on}=await import(new URL('src/core/ctx.js',document.baseURI));
    window.__projectionFires=[]; on('weapon:fire',e=>{if(e.actor===G.local)window.__projectionFires.push({weapon:e.weapon,hand:e.hand,time:performance.now()});});
    window.__projectionRead=()=>{
      const a=G.local,h=g.hud,cam=G.rig.gameCam, vector=p=>p?.toArray?.()||p;
      const glyph=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,transform:s.transform,translate:s.translate,scale:s.scale,opacity:s.opacity,visibility:s.visibility,attribute:el.getAttribute('transform'),parentAttribute:el.parentElement.getAttribute('transform'),animations:el.getAnimations().map(x=>({time:x.currentTime,state:x.playState,keyframes:x.effect.getKeyframes()}))};};
      const pairs=a.weapon.kind==='dualies'?G.projectiles.s3DualiesGuides(a,a.weapon,cam):null;
      const impact=a.weapon.kind==='shooter'?G.projectiles.s3ShooterImpact(a,a.weapon):null,marker=a.weapon.kind==='shooter'?G.projectiles.muzzleBlockFeedback(a):null;
      return {position:vector(a.pos),aim:vector(a.aimPoint),direction:vector(a.aimDir),camera:vector(cam.position),pitch:g.rig.pitch,retTranslate:h.ret.style.translate,guide:a.weapon.kind==='shooter'?G.match.controller.shotGuide:null,impact:impact?{point:vector(impact.point),frame:impact.guideFrame}:null,marker:marker?vector(marker.point):null,pairs:pairs?.map(p=>vector(p)),turret:!!a.weaponRunner.s3Turret,dodge:!!a.weaponRunner.dodge,glyphs:[...h.ret.querySelectorAll('.iw-ret__dot,.iw-ret__twin,.iw-ret__merged,.iw-ret__tick')].map(el=>({class:el.getAttribute('class'),...glyph(el)})),twinHandles:h._twin?.map(el=>h.ret.contains(el)),guideHandles:h._twinGuide?.map(el=>h.ret.contains(el)),fires:window.__projectionFires.length};
    };
  });
  for (const weapon of ['shooter','dualies']) {
    for (const [name,pitch] of [['horizontal',0],['floor',-.8]]) {
      const row = await page.evaluate(async ({weapon,name,pitch}) => {
        const G=window.__G,g=window.__inkwave,a=G.local; G.match.range.setWeapon(weapon); G.match.range.travel('lane');
        a.invuln=0;g.rig.pitch=pitch;g.rig.yaw=0;
        g._skipRender=true;try{for(let n=0;n<90;n++)g._frame(1/60);}finally{g._skipRender=false;}g._frame(0);
        return {weapon,name,...window.__projectionRead()};
      },{weapon,name,pitch});
      await page.screenshot({path:path.join(out,weapon+'-'+name+'.png')}); receipt.scenarios.push(row);
    }
  }
  // Exercise the real emitted fire listener and browser's independent WAAPI
  // clock while the game remains frozen. This isolates the transform conflict.
  receipt.kick = await page.evaluate(async () => {
    const g=window.__inkwave,G=window.__G,a=G.local,h=g.hud;
    g.rig.pitch=0;g._skipRender=true;try{for(let n=0;n<60;n++)g._frame(1/60);}finally{g._skipRender=false;}g._frame(0);
    const {emit}=await import(new URL('src/core/ctx.js',document.baseURI));
    const rows=[{at:0,before:true,...window.__projectionRead()}],start=performance.now();
    // Isolate DOM animation from expensive software-GPU rendering. Time runs
    // naturally; this is component evidence, not a live-fire flight capture.
    g._skipRender=true;
    try {
      emit('weapon:fire',{actor:a,weapon:a.weaponId,hand:0,muzzle:a.pos.clone(),dir:a.aimDir.clone()});
      while(performance.now()-start<220){ await new Promise(requestAnimationFrame); rows.push({at:performance.now()-start,...window.__projectionRead()}); }
    } finally {g._skipRender=false;}
    return rows;
  });
  await page.screenshot({path:path.join(out,'dualies-after-kick.png')});
  receipt.lifecycle = await page.evaluate(async () => {
    const g=window.__inkwave,G=window.__G,a=G.local,h=g.hud;
    const {emit}=await import(new URL('src/core/ctx.js',document.baseURI));
    const before=G.projectiles.list.length;
    for(let n=0;n<100;n++)emit('weapon:fire',{actor:a,weapon:a.weaponId,hand:n%2,muzzle:a.pos.clone(),dir:a.aimDir.clone()});
    const bounded=window.__projectionRead();h.setVisible(false);
    const hidden=window.__projectionRead();h.setVisible(true);
    G.match.range.setWeapon('shooter');g._frame(0);G.match.range.setWeapon('dualies');g._frame(0);
    const rebuilt=window.__projectionRead();
    g.debug.fire(true);g._frame(1/60);const admitted=a.weaponRunner.tryDodge(a.aimDir.clone().set(1,0,0));
    g._skipRender=true;try{for(let n=0;n<90;n++)g._frame(1/60);}finally{g._skipRender=false;}g._frame(0);
    const turret=window.__projectionRead();g.debug.fire(false);g._frame(1/60);const released=window.__projectionRead();
    return {before,bounded,hidden,rebuilt,admitted,turret,released};
  });
  // Separate trusted live-input attempt; no pointer-lock workaround is used.
  await page.evaluate(()=>{const g=window.__inkwave;g.debug.unfreeze();window.__projectionFires.length=0;});
  await page.mouse.move(640,360);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
  receipt.live = await page.evaluate(()=>({fires:window.__projectionFires,pointerlock:!!document.pointerLockElement,pointerErrors:window.__projectionPointerErrors||0,weapon:window.__G.local.weaponId}));
  if(process.argv.includes('--assert')){
    for(const row of receipt.scenarios.filter(r=>r.name==='floor')) {
      const points=row.weapon==='shooter'?[row.guide]:row.pairs;
      assert(points?.every(p=>(p.y??p[1])>=-1e-8),'floor guides must not project a subterranean trajectory');
    }
    assert.equal(receipt.scenarios.find(r=>r.weapon==='shooter'&&r.name==='horizontal').marker,null,'clear lane has no late falling-ink obstruction cue');
    const before=receipt.kick[0].glyphs.filter(g=>g.class.includes('twin'));
    const active=receipt.kick.filter(r=>r.glyphs.some(g=>g.class.includes('twin')&&g.animations.length));
    assert(active.length,'browser must observe an actual active kick');
    for(const row of active)row.glyphs.filter(g=>g.class.includes('twin')).forEach((g,i)=>assert(Math.hypot(g.x-before[i].x,g.y-before[i].y)<.2,'kick must preserve each projected centre'));
    assert(receipt.lifecycle.bounded.glyphs.filter(g=>g.class.includes('twin')).every(g=>g.animations.length<=1),'each hand owns at most one kick');
    assert(receipt.lifecycle.hidden.glyphs.every(g=>!g.animations.length),'hidden HUD cancels shot animations');
    assert(receipt.lifecycle.rebuilt.guideHandles?.every(Boolean),'rebuilt guide handles belong to the live DOM');
    assert(receipt.lifecycle.rebuilt.glyphs.filter(g=>g.class.includes('twin')).every(g=>g.parentAttribute),'unchanged aim is applied to rebuilt DOM');
    assert(receipt.lifecycle.admitted&&receipt.lifecycle.turret.turret,'native accepted roll reaches turret state');
    assert(!receipt.lifecycle.released.turret,'native release ends turret state');
    const visible=row=>row.glyphs.filter(g=>/twin|merged/.test(g.class)&&g.visibility!=='hidden'&&Number(g.opacity)>0);
    assert.equal(visible(receipt.lifecycle.turret).length,1);assert.equal(visible(receipt.lifecycle.released).length,2);
    assert.deepEqual(receipt.errors,[]);
  }
  receipt.status='recorded';
} catch(error) { receipt.status='failed';receipt.failure=String(error);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error; }
finally { fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve)); }
