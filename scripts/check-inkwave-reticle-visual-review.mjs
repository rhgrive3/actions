// Actual production game/HUD screenshots, not an SVG fixture or retail parity gate.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export const BASELINE_SHA = '7f863ea2d65671abd1453fdae1b61de00f1d10e2';
export const VIEWPORTS = Object.freeze([
  {name:'desktop',width:1280,height:720,deviceScaleFactor:1,touch:false},
  {name:'mobile',width:844,height:390,deviceScaleFactor:3,touch:true},
]);
export const CASES = Object.freeze([
  {name:'roller',id:'roller',profile:'roller-reference-720p',kind:'roller'},
  {name:'brella',id:'s3-shelter-normal',profile:'brella-reference-720p',kind:'shooter'},
  {name:'wiper',id:'s3-saber-lite',profile:'wiper-reference-720p',kind:'charger',charge:true},
  {name:'stamper',id:'s3-saber-normal',profile:'stamper-reference-720p',kind:'charger',charge:true},
  // No geometry profile supports this actual weapon: it MUST stay native.
  {name:'native-charger-fallback',id:'charger',profile:null,kind:'charger',charge:true},
  {name:'tri-stringer-fallback',id:'s3-stringer-normal',profile:null,kind:'charger',idleOnly:true},
  {name:'octobrush-fallback',id:'s3-brush-normal',profile:null,kind:'roller',idleOnly:true},
]);
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function reticleCrop(rect, viewport) {
  const width = Math.min(240,viewport.width),height = Math.min(200,viewport.height);
  return {x:Math.max(0,Math.min(viewport.width-width,Math.round(rect.x+rect.width/2-width/2))),
    y:Math.max(0,Math.min(viewport.height-height,Math.round(rect.y+rect.height/2-height/2))),width,height};
}
export function assertSnapshot(row, scenario, phase, before=false) {
  assert.equal(row.weaponId,scenario.id,'actual actor weapon identity');
  assert.equal(row.hudWeapon,scenario.id,'production HUD must receive actual weapon ID');
  assert.equal(row.kind,scenario.kind,'native update kind remains authoritative');
  assert(row.retConnected,'actual reticle must be connected');
  assert(row.hudVisible,'native HUD must be active');
  const nativeIdle=scenario.kind==='charger'&&(before||!scenario.profile)&&['idle','release','switch-back'].includes(phase);
  assert.equal(row.visible,!nativeIdle,'retain native idle visibility gate; supported Splatana profile is visible');
  assert(row.rect.width>=0 && row.rect.height>=0,'finite reticle bounds');
  if(!before)assert.equal(row.installed,true,'production HUD installer is active');
  assert.deepEqual(row.profiles,before||!scenario.profile?[]:[scenario.profile]);
  if(!before&&scenario.profile)assert(row.profileArtwork.every(a=>a.display!=='none'&&a.bounds.width>0&&a.bounds.height>0),'installed SVG must actually participate in browser layout');
  if(scenario.kind==='charger') {
    assert(row.chargeHandleConnected && row.chargeHandleInReticle,'native charge handle stays attached');
    assert(Number.isFinite(row.chargeOffset),'native charge offset remains writable');
    if(!before && scenario.profile)assert(row.chargeArtworkHidden,'splatana hides native artwork without detaching handle');
    else assert(!row.chargeArtworkHidden,'unsupported native charger artwork stays visible');
  }
  if(phase==='charging')assert(row.charging && row.charge>0 && row.charge<1,'real partially charged runner');
  if(phase==='full')assert(row.charging && row.charge>=1,'real fully charged runner');
  if(phase==='idle'||phase==='release'||phase==='switch-back')assert(!row.charging && row.charge===0,'real release/reset');
  if(!before && scenario.name==='brella')assert.equal(row.decoratedSpreadTicks,4,'all four native spread ticks retain decorations');
  if(!before && scenario.profile && scenario.kind==='charger')assert(!row.classes.includes('iw-ret--charger'),'no inherited charger visual selector');
}

