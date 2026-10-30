// Reference-only decoding of fixed public source; never writes source media to product.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {limitedFetch,selectVideo} from './recover-public-blast-reference.mjs';
const TWEET='1632258225746903041',SOURCE='https://x.com/rougsmth/status/'+TWEET;
// Public embed query shape follows Vercel react-tweet fetch-tweet.ts, not an X API guarantee.
export function publicReferenceQuery(){
 const token=((Number(TWEET)/1e15)*Math.PI).toString(36).replace(/(0+|\.)/g,'');
 return 'https://cdn.syndication.twimg.com/tweet-result?id='+TWEET+'&lang=en&token='+token;
}
export function inspectReferenceMetadata(data){
 const object=data!==null&&typeof data==='object'&&!Array.isArray(data);
 const keys=object?Object.keys(data):[];
 return {shape:object?'object':Array.isArray(data)?'array':data===null?'null':typeof data,
  keyCount:keys.length,keys:keys.slice(0,32).map(k=>k.slice(0,64)),
  typename:object&&typeof data.__typename==='string'?data.__typename.slice(0,80):null,
  idType:object?typeof data.id_str:'missing',
  observedId:object&&typeof data.id_str==='string'?data.id_str.slice(0,40):null,
  identityMatches:object&&data.id_str===TWEET};
}
const SYNDICATION=publicReferenceQuery();
const TARGET=15.95,MAX_VIDEO=128*1024*1024,MAX_PNG=8*1024*1024,PREFIX='BLAST_REFERENCE_BROWSER_V1';
const sha=b=>createHash('sha256').update(b).digest('hex');
const emit=value=>process.stdout.write(PREFIX+' '+JSON.stringify(value)+'\n');
export function validatePresentedFrame(frame,target=TARGET){
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 if(!finite(target)||target!==TARGET)throw Error('Only the fixed reference time is allowed');
 if(!frame||!finite(frame.mediaTime)||Math.abs(frame.mediaTime-target)>0.05)throw Error('Presented mediaTime does not match the requested frame within 50ms');
 if(frame.paused!==true||frame.seeking!==false||!Number.isInteger(frame.readyState)||frame.readyState<2||frame.readyState>4)throw Error('Video frame is not paused and ready');
 if(!finite(frame.currentTime)||Math.abs(frame.currentTime-target)>0.001)throw Error('Video seek did not settle at the target');
 if(!Number.isInteger(frame.width)||!Number.isInteger(frame.height)||frame.width<=0||frame.height<=0||frame.width>4096||frame.height>4096||frame.width*frame.height>16777216)throw Error('Native video dimensions exceed bounds');
 if(frame.metadataWidth!==frame.width||frame.metadataHeight!==frame.height)throw Error('Anamorphic or mismatched decoded dimensions are not admitted');
 if(!Number.isInteger(frame.presentedFrames)||frame.presentedFrames<1)throw Error('No presented video frame observed');
 return true;
}
export async function seekReferenceFrame({url,target=15.95}){
 if(target!==15.95)throw Error('Only the fixed reference time is allowed');
 const video=document.querySelector('video');
 if(!video||typeof video.requestVideoFrameCallback!=='function')throw Error('Native video frame callbacks unavailable');
 video.muted=true;video.controls=false;video.preload='auto';video.playsInline=true;video.pause();
 let timer,callback;
 try{
  const ready=new Promise((resolve,reject)=>{
   video.addEventListener('loadedmetadata',resolve,{once:true});
   video.addEventListener('error',()=>reject(Error('Video metadata/decode error '+(video.error?.code??''))),{once:true});
  });
  video.src=url;
  await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Video metadata timeout')),30000);})]);clearTimeout(timer);
  if(!Number.isFinite(video.duration)||video.duration<=target)throw Error('Reference duration does not contain target');
  video.style.width=video.videoWidth+'px';video.style.height=video.videoHeight+'px';
  const seeked=new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));
  const presented=new Promise(resolve=>{
   const next=(_now,meta)=>{if(Number.isFinite(meta.mediaTime)&&Math.abs(meta.mediaTime-target)<=0.05)resolve(meta);else callback=video.requestVideoFrameCallback(next);};
   callback=video.requestVideoFrameCallback(next);
  });
  video.currentTime=target;
  const [,meta]=await Promise.race([Promise.all([seeked,presented]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Reference seek/frame presentation timeout')),30000);})]);
  video.pause();
  return {mediaTime:meta.mediaTime,presentationTime:meta.presentationTime,expectedDisplayTime:meta.expectedDisplayTime,presentedFrames:meta.presentedFrames,processingDuration:meta.processingDuration,
   metadataWidth:meta.width,metadataHeight:meta.height,width:video.videoWidth,height:video.videoHeight,currentTime:video.currentTime,duration:video.duration,paused:video.paused,seeking:video.seeking,readyState:video.readyState};
 }finally{clearTimeout(timer);if(callback)video.cancelVideoFrameCallback(callback);}
}
export async function recoverBrowserReference(sourceRoot){
 let server,browser;
 const networkFailures=[];
 try{
  if(process.env.CHROMIUM_EXECUTABLE_PATH)throw Error('Executable override forbidden');
  const root=path.resolve(sourceRoot),require=createRequire(path.join(root,'package.json'));
  const {chromium}=require('playwright');
  const {launchSandboxBrowser,sandboxBrowserOptions}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-sandbox-browser.mjs')));
  const options=sandboxBrowserOptions(process.env);
  if(options.chromiumSandbox!==true||'executablePath' in options||JSON.stringify(options.args)!==JSON.stringify(['--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']))throw Error('Unexpected sandbox launcher contract');
  if(!fs.existsSync(chromium.executablePath()))throw Error('Existing approved Playwright browser unavailable; helper does not install');
  const json=await limitedFetch(SYNDICATION,'cdn.syndication.twimg.com',2*1024*1024,AbortSignal.timeout(30000));
  let data;
  try{data=JSON.parse(json.bytes.toString('utf8'));}
  catch(error){emit({type:'metadata',url:SYNDICATION,bytes:json.bytes.length,sha256:sha(json.bytes),parse:'invalid-json'});throw error;}
  const metadata=inspectReferenceMetadata(data);
  emit({type:'metadata',url:SYNDICATION,bytes:json.bytes.length,sha256:sha(json.bytes),parse:'json',...metadata});
  if(!metadata.identityMatches)throw Error('Public tweet identity missing or mismatched');
  const video=await limitedFetch(selectVideo(data),'video.twimg.com',MAX_VIDEO,AbortSignal.timeout(90000));
  server=http.createServer((req,res)=>{
   if(req.url!=='/reference.mp4'||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end();return;}
   const range=req.headers.range;
   if(range){
    const match=/^bytes=(\d+)-(\d*)$/.exec(range);
    const start=match?Number(match[1]):NaN,end=match&&match[2]?Number(match[2]):video.bytes.length-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>=video.bytes.length){res.writeHead(416,{'content-range':'bytes */'+video.bytes.length});res.end();return;}
    res.writeHead(206,{'content-type':'video/mp4','content-range':'bytes '+start+'-'+end+'/'+video.bytes.length,'content-length':end-start+1,'accept-ranges':'bytes','cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:video.bytes.subarray(start,end+1));return;
   }
   res.writeHead(200,{'content-type':'video/mp4','content-length':video.bytes.length,'accept-ranges':'bytes','cache-control':'no-store'});res.end(req.method==='HEAD'?undefined:video.bytes);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const localURL='http://127.0.0.1:'+server.address().port+'/reference.mp4';
  browser=await launchSandboxBrowser(chromium);
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',route=>route.request().url()===localURL?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();
  page.on('requestfailed',r=>networkFailures.push({url:r.url(),failure:r.failure()}));
  await page.setContent(`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src http://127.0.0.1:*; style-src 'unsafe-inline'"><style>html,body{margin:0;padding:0;background:black}video{display:block;max-width:none;max-height:none}</style><video></video>`);
  const frame=await page.evaluate(seekReferenceFrame,{url:localURL,target:TARGET});validatePresentedFrame(frame);
  await page.setViewportSize({width:frame.width,height:frame.height});
  const element=page.locator('video'),box=await element.boundingBox();
  if(!box||box.width!==frame.width||box.height!==frame.height)throw Error('Video element is scaled');
  const png=await element.screenshot({type:'png',timeout:30000});
  const after=await element.evaluate(v=>({paused:v.paused,seeking:v.seeking,currentTime:v.currentTime,width:v.videoWidth,height:v.videoHeight}));
  if(!after.paused||after.seeking||after.currentTime!==frame.currentTime||after.width!==frame.width||after.height!==frame.height)throw Error('Video changed during screenshot');
  if(png.length>MAX_PNG||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==frame.width||png.readUInt32BE(20)!==frame.height)throw Error('Reference screenshot size or PNG mismatch');
  if(networkFailures.length)throw Error('Reference browser request failed: '+JSON.stringify(networkFailures));
  const base64=png.toString('base64'),parts=Math.ceil(base64.length/12000),pngSHA256=sha(png);
  emit({type:'meta',recordId:'public-tweet-browser-frame',status:'decoded-not-reviewed',sourceURL:SOURCE,syndicationURL:SYNDICATION,videoURL:video.url,retrievedAt:new Date().toISOString(),requestedTimeSeconds:TARGET,frame,videoSHA256:sha(video.bytes),videoBytes:video.bytes.length,pngSHA256,pngBytes:png.length,parts,encoding:'base64',browser:browser.version(),sandboxOptions:options,scope:'historical public 2023 clip; game build unverified; original-size paused video element; browser decode/compositor color pipeline, no image editing'});
  for(let i=0;i<parts;i++)emit({type:'chunk',recordId:'public-tweet-browser-frame',index:i,base64:base64.slice(i*12000,(i+1)*12000)});
  emit({type:'complete',recordId:'public-tweet-browser-frame',pngSHA256,parts});return true;
 }catch(error){emit({type:'error',recordId:'public-tweet-browser-frame',status:'not-recovered',sourceURL:SOURCE,error:String(error?.stack||error).slice(0,3000),networkFailures});return false;}
 finally{await browser?.close().catch(error=>emit({type:'cleanup-error',error:String(error)}));if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(!await recoverBrowserReference(process.argv[2]))process.exitCode=1;}
