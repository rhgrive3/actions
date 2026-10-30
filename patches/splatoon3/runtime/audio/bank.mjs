import { WEAPON_AUDIO, LOOP_EVENTS, mainAudioSourceId } from './weapon-recipes.mjs';
export { mainAudioSourceId } from './weapon-recipes.mjs';
import { KIT_AUDIO } from './kit-recipes.mjs';
import { COMBAT_AUDIO } from './combat-recipes.mjs';
import { SOURCE_EXTRA_AUDIO } from './source-cue-registry.mjs';
export const AUDIO_RECIPES=Object.freeze({...WEAPON_AUDIO,...KIT_AUDIO,...COMBAT_AUDIO,...SOURCE_EXTRA_AUDIO});
import { renderSound } from './render.mjs';
import { audioWorkerDeadline } from './worker-deadline.mjs';
export const MAIN_AUDIO_PREFIX='main:';
// Source-recorded MP3s always win. Only MAIN-weapon attack one-shots may use
// an explicitly authored INKWAVE fallback when the real sample is not resident.
export const mainAttackFallbackEligible=(id,event)=>typeof id==='string'&&!id.includes(':')&&/^fire(?:_[a-z0-9]+)?$/.test(event)&&!!WEAPON_AUDIO[mainAudioSourceId(id)]?.events.includes(event);
import { AuthorizedSamplePack } from './authorized-samples.mjs';
const MAX_BYTES=12*1024*1024;
// Recovery/retirement bounds, not audio timing or a measured device budget.
const WORKER_TIMEOUT_MS=20000, WORKER_IDLE_MS=10000;
export class WeaponSoundBank {
  constructor(ctx,{maxBytes=MAX_BYTES,workerFactory,realOnly=false,audibleShotFallback=false,workerTimeoutMs=WORKER_TIMEOUT_MS,workerIdleMs=WORKER_IDLE_MS}={}){this.realOnly=realOnly;this.audibleShotFallback=!!audibleShotFallback;this.ctx=ctx;this.maxBytes=Math.max(1024*1024,maxBytes);this.cache=new Map();this._proceduralMruKey=null;this.defs=new Map();this.roundRobin=new Map();this.bytes=0;this.hits=0;this.misses=0;this.evicted=0;this.jobs=[];this.pending=new Set();this.timer=null;this.disposed=false;this.workerFactory=workerFactory;this.worker=null;this.workerFailed=false;this.workerError=null;this.inFlight=null;this.generatedOffThread=0;this.workerDeadline=null;this.workerIdle=null;this.workerTimeoutMs=Number.isFinite(workerTimeoutMs)&&workerTimeoutMs>0?workerTimeoutMs:WORKER_TIMEOUT_MS;this.workerIdleMs=Number.isFinite(workerIdleMs)&&workerIdleMs>=0?workerIdleMs:WORKER_IDLE_MS;this.authorized=new AuthorizedSamplePack(ctx);}
  has(id,event='fire'){return !!AUDIO_RECIPES[mainAudioSourceId(id)]?.events.includes(event);}
  name(id,event='fire'){id=mainAudioSourceId(id);return this.has(id,event)?`${MAIN_AUDIO_PREFIX}${id}:${event}`:null;}
  get(id,event,variant=0){
    id=mainAudioSourceId(id);
    // Recording-only cues are source routes, not parameters for the PCM renderer.
    if(Object.hasOwn(COMBAT_AUDIO,id)||Object.hasOwn(SOURCE_EXTRA_AUDIO,id))throw new Error('Recorded-only cue cannot generate PCM: '+id+'/'+event);
    if(this.realOnly&&!(this.audibleShotFallback&&mainAttackFallbackEligible(id,event)))throw new Error('Procedural weapon audio disabled for non-main-shot events');
    const key=`${id}:${event}:${variant}`;let item=this.cache.get(key);
    if(item){if(this._proceduralMruKey!==key){this.cache.delete(key);this.cache.set(key,item);this._proceduralMruKey=key;}this.hits++;return item.buffer;}
    const recipe=AUDIO_RECIPES[id];if(!recipe||!this.has(id,event))throw new RangeError('Unknown main audio '+key);
    const pcm=renderSound(recipe,event,variant,this.ctx.sampleRate);this.misses++;return this._store(key,pcm);
  }
  _store(key,pcm){
    const found=this.cache.get(key);if(found)return found.buffer;
    const buffer=this.ctx.createBuffer(1,pcm.length,this.ctx.sampleRate);buffer.getChannelData(0).set(pcm);
    const bytes=pcm.byteLength;while(this.bytes+bytes>this.maxBytes&&this.cache.size){const first=this.cache.keys().next().value;this.bytes-=this.cache.get(first).bytes;this.cache.delete(first);if(this._proceduralMruKey===first)this._proceduralMruKey=null;this.evicted++;}
    if(bytes<=this.maxBytes){this.cache.set(key,{buffer,bytes});this._proceduralMruKey=key;this.bytes+=bytes;}return buffer;
  }
  _ensureWorker(){
    if(this.worker||this.workerFailed||typeof this.ctx.startRendering==='function')return this.worker;
    if(typeof Worker==='undefined'&&!this.workerFactory){this.workerFailed=true;return null;}
    try{
      const worker=this.worker=this.workerFactory?this.workerFactory():new Worker(new URL('./render-worker.js',import.meta.url),{name:'inkwave-audio-render'});
      worker.onmessage=({data})=>{
        const job=this.inFlight;if(this.disposed||this.worker!==worker||!job||data?.key!==job[3])return;
        if(!(data.pcm instanceof Float32Array)){this._failWorker(worker,data.error||'Invalid worker PCM');return;}
        try{if(!this.cache.has(job[3])){this._store(job[3],data.pcm);this.generatedOffThread++;}}
        catch(error){this._failWorker(worker,error);return;}
        this.workerDeadline?.();this.workerDeadline=null;
        this.inFlight=null;this.pending.delete(job[3]);this._pump();
      };
      worker.onerror=error=>this._failWorker(worker,error?.message||'Worker initialization failed');
    }catch(error){this.worker=null;this.workerFailed=true;this.workerError=String(error?.message||error);}
    return this.worker;
  }
  _releaseWorker(worker=this.worker){
    if(worker!==this.worker)return;
    this.workerDeadline?.();clearTimeout(this.workerIdle);
    this.workerDeadline=this.workerIdle=null;this.worker=null;
    if(worker){worker.onmessage=worker.onerror=null;worker.terminate();}
  }
  _failWorker(worker,error){
    if(this.disposed||this.worker!==worker)return;
    this.workerError=String(error?.message||error);this.workerFailed=true;
    const job=this.inFlight;this.inFlight=null;this._releaseWorker(worker);
    if(job)this.jobs.unshift(job);
    this._pump();
  }
  _retireIdleWorker(){
    if(!this.worker||this.inFlight||this.jobs.length||this.workerIdle!==null)return;
    const worker=this.worker;
    this.workerIdle=setTimeout(()=>{
      if(this.worker!==worker||this.disposed)return;
      this.workerIdle=null;
      if(!this.inFlight&&!this.jobs.length)this._releaseWorker(worker);
    },this.workerIdleMs);this.workerIdle.unref?.();
  }
  _pump(){
    if(this.disposed||this.inFlight||this.timer)return;
    const job=this.jobs.shift();if(!job){this._retireIdleWorker();return;}
    if(this.cache.has(job[3])){this.pending.delete(job[3]);this._pump();return;}
    clearTimeout(this.workerIdle);this.workerIdle=null;
    const worker=this._ensureWorker();
    if(worker){this.inFlight=job;try{worker.postMessage({id:job[0],event:job[1],variant:job[2],key:job[3],sampleRate:this.ctx.sampleRate});}
      catch(error){this._failWorker(worker,error);return;}
      // A late old-worker reply cannot complete a replacement owner's job.
      // A synchronous test Worker may already have finished during postMessage.
      if(this.worker===worker&&this.inFlight===job){
        this.workerDeadline=audioWorkerDeadline(()=>!this.disposed&&this.worker===worker&&this.inFlight===job,
          ()=>this._failWorker(worker,'Authored audio render worker timed out'),{timeoutMs:this.workerTimeoutMs});
      }
      return;}
    // Offline tests / unsupported worker environments retain a bounded fallback, never a frame loop.
    this.timer=setTimeout(()=>{
      this.timer=null;if(this.disposed)return;
      this.pending.delete(job[3]);
      try{this.get(...job.slice(0,3));}
      catch(error){this.workerError=String(error?.message||error);}
      finally{this._pump();}
    },8);
  }

