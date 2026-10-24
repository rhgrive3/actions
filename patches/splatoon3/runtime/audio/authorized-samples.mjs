import { audioLoadScope } from './load-deadline.mjs';
/**
 * Optional operator-provided sound library. No Nintendo or reference WAVs are bundled.
 * Replacement is transactional: an in-progress download NEVER changes the live bank.
 * Usage-rights statements are operator attestations, NOT license verification.
 */
import { WEAPON_AUDIO, LOOP_EVENTS } from './weapon-recipes.mjs';
import { KIT_AUDIO } from './kit-recipes.mjs';
import { COMBAT_AUDIO } from './combat-recipes.mjs';
import { SOURCE_EXTRA_AUDIO } from './source-cue-registry.mjs';
const AUDIO_RECIPES={...WEAPON_AUDIO,...KIT_AUDIO,...COMBAT_AUDIO,...SOURCE_EXTRA_AUDIO};
const EXT=/\.(wav|ogg|mp3|flac|m4a)$/i;
// A shipped 2022 MP3 is named Wp_BombBomb_Octave+1_00.mp3. '+' is a safe literal in a local file segment.
const SAFE=/^[\w .()+\-/]+$/;
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
function pcmKey(clip) {
  return clip.sha256 && clip.seamlessLoop !== false
    ? JSON.stringify([clip.file, clip.sha256, LOOP_EVENTS.has(clip.event), clip.loopStart ?? null, clip.loopEnd ?? null]) : null;
}
function windupKey(clip) {
  return clip.sha256 && clip.seamlessLoop !== false ? JSON.stringify([clip.file, clip.sha256]) : null;
}
function canReuseBrushWindup(row,clip){
  // Only this verified one-shot is a raw source for its separately repaired
  // loop. A repaired roll must never become a later windup's source.
  return clip.id==='s3-brush-normal' && clip.event==='roll'
    && row.id===clip.id && row.event==='windup'
    && row.file===clip.file && !!row.sha256 && row.sha256===clip.sha256
    && row.loopStart==null && row.loopEnd==null
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
    this.loaded=new Map();this._mruKey=null;this.byEvent=new Map();this.bytes=0;this.errors=[];
    this.manifest=null;this.source='none';this.pending=0;this.generation=0;this.repaired=0;
    this._loadScopes=new Set();
  }
  key(id,event,variant){return `${id}:${event}:${variant}`;}
  _cancelLoads(){const retired=[...this._loadScopes];this._loadScopes=new Set();for(const scope of retired)scope.cancel();}
  pick(id,event,serial=0){
    const arr=this.byEvent.get(`${id}:${event}`);
    const index=finite(serial)?Math.abs(Math.trunc(serial)):0;
    if(!arr?.length)return null;const item=arr[index%arr.length];
    // Playback touches move entries to the end of the decoded-cache LRU.
    const key=this.key(item.id,item.event,item.variant);if(this.loaded.has(key)&&this._mruKey!==key){this.loaded.delete(key);this.loaded.set(key,item);this._mruKey=key;}
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
    this._cancelLoads();
    const current=()=>this.generation===generation && this.ctx.state!=='closed';
    const cancelled=Symbol('cancelled audio sample load');
    const next=replace?new Map():new Map(this.loaded);
    let total=replace?0:decodedBytes(next),done=0,repairs=0,cursor=0;
    const errors=[],decoded=new Map(),scopes=new Map();
    // Existing and staged rows reference PCM by identity. Account bytes once
    // per AudioBuffer while staging, without rebuilding a candidate Map per clip.
    const refs=new Map();
    for(const row of next.values())refs.set(row.buffer,(refs.get(row.buffer)||0)+1);
    // Transaction-local ordered buckets track the same first compatible row
    // as next.values(), including replacement and budget eviction.
    // Small demand-page imports keep the original scan; building an index
    // costs more than one or two scans of the resident bank.
    const usePCMIndex=valid.length>=8;
    const pcmRows=usePCMIndex?new Map():null,windupRows=usePCMIndex?new Map():null,changedEvents=new Set();
    const indexRow=(row,add)=>{
      if(!usePCMIndex)return;
      const entries=[[pcmRows,pcmKey(row)]];
      if(row.id==='s3-brush-normal'&&row.event==='windup'&&row.loopStart==null&&row.loopEnd==null)entries.push([windupRows,windupKey(row)]);
      for(const [index,key] of entries){
        if(key==null)continue;
        if(add){let bucket=index.get(key);if(!bucket)index.set(key,bucket=new Set());bucket.add(row);}
        else{const bucket=index.get(key);bucket?.delete(row);if(bucket?.size===0)index.delete(key);}
      }
    };
    if(usePCMIndex)for(const row of next.values())indexRow(row,true);
    const acquire=row=>{if(!refs.has(row.buffer))total+=row.bytes;refs.set(row.buffer,(refs.get(row.buffer)||0)+1);};
    const release=row=>{const n=refs.get(row.buffer);if(n===1){refs.delete(row.buffer);total-=row.bytes;}else refs.set(row.buffer,n-1);};
    const remainingByFile=new Map();
    for(const clip of valid)remainingByFile.set(clip.file,(remainingByFile.get(clip.file)||0)+1);
    const hashedFiles=new Set(valid.filter(clip=>clip.sha256).map(clip=>clip.file));
    // The same file can back multiple variants: download/decode it once per import.
    const getDecoded=(clip)=>{
      if(decoded.has(clip.file))return decoded.get(clip.file);
      const scope=audioLoadScope();scopes.set(clip.file,scope);this._loadScopes.add(scope);
      const promise=scope.run(async()=>{
        const url=baseURL.replace(/\/$/,'')+'/'+clip.file;
        if(!current())throw cancelled;
        const res=await this.fetcher(url,scope.signal?{signal:scope.signal}:undefined);
        scope.check();
        if(!current())throw cancelled;
        if(!res?.ok)throw new Error('HTTP '+(res?.status??'unknown'));
        const reported=Number(res.headers?.get?.('content-length'));
        if(Number.isFinite(reported)&&reported>MAX_FILE_BYTES)throw new Error('Clip exceeds 8 MiB');
        const bytes=await res.arrayBuffer();
        scope.check();
        if(!current())throw cancelled;
        if(!(bytes instanceof ArrayBuffer)||bytes.byteLength>MAX_FILE_BYTES||!bytes.byteLength)throw new Error('Clip is empty or exceeds 8 MiB');
        // Decode only after the consuming manifest entry passes its checksum.
        // A pure unhashed file has no later byte borrower, so WebKit may take
        // ownership of its fetched ArrayBuffer directly.
        const file={bytes,digest:null,pcm:null,scope};
        file.decode=()=>file.pcm||(file.pcm=scope.run(async()=>{
          if(!current())throw cancelled;
          scope.check();
          const pcm=await this.ctx.decodeAudioData(hashedFiles.has(clip.file)?bytes.slice(0):bytes);
          scope.check();
          if(!current())throw cancelled;
          if(!pcm||!finite(pcm.duration)||pcm.duration<=0||pcm.duration>30||!Number.isInteger(pcm.length)||pcm.length<=0||
             !Number.isInteger(pcm.numberOfChannels)||pcm.numberOfChannels<1||pcm.numberOfChannels>8)
            throw new Error('Invalid decoded sample');
          return pcm;
        }));
        return file;
      });
      decoded.set(clip.file,promise);return promise;
    };
    const jobs=Array.from({length:Math.min(concurrency,Math.max(1,valid.length))},async()=>{
      while(cursor<valid.length && current()){
        const clip=valid[cursor++];this.pending++;
        try{
          // Reuse an already verified, byte-identical source buffer across IDs.
          // The same source is intentionally referenced by e.g. several chargers.
          // Loop endpoints/repair mode must match, so no PCM is ever reinterpreted.
          let existing=null,rawWindup=null;
          if(usePCMIndex){
            const candidate=pcmRows.get(pcmKey(clip))?.values().next().value;
            if(candidate&&canReusePCM(candidate,clip))existing=candidate;
            if(!existing&&clip.id==='s3-brush-normal'&&clip.event==='roll'){
              const windup=windupRows.get(windupKey(clip))?.values().next().value;
              if(windup&&canReuseBrushWindup(windup,clip))rawWindup=windup;
            }
          }else for(const row of next.values()){
            if(canReusePCM(row,clip)){existing=row;break;}
            if(!rawWindup&&canReuseBrushWindup(row,clip))rawWindup=row;
          }
          let buffer;
          if(existing){buffer=existing.buffer;}
          else {
            const decodedFile=rawWindup?null:await getDecoded(clip);
            if(!current())return;
            if(clip.sha256&&!rawWindup){
              if(!globalThis.crypto?.subtle)throw new Error('SHA256 requested but SubtleCrypto unavailable');
              // Memoize only this transaction's actual fetched bytes; every
              // manifest row still compares its own declared checksum.
              if(!decodedFile.digest)decodedFile.digest=decodedFile.scope.run(()=>globalThis.crypto.subtle.digest('SHA-256',decodedFile.bytes)
                .then(dig=>Array.from(new Uint8Array(dig),v=>v.toString(16).padStart(2,'0')).join('')));
              const sha=await decodedFile.digest;
              if(!current())return;
              if(sha.toLowerCase()!==clip.sha256.toLowerCase())throw new Error('Checksum mismatch');
            }
            const pcm=rawWindup?rawWindup.buffer:await decodedFile.decode();
            if(!current())return;
            if(clip.loopEnd!=null&&clip.loopEnd>pcm.duration)throw new Error('Loop end exceeds decoded duration');
            const shouldLoop=LOOP_EVENTS.has(clip.event),shouldRepair=shouldLoop&&clip.seamlessLoop!==false;
            buffer=shouldRepair?repairLoopSeam(this.ctx,pcm,clip.loopStart??0,clip.loopEnd??pcm.duration):pcm;
            if(buffer!==pcm)repairs++;
          }
          const cost=buffer.length*buffer.numberOfChannels*4;
          if(!Number.isSafeInteger(cost)||cost<=0)throw new Error('Invalid decoded sample size');
          if(cost>this.maxBytes)throw new Error('Sample cache budget exceeded');
          const key=this.key(clip.id,clip.event,clip.variant);
          const prior=next.get(key);
          if(prior){next.delete(key);release(prior);indexRow(prior,false);changedEvents.add(`${prior.id}:${prior.event}`);}
          const row=Object.freeze({...clip,buffer,bytes:cost});
          next.set(key,row);acquire(row);indexRow(row,true);changedEvents.add(`${row.id}:${row.event}`);
          // New row fits the budget alone; evict from the original LRU head
          // until the staged bank fits, accounting for shared PCM identities.
          while(total>this.maxBytes&&next.size>1){
            const victim=next.keys().next().value;
            if(victim===key)break;
            const removed=next.get(victim);next.delete(victim);release(removed);indexRow(removed,false);changedEvents.add(`${removed.id}:${removed.event}`);
          }
          done++;
        }catch(e){if(e!==cancelled && current())errors.push({file:clip.file,id:clip.id,event:clip.event,error:String(e?.message||e)});}
        finally{
          this.pending--;
          // A shared decoded file remains live until its last manifest borrower
          // finishes, even if jobs run concurrently or one clip fails checksum.
          const left=remainingByFile.get(clip.file)-1;
          if(left===0){remainingByFile.delete(clip.file);decoded.delete(clip.file);const scope=scopes.get(clip.file);scope?.finish();this._loadScopes.delete(scope);scopes.delete(clip.file);}
          else remainingByFile.set(clip.file,left);
        }
      }
    });
    await Promise.all(jobs);
    // Last-request-wins. The old playback bank remains valid throughout network/decode.
    if(!current())return {loaded:0,rejected:errors.length,errors,cancelled:true,bytes:this.bytes};
    let byEvent;
    if(!replace){
      byEvent=new Map();
      // Keep the final Map's original event order, while retaining untouched
      // arrays and sorting only the events with actual row changes.
      for(const row of next.values()){
        const event=`${row.id}:${row.event}`;
        if(!byEvent.has(event))byEvent.set(event,changedEvents.has(event)?[]:this.byEvent.get(event)||[]);
        if(changedEvents.has(event))byEvent.get(event).push(row);
      }
      for(const event of changedEvents)byEvent.get(event)?.sort((a,b)=>a.variant-b.variant);
    }
    this.loaded=next;this._mruKey=null;this.bytes=total;
    if(byEvent)this.byEvent=byEvent;else this._reindex();
    this.errors=errors;this.repaired=repairs;
    this.manifest={targetVersion:manifest.targetVersion||null,usageRights:manifest.usageRights,source:manifest.source||null};
    this.source='user-supplied';
    return {loaded:done,rejected:errors.length,errors,cancelled:false,bytes:this.bytes,repairedLoops:repairs};
  }
  clear(){this.generation++;this.loaded.clear();this._mruKey=null;this.byEvent.clear();this.bytes=0;this.manifest=null;this.source='none';this.errors=[];this.repaired=0;this._cancelLoads();}
  stats(){return{source:this.source,clips:this.loaded.size,bytes:this.bytes,limitBytes:this.maxBytes,errors:this.errors.length,
    repairedLoops:this.repaired,pending:this.pending,rights:this.manifest?.usageRights||null,targetVersion:this.manifest?.targetVersion||null};}
}
