/**
 * Recorded 2022 Splatoon 3 player-impact / critical-hit / splat PCM.
 * Sources: public archival Google Drive "Splatoon 3 SFX and Music" 2022 dump.
 * Playback event routing is based on exposed source labels and public hit
 * behavior, NOT recovered Nintendo SLINK or confirmed retail 11.3.0 sequencing.
 * Each source is same-origin and SHA-256 checked. No procedural substitute.
 */
import { mainAudioSourceId } from './bank.mjs';
import { blasterHitCueKind } from './blaster-hit.mjs';

export const COMBAT_RECORDINGS=Object.freeze({
  hit:Object.freeze({file:'HitEf_Damage_00.mp3',sha256:'c4b6ac316315ee76f06392821db008334daf6f162e106347f164196ac64a85db',gain:.8}),
  critical:Object.freeze({file:'HitEf_CriticalHit_00.mp3',sha256:'5366114895aca376f4780aa1123d90a7c4542bcad24a464afc374f47f28169cd',gain:1}),
  splat:Object.freeze({file:'Pl_DeadSplash_00.mp3',sha256:'333f4c0f699adedb573b4bdf2b811bfa0c39b77330a69ced5f31c4a915d8ce1f',gain:.62}),
  bubble:Object.freeze({file:'Pl_DeadBubbleSplash_00.mp3',sha256:'8963d67e781c415a6247e0b7725e0c8f891dd313d4a98cceadadde566797e40c',gain:.37})
});
const NAMES=Object.keys(COMBAT_RECORDINGS);
const ID='combat:';
const INSTALLED=Symbol.for('inkwave.audio.recorded-combat-cues.2022.v1');
const sourceDir=new URL('./s3-real/',import.meta.url);

/**
 * Select a confirmation by the admitted damage event, not by arbitrary input.
 * An ordinary Charger half charge need not receive the iconic critical cue.
 * The actual projectile charge accompanies native and catalogue hit events.
 * Damage >=100 is a last-resort compatibility proxy only when the charge
 * metadata is genuinely missing; retail Nintendo SLINK is not yet audited.
 */
export function recordedHitCue({attacker,weaponId,damage,charge}={}){
  const id=mainAudioSourceId(weaponId||attacker?.weapon?.id);
  const charger=id==='charger'||typeof id==='string'&&id.startsWith('s3-charger-');
  const full=Number.isFinite(charge)?charge>=1-1e-6:Number.isFinite(damage)&&damage>=100;
  if(charger&&full)return 'critical';
  if(blasterHitCueKind(attacker,id)==='direct')return 'critical';
  return 'hit';
}

export function installRecordedCombatCues(Engine){
  const p=Engine?.prototype;
  if(!p||p[INSTALLED])return;
  p[INSTALLED]=true;
  p.recordedCueForHit=recordedHitCue;
  // One cache per AudioContext, not a download/decode for each hit.
  p.prepareRecordedCombatCues=function(){
    if(!this.ctx)this.init();
    if(!this.ctx||this.ctx.state==='closed')return Promise.reject(new Error('No active AudioContext for recorded combat cues'));
    const context=this.ctx;
    let state=this._recordedCombat;
    if(!state||state.ctx!==context)state=this._recordedCombat={ctx:context,buffers:new Map(),pending:null,error:null};
    if(NAMES.every(id=>state.buffers.has(id)))return Promise.resolve(state);
    if(state.pending)return state.pending;
    const fetcher=globalThis.fetch?.bind(globalThis);
    if(typeof fetcher!=='function')return Promise.reject(new Error('Window.fetch unavailable for recorded combat MP3'));
    const pending=Promise.all(NAMES.filter(id=>!state.buffers.has(id)).map(async id=>{
      const meta=COMBAT_RECORDINGS[id],url=new URL(meta.file,sourceDir);
      if(url.origin!==sourceDir.origin||url.pathname.indexOf('/s3-real/')<0)
        throw new Error('Unsafe source combat MP3');
      const res=await fetcher(url);
      if(!res?.ok)throw new Error(meta.file+' HTTP '+(res?.status??'failed'));
      const bytes=await res.arrayBuffer();
      if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<500||bytes.byteLength>1024*1024)
        throw new Error(meta.file+' invalid MP3 length');
      if(!globalThis.crypto?.subtle)throw new Error('SHA-256 crypto unavailable for recorded combat MP3');
      const sha=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
      if(sha!==meta.sha256)throw new Error(meta.file+' checksum mismatch');
      const buffer=await context.decodeAudioData(bytes.slice(0));
      if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>5)
        throw new Error(meta.file+' invalid decoded audio');
      if(this.ctx!==context)return;
      state.buffers.set(id,buffer);
    }));
    state.pending=pending.then(()=>{
      if(this.ctx!==context)throw new Error('AudioContext replaced while loading recorded combat cues');
      state.error=null;return state;
    },e=>{state.error=String(e?.message||e);throw e;}).finally(()=>{state.pending=null;});
    return state.pending;
  };
  p.playRecordedCombat=function(id,options={}){
    if(!NAMES.includes(id))return null;
    if(!this._recordedCombat?.buffers.has(id))return null; // never synthesize a fake hit
    return this.play(ID+id,{...options,priority:options.priority??(id==='critical'?97:72)});
  };
  const definition=p._def;
  p._def=function(name){
    if(typeof name==='string'&&name.startsWith(ID)){
      const id=name.slice(ID.length),row=COMBAT_RECORDINGS[id];
      const buffer=row&&this._recordedCombat?.ctx===this.ctx&&this._recordedCombat.buffers.get(id);
      if(!buffer)return null;
      return {
        gain:row.gain,priority:id==='critical'?97:70,max:14,jitter:0,
        minGap:id==='hit'?.028:.02,reverb:.03,ref:3,
        build(v){
          const source=v.ctx.createBufferSource();source.buffer=buffer;source.loop=false;source.playbackRate.value=1;
          source.connect(v.out);source.start(v.t,0);
          source._end=v.t+buffer.duration;v.nodes.push(source);v.srcs.push(source);v.end=Math.max(v.end,source._end);
        }
      };
    }
    return definition.call(this,name);
  };
  const disposal=p.disposeWeaponAudio;
  p.disposeWeaponAudio=function(...args){
    this._recordedCombat=null;
    return disposal?.apply(this,args);
  };
}