  resolve(name){
    if(!name?.startsWith(MAIN_AUDIO_PREFIX))return null;
    if(this.defs.has(name))return this.defs.get(name);
    const sep=name.lastIndexOf(':'),id=mainAudioSourceId(name.slice(MAIN_AUDIO_PREFIX.length,sep)),event=name.slice(sep+1);
    // Canonical cache/decoded MP3 identity is the source base, never the kit skin.
    name=`${MAIN_AUDIO_PREFIX}${id}:${event}`;
    if(this.defs.has(name))return this.defs.get(name);
    if(!this.has(id,event))return null;
    if(Object.hasOwn(COMBAT_AUDIO,id)&&!this.authorized.byEvent.has(`${id}:${event}`))return null;
    // Strict deployment must never substitute a synthesized waveform, even if
    // an authorized file is still decoding, missing, or evicted from the LRU.
    if(this.realOnly&&!this.authorized.byEvent.has(`${id}:${event}`)&&!(this.audibleShotFallback&&mainAttackFallbackEligible(id,event)))return null;
    // HoldNoise is treated as a single onset/keep-reemerge cue, NOT the
    // continuous ascending Charger sound. A repeated transient cannot stand
    // in for an unverified retail charge-up soundscape.
    const chargerOnset=AUDIO_RECIPES[id]?.family==='charger'&&event==='charge';
    const bank=this,loop=LOOP_EVENTS.has(event)&&!chargerOnset;
    const build=(v,p,o={})=>{
      const serial=o.variant??(loop?0:bank.roundRobin.get(name)??0);
      // Keep the established three-way sequence for authored/short banks,
      // but include every resident recording when an event has four or more.
      const variants=Math.max(3,bank.authorized.byEvent.get(`${id}:${event}`)?.length||0);
      bank.roundRobin.set(name,(serial+1)%variants);
      const authorized=bank.authorized.pick(id,event,serial);
      if(!authorized&&bank.realOnly&&!(bank.audibleShotFallback&&mainAttackFallbackEligible(id,event)))throw new Error('Verified sample not resident: '+id+'/'+event);
      const buffer=authorized?.buffer||bank.get(id,event,Math.abs(Math.trunc(serial))%3),s=v.ctx.createBufferSource();
      const recordedChargerOnset=!!authorized&&chargerOnset;
      const recordedSpinnerMotor=!!authorized&&AUDIO_RECIPES[id]?.family==='splatling'&&['charge','spin'].includes(event);
      s.buffer=buffer;s.loop=loop;
      if(loop&&authorized?.loopStart!=null){s.loopStart=authorized.loopStart;s.loopEnd=authorized.loopEnd;}
      if(authorized&&authorized.gain!==1){const g=v.ctx.createGain();g.gain.value=authorized.gain;s.connect(g);g.connect(v.out);v.nodes.push(g);}else s.connect(v.out);
      // A recorded click stays at the recorded speed and retains its full
      // attack/decay. Do not pitch-sweep, stretch, stitch or endlessly loop it.
      s.playbackRate.value=(recordedChargerOnset||recordedSpinnerMotor)?1:Math.max(.3,Math.min(3,p));s.start(v.t,0);
      s._end=loop?Infinity:v.t+buffer.duration/s.playbackRate.value;
      v.nodes.push(s);v.srcs.push(s);v.end=Math.max(v.end,s._end);v.endless=loop;
      return {pitch(q,t){
        if(!recordedChargerOnset&&!recordedSpinnerMotor)s.playbackRate.setTargetAtTime(Math.max(.3,Math.min(3,q)),t,.035);
      }};
    };
    const d={gain:loop?.23:(event==='explosion'?.7:.68),max:16,jitter:loop?0:.008,minGap:['impact','shield_hit'].includes(event)?.024:event==='explosion'?.008:0,
      reverb:loop?.025:.055,ref:event==='explosion'?5:3,priority:event==='ready'?90:65,weaponId:id,event,
      ...(loop?{loop:build,oneShot:.65}:{build})};
    this.defs.set(name,d);return d;
  }
  // Newest local weapon is likely to fire first: prioritize its attack/charge buffers.
  // Keep worker jobs bounded even after rapid weapon switches or many remote actors.
  warm(id,{focus=true,events=null}={}){
    id=mainAudioSourceId(id);
    if(this.disposed||(Object.hasOwn(COMBAT_AUDIO,id)||Object.hasOwn(SOURCE_EXTRA_AUDIO,id))||(this.realOnly&&!this.audibleShotFallback)||!AUDIO_RECIPES[id])return;
    const priority=['fire','fire_full','fire_left','fire_alt','fire_vertical','ready'];
    const eventNames=AUDIO_RECIPES[id].events.filter(e=>!events||events.includes(e)).filter(e=>!this.realOnly||mainAttackFallbackEligible(id,e)).sort((a,b)=>{
      const pa=priority.indexOf(a),pb=priority.indexOf(b);
      return (pa<0?99:pa)-(pb<0?99:pb);
    });
    const urgent=[],ordinary=[];
    for(const e of eventNames)for(let v=0;v<3;v++){
      if(this.authorized.pick(id,e,v))continue;
      const key=`${id}:${e}:${v}`;if(this.cache.has(key)||this.pending.has(key))continue;
      if(this.pending.size>=256){
        if(!focus)continue;
        const last=this.jobs.findLastIndex(job=>job[0]!==id);
        if(last<0)continue;
        const old=this.jobs.splice(last,1)[0];this.pending.delete(old[3]);
      }
      this.pending.add(key);
      (focus&&priority.includes(e)?urgent:ordinary).push([id,e,v,key]);
    }
    if(focus&&urgent.length)this.jobs.unshift(...urgent);
    this.jobs.push(...ordinary);
    this._pump();
  }

