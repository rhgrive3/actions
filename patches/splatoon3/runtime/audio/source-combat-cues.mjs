// Two SHA-pinned, third-party comparison recordings, NOT verified Nintendo
// game event names. Local, repo-bundled MP3s. No synthesis or remote runtime URLs.
// 2026-10-19: exact mp3 hashes captured by user-requested reference collection.
const SOURCES=Object.freeze({
  direct:Object.freeze({
    file:'direct-hit-upload.mp3',
    sha256:'3001fbea582cc2c5b5b00f752d852eb36a637eaab185fd11b6107c3657a6e3d2',
    bytes:11136,
  }),
  chargerDirect:Object.freeze({
    file:'charger-hit-upload.mp3',
    sha256:'fd75c4c64a9153e4f3801299af9c1aae970c0c1818b5d4763a3a2b858e3b0487',
    bytes:17599,
  }),
});
const ROOT=new URL('../../../../assets/audio/combat/',import.meta.url);
const INSTALLED=Symbol.for('inkwave.combat.recorded-cues.v1');
const own=(map,key)=>Object.prototype.hasOwnProperty.call(map,key);

export const recordedCombatCueSource=cue=>SOURCES[cue]||null;
export function installRecordedCombatCues(Engine){
  const p=Engine.prototype;if(p[INSTALLED])return;
  Object.defineProperty(p,INSTALLED,{value:true});
  const state=function(){
    if(!this.ctx)return null;
    if(this._combatSamples?.ctx!==this.ctx){
      this._combatSamples={ctx:this.ctx,buffers:new Map(),pending:new Map(),errors:[]};
    }
    return this._combatSamples;
  };
  p.prepareCombatCue=function(type){
    if(!own(SOURCES,type))return Promise.reject(new RangeError('Unknown recorded cue'));
    if(!this.ctx)this.init();
    const s=state.call(this);if(!s)return Promise.reject(new Error('AudioContext unavailable'));
    if(s.buffers.has(type))return Promise.resolve(s.buffers.get(type));
    if(s.pending.has(type))return s.pending.get(type);
    const clip=SOURCES[type],engine=this;
    const job=(async()=>{
      const fetcher=globalThis.fetch?.bind(globalThis);
      if(!fetcher)throw new Error('fetch unavailable for recorded combat MP3');
      // Named filename from an immutable source index; no user-controlled URL.
      const response=await fetcher(new URL(clip.file,ROOT));
      if(!response?.ok)throw new Error('combat clip HTTP '+(response?.status??'?'));
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength!==clip.bytes)throw new Error('combat clip length mismatch');
      if(!globalThis.crypto?.subtle)throw new Error('SHA-256 unavailable');
      const hash=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),
        x=>x.toString(16).padStart(2,'0')).join('');
      if(hash!==clip.sha256)throw new Error('combat clip SHA mismatch');
      const decoded=await s.ctx.decodeAudioData(bytes.slice(0));
      if(s.ctx!==engine.ctx||s.ctx.state==='closed')throw new Error('AudioContext changed');
      if(!decoded||!Number.isFinite(decoded.duration)||decoded.duration<=0||decoded.duration>3)
        throw new Error('invalid combat audio buffer');
      s.buffers.set(type,decoded);
      return decoded;
    })();
    const tracked=job.catch(error=>{
      if(this._combatSamples===s){s.errors.push({cue:type,error:String(error?.message||error)});
        if(s.errors.length>8)s.errors.shift();}
      throw error;
    }).finally(()=>{if(s.pending.get(type)===tracked)s.pending.delete(type);});
    s.pending.set(type,tracked);return tracked;
  };
  p.prepareCombatCues=function(){
    // Run only once per decoded AudioContext, during ordinary START/loadout.
    // Avoid generating procedural substitute sound on load error.
    for(const type of Object.keys(SOURCES))this.prepareCombatCue(type).catch(()=>{});
  };
  p.combatCueStats=function(){
    const s=state.call(this);return s?{loaded:[...s.buffers.keys()],pending:[...s.pending.keys()],
      errors:s.errors.slice()}: {loaded:[],pending:[],errors:[]};
  };
  const def=p._def;
  p._def=function(name){
    if(typeof name==='string'&&name.startsWith('combat:')){
      const type=name.slice(7),buffer=state.call(this)?.buffers.get(type);
      if(!own(SOURCES,type)||!buffer)return null;
      return {gain:1,max:7,jitter:0,reverb:0.03,minGap:0.045,
        build(v){
          const src=v.ctx.createBufferSource();src.buffer=buffer;
          src.connect(v.out);src.start(v.t,0);
          src._end=v.t+buffer.duration;v.nodes.push(src);v.srcs.push(src);
          v.end=Math.max(v.end,src._end);
        }};
    }
    return def.call(this,name);
  };
  p.playRecordedCombatCue=function(type,options={}){
    if(!own(SOURCES,type))return null;
    const s=state.call(this);
    if(!s?.buffers.has(type)){
      this.prepareCombatCue(type).catch(()=>{});
      return null; // no invented or generated sample, no late duplicate voice
    }
    return this.play('combat:'+type,options);
  };
  const initialize=p.init;
  p.init=function(...args){
    const result=initialize.apply(this,args);
    if(this.ctx&&!this.offline)this.prepareCombatCues();
    return result;
  };
}
