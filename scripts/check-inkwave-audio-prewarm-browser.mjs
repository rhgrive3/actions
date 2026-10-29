#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const audio=fs.readFileSync(path.join(root,'inkwave-public/src/audio/audio.js'),'utf8'),music=fs.readFileSync(path.join(root,'inkwave-public/src/audio/music.js'),'utf8');
const grain=audio.slice(audio.indexOf('const TEX = {'),audio.indexOf('/* ------------------------------------------------------------------------------------------------------------\n * Engine')).replace('export function','function');
const impulse=music.slice(music.indexOf('export function makeImpulse('),music.indexOf('\n// tanh drive curve')).replace('export function','function');
const prng=music.slice(music.indexOf('export function mulberry32('),music.indexOf('\nconst perCtx')).replace('export function','function');
const evidenceIndex=process.argv.indexOf('--evidence');
if(evidenceIndex<0||!process.argv[evidenceIndex+1])throw new Error('Required --evidence');
const evidence=path.resolve(process.argv[evidenceIndex+1]);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Audio PCM parity</title>');return;}if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('path');const body=fs.readFileSync(file);res.writeHead(200,{'content-type':file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const result=await page.evaluate(async({grain,impulse,prng})=>{
  const {texture}=await import('/patches/splatoon3/runtime/audio/grain-texture.mjs'),{prewarmGrainTextures,cancelGrainPrewarm}=await import('/patches/splatoon3/runtime/audio/grain-prewarm.mjs'),{ReverbPrewarm}=await import('/patches/splatoon3/runtime/audio/reverb-prewarm.mjs');
  const baselineTexture=new Function(prng+grain+';return texture;')(),baselineImpulse=new Function(prng+impulse+';return makeImpulse;')();
  const same=(a,b,label)=>{if(a.length!==b.length)throw Error(label+' length');const x=new Uint32Array(a.buffer,a.byteOffset,a.length),y=new Uint32Array(b.buffer,b.byteOffset,b.length);for(let i=0;i<x.length;i++)if(x[i]!==y[i])throw Error(label+' sample '+i);};
  const wait=async(fn,label)=>{const end=performance.now()+15000;while(!fn()){if(performance.now()>end)throw Error(label+' timeout');await new Promise(r=>setTimeout(r,10));}};
  const results=[];
  for(const rate of [44100,48000,96000]){
   const ctx=new OfflineAudioContext(2,128,rate),engine={ctx},warm=new ReverbPrewarm({sampleRate:rate});let failed=false;
   if(!prewarmGrainTextures(engine,()=>{failed=true;},{delay:0}))throw Error('no Worker');
   try{
    await wait(()=>engine._grainPrewarm?.done&&warm.pair,'kernels '+rate);if(failed)throw Error('grain worker failed');
    let samples=0;for(const kind of ['bubbles','bubbles_bright','squelch','rain','sizzle']){const actual=texture(ctx,kind).getChannelData(0),expected=baselineTexture(ctx,kind).getChannelData(0);same(actual,expected,kind+' '+rate);samples+=actual.length;}
    const pair=warm.take(ctx);for(let i=0;i<2;i++){const expected=i?baselineImpulse(ctx,2.2,2.4,{seed:5,bright:.7,dark:.08}):baselineImpulse(ctx,1.5,3.4,{pre:.012,seed:3});for(let ch=0;ch<2;ch++){same(pair[i].getChannelData(ch),expected.getChannelData(ch),'IR '+i+' '+ch+' '+rate);samples+=pair[i].length;}}
    results.push({sampleRate:rate,grainKinds:5,stereoIRs:2,comparedSamples:samples,bitExact:true});
   }finally{cancelGrainPrewarm(engine);warm.dispose();}
  }
  return{userAgent:navigator.userAgent,results,passed:true};
 },{grain,impulse,prng});
 fs.mkdirSync(path.dirname(evidence),{recursive:true});fs.writeFileSync(evidence,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
