/**
 * Optional operator-provided sound library. No Nintendo or reference WAVs are bundled.
 * Replacement is transactional: an in-progress download NEVER changes the live bank.
 * Usage-rights statements are operator attestations, NOT license verification.
 */
import { WEAPON_AUDIO, LOOP_EVENTS } from './weapon-recipes.mjs';
import { KIT_AUDIO } from './kit-recipes.mjs';
const AUDIO_RECIPES={...WEAPON_AUDIO,...KIT_AUDIO};
const EXT=/\.(wav|ogg|mp3|flac|m4a)$/i;
const SAFE=/^[\w .()\-/]+$/;
const MAX_CLIPS=1536;
const MAX_FILE_BYTES=8*1024*1024;
const DEFAULT_BYTES=24*1024*1024;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
// Count each decoded AudioBuffer once even when several weapon slots point
// to the same immutable 2022 MP3. Never deduplicate unverified content.
function decodedBytes(rows){
  let total=0;const seen=new Set();
  for(const row of rows.values())if(!seen.has(row.buffer)){seen.add(row.buffer);total+=row.bytes;}
  return total;
}
function canReusePCM(row,clip){
  return row.file===clip.file && !!row.sha256 && row.sha256===clip.sha256
    && LOOP_EVENTS.has(row.event)===LOOP_EVENTS.has(clip.event)
    && (row.loopStart??null)===(clip.loopStart??null)
    && (row.loopEnd??null)===(clip.loopEnd??null)
    && row.seamlessLoop!==false && clip.seamlessLoop!==false;
}

