#!/usr/bin/env node
// Real emitted AudioEngine/AudioContext/Worker check. This measures the output
// graph after a trusted unlock gesture; it does not certify speaker perception.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
const [siteArg,outArg]=process.argv.slice(2);
assert.ok(siteArg&&outArg,'usage: script <built-site> <evidence.json>');
const site=path.resolve(siteArg),out=path.resolve(outArg);
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
for(const [rel,expected] of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,rel))),expected,rel);
const index=fs.readFileSync(path.join(site,'index.html'),'utf8');
const importMap=index.match(/<script type="importmap">([\s\S]*?)<\/script>/)[0];
const harness=`<!doctype html><title>Emitted charge audio</title>${importMap}<button id="unlock">Enable audio</button>
<script type="module">import {audio} from '/src/audio/audio.js';window.audio=audio;
document.querySelector('#unlock').onclick=e=>{window.unlockTrusted=e.isTrusted;audio.init();};</script>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.mp3':'audio/mpeg','.html':'text/html'};
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__charge_audio.html'){res.setHeader('content-type','text/html');res.end(harness);return;}
  const file=path.resolve(site,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const receipt={contentHash:manifest.contentHash,inputHash:manifest.inputHash,errors:[],rows:[],kind:'emitted-audio-component'};
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();page.on('pageerror',e=>receipt.errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/__charge_audio.html');
  await page.waitForFunction(()=>!!window.audio);await page.locator('#unlock').click();
  receipt.unlock=await page.evaluate(()=>({trusted:window.unlockTrusted,state:audio.ctx.state}));
  assert.equal(receipt.unlock.trusted,true);assert.equal(receipt.unlock.state,'running');
  for(const [id,time] of [['charger',1],['s3-charger-quick',45/60],['s3-charger-normalscope',1],['s3-charger-long',92/60],['s3-charger-longscope',92/60],['s3-charger-light',20/60],['s3-charger-keeper',71/60],['s3-charger-pencil',72/60]]){
    const row=await page.evaluate(async({id,time})=>{
      const {chargerRecordedStatus,prewarmChargerRise}=await import('/patches/splatoon3/runtime/audio/charger-charge-rise.mjs');
      const result=await audio.requireRecordedMainShot(id);
      await prewarmChargerRise(audio,{weaponId:id,chargeTime:time});
      // Let the actual module Worker finish. Original at 1x remains a valid
      // audible fallback if this browser cannot run a Worker.
      await new Promise(r=>setTimeout(r,150));
      const captures=[],create=audio.ctx.createBufferSource.bind(audio.ctx);
      audio.ctx.createBufferSource=()=>{const s=create(),start=s.start.bind(s);s.start=(...args)=>{captures.push({rate:s.playbackRate.value,loop:s.loop,frames:s.buffer?.length,duration:s.buffer?.duration,args});return start(...args);};return s;};
      const analyser=audio.ctx.createAnalyser();analyser.fftSize=2048;audio.master.connect(analyser);
      const h=audio.playChargerChargeRise({weaponId:id,chargeTime:time,volume:.55});
      const pcm=new Float32Array(analyser.fftSize);let peak=0,rmsMax=0;
      for(let i=0;i<12;i++){
        await new Promise(r=>setTimeout(r,20));analyser.getFloatTimeDomainData(pcm);
        let power=0;for(const n of pcm){peak=Math.max(peak,Math.abs(n));power+=n*n;}
        rmsMax=Math.max(rmsMax,Math.sqrt(power/pcm.length));
      }
      h?.stop(.02);audio.master.disconnect(analyser);audio.ctx.createBufferSource=create;
      await new Promise(r=>setTimeout(r,60));
      return {id,chargeTime:time,admission:result,context:audio.ctx.state,playing:!!h,status:chargerRecordedStatus(audio.ctx),captures,peak,rmsMax};
    },{id,time});
    receipt.rows.push(row);console.log(JSON.stringify({id,peak:row.peak,rms:row.rmsMax,status:row.status}));
    assert.equal(row.context,'running',id);assert.equal(row.status.ready,true,id);assert.ok(row.playing,id);
    assert.ok(row.peak>1e-4&&row.rmsMax>1e-5,id+' non-silent output');
    assert.equal(row.captures.length,1,id+' one real source');assert.equal(row.captures[0].rate,1,id+' pitch unchanged');assert.equal(row.captures[0].loop,false);
  }
  const missing=await browser.newPage();
  await missing.route('**/assets/audio/charger-first-splatune2-reference.mp3',r=>r.fulfill({status:404,body:'fixture: missing charge asset'}));
  await missing.goto('http://127.0.0.1:'+server.address().port+'/__charge_audio.html');
  await missing.waitForFunction(()=>!!window.audio);await missing.locator('#unlock').click();
  receipt.missingAsset=await missing.evaluate(async()=>{
    try{await audio.requireRecordedMainShot('s3-charger-light');return {blocked:false};}
    catch(error){return {blocked:true,error:error.message,state:audio.ctx.state};}
  });
  assert.equal(receipt.missingAsset.blocked,true);assert.match(receipt.missingAsset.error,/チャージ音/);
  assert.deepEqual(receipt.errors,[]);receipt.passed=true;
}finally{
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');
  await browser?.close();await new Promise(r=>server.close(r));
}
