#!/usr/bin/env node
// Controlled DOM component QA of the emitted HUD. Charge frames are fixture
// inputs; this is neither ordinary gameplay input nor Nintendo visual parity.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [rel,h] of Object.entries(build.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,rel))),h,rel);
const importMap=fs.readFileSync(path.join(site,'index.html'),'utf8').match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
const html=`<!doctype html><meta charset="utf-8">${importMap}<link rel="stylesheet" href="/styles/hud.css">
<link rel="stylesheet" href="/patches/splatoon3/ui.css"><style>
body{margin:0;padding:28px;background:#243b46;color:#fff;font:15px system-ui;--self-light:#62f5cb;--u:10px}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 22px;color:#bed2db}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
article{height:210px;position:relative;background:#162b35;border:1px solid #46626e;border-radius:9px}h2{font-size:13px;padding:12px;margin:0}small{position:absolute;bottom:12px;left:12px;color:#bed2db}
article .iw-xh{left:50%;top:56%;display:block!important;opacity:1!important}
</style><h1>Stringer charge stages · controlled HUD component</h1>
<p>Native circle geometry; source-timed first and second laps. This is not a live-input or original-game comparison.</p><div class="grid"></div>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((q,r)=>{
  const url=new URL(q.url,'http://localhost');
  if(url.pathname==='/__bow_hud.html'){r.setHeader('content-type','text/html');r.end(html);return;}
  const file=path.resolve(site,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){r.writeHead(404);r.end();return;}
  r.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(r);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const receipt={kind:'emitted HUD controlled component; not live-input or retail parity',contentHash:build.contentHash,inputHash:build.inputHash,errors:[],rows:[]};
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:820},reducedMotion:'reduce'});page.on('pageerror',e=>receipt.errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/__bow_hud.html');
  receipt.rows=await page.evaluate(async()=>{
    const {HUD}=await import('/src/ui/hud.js'),api=await import('/src/config.js');
    const {install}=await import('/patches/splatoon3/runtime/install.mjs');
    const {G}=await import('/src/core/ctx.js');
    install(await (await fetch('/patches/splatoon3/profile.json')).json());
    const records=[],grid=document.querySelector('.grid'),el=html=>{const d=document.createElement('div');d.innerHTML=html||'';return d;};
    for(const id of ['s3-stringer-normal','s3-stringer-short','s3-stringer-explosion']){
      const w=api.WEAPONS[id],p=w.catalogRecord.parameters.spl__WeaponStringerParam.ChargeParam;
      const first=p.ChargeFrameMidCharge,full=p.ChargeFrameFullCharge;
      for(const [label,frame] of [['First half',first/2],['First ready',first],['Second half',(first+full)/2],['Full',full],['Released',0]]){
        const actor={alive:true,form:'kid',invuln:0,weapon:w,weaponRunner:{charge:frame/full,chargeT:frame/full,charging:frame>0},ink:100};
        const h=Object.assign(Object.create(HUD.prototype),{_L:{},_bloom:0,_kick:0,_visible:true,
          ret:el(),xh:el(),spIcon:el(),scopeMask:el(),shield:el(),subChip:el('<i></i><span><i></i></span><b></b>'),tank:el(),_local:()=>actor,_snd(){},_restart(){}});
        const tile=document.createElement('article'),title=document.createElement('h2'),caption=document.createElement('small');
        title.textContent=w.name+' · '+label;caption.textContent=frame+'F / '+full+'F';
        h.xh.className='iw-xh';h.xh.append(h.ret);tile.append(title,h.xh,caption);grid.append(tile);
        G.match={local:actor};const before=JSON.stringify(actor);
        h._updCrosshair({weapon:id,charge:frame/full,crosshair:{}},1/60);
        const circle=h._chargeEl,track=h.ret.querySelector('.iw-ret__track'),svg=h.ret.querySelector('.iw-ret__svg');
        records.push({id,label,frame,first,full,stage:h.ret.dataset.chargeStage,offset:+circle.style.strokeDashoffset,
          circumference:h._chargeC,stroke:circle.style.stroke,trackOpacity:track.style.opacity,
          computedTrackStroke:getComputedStyle(track).stroke,computedTrackOpacity:getComputedStyle(track).opacity,
          circleRadius:circle.getAttribute('r'),trackRadius:track.getAttribute('r'),circleCount:svg.querySelectorAll('circle').length,
          addedSecondCircle:!!svg.querySelector('.iw-ret__stringer-second'),scopeOpacity:h.scopeMask.style.opacity,
          actorUnchanged:JSON.stringify(actor)===before});
      }
    }
    return records;
  });
  for(const r of receipt.rows){
    const progress=r.label==='First half'||r.label==='Second half'?.5:r.label==='Full'?1:0;
    assert.ok(Math.abs(r.offset-r.circumference*(1-progress))<.011,r.id+' '+r.label);
    assert.equal(r.stage,r.label==='Full'?'full':r.label==='First ready'||r.label==='Second half'?'second':'first');
    assert.equal(r.circleRadius,'25');assert.equal(r.trackRadius,'25');assert.equal(r.addedSecondCircle,false);
    assert.equal(r.actorUnchanged,true);assert.equal(+r.scopeOpacity,0);
    assert.equal(r.trackOpacity,'',r.id+' native track opacity remains CSS-owned');
    assert.equal(r.stroke,'',r.id+' native arc stroke remains CSS-owned');
    if(r.label!=='Full'){
      const baseline=receipt.rows.find(x=>x.id===r.id&&x.label==='First half');
      assert.equal(r.computedTrackStroke,baseline.computedTrackStroke,r.id+' no stage-owned persistent track color');
      assert.equal(r.computedTrackOpacity,baseline.computedTrackOpacity,r.id+' unchanged native unfilled track opacity');
    }
  }
  await page.screenshot({path:path.join(out,'stages.png'),fullPage:true});
  assert.deepEqual(receipt.errors,[]);receipt.passed=true;console.log(JSON.stringify({passed:true,cases:receipt.rows.length,contentHash:receipt.contentHash,out}));
}finally{
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(receipt,null,2)+'\n');
  await browser?.close();await new Promise(r=>server.close(r));
}