function safeRelative(path){
  return typeof path==='string'&&path.length>0&&path.length<=240&&SAFE.test(path)
    &&!path.startsWith('/')&&!path.split('/').some(s=>s==='.'||s==='..'||!s);
}
function safeBaseURL(path){
  // This loader intentionally does not permit cross-origin or user-supplied absolute URLs.
  // `./` is needed by offline/local lab builds, so normalize that prefix before validation.
  if(path==='.'||path==='./')return true;
  if(typeof path!=='string'||!path||/[?#\\:%]/.test(path)||path.startsWith('//')||path.startsWith('/')||/^\w+:/.test(path))return false;
  return safeRelative(path.replace(/^(\.\/)+/,'').replace(/\/$/,''));
}
export function validateAuthorizedManifest(manifest){
  if(!manifest||manifest.schema!==1||!Array.isArray(manifest.clips)||manifest.clips.length>MAX_CLIPS)
    throw new TypeError('Expected {schema:1, clips:[...]}, max 1536');
  if(typeof manifest.usageRights!=='string'||manifest.usageRights.trim().length<8)
    throw new TypeError('Declare the operator’s ownership/license/usage rights');
  if(manifest.targetVersion!=null&&typeof manifest.targetVersion!=='string')
    throw new TypeError('targetVersion must be a string');
  const seen=new Set();
  return manifest.clips.map((c,i)=>{
    if(!c||typeof c.id!=='string'||typeof c.event!=='string'||!AUDIO_RECIPES[c.id]?.events.includes(c.event))
      throw new RangeError(`Clip ${i}: unknown weapon/event`);
    if(!safeRelative(c.file)||!EXT.test(c.file))throw new TypeError(`Clip ${i}: unsafe/unsupported file`);
    const variant=c.variant==null?0:c.variant;
    if(!Number.isInteger(variant)||variant<0||variant>15)throw new RangeError(`Clip ${i}: invalid variant`);
    const gain=c.gain==null?1:c.gain;
    if(!finite(gain)||gain<0||gain>2)throw new RangeError(`Clip ${i}: invalid gain`);
    const loopStart=c.loopStart??null,loopEnd=c.loopEnd??null;
    if((loopStart==null)!==(loopEnd==null)||(loopStart!=null&&(!finite(loopStart)||!finite(loopEnd)||loopStart<0||loopEnd<=loopStart)))
      throw new RangeError(`Clip ${i}: invalid loop points`);
    if(c.sha256!=null&&(typeof c.sha256!=='string'||!/^[0-9a-f]{64}$/i.test(c.sha256)))
      throw new RangeError(`Clip ${i}: invalid SHA-256`);
    if(c.seamlessLoop!=null&&typeof c.seamlessLoop!=='boolean')throw new TypeError(`Clip ${i}: seamlessLoop must be boolean`);
    const key=`${c.id}:${c.event}:${variant}`;
    if(seen.has(key))throw new Error('Duplicate clip '+key);
    seen.add(key);
    return Object.freeze({...c,variant,gain,loopStart,loopEnd});
  });
}
function repairLoopSeam(ctx,buffer,startSeconds,endSeconds){
  // Repair *only* the boundary of an authorized loop, never a one-shot transient.
  // A short symmetrical endpoint fade is cheap, deterministic and channel independent.
  const sr=buffer.sampleRate||ctx.sampleRate;
  if(!finite(sr)||sr<8000||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1)return buffer;
  const begin=Math.max(0,Math.floor(startSeconds*sr));
  const end=Math.min(buffer.length,Math.floor(endSeconds*sr));
  const frames=Math.min(Math.floor(sr*.004),Math.floor((end-begin)/6));
  if(frames<4)return buffer;
  let worst=0;
  for(let c=0;c<buffer.numberOfChannels;c++){
    const x=buffer.getChannelData(c);
    worst=Math.max(worst,Math.abs(x[end-1]-x[begin]));
  }
  if(worst<.004)return buffer;
  if(typeof ctx.createBuffer!=='function')return buffer;
  const out=ctx.createBuffer(buffer.numberOfChannels,buffer.length,sr);
  for(let c=0;c<buffer.numberOfChannels;c++){
    const from=buffer.getChannelData(c),to=out.getChannelData(c);
    to.set(from);
    const middle=(from[begin]+from[end-1])*.5;
    for(let i=0;i<frames;i++){
      const q=i/(frames-1),a=q*q*(3-2*q);
      to[end-frames+i]=from[end-frames+i]*(1-a)+middle*a;
      to[begin+i]=middle*(1-a)+from[begin+i]*a;
    }
  }
  return out;
}
export class AuthorizedSamplePack {
  constructor(ctx,{maxBytes=DEFAULT_BYTES,fetcher}={}){
    if(!finite(maxBytes)||maxBytes<1024)throw new RangeError('Invalid authorized audio cache budget');
    // WebKit brand-checks Window.fetch: never store its unbound method.
    // Explicit test/operator fetchers keep their original call semantics.
    this.ctx=ctx;this.maxBytes=maxBytes;this.fetcher=fetcher||globalThis.fetch?.bind(globalThis);
    this.loaded=new Map();this.byEvent=new Map();this.bytes=0;this.errors=[];
    this.manifest=null;this.source='none';this.pending=0;this.generation=0;this.repaired=0;
  }
  key(id,event,variant){return `${id}:${event}:${variant}`;}
  pick(id,event,serial=0){
    const arr=this.byEvent.get(`${id}:${event}`);
    const index=finite(serial)?Math.abs(Math.trunc(serial)):0;
    if(!arr?.length)return null;const item=arr[index%arr.length];
    // Playback touches move entries to the end of the decoded-cache LRU.
    const key=this.key(item.id,item.event,item.variant);if(this.loaded.has(key)){this.loaded.delete(key);this.loaded.set(key,item);}
    return item;
  }
  _reindex(){
    this.byEvent.clear();
    for(const item of this.loaded.values()){
      const key=`${item.id}:${item.event}`;
      if(!this.byEvent.has(key))this.byEvent.set(key,[]);
      this.byEvent.get(key).push(item);
    }
    for(const arr of this.byEvent.values())arr.sort((a,b)=>a.variant-b.variant);
  }
  async load(manifest,{baseURL='./',concurrency=3,replace=true}={}){
    const valid=validateAuthorizedManifest(manifest);
    if(!safeBaseURL(baseURL))throw new TypeError('baseURL must be a safe relative local path');
    if(typeof this.fetcher!=='function')throw new Error('fetch API unavailable');
    if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new RangeError('concurrency must be 1..4');
    const generation=++this.generation;
    const current=()=>this.generation===generation && this.ctx.state!=='closed';
    const cancelled=Symbol('cancelled audio sample load');
    const next=replace?new Map():new Map(this.loaded);
    let total=replace?0:decodedBytes(next),done=0,repairs=0,cursor=0;
    const errors=[],decoded=new Map();
    // The same file can back multiple variants: download/decode it once per import.
    const getDecoded=(clip)=>{
      if(decoded.has(clip.file))return decoded.get(clip.file);
      const promise=(async()=>{
        const url=baseURL.replace(/\/$/,'')+'/'+clip.file;
        if(!current())throw cancelled;
        const res=await this.fetcher(url);
        if(!current())throw cancelled;
        if(!res?.ok)throw new Error('HTTP '+(res?.status??'unknown'));
        const reported=Number(res.headers?.get?.('content-length'));
        if(Number.isFinite(reported)&&reported>MAX_FILE_BYTES)throw new Error('Clip exceeds 8 MiB');
        const bytes=await res.arrayBuffer();
        if(!current())throw cancelled;
        if(!(bytes instanceof ArrayBuffer)||bytes.byteLength>MAX_FILE_BYTES||!bytes.byteLength)throw new Error('Clip is empty or exceeds 8 MiB');
        // Hash validation is per manifest entry below, even for reused decoded files.
        const pcm=await this.ctx.decodeAudioData(bytes.slice(0));
        if(!current())throw cancelled;
        if(!pcm||!finite(pcm.duration)||pcm.duration<=0||pcm.duration>30||!Number.isInteger(pcm.length)||pcm.length<=0||
           !Number.isInteger(pcm.numberOfChannels)||pcm.numberOfChannels<1||pcm.numberOfChannels>8)
          throw new Error('Invalid decoded sample');
        return {bytes,pcm};
      })();
      decoded.set(clip.file,promise);return promise;
    };
    const jobs=Array.from({length:Math.min(concurrency,Math.max(1,valid.length))},async()=>{
      while(cursor<valid.length && current()){
        const clip=valid[cursor++];this.pending++;
        try{
          // Reuse an already verified, byte-identical source buffer across IDs.
          // The same source is intentionally referenced by e.g. several chargers.
          // Loop endpoints/repair mode must match, so no PCM is ever reinterpreted.
          const existing=[...next.values()].find(row=>canReusePCM(row,clip));
          let buffer;
          if(existing){buffer=existing.buffer;}
          else {
            const {bytes,pcm}=await getDecoded(clip);
            if(!current())return;
            if(clip.sha256){
              if(!globalThis.crypto?.subtle)throw new Error('SHA256 requested but SubtleCrypto unavailable');
              const dig=await globalThis.crypto.subtle.digest('SHA-256',bytes);
              if(!current())return;
              const sha=Array.from(new Uint8Array(dig),v=>v.toString(16).padStart(2,'0')).join('');
              if(sha.toLowerCase()!==clip.sha256.toLowerCase())throw new Error('Checksum mismatch');
            }
            if(clip.loopEnd!=null&&clip.loopEnd>pcm.duration)throw new Error('Loop end exceeds decoded duration');
            const shouldLoop=LOOP_EVENTS.has(clip.event),shouldRepair=shouldLoop&&clip.seamlessLoop!==false;
            buffer=shouldRepair?repairLoopSeam(this.ctx,pcm,clip.loopStart??0,clip.loopEnd??pcm.duration):pcm;
            if(buffer!==pcm)repairs++;
          }
          const cost=buffer.length*buffer.numberOfChannels*4;
          if(!Number.isSafeInteger(cost)||cost<=0)throw new Error('Invalid decoded sample size');
          const key=this.key(clip.id,clip.event,clip.variant);
          const candidate=new Map(next);candidate.delete(key);
          candidate.set(key,Object.freeze({...clip,buffer,bytes:cost}));
          let candidateBytes=decodedBytes(candidate);
          // Evict oldest rows only if their LAST reference is removed. A playing
          // BufferSource retains its own buffer until the sound finishes.
          while(candidateBytes>this.maxBytes&&candidate.size>1){
            const victim=candidate.keys().next().value;
            if(victim===key)break;
            candidate.delete(victim);candidateBytes=decodedBytes(candidate);
          }
          if(candidateBytes>this.maxBytes)throw new Error('Sample cache budget exceeded');
          next.clear();for(const [name,row] of candidate)next.set(name,row);
          total=candidateBytes;
          done++;
        }catch(e){if(e!==cancelled && current())errors.push({file:clip.file,id:clip.id,event:clip.event,error:String(e?.message||e)});}
        finally{this.pending--;}
      }
    });
    await Promise.all(jobs);
    // Last-request-wins. The old playback bank remains valid throughout network/decode.
    if(!current())return {loaded:0,rejected:errors.length,errors,cancelled:true,bytes:this.bytes};
    this.loaded=next;this.bytes=total;this._reindex();this.errors=errors;this.repaired=repairs;
    this.manifest={targetVersion:manifest.targetVersion||null,usageRights:manifest.usageRights,source:manifest.source||null};
    this.source='user-supplied';
    return {loaded:done,rejected:errors.length,errors,cancelled:false,bytes:this.bytes,repairedLoops:repairs};
  }
  clear(){this.generation++;this.loaded.clear();this.byEvent.clear();this.bytes=0;this.manifest=null;this.source='none';this.errors=[];this.repaired=0;}
  stats(){return{source:this.source,clips:this.loaded.size,bytes:this.bytes,limitBytes:this.maxBytes,errors:this.errors.length,
    repairedLoops:this.repaired,pending:this.pending,rights:this.manifest?.usageRights||null,targetVersion:this.manifest?.targetVersion||null};}
}
