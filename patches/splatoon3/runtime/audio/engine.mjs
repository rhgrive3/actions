import { WeaponSoundBank, AUDIO_RECIPES, MAIN_AUDIO_PREFIX } from './bank.mjs';
import { RealS3SampleLoader } from './real-s3-loader.mjs';
import { blasterHitCuePitch } from './blaster-hit.mjs';
const INSTALLED=Symbol.for('inkwave.weapon-audio.engine.v1');

// Extends the existing mixer; its unlock, mute, compressor and spatial paths remain authoritative.
export function installWeaponAudioEngine(Engine){
  const p=Engine.prototype;if(p[INSTALLED])return;p[INSTALLED]=true;
  // Audio is instantiated when the real boot imports src/audio/audio.js. The
  // gameplay patch installs BEFORE Game assigns G.audio, so bind on Engine,
  // not to an early (null) global audio instance.
  p.blasterHitCuePitch=blasterHitCuePitch;
  // v10 defined resolveWeaponSound but never connected AudioEngine._def to it.
  // A real game call to playWeapon therefore always hit the legacy SFX registry.
  const originalDef=p._def;
  p._def=function(name){
    if(typeof name==='string'&&name.startsWith(MAIN_AUDIO_PREFIX))return this.resolveWeaponSound(name);
    return originalDef.call(this,name);
  };
  p.weaponBank=function(){if(!this.ctx)return null;if(!this._weaponBank||this._weaponBank.ctx!==this.ctx){
    this._weaponBank?.dispose();this._weaponBank=new WeaponSoundBank(this.ctx,{realOnly:true});
    this._realS3Loader=new RealS3SampleLoader(this._weaponBank);
  }return this._weaponBank;};
  p.resolveWeaponSound=function(name){return this.weaponBank()?.resolve(name)||null;};
  p.loadAuthorizedWeaponAudio=async function(manifest,options={}){if(!this.ctx)this.init();if(!this.ctx)throw new Error("Web Audio context not initialized; unlock with a user gesture first");return this.weaponBank().authorized.load(manifest,options);};
  p.prepareWeapon=function(id,{urgent=true}={}){
    if(!AUDIO_RECIPES[id])return;
    this._warmWeapons||=new Set();this._warmWeapons.add(id);
    if(this._warmWeapons.size>8)this._warmWeapons.delete(this._warmWeapons.values().next().value);
    this.weaponBank();this._realS3Loader?.ensure(id);
  };
  // Preserve the exact admitted projectile clock: never delay a missed one-shot.
  // Preload after a first cold miss; the following shots will use real samples.
  p.playWeapon=function(id,event='fire',options={}){
    const bank=this.weaponBank(),name=bank?.name(id,event);
    if(!name)return null;
    if(!bank.authorized.byEvent.has(`${id}:${event}`)){
      this._realS3Loader?.ensure(id,event);this._realAudioSuppressed=(this._realAudioSuppressed||0)+1;
      return null;
    }
    return this.play(name,{...options,priority:options.priority??(options.actor?.isLocal?88:64)});
  };
  p.loopWeapon=function(id,event,options={}){
    const bank=this.weaponBank(),name=bank?.name(id,event);
    if(!name)return null;
    if(bank.authorized.byEvent.has(`${id}:${event}`))return this.loop(name,options);
    // A loop can begin after its source is decoded, provided the effect still
    // exists. Returning a permanent silent handle here leaves special effects
    // muted for their entire lifetime in kit-runtime's active map.
    const context=this.ctx,loader=this._realS3Loader,engine=this;
    let stopped=false,failed=false,actual=null,currentOptions={...options};
    const handle={
      // A pending loop counts as active to avoid duplicate registration. A
      // failed fetch does not: active gameplay may retry after loader backoff.
      get playing(){return !stopped&&!failed&&(actual?actual.playing!==false:true);},
      set(update={}){if(stopped)return;currentOptions={...currentOptions,...update};actual?.set?.(update);},
      stop(fade=.15){if(stopped)return;stopped=true;actual?.stop?.(fade);actual=null;},
    };
    if(!loader){failed=true;return handle;}
    loader.ensure(id,event).then(()=>{
      if(stopped)return;
      if(engine.ctx!==context||engine._weaponBank!==bank||
         !bank.authorized.byEvent.has(`${id}:${event}`)){failed=true;return;}
      try{
        actual=engine.loop(name,currentOptions);
        if(!actual||actual.playing===false){actual=null;failed=true;}
      }catch{failed=true;actual=null;}
    }).catch(()=>{failed=true;/* Missing/unavailable remains silent. */});
    return handle;
  };
  const init=p.init;p.init=function(...args){const result=init.apply(this,args);
    if(this.ctx){this.weaponBank();for(const id of this._warmWeapons||[])this._realS3Loader?.ensure(id);}
    return result;
  };
  const stats=p.stats;p.stats=function(){const result=stats.call(this);for(const [key,list] of this.byName){if(!list.some(v=>!v.v.dead&&!v.stolen))this.byName.delete(key);}return {...result,weaponBank:this._weaponBank?.stats()||null,
    realS3Loader:this._realS3Loader?.stats()||null,realAudioSuppressed:this._realAudioSuppressed||0,baseLatencySeconds:this.ctx?.baseLatency??null,outputLatencySeconds:this.ctx?.outputLatency??null,
    latencyMeaning:'reported Web Audio components; not measured end-to-end input latency'};};
  p.disposeWeaponAudio=function(){this.stopAll(.02);this._weaponBank?.dispose();this._weaponBank=null;this._realS3Loader=null;this._warmWeapons?.clear();};
}
