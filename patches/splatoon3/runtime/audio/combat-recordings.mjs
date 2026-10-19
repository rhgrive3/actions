/**
 * Local, original 2022 Splatoon 3 combat feedback recordings.
 * Names are extracted resource labels, not proof of the complete S3 11.3.0
 * SLINK event tree or of redistribution rights. No guessed sound synthesis.
 *
 * All four MP3 assets are stored with the original shooter files under
 * patches/splatoon3/runtime/audio/s3-real/ and shipped by the Pages builder.
 */
export const COMBAT_CUE_SOURCES=Object.freeze({
  hit_marker: Object.freeze({
    file:'HitEf_Damage_00.mp3',
    sha256:'c4b6ac316315ee76f06392821db008334daf6f162e106347f164196ac64a85db',
    bytes:3805, gain:.76, priority:84
  }),
  s3_critical_hit: Object.freeze({
    file:'HitEf_CriticalHit_00.mp3',
    sha256:'5366114895aca376f4780aa1123d90a7c4542bcad24a464afc374f47f28169cd',
    bytes:16344, gain:.88, priority:92
  }),
  splat_enemy: Object.freeze({
    file:'Pl_DeadSplash_00.mp3',
    sha256:'333f4c0f699adedb573b4bdf2b811bfa0c39b77330a69ced5f31c4a915d8ce1f',
    bytes:55841, gain:.8, priority:94
  }),
  s3_splat_squid: Object.freeze({
    file:'Pl_DeadBubbleSplash_00.mp3',
    sha256:'8963d67e781c415a6247e0b7725e0c8f891dd313d4a98cceadadde566797e40c',
    bytes:33271, gain:.78, priority:94
  }),
});

const INSTALLED=Symbol.for('inkwave.audio.2022-combat-cues');
const EXPECTED_PATH=/^[A-Za-z0-9_]+\.mp3$/;
const MAX_FILE_BYTES=128*1024;
const FILE_ROOT=new URL('./s3-real/',import.meta.url);
const safeError=e=>String(e?.message||e||'unknown').slice(0,280);

/** Full-charge is a PROJECTILE property, not an inferred kill/damage threshold. */
export function isSourceCriticalHit({weaponId,charge,direct=true}={}){
  if(!direct||!Number.isFinite(charge)||charge<.999)return false;
  return typeof weaponId==='string' &&
    (weaponId==='charger'||/^s3-charger-/.test(weaponId)||/charger/i.test(weaponId));
}

export function installRecordedCombatAudio(AudioEngine){
  const p=AudioEngine.prototype;
  if(p[INSTALLED])return;
  Object.defineProperty(p,INSTALLED,{value:true});
  const originalDef=p._def;
  p._def=function(name){
    const spec=COMBAT_CUE_SOURCES[name];
    if(!spec)return originalDef.call(this,name);
    const state=this._s3CombatCues;
    // Known source, but not yet ready: NEVER synthesize a substitute.
    if(!state||state.context!==this.ctx)return null;
    const buffer=state.buffers.get(name);
    if(!buffer)return null;
    return {gain:spec.gain,max:8,jitter:0,minGap:.018,reverb:0,ref:3,priority:spec.priority,
      build(v){
        const source=v.ctx.createBufferSource();
        source.buffer=buffer;
        source.connect(v.out);
        source.start(v.t);
        source._end=v.t+buffer.duration;
        v.nodes.push(source);v.srcs.push(source);
        v.end=Math.max(v.end,source._end);
      }
    };
  };

  p.prepareRecordedCombatCues=function(){
    if(!this.ctx)return Promise.resolve({ready:false,reason:'no-audio-context'});
    if(!this._s3CombatCues||this._s3CombatCues.context!==this.ctx)
      this._s3CombatCues={context:this.ctx,buffers:new Map(),pending:null,errors:[]};
    const state=this._s3CombatCues,context=this.ctx;
    if(state.pending)return state.pending;
    const request=async([name,spec])=>{
      if(context.state==='closed'||this.ctx!==context)return;
      if(state.buffers.has(name))return;
      if(!EXPECTED_PATH.test(spec.file))throw Error('Invalid combat audio asset path');
      const fetcher=globalThis.fetch?.bind(globalThis);
      if(!fetcher)throw Error('fetch unavailable for combat samples');
      const response=await fetcher(new URL(spec.file,FILE_ROOT));
      if(!response?.ok)throw Error('HTTP '+(response?.status??'unknown')+' '+spec.file);
      const bytes=await response.arrayBuffer();
      if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==spec.bytes||bytes.byteLength>MAX_FILE_BYTES)
        throw Error('Invalid MP3 byte length '+spec.file);
      if(!globalThis.crypto?.subtle)throw Error('SubtleCrypto is required for source verification');
      const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
      const sum=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      if(sum!==spec.sha256)throw Error('MP3 checksum mismatch '+spec.file);
      const buffer=await context.decodeAudioData(bytes.slice(0));
      if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>5)
        throw Error('MP3 decoding rejected '+spec.file);
      if(this.ctx===context&&context.state!=='closed')state.buffers.set(name,buffer);
    };
    state.pending=(async()=>{
      state.errors.length=0;
      // Four clips total <110 KiB, decoded once per AudioContext, not per hit.
      const all=await Promise.allSettled(Object.entries(COMBAT_CUE_SOURCES).map(request));
      for(let i=0;i<all.length;i++)if(all[i].status==='rejected')
        state.errors.push(Object.keys(COMBAT_CUE_SOURCES)[i]+': '+safeError(all[i].reason));
      return {ready:state.buffers.size===Object.keys(COMBAT_CUE_SOURCES).length,
        decoded:state.buffers.size,errors:[...state.errors]};
    })().finally(()=>{state.pending=null;});
    return state.pending;
  };

  p.recordedCombatCueStats=function(){
    const s=this._s3CombatCues;
    return {loaded:s?.context===this.ctx?s.buffers.size:0,
      expected:Object.keys(COMBAT_CUE_SOURCES).length,
      loading:!!s?.pending,errors:s?.errors?.slice(-4)||[]};
  };
}
