import { WeaponSoundBank, AUDIO_RECIPES, MAIN_AUDIO_PREFIX, mainAudioSourceId } from './bank.mjs';
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
    this._weaponBank?.dispose();this._weaponBank=new WeaponSoundBank(this.ctx,{realOnly:true,audibleShotFallback:true});
    this._realS3Loader=new RealS3SampleLoader(this._weaponBank);
  }return this._weaponBank;};
  p.resolveWeaponSound=function(name){return this.weaponBank()?.resolve(name)||null;};
  p.loadAuthorizedWeaponAudio=async function(manifest,options={}){if(!this.ctx)this.init();if(!this.ctx)throw new Error("Web Audio context not initialized; unlock with a user gesture first");return this.weaponBank().authorized.load(manifest,options);};
  p.prepareWeapon=function(id,{urgent=true}={}){
    id=mainAudioSourceId(id);
    if(!AUDIO_RECIPES[id]||!urgent)return;
    // Remote bots must not block the iPad player's first shot behind an
    // unbounded serial MP3 decode queue. Admit the active local weapon first.
    this._warmWeapons||=new Set();this._warmWeapons.add(id);
    if(this._warmWeapons.size>8)this._warmWeapons.delete(this._warmWeapons.values().next().value);
    const bank=this.weaponBank();if(!bank)return;
    if(!id.includes(':')){
      const loader=this._realS3Loader;
      // Fetch the actual selected recording first. Generating synthetic PCM for
      // all 54 already-recorded mains before checking the manifest wastes CPU
      // and causes the perceptual "Splatling sounds synthesized" regression.
      // Charger hold noise must be resident before the player holds fire.
      // First fetch the very short charging loop, then batch the rest of the
      // selected weapon's actual source events (full shot and ready included).
      // The second request reuses the decoded hold buffer, rather than
      // serializing four separate event-specific fetch/decode transactions.
      const isCharger=AUDIO_RECIPES[id].family==='charger';
      const main=loader?.ensure(id,isCharger?'charge':'fire');
      if(isCharger)loader?.ensure(id);
      if(AUDIO_RECIPES[id].family==='splatling'){
        // 2022 Spinner sources have distinct Motor (charge) and MotorFire
        // (stream) recordings. Demand-page both while the loadout is active.
        for(const event of ['charge','spin'])if(bank.has(id,event))loader?.ensure(id,event);
      }
      main?.then(()=>{
        // Only weapons confirmed to lack a recorded base shot can be authored.
        // The existing Worker and 12 MiB LRU keep this off the game loop.
        if(this._weaponBank===bank&&loader?.declares(id,'fire')===false)
          bank.warm(id,{focus:true,events:['fire','fire_full','fire_alt','fire_left','fire_vertical']});
      }).catch(()=>{});
    }else this._realS3Loader?.ensure(id,'fire');
  };
  // The selected player's first shot must be an actual decoded recording.
  // Run from the START operation before the game becomes playable, while the
  // user-gesture audio unlock/fade is in progress. Never synthesize on failure.
  p.requireRecordedMainShot=async function(weaponId){
    const id=mainAudioSourceId(weaponId);
    if(!id)throw new Error('録音SEを確認するメインブキを特定できません');
    if(id.includes(':')||!AUDIO_RECIPES[id])return {ready:false,unrecorded:true,id};
    if(!this.ctx)this.init();
    const bank=this.weaponBank(),loader=this._realS3Loader;
    if(!bank||!loader)throw new Error('録音SEを再生するAudioContextを初期化できません');
    // Source hit/splat cues preload concurrently with the selected shot.
    const recordedCombatReady=this.prepareRecordedCombatCues?.();
    // A failed HTTP/decode cannot hold the game's loading transition forever.
    // This bound affects START only, never the actual projectile fire cadence.
    let timeoutId;
    let result;
    try{result=await Promise.race([
      loader.ensure(id,'fire'),
      new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error('本家射撃MP3の読み込みが完了しません: '+id)),12000);})
    ]);}finally{clearTimeout(timeoutId);}
    const recorded=loader.declares(id,'fire');
    // Some modern catalogue weapons have no 2022 MP3. Their authored sound is
    // their only source, not a substitute for an existing recording.
    if(recorded===false){
      // ShooterNormal MP3 is part of the pinned source release. A missing or
      // incomplete manifest may never reinterpret it as an authored gunshot.
      if(id==='shooter')throw new Error('スプラシューターの本家MP3が音源一覧にありません');
      return {ready:false,unrecorded:true,id};
    }
    if(recorded!==true)throw new Error('ブキ音源の一覧を読み込めません: '+id);
    if(!bank.authorized.byEvent.has(id+':fire')){
      const error=result?.errors?.[0]?.error||loader.errors?.at(-1)||'MP3をデコードできません';
      throw new Error('本家射撃MP3の準備に失敗しました: '+id+' ('+error+')');
    }
    // AudioContext can be temporarily suspended by the browser. The caller
    // must enter the game only after the selected recording and device are live.
    if(this.ctx.state&&this.ctx.state!=='running'){
      let wakeTimeout;
      try{
        const resumed=this.ctx.resume?.();
        if(resumed)await Promise.race([resumed,new Promise((_,reject)=>{
          wakeTimeout=setTimeout(()=>reject(new Error('音声出力の有効化が必要です。もう一度STARTを押してください')),4500);
        })]);
      }catch(error){throw new Error('音声出力を開始できません。再度STARTを押してください ('+String(error?.message||error)+')');}
      finally{clearTimeout(wakeTimeout);}
      if(this.ctx.state!=='running')throw new Error('音声出力が有効ではありません。もう一度STARTを押してください');
    }
    if(recordedCombatReady)await recordedCombatReady;
    return {ready:true,id,recording:'fire'};
  };
  // Preserve the exact admitted projectile clock: never delay a missed one-shot.
  // Preload after a first cold miss; the following shots will use real samples.
  p.playWeapon=function(id,event='fire',options={}){
    id=mainAudioSourceId(id);
    const bank=this.weaponBank(),name=bank?.name(id,event);
    if(!name)return null;
    const loader=this._realS3Loader;
    const recorded=bank.authorized.byEvent.has(`${id}:${event}`);
    if(!recorded){
      // Never start a synthesized substitute for a known MP3. A cold fetch,
      // failed response, or LRU eviction may delay the real sample, but must
      // not change an already-recorded main's timbre into INKWAVE PCM.
      loader?.ensure(id,event);
      const mainAttack=!id.includes(':')&&/^fire(?:_[a-z0-9]+)?$/.test(event);
      // The S3 catalog can emit fire_full/fire_alt even when the 2022 source
      // only recorded fire (notably Spinners at full charge). Prefer the real
      // regular shot over a non-existent specialized synthesized sample.
      if(mainAttack&&event!=='fire'&&bank.has(id,'fire')){
        if(bank.authorized.byEvent.has(`${id}:fire`))
          return this.play(bank.name(id,'fire'),{...options,priority:options.priority??(options.actor?.isLocal?88:64)});
        if(loader?.declares(id,'fire')===true)loader?.ensure(id,'fire');
      }
      const declared=loader?.declares(id,event);
      const hasBase=mainAttack&&event!=='fire'&&loader?.declares(id,'fire')===true;
      // This ShooterNormal MP3 is shipped in the pinned pack. An invalid
      // or incomplete manifest never authorizes synthesizing its gunshot.
      if(id==='shooter'){
        this._realAudioSuppressed=(this._realAudioSuppressed||0)+1;
        return null;
      }
      // Unknown manifest also fails closed. Only an explicit confirmation
      // that neither requested nor base real MP3 exists enables authored PCM.
      if(declared!==false||hasBase||!bank.audibleShotFallback||options.actor?.isLocal!==true||
         !bank.has(id,event)||!mainAttack){
        this._realAudioSuppressed=(this._realAudioSuppressed||0)+1;
        return null;
      }
      this._realAudioFallbackShots=(this._realAudioFallbackShots||0)+1;
    }
    return this.play(name,{...options,priority:options.priority??(options.actor?.isLocal?88:64)});
  };
  p.loopWeapon=function(id,event,options={}){
    id=mainAudioSourceId(id);
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
    if(this.ctx){for(const id of this._warmWeapons||[])this.prepareWeapon(id,{urgent:true});}
    return result;
  };
  const stats=p.stats;p.stats=function(){const result=stats.call(this);for(const [key,list] of this.byName){if(!list.some(v=>!v.v.dead&&!v.stolen))this.byName.delete(key);}return {...result,weaponBank:this._weaponBank?.stats()||null,
    realS3Loader:this._realS3Loader?.stats()||null,realAudioSuppressed:this._realAudioSuppressed||0,authoredFallbackShots:this._realAudioFallbackShots||0,baseLatencySeconds:this.ctx?.baseLatency??null,outputLatencySeconds:this.ctx?.outputLatency??null,
    latencyMeaning:'reported Web Audio components; not measured end-to-end input latency'};};
  p.disposeWeaponAudio=function(){this.stopAll(.02);this._weaponBank?.dispose();this._weaponBank=null;this._realS3Loader=null;this._warmWeapons?.clear();};
}
