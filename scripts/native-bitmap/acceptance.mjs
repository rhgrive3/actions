import {validateResults} from './receipt-gate.mjs';
// Small real-browser ownership test; synthetic PNGs and no WebGL renderer.
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {chromium} from 'playwright';
const [candidatePath,baselinePath,threeDir,output]=process.argv.slice(2);assert(candidatePath&&baselinePath&&threeDir&&output);
const pinned=[['candidate',candidatePath,'6b706ae30aafccda4abde8913f0d57f8518a92e0173cfaf3f1904d5b4965487b'],['baseline',baselinePath,'516b3f0018c41551b12734b76c68d2cb1bfbe99dc13ce553ee7e0ef00174e023'],['three.module.js',path.join(threeDir,'three.module.js'),'9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea'],['three.core.js',path.join(threeDir,'three.core.js'),'9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6']];
const bytes={};for(const [key,p,hash] of pinned){const b=fs.readFileSync(p);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),hash,key);bytes[key]=b;}
const stubs={'registry.mjs':'export const nativeStageURL=()=>"/synthetic.png";','build-config.mjs':'export const nativeStageBuild={mode:"browser-direct"};','source-data.mjs':'export const loadBrowserSource=()=>{throw Error("Unexpected geometry load")};','source-cache.mjs':'export const sourceBytes=async()=>globalThis.syntheticPNG.slice(0);'};
const server=http.createServer((req,res)=>{const u=req.url;let b;if(u==='/')b='<script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script>';else if(u==='/three/three.module.js')b=bytes['three.module.js'];else if(u==='/three/three.core.js')b=bytes['three.core.js'];else{const m=/^\/(baseline|candidate)\/([^/]+)$/.exec(u);if(m)b=m[2]==='native-load.mjs'?bytes[m[1]]:stubs[m[2]];}if(b===undefined){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':u==='/'?'text/html':'text/javascript'});res.end(b);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});const results=[];let active;
try{
 for(const variant of ['baseline','candidate'])for(const scenario of ['decode','resize','resize-reject','texture-setup-reject','normal','abort']){
  active={variant,scenario};const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();await page.goto(origin);
  results.push(await page.evaluate(async({variant,scenario})=>{
   const THREE=await import('three');const loader=await import(`/${variant}/native-load.mjs`);
   const canvas=new OffscreenCanvas(32,16),ctx=canvas.getContext('2d');ctx.fillStyle='rgb(192,64,32)';ctx.fillRect(0,0,32,16);globalThis.syntheticPNG=await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer();
   const nativeCreate=globalThis.createImageBitmap,createDescriptor=Object.getOwnPropertyDescriptor(globalThis,'createImageBitmap'),closeDescriptor=Object.getOwnPropertyDescriptor(ImageBitmap.prototype,'close'),disposeDescriptor=Object.getOwnPropertyDescriptor(THREE.Texture.prototype,'dispose');
   const bitmaps=[],closed=[],disposed=[];let calls=0,result,error;
   globalThis.createImageBitmap=async function(...args){calls++;if(scenario==='resize-reject'&&args[0] instanceof ImageBitmap)throw Error('intentional-resize-reject');const b=await Reflect.apply(nativeCreate,this,args);bitmaps.push(b);return b;};
   ImageBitmap.prototype.close=function(...args){const before=[this.width,this.height];const r=Reflect.apply(closeDescriptor.value,this,args);closed.push({id:bitmaps.indexOf(this),before,after:[this.width,this.height]});return r;};
   THREE.Texture.prototype.dispose=function(...args){disposed.push(this);return Reflect.apply(disposeDescriptor.value,this,args);};
   try{
    const normal=scenario==='normal',data={manifest:{materials:{m:{albedo:normal?undefined:'synthetic.png',normalEncoding:'unorm-rg',maps:normal?{normal:'synthetic.png'}:{},channels:{}}}},integrity:{}};
    try{result=await loader.loadNativeTextures('synthetic',data,{capabilities:{getMaxAnisotropy(){if(scenario==='texture-setup-reject')throw Error('intentional-texture-setup-reject');return 4;}}},normal?'high':'balanced',scenario==='abort'?{aborted:true}:undefined,['decode','normal'].includes(scenario)?64:8);}catch(e){error={name:e.name,message:e.message};}
    const snapshots=bitmaps.map((b,i)=>{let drawable=false,pixel=null;try{const c=new OffscreenCanvas(1,1),x=c.getContext('2d');x.drawImage(b,0,0,1,1);pixel=Array.from(x.getImageData(0,0,1,1).data);drawable=true;}catch(e){if(e.name!=='InvalidStateError')throw e;}return {id:i,width:b.width,height:b.height,drawable,pixel,closeCount:closed.filter(c=>c.id===i).length};});
    const success=['decode','resize','normal'].includes(scenario),t=result?.get('synthetic.png');let ownershipPass;
    if(success){ownershipPass=!error&&result?.size===1&&disposed.length===0&&(normal?t?.isDataTexture===true&&snapshots.every(b=>b.closeCount===1&&!b.drawable):t?.image===bitmaps.at(-1)&&snapshots.at(-1).drawable&&snapshots.at(-1).closeCount===0&&snapshots.at(-1).pixel.join(',')==='192,64,32,255'&&snapshots.slice(0,-1).every(b=>b.closeCount===1&&!b.drawable));}
    else{const expected=scenario==='abort'?'AbortError':scenario==='resize-reject'?'intentional-resize-reject':'intentional-texture-setup-reject';ownershipPass=!!error&&(scenario==='abort'?error.name:error.message)===expected&&snapshots.every(b=>b.closeCount===1&&!b.drawable)&&disposed.length===(scenario==='resize-reject'?0:1);}
    if(scenario==='decode'&&t?.image.width!==32)ownershipPass=false;if(scenario==='resize'&&(t?.image.width!==8||t?.image.height!==4))ownershipPass=false;
    const receipt={variant,scenario,ownershipPass,calls,snapshots,error,returned:!!result,disposedCount:disposed.length,closeEvents:closed.slice(),sourceMode:'synthetic sourceBytes boundary; actual immutable loader, Three.Texture and browser ImageBitmap',restorationVerifiedOnExit:true};
    // Explicitly exercise caller ownership only after preserving the live-return receipt.
    if(t){t.image?.close?.();t.dispose();receipt.callerCleanup={disposed:disposed.filter(x=>x===t).length,bitmapClosed:normal?null:t.image.width===0&&t.image.height===0};if(receipt.callerCleanup.disposed!==1||!normal&&!receipt.callerCleanup.bitmapClosed)receipt.ownershipPass=false;}
    return receipt;
   }finally{
    for(const b of bitmaps)if(b.width||b.height)Reflect.apply(closeDescriptor.value,b,[]);
    Object.defineProperty(globalThis,'createImageBitmap',createDescriptor);Object.defineProperty(ImageBitmap.prototype,'close',closeDescriptor);Object.defineProperty(THREE.Texture.prototype,'dispose',disposeDescriptor);delete globalThis.syntheticPNG;
    if(globalThis.createImageBitmap!==nativeCreate||ImageBitmap.prototype.close!==closeDescriptor.value||THREE.Texture.prototype.dispose!==disposeDescriptor.value)throw Error('Restoration failed');
   }
  },{variant,scenario}));await context.close();
 }
 validateResults(results);
 fs.writeFileSync(output,JSON.stringify({status:'passed',candidateHead:'3ab55b1134d93b53c806be00c6d255b232fe2278',baselineHead:'efb8cfa1d38f962a509f0a32fa8add04352344d3',sourceSHA256:Object.fromEntries(pinned.map(([k,,h])=>[k,h])),browserVersion:browser.version(),scope:'Synthetic bitmap ownership; no stage/GPU upload/hardware/crash-cause qualification',results},null,2));
}catch(e){fs.writeFileSync(output,JSON.stringify({status:'failed',active,error:String(e.stack||e),results},null,2));throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
