import { WEAPON_AUDIO, LOOP_EVENTS, mainAudioSourceId } from './weapon-recipes.mjs';
export { mainAudioSourceId } from './weapon-recipes.mjs';
import { KIT_AUDIO } from './kit-recipes.mjs';
import { COMBAT_AUDIO } from './combat-recipes.mjs';
export const AUDIO_RECIPES=Object.freeze({...WEAPON_AUDIO,...KIT_AUDIO,...COMBAT_AUDIO});
import { renderSound } from './render.mjs';
export const MAIN_AUDIO_PREFIX='main:';
// Source-recorded MP3s always win. Only MAIN-weapon attack one-shots may use
// an explicitly authored INKWAVE fallback when the real sample is not resident.
export const mainAttackFallbackEligible=(id,event)=>typeof id==='string'&&!id.includes(':')&&/^fire(?:_[a-z0-9]+)?$/.test(event)&&!!WEAPON_AUDIO[mainAudioSourceId(id)]?.events.includes(event);
import { AuthorizedSamplePack } from './authorized-samples.mjs';
const MAX_BYTES=12*1024*1024;
export class WeaponSoundBank {
  constructor(ctx,{maxBytes=MAX_BYTES,workerFactory,realOnly=false,audibleShotFallback=false}={}){this.realOnly=realOnly;this.audibleShotFallback=!!audibleShotFallback;this.ctx=ctx;this.maxBytes=Math.max(1024*1024,maxBytes);this.cache=new Map();this.defs=new Map();this.roundRobin=new Map();this.bytes=0;this.hits=0;this.misses=0;this.evicted=0;this.jobs=[];this.pending=new Set();this.timer=null;this.disposed=false;this.workerFactory=workerFactory;this.worker=null;this.workerFailed=false;this.workerError=null;this.inFlight=null;this.generatedOffThread=0;this.authorized=new AuthorizedSamplePack(ctx);}
  has(id,event='fire'){return !!AUDIO_RECIPES[mainAudioSourceId(id)]?.events.includes(event);}
  name(id,event='fire'){id=mainAudioSourceId(id);return this.has(id,event)?`${MAIN_AUDIO_PREFIX}${id}:${event}`:null;}
  get(id,event,variant=0){
    id=mainAudioSourceId(id);
    if(this.realOnly&&!(this.audibleShotFallback&&mainAttackFallbackEligible(id,event)))throw new Error('Procedural weapon audio disabled for non-main-shot events');
    const key=`${id}:${event}:${variant}`;let item=this.cache.get(key);
    if(item){this.cache.delete(key);this.cache.set(key,item);this.hits++;return item.buffer;}
    const recipe=AUDIO_RECIPES[id];if(!recipe||!this.has(id,event))throw new RangeError('Unknown main audio '+key);
    const pcm=renderSound(recipe,event,variant,this.ctx.sampleRate);this.misses++;return this._store(key,pcm);
  }
  _store(key,pcm){
    const found=this.cache.get(key);if(found)return found.buffer;
    const buffer=this.ctx.createBuffer(1,pcm.length,this.ctx.sampleRate);buffer.getChannelData(0).set(pcm);
    const bytes=pcm.byteLength;while(this.bytes+bytes>this.maxBytes&&this.cache.size){const first=this.cache.keys().next().value;this.bytes-=this.cache.get(first).bytes;this.cache.delete(first);this.evicted++;}
    if(bytes<=this.maxBytes){this.cache.set(key,{buffer,bytes});this.bytes+=bytes;}return buffer;
  }
  _ensureWorker(){
    if(this.worker||this.workerFailed||typeof this.ctx.startRendering==='function')return this.worker;
    if(typeof Worker==='undefined'&&!this.workerFactory){this.workerFailed=true;return null;}
    try{
      this.worker=this.workerFactory?this.workerFactory():new Worker(new URL('./render-worker.js',import.meta.url),{name:'inkwave-audio-render'});
      this.worker.onmessage=({data})=>{
        const job=this.inFlight;if(this.disposed||!job||data?.key!==job[3])return;
        this.inFlight=null;this.pending.delete(job[3]);
        if(data.pcm instanceof Float32Array){if(!this.cache.has(job[3])){this._store(job[3],data.pcm);this.generatedOffThread++;}}
        else {this.workerError=data.error||'Invalid worker PCM';this.workerFailed=true;this.worker.terminate();this.worker=null;this.jobs.unshift(job);}
        this._pump();
      };
      this.worker.onerror=(error)=>{if(this.disposed)return;this.workerError=error?.message||'Worker initialization failed';this.workerFailed=true;this.worker?.terminate();this.worker=null;
        if(this.inFlight){this.jobs.unshift(this.inFlight);this.inFlight=null;}this._pump();};
    }catch(error){this.worker=null;this.workerFailed=true;this.workerError=String(error?.message||error);}
    return this.worker;
  }
  _pump(){
    if(this.disposed||this.inFlight||this.timer)return;
    const job=this.jobs.shift();if(!job)return;
    if(this.cache.has(job[3])){this.pending.delete(job[3]);this._pump();return;}
    const worker=this._ensureWorker();
    if(worker){this.inFlight=job;try{worker.postMessage({id:job[0],event:job[1],variant:job[2],key:job[3],sampleRate:this.ctx.sampleRate});}
      catch{this.inFlight=null;this.workerFailed=true;worker.terminate();this.worker=null;this.jobs.unshift(job);this._pump();}return;}
    // Offline tests / unsupported worker environments retain a bounded fallback, never a frame loop.
    this.timer=setTimeout(()=>{this.timer=null;if(this.disposed)return;this.pending.delete(job[3]);this.get(...job.slice(0,3));this._pump();},8);
  }