// Freeze the scheduler only; advance the actual game once per native RAF. Never
// request a bulk debug step or run a synchronous 240-frame GPU/render burst.
export async function pace(page, frames=1) {
  assert(Number.isInteger(frames) && frames>0 && frames<=240);
  await page.evaluate(async frames=>{
    const g=window.__inkwave;
    if(!g.frozen)throw Error('Paced capture requires the native scheduler frozen');
    for(let i=0;i<frames;i++) {
      await new Promise(resolve=>requestAnimationFrame(resolve));
      g._frame(1/60);
    }
  },frames);
}
async function until(page,predicate,label,maxFrames=240) {
  for(let n=0;n<maxFrames;n++) {
    await pace(page);
    if(await page.evaluate(predicate))return n+1;
  }
  throw Error('Actual game state deadline: '+label);
}
async function readSnapshot(page) {
  return page.evaluate(()=>{
    const g=window.__inkwave,a=window.__G.local,h=g.hud,r=h.ret,runner=a.weaponRunner;
    const charge=h._chargeEl,rect=r.getBoundingClientRect();
    const hidden=el=>{for(let p=el;p&&p!==r.parentNode;p=p.parentElement)if(getComputedStyle(p).display==='none')return true;return false;};
    const style=getComputedStyle(r),guide=g._hudTransport?.crosshair?.guide;
    return {weaponId:a.weaponId,baseWeaponId:a.weapon.catalogRecord?.id||a.weapon.id||a.weaponId,
      family:a.weapon.behaviorKind||a.weapon.catalogRecord?.family||a.weapon.kind,hudWeapon:h._L.weapon,kind:h._L.kind,
      installed:!!h[Symbol.for('inkwave.weaponReticlePresentation.installed')],
      retConnected:r.isConnected,visible:style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0,
      visibility:style.visibility,hudVisible:!h.el.classList.contains('is-hidden'),
      classes:[...r.classList],rect:rect.toJSON(),charge:runner.charge||0,charging:runner.charging===true,
      profiles:[...r.querySelectorAll('[data-iw-reticle-presentation-profile]')].map(n=>n.dataset.iwReticlePresentationProfile),
      profileArtwork:[...r.querySelectorAll('[data-iw-reticle-presentation-profile]')].map(n=>({display:getComputedStyle(n).display,bounds:n.getBoundingClientRect().toJSON()})),
      decoratedSpreadTicks:r.querySelectorAll('.iw-ret__tick > .iw-reticle-presentation-spread-tick').length,
      chargeHandleConnected:!!charge?.isConnected,chargeHandleInReticle:!!charge&&r.contains(charge),
      chargeOffset:charge?Number.parseFloat(charge.style.strokeDashoffset):null,chargeArtworkHidden:charge?hidden(charge):null,
      spread:h._L.spread,spreadVariable:r.style.getPropertyValue('--sp'),
      projectedShotGuide:guide?{x:guide.x,y:guide.y}:null,worldShotGuide:window.__G.match.controller?.shotGuide?.toArray?.()||null,
      runner:{charge:runner.charge||0,chargeT:runner.chargeT||0,charging:runner.charging===true,bowTilt:runner.catalogState?.bowTilt||0},
      settings:{quality:g.settings.quality,shadows:g.settings.shadows,bloom:g.settings.bloom,minimap:g.settings.minimap,frameRate:g.settings.frameRate},
      canvas:{width:window.__G.renderer.domElement.width,height:window.__G.renderer.domElement.height,pixelRatio:window.__G.renderer.getPixelRatio()},
      canopy:runner.catalogState?.canopy?{open:!!runner.catalogState.canopy.open,preparing:!!runner.catalogState.canopy.preparing}:null,
      saberSwingKey:runner.catalogState?.saberSwing?.key||null,
      css:{scale:style.scale,transform:style.transform,translate:style.translate,rotate:style.rotate,zoom:style.zoom},
      position:a.pos.toArray(),camera:window.__G.camera.position.toArray(),fov:window.__G.camera.fov,aspect:window.__G.camera.aspect,yaw:g.rig.yaw,pitch:g.rig.pitch,
      renderer:window.__G.renderer.getContext().getParameter(window.__G.renderer.getContext().RENDERER),
      dpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},
    };
  });
}
export async function main(argv=process.argv.slice(2)) {
  const [siteArg,outArg,...flags]=argv;
  assert(siteArg&&outArg,'Usage: node scripts/check-inkwave-reticle-visual-review.mjs SITE OUTPUT [--before]');
  const before=flags.includes('--before'),site=fs.realpathSync(siteArg),out=path.resolve(outArg);
  const sourceSha=process.env.SOURCE_SHA;
  assert(/^[a-f0-9]{40}$/.test(sourceSha||''),'SOURCE_SHA must pin the checked-out commit');
  if(before)assert.equal(sourceSha,BASELINE_SHA);
  fs.mkdirSync(out,{recursive:true});
  const script=fs.readFileSync(new URL(import.meta.url));
  fs.writeFileSync(path.join(out,'probe.mjs.txt'),script);
  const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
  assert(/^[a-f0-9]{64}$/.test(build.contentHash),'production build identity required');
  // Inspect actual emitted sources: production output, with its final CSS and
  // all adapters, is served unchanged. No setContent/HTML/SVG fixture exists.
  for(const relative of ['src/ui/hud.js','styles/hud.css']) {
    const bytes=fs.readFileSync(path.join(site,relative));
    assert.equal(sha256(bytes),build.artifacts[relative],'emitted identity: '+relative);
  }
  const receipt={schema:1,before,sourceSha,contentHash:build.contentHash,inputHash:build.inputHash,
    probeSha256:sha256(script),build:build.build,viewports:VIEWPORTS,scenarios:[],errors:[],status:'running',
    scope:'Actual production range/HUD DOM and browser screenshots; software GPU only. Reference-guided approximation, NOT Nintendo pixel/behavior parity or full CI.',
    comparison:'Pair same viewport/weapon/phase crop against immutable main; retail reference review is separate, not certified by this gate.'};
  const write=()=>fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  fs.copyFileSync(path.join(site,'inkwave-build.json'),path.join(out,'inkwave-build.json'));
  write();
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.wasm':'application/wasm'};
  const server=http.createServer((req,res)=>{
    let file;
    try {file=path.resolve(site,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/\/$/,'/index.html'));}
    catch {res.writeHead(400);res.end();return;}
    if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser,page;
  try {
    const {chromium}=await import('playwright');
    const {enterRangeFromMenu}=await import('./lib/inkwave-range-menu-entry.mjs');
    browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    for(const view of VIEWPORTS) {
      const context=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:view.deviceScaleFactor,hasTouch:view.touch,isMobile:view.touch});
      page=await context.newPage();
      page.on('pageerror',error=>{receipt.errors.push({viewport:view.name,error:String(error)});write();});
      page.on('console',message=>fs.appendFileSync(path.join(out,'browser.log'),`[${view.name}] ${message.type()}: ${message.text()}\n`));
      await page.addInitScript(()=>{
        let seed=0x52455449;
        Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
        localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'en',shadows:false,bloom:false,minimap:false}));
      });
      const entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{touch:view.touch,timeout:180000});
      await page.evaluate(()=>{
        const g=window.__inkwave,G=window.__G,a=G.local;
        g.debug.freeze();g.debug.freezeBots();G.match.range.movingTargets=false;g.debug.fire(false);
        a.pos.set(-14.6,.04,0);a.vel.set(0,0,0);a.yaw=a.aimYaw=0;g.rig.yaw=0;g.rig.pitch=-.12;
      });
      for(const scenario of CASES) {
        console.log(view.name,scenario.id,'start');
        await page.evaluate(async id=>{
          const g=window.__inkwave;g.debug.fire(false);window.__G.match.range.setWeapon(id);
          await window.__G.local.character.sourceMotion.ready;
        },scenario.id);
        await pace(page,4);
        const capture=async phase=>{
          console.log(before?'baseline':'candidate',view.name,scenario.id,phase,'capture');
          const row=await readSnapshot(page);
          console.log(JSON.stringify({head:sourceSha,before,viewport:view.name,actualWeaponId:row.weaponId,phase,profile:row.profiles,viewportCss:row.viewport,dpr:row.dpr,settings:row.settings}));
          const basename=`${view.name}-${scenario.name}-${phase}`;
          const crop=reticleCrop(row.rect,view);
          row.viewportName=view.name;row.phase=phase;row.entry=entry;row.files={frame:basename+'-frame.png',crop:basename+'-reticle.png'};row.crop=crop;
          receipt.scenarios.push(row);write();
          await page.screenshot({path:path.join(out,row.files.frame),timeout:20000});
          await page.screenshot({path:path.join(out,row.files.crop),clip:crop,timeout:20000});
          row.imageSha256={frame:sha256(fs.readFileSync(path.join(out,row.files.frame))),crop:sha256(fs.readFileSync(path.join(out,row.files.crop)))};
          assertSnapshot(row,scenario,phase,before);write();
        };
        await capture('idle');
        if(scenario.idleOnly)continue;
        await page.evaluate(()=>window.__inkwave.debug.fire(true));
        if(scenario.charge) {
          await until(page,()=>{const r=window.__G.local.weaponRunner;return r.charging&&r.charge>=.35&&r.charge<1;},scenario.id+' partial charge after native display delay');
          await capture('charging');
          await until(page,()=>{const r=window.__G.local.weaponRunner;return r.charging&&r.charge>=1;},scenario.id+' full charge');
          await capture('full');
        } else {
          await pace(page,8);await capture('firing');
          if(scenario.name==='brella') {
            await until(page,()=>window.__G.local.weaponRunner.catalogState?.canopy?.open===true,'real Brella canopy opens');
            await capture('canopy-open');
          }
        }
        await page.evaluate(()=>window.__inkwave.debug.fire(false));
        await until(page,()=>{const r=window.__G.local.weaponRunner;return !r.charging&&(r.charge||0)===0;},scenario.id+' release');
        await capture('release');
      }
      // Return from unsupported native charger to Wiper, then native charger:
      // stale DOM/profile restoration is exercised via the real selection API.
      for(const name of ['wiper','native-charger-fallback']) {
        const scenario=CASES.find(row=>row.name===name);
        await page.evaluate(id=>window.__G.match.range.setWeapon(id),scenario.id);await pace(page,2);
        const row=await readSnapshot(page);assertSnapshot(row,scenario,'switch-back',before);
        receipt.scenarios.push({...row,viewportName:view.name,phase:'switch-back'});write();
      }
      assert.deepEqual(receipt.errors,[],'uncaught browser errors');
      await context.close();page=null;
    }
    receipt.status=before?'baseline-recorded':'passed';
  } catch(error) {
    receipt.status='failed';receipt.failure=String(error.stack||error);
    if(page){await page.screenshot({path:path.join(out,'failure.png'),timeout:10000}).catch(()=>{});receipt.diagnostic=await page.evaluate(()=>({title:document.title,text:document.body.innerText.slice(0,2000),menu:window.__inkwave?.menus?.current})).catch(String);}
    throw error;
  } finally {write();await browser?.close();await new Promise(resolve=>server.close(resolve));}
  return receipt;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