  stats(){return{realOnly:this.realOnly,audibleShotFallback:this.audibleShotFallback,bytes:this.bytes,budget:this.maxBytes,entries:this.cache.size,hits:this.hits,misses:this.misses,evicted:this.evicted,pending:this.pending.size,generatedOffThread:this.generatedOffThread,worker:!!this.worker,workerFallback:this.workerFailed,workerError:this.workerError,authorized:this.authorized.stats()};}
  dispose(){this.disposed=true;this._releaseWorker();this.inFlight=null;if(this.timer)clearTimeout(this.timer);this.timer=null;this.jobs.length=0;this.pending.clear();this.cache.clear();this._proceduralMruKey=null;this.defs.clear();this.roundRobin.clear();this.bytes=0;this.authorized.clear();}
}
// A weak actor key prevents one player's firing/landing from suppressing another's.
const actors=new WeakMap();let nextActor=1;
export function audioEmitterKey(o={}){if(o.emitterId!=null)return String(o.emitterId);const a=o.actor;if(a&&typeof a==='object'){let id=actors.get(a);if(id===undefined){id=nextActor++;actors.set(a,id);}return 'actor'+id;}if(o.pos&&Number.isFinite(o.pos.x)&&Number.isFinite(o.pos.y)&&Number.isFinite(o.pos.z))return `cell:${Math.floor(o.pos.x/2)}:${Math.floor(o.pos.y/2)}:${Math.floor(o.pos.z/2)}`;return 'local';}
export function selectVictim(voices,incomingPriority){let result=null;for(const v of voices){if(v.v.dead||v.stolen)continue;if(!result||(v.priority??35)<(result.priority??35)||((v.priority??35)===(result.priority??35)&&v.t<result.t))result=v;}return result&&(result.priority??35)<=incomingPriority?result:null;}