  resolve(name){
    if(!name?.startsWith(MAIN_AUDIO_PREFIX))return null;
    if(this.defs.has(name))return this.defs.get(name);
    const sep=name.lastIndexOf(':'),id=mainAudioSourceId(name.slice(MAIN_AUDIO_PREFIX.length,sep)),event=name.slice(sep+1);
    // Canonical cache/decoded MP3 identity is the source base, never the kit skin.
    name=`${MAIN_AUDIO_PREFIX}${id}:${event}`;
    if(this.defs.has(name))return this.defs.get(name);
    if(!this.has(id,event))return null;
    // Strict deployment must never substitute a synthesized waveform, even if
    // an authorized file is still decoding, missing, or evicted from the LRU.
    if(this.realOnly&&!this.authorized.byEvent.has(`${id}:${event}`)&&!(this.audibleShotFallback&&mainAttackFallbackEligible(id,event)))return null;
    const bank=this,loop=LOOP_EVENTS.has(event);
    const build=(v,p,o={})=>{
      const serial=o.variant??bank.roundRobin.get(name)??0;bank.roundRobin.set(name,(serial+1)%3);
      const authorized=bank.authorized.pick(id,event,serial);
      if(!authorized&&bank.realOnly&&!(bank.audibleShotFallback&&mainAttackFallbackEligible(id,event)))throw new Error('Verified sample not resident: '+id+'/'+event);
      const buffer=authorized?.buffer||bank.get(id,event,Math.abs(Math.trunc(serial))%3),s=v.ctx.createBufferSource();s.buffer=buffer;s.loop=loop;
      // Nintendo's 2022 Charger HoldNoise is a 0.235s (Bamboo/Pump: 0.340s)
      // recorded texture, NOT the synth oscillator the old native runner
      // ramps up to 2.5x. Preserve the recorded sample at original pitch.
      // Retail SLINK pitch automation is not verified; do not invent one.
      const sourceChargerHold=!!authorized&&AUDIO_RECIPES[id]?.family==='charger'&&event==='charge';
      // All four authentic short HoldNoise recordings are a static noise
      // texture. A permanent 1.0x loop cannot convey charging progress.
      // This is a deliberately bounded INKWAVE pitch *presentation* curve,
      // NOT a claim that Nintendo's private SLINK automation was recovered.
      // Use the actor's real admitted charge, not native/catalogue synth pitch
      // arguments (1..2.5 versus .66..1.44). No generated audio is mixed in.
      const sourceChargeRate=()=>{
        const progress=o.actor?.weaponRunner?.charge;
        if(!Number.isFinite(progress))return 1;
        return .94+.40*Math.max(0,Math.min(1,progress));
      };
      let sourceRate=sourceChargerHold?sourceChargeRate():null;
      if(loop&&authorized?.loopStart!=null){s.loopStart=authorized.loopStart;s.loopEnd=authorized.loopEnd;}
      if(authorized&&authorized.gain!==1){const g=v.ctx.createGain();g.gain.value=authorized.gain;s.connect(g);g.connect(v.out);v.nodes.push(g);}else s.connect(v.out);
      // Small playback variation is additional to independently rendered round-robin samples.
      s.playbackRate.value=sourceChargerHold?sourceRate:Math.max(.3,Math.min(3,p));s.start(v.t,0);
      s._end=loop?Infinity:v.t+buffer.duration/s.playbackRate.value;
      v.nodes.push(s);v.srcs.push(s);v.end=Math.max(v.end,s._end);v.endless=loop;
      return {pitch(q,t){
        if(sourceChargerHold){
          const next=sourceChargeRate();
          if(Math.abs(next-sourceRate)>.006){
            // Smooth the actual recorded sample's playback clock; no new
            // oscillator, noise generator, or per-frame PCM allocation.
            s.playbackRate.setTargetAtTime(next,t,.045);sourceRate=next;
          }
        }else s.playbackRate.setTargetAtTime(Math.max(.3,Math.min(3,q)),t,.035);
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
    if(this.disposed||(this.realOnly&&!this.audibleShotFallback)||!AUDIO_RECIPES[id])return;
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
  dispose(){this.disposed=true;this.worker?.terminate();this.worker=null;this.inFlight=null;if(this.timer)clearTimeout(this.timer);this.timer=null;this.jobs.length=0;this.pending.clear();this.cache.clear();this.defs.clear();this.roundRobin.clear();this.bytes=0;this.authorized.clear();}
}
// A weak actor key prevents one player's firing/landing from suppressing another's.
const actors=new WeakMap();let nextActor=1;
export function audioEmitterKey(o={}){if(o.emitterId!=null)return String(o.emitterId);const a=o.actor;if(a&&typeof a==='object'){if(!actors.has(a))actors.set(a,nextActor++);return 'actor'+actors.get(a);}if(o.pos&&[o.pos.x,o.pos.y,o.pos.z].every(Number.isFinite))return `cell:${Math.floor(o.pos.x/2)}:${Math.floor(o.pos.y/2)}:${Math.floor(o.pos.z/2)}`;return 'local';}
export function selectVictim(voices,incomingPriority){let result=null;for(const v of voices){if(v.v.dead||v.stolen)continue;if(!result||(v.priority??35)<(result.priority??35)||((v.priority??35)===(result.priority??35)&&v.t<result.t))result=v;}return result&&(result.priority??35)<=incomingPriority?result:null;}
