// Read-only recovery of one public reference frame. Never imports reference assets into product.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const PREFIX='BLAST_REFERENCE_V1',TWEET='1632258225746903041';
const SOURCE='https://x.com/rougsmth/status/'+TWEET;
const SYNDICATION='https://cdn.syndication.twimg.com/tweet-result?id='+TWEET+'&lang=en';
const TIME=15.95,MAX_VIDEO=128*1024*1024,MAX_PNG=8*1024*1024,CHUNK=12000;
const emit=value=>process.stdout.write(PREFIX+' '+JSON.stringify(value)+'\n');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function allowedURL(value,host){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.hostname!==host||u.username||u.password||u.port&&u.port!=='443')throw Error('Reference URL outside fixed HTTPS host');
 return u;
}
export function selectVideo(data){
 const candidates=[...(Array.isArray(data?.video?.variants)?data.video.variants:[]),
  ...(Array.isArray(data?.mediaDetails)?data.mediaDetails.flatMap(m=>Array.isArray(m?.video_info?.variants)?m.video_info.variants:[]):[])];
 const valid=[];
 for(const c of candidates){
  const raw=c?.src??c?.url;if(typeof raw!=='string')continue;
  try{const u=allowedURL(raw,'video.twimg.com');
   if(!/\.mp4$/i.test(u.pathname))continue;
   valid.push({url:u.href,bitrate:Number.isFinite(c.bitrate)?c.bitrate:0});
  }catch{}
 }
 valid.sort((a,b)=>b.bitrate-a.bitrate||a.url.localeCompare(b.url));
 if(!valid.length)throw Error('Public syndication response has no allowed MP4 video variant');
 return valid[0].url;
}
export async function limitedFetch(url,host,limit,signal){
 let target=allowedURL(url,host);
 for(let hop=0;hop<4;hop++){
  const response=await fetch(target,{redirect:'manual',signal});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location)throw Error('Redirect has no location');
   target=allowedURL(new URL(location,target).href,host);continue;
  }
  if(!response.ok)throw Error('Reference HTTP '+response.status);
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>limit){await response.body?.cancel();throw Error('Reference content-length exceeds bound');}
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Reference stream exceeds bound');chunks.push(chunk);}
  return {bytes:Buffer.concat(chunks,size),url:target.href};
 }
 throw Error('Reference redirect bound exceeded');
}
const STILL='https://www.nintendo.com/jp/character/splatoon/images/en/sp/fashion/weapon/detail/blaster/mv02_bottom.png';
export async function recoverOfficialStill(){
 try{
  const image=await limitedFetch(STILL,'www.nintendo.com',MAX_PNG,AbortSignal.timeout(30000));
  const png=image.bytes;
  if(png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Official fallback is not a PNG');
  const base64=png.toString('base64'),parts=Math.ceil(base64.length/CHUNK),hash=digest(png),recordId='nintendo-official-still';
  emit({type:'meta',recordId,status:'retrieved-not-reviewed',sourceURL:STILL,finalURL:image.url,retrievedAt:new Date().toISOString(),pngSHA256:hash,pngBytes:png.length,width:png.readUInt32BE(16),height:png.readUInt32BE(20),parts,encoding:'base64',version:'Official webpage asset; build/date and explosion content unverified',pixelTransform:'none; original PNG bytes'});
  for(let i=0;i<parts;i++)emit({type:'chunk',recordId,index:i,base64:base64.slice(i*CHUNK,(i+1)*CHUNK)});
  emit({type:'complete',recordId,pngSHA256:hash,parts});return true;
 }catch(error){emit({type:'error',recordId:'nintendo-official-still',status:'not-recovered',sourceURL:STILL,error:String(error?.message||error).slice(0,1200)});return false;}
}
export async function recover(){
 let directory=null;
 try{
  const availability=spawnSync('ffmpeg',['-version'],{encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
  if(availability.error||availability.status!==0)throw Error('Existing ffmpeg unavailable; installation not attempted');
  const json=await limitedFetch(SYNDICATION,'cdn.syndication.twimg.com',2*1024*1024,AbortSignal.timeout(30000));
  const data=JSON.parse(json.bytes.toString('utf8'));
  if(data.id_str!==TWEET)throw Error('Public syndication tweet identity missing or mismatched');
  const video=await limitedFetch(selectVideo(data),'video.twimg.com',MAX_VIDEO,AbortSignal.timeout(90000));
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'blast-reference-'));
  const sourceFile=path.join(directory,'source.mp4'),frameFile=path.join(directory,'frame.png');
  await fs.writeFile(sourceFile,video.bytes,{flag:'wx'});
  const decoded=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-f','mov','-enable_drefs','0','-use_absolute_path','0','-i',sourceFile,'-ss',String(TIME),'-frames:v','1','-c:v','png',frameFile],{encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
  if(decoded.error||decoded.status!==0)throw Error('Reference frame decode failed: '+String(decoded.error||decoded.stderr).slice(0,600));
  if((await fs.stat(frameFile)).size>MAX_PNG)throw Error('Reference PNG exceeds bound');
  const png=await fs.readFile(frameFile);
  if(png.length>MAX_PNG||png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Reference PNG missing, invalid or oversized');
  const base64=png.toString('base64'),parts=Math.ceil(base64.length/CHUNK),hash=digest(png);
  emit({type:'meta',recordId:'public-tweet-frame',retrievedAt:new Date().toISOString(),status:'decoded-not-reviewed',sourceURL:SOURCE,syndicationURL:SYNDICATION,videoURL:video.url,timeSeconds:TIME,videoSHA256:digest(video.bytes),videoBytes:video.bytes.length,pngSHA256:hash,pngBytes:png.length,width:png.readUInt32BE(16),height:png.readUInt32BE(20),parts,encoding:'base64',version:'Historical public 2023 clip; exact game build unverified, not claimed 11.3.0',pixelTransform:'none; decoded original-size frame'});
  for(let i=0;i<parts;i++)emit({type:'chunk',recordId:'public-tweet-frame',index:i,base64:base64.slice(i*CHUNK,(i+1)*CHUNK)});
  emit({type:'complete',recordId:'public-tweet-frame',pngSHA256:hash,parts});
  return true;
 }catch(error){emit({type:'error',recordId:'public-tweet-frame',status:'not-recovered',sourceURL:SOURCE,timeSeconds:TIME,error:String(error?.message||error).slice(0,1200),authorization:'public unauthenticated endpoints only; no installation or alternate video host'});await recoverOfficialStill();return false;}
 finally{if(directory)await fs.rm(directory,{recursive:true,force:true}).catch(error=>emit({type:'cleanup-error',error:String(error.message).slice(0,300)}));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))await recover();
