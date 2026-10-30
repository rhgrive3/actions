import { audioLoadDeadline } from './load-deadline.mjs';
import { WeaponSoundBank, AUDIO_RECIPES, MAIN_AUDIO_PREFIX, mainAudioSourceId } from './bank.mjs';
import { RealS3SampleLoader } from './real-s3-loader.mjs';
import { chargerRiseBuffer, playChargerRise, prewarmChargerRise, disposeChargerRise, usesChargerRise } from './charger-charge-rise.mjs';
import { blasterHitCuePitch } from './blaster-hit.mjs';
import { borrowedRecordedMainId, isBorrowedRecordedMain } from './borrowed-recorded-mains.mjs';
import { sourceEventRoute } from './extra-source-routes.mjs';
import { syncCatalogSpinnerCharge } from './spinner-charge-layer.mjs';
import { spinnerAudioIds, spinnerClipDefinition, spinnerPreload, spinnerReleaseCache } from './spinner-charge-clips.mjs';
import { spinnerChargeAudioLoop } from './spinner-charge-control.mjs';
import { usesStringerCharge, stringerChargeAudioLoop } from './stringer-charge-control.mjs';
import { installChargeAudioLifecycle, prewarmChargeCue } from './charge-audio-lifecycle.mjs';

const INSTALLED=Symbol.for('inkwave.weapon-audio.engine.v1');
const RECORDED_COMBAT_CUES=Object.freeze(['combat:critical','combat:damage','combat:ink_focus_normal','combat:ink_focus_strong','combat:splat']);

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
    if(typeof name==='string'&&name.startsWith(MAIN_AUDIO_PREFIX)){
      const pos=name.lastIndexOf(':'),mainId=mainAudioSourceId(name.slice(MAIN_AUDIO_PREFIX.length,pos));
      if(isBorrowedRecordedMain(mainId)){
        const source=borrowedRecordedMainId(mainId),event=name.slice(pos+1);
        // Even a direct play('main:unsourced:fire') may never generate PCM.
        if(!this.weaponBank()?.authorized.byEvent.has(source+':'+event))return null;
        return this.resolveWeaponSound(MAIN_AUDIO_PREFIX+source+':'+event);
      }
      return this.resolveWeaponSound(name);
    }
    return originalDef.call(this,name);
  };
  p.weaponBank=function(){if(!this.ctx)return null;if(!this._weaponBank||this._weaponBank.ctx!==this.ctx){
    this._warmCombatCueBank=null; // No strong hold on the previous AudioContext's decoded resources.
    this._weaponBank?.dispose();this._weaponBank=new WeaponSoundBank(this.ctx,{realOnly:true,audibleShotFallback:true});
    this._realS3Loader=new RealS3SampleLoader(this._weaponBank);
  }return this._weaponBank;};
  p.resolveWeaponSound=function(name){if(typeof name!=='string'||!name.startsWith(MAIN_AUDIO_PREFIX))return null;return this.weaponBank()?.resolve(name)||null;};
  p.loadAuthorizedWeaponAudio=async function(manifest,options={}){if(!this.ctx)this.init();if(!this.ctx)throw new Error("Web Audio context not initialized; unlock with a user gesture first");return this.weaponBank().authorized.load(manifest,options);};
  p.prepareWeapon=function(id,{urgent=true}={}){
    const requested=mainAudioSourceId(id),borrowed=isBorrowedRecordedMain(requested);
    id=borrowedRecordedMainId(requested);
    if(!AUDIO_RECIPES[id]||!urgent)return;
    // Remote bots must not block the iPad player's first shot behind an
    // unbounded serial MP3 decode queue. Admit the active local weapon first.
    this._warmWeapons||=new Set();this._warmWeapons.clear();this._warmWeapons.add(id);
    if(this._warmWeapons.size>8)this._warmWeapons.delete(this._warmWeapons.values().next().value);
    const bank=this.weaponBank();if(!bank)return;
    if(spinnerAudioIds.has(requested)&&typeof window!=='undefined')void spinnerPreload(this,requested).catch(()=>{});
    if(spinnerAudioIds.has(requested)||usesStringerCharge(requested))prewarmChargeCue(this);
    const ownerKey=id;
    if(this._prewarmId!==ownerKey||this._prewarmLoader!==this._realS3Loader){
      this._prewarmLoader?.cancelOwner?.(this._prewarmOwner);this._prewarmOwner={};this._prewarmId=ownerKey;this._prewarmLoader=this._realS3Loader;
    }
    const prewarmOwner=this._prewarmOwner;
    if(usesChargerRise(id))this.prewarmChargerChargeRise?.(id);
    this._warmPreparedContext=this.ctx;this._warmPreparedBank=bank;
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
      const main=loader?.ensure(id,isCharger?'charge':'fire',{priority:true,owner:prewarmOwner});
      if(isCharger)loader?.ensure(id,null,{owner:prewarmOwner});
      if(usesStringerCharge(requested))for(const event of ['charge','fire_full'])
        loader?.ensure(id,event,{owner:prewarmOwner});
      // Small original impact/hit/splat MP3s are shared by ALL weapons.
      // Preload only for the active local weapon, behind its main shot.
      // This never warms unrelated remote gunshots or authors fallback PCM.
      // Re-check only these five shared residents on explicit preparation.
      // LRU eviction or a failed first load must not leave a permanent "warm"
      // marker. Resident/in-flight/backoff/absent cues create no new requests.
      this._warmCombatCueBank=bank;
      const combat=[];
      for(const cue of RECORDED_COMBAT_CUES){
        if((loader?.isEventResident?.(cue,'fire') ?? bank.authorized.byEvent.has(cue+':fire')) || loader?.inFlight?.has(cue+':fire') ||
           loader?.retryPending?.(cue,'fire') || loader?.declares(cue,'fire')===false)continue;
        combat.push({id:cue,event:'fire'});
      }
      // Shared cues remain required and owner-independent. Two-event batches
      // overlap at most two decoders and leave the main priority request first.
      for(let i=0;i<combat.length;i+=2){
        const batch=combat.slice(i,i+2);
        if(loader?.ensureMany)loader.ensureMany(batch)?.catch(()=>{});
        else for(const cue of batch)loader?.ensure(cue.id,cue.event)?.catch(()=>{});
      }
      if(AUDIO_RECIPES[id].family==='splatling'){
        // 2022 Spinner sources have distinct Motor (charge) and MotorFire
        // (stream) recordings. Demand-page both while the loadout is active.
        for(const event of ['charge','spin'])if(bank.has(id,event))loader?.ensure(id,event,{owner:prewarmOwner});
      }
      main?.then(()=>{
        // Only weapons confirmed to lack a recorded base shot can be authored.
        // The existing Worker and 12 MiB LRU keep this off the game loop.
        if(this._weaponBank===bank&&this._prewarmOwner===prewarmOwner&&!borrowed&&loader?.declares(id,'fire')===false)
          bank.warm(id,{focus:true,events:['fire','fire_full','fire_alt','fire_left','fire_vertical']});
      }).catch(()=>{});
    }else this._realS3Loader?.ensure(id,'fire');
  };
  // The selected player's first shot must be an actual decoded recording.
  // Run from the START operation before the game becomes playable, while the
  // user-gesture audio unlock/fade is in progress. Never synthesize on failure.
  p.requireRecordedMainShot=async function(weaponId){
    const requested=mainAudioSourceId(weaponId),id=borrowedRecordedMainId(requested);
    const borrowed=isBorrowedRecordedMain(requested);
    if(!id)throw new Error('録音SEを確認するメインブキを特定できません');
    if(id.includes(':')||!AUDIO_RECIPES[id])return {ready:false,unrecorded:true,id};
    if(!this.ctx)this.init();
    const bank=this.weaponBank(),loader=this._realS3Loader;
    if(!bank||!loader)throw new Error('録音SEを再生するAudioContextを初期化できません');
    // A failed HTTP/decode cannot hold the game's loading transition forever.
    // This bound affects START only, never the actual projectile fire cadence.
    let timeoutId;
    let result;
    try{result=await Promise.race([
      loader.ensure(id,'fire',{priority:true}),
      new Promise((_,reject)=>{timeoutId=setTimeout(()=>reject(new Error('本家射撃MP3の読み込みが完了しません: '+id)),12000);})
    ]);}finally{clearTimeout(timeoutId);}
    const recorded=loader.declares(id,'fire');
    // Some modern catalogue weapons have no 2022 MP3. Their authored sound is
    // their only source, not a substitute for an existing recording.
    if(recorded===false){
      // ShooterNormal MP3 is part of the pinned source release. A missing or
      // incomplete manifest may never reinterpret it as an authored gunshot.
      if(borrowed)throw new Error('代用する2022年実録MP3が見つかりません: '+requested+' -> '+id);
      if(id==='shooter')throw new Error('スプラシューターの本家MP3が音源一覧にありません');
      return {ready:false,unrecorded:true,id};
    }
    if(recorded!==true)throw new Error('ブキ音源の一覧を読み込めません: '+id);
    if(!bank.authorized.byEvent.has(id+':fire')){
      const error=result?.errors?.[0]?.error||loader.errors?.at(-1)||'MP3をデコードできません';
      throw new Error('本家射撃MP3の準備に失敗しました: '+id+' ('+error+')');
    }
    // A playable charged weapon needs its charge/release recordings too.
    // Otherwise an immediate full shot falls back to the tap-shot recording.
    const family=AUDIO_RECIPES[id]?.family;
    const required=family==='charger'?['charge','ready','fire_full']:
      family==='splatling'?['charge','spin','ready']:family==='stringer'?['charge','fire_full']:[];
    const requiredRecordings=required.filter(event=>loader.declares(id,event)===true);
    if(requiredRecordings.length)await audioLoadDeadline(loader.ensureMany(requiredRecordings.map(event=>({id,event})),{priority:true}),12000);
    for(const event of requiredRecordings){
      if(!bank.authorized.byEvent.has(id+':'+event))
        throw new Error('本家チャージ・射撃MP3の準備に失敗しました: '+id+'/'+event);
    }
    // All Charger onsets use the selected Splat phrase. Admit START only after
    // its real buffer has decoded; a cold one-shot must not silently disappear.
    if(usesChargerRise(requested)&&!await chargerRiseBuffer(this.ctx,{retry:true}))
      throw new Error('チャージ音の録音を読み込めません。通信を確認してSTARTを押してください');
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
    // Require already-installed, source-recorded combat cues before the
    // first playable hit for every weapon. Lightweight audio is decoded once
    // into the shared bounded bank. Tests/operator packs that do not declare
    // these independent cues may still use their own isolated sound fixtures.
    // Batch only two shared events at a time, retaining an explicit residency
    // receipt for every cue even when the transaction partially succeeds.
    const combat=RECORDED_COMBAT_CUES.filter(cue=>loader.declares(cue,'fire')===true);
    for(let i=0;i<combat.length;i+=2){
      const batch=combat.slice(i,i+2);
      const row=await audioLoadDeadline(loader.ensureMany
        ?loader.ensureMany(batch.map(id=>({id,event:'fire'})),{priority:true})
        :Promise.all(batch.map(id=>loader.ensure(id,'fire',{priority:true}))).then(results=>({errors:results.flatMap(r=>r?.errors||[])})),12000);
      for(const cue of batch)if(!(loader.isEventResident?.(cue,'fire') ?? bank.authorized.byEvent.has(cue+':fire'))){
        const why=row?.errors?.find(error=>error.id===cue)?.error||row?.errors?.[0]?.error||loader.errors?.at(-1)||'source asset missing';
        throw new Error('本家命中・撃破SEを読み込めません: '+cue+' ('+why+')');
      }
    }
    // One small shared recorded cue must be resident before a very short
    // LACT first stage. Unknown/test manifests do not invent this source.
    if((spinnerAudioIds.has(requested)||usesStringerCharge(requested))&&loader.declares('charger','ready')===true)
      await audioLoadDeadline(loader.ensure('charger','ready',{priority:true}),12000);
    // Optional charge textures must never block START on slow/failed decode.
    // prepareWeapon already opportunistically warms the selected clip; its
    // native Motor fallback owns the sound until the texture is resident.
    return {ready:true,id,recording:'fire'};
  };
  const requireMain=p.requireRecordedMainShot;
  p.requireRecordedMainShot=function(...args){return audioLoadDeadline(requireMain.apply(this,args),20000,'Recorded audio START preparation timed out');};
  // Preserve the exact admitted projectile clock: never delay a missed one-shot.
  // Preload after a first cold miss; the following shots will use real samples.
  p.playWeapon=function(id,event='fire',options={}){
    const requested=mainAudioSourceId(id),borrowed=isBorrowedRecordedMain(requested);
    id=borrowedRecordedMainId(requested);
    const bank=this.weaponBank(),name=bank?.name(id,event);
    if(!name)return null;
    const loader=this._realS3Loader;
    const recorded=bank.authorized.byEvent.has(`${id}:${event}`);
    // An already-decoded native event always wins. Only route a confirmed
    // manifest-absent event to an explicitly registered source recording.
    // This keeps the original gameplay clock and never fabricates PCM.
    const fallback=sourceEventRoute(id,event);
    if(!recorded&&fallback&&loader?.declares(id,event)===false)
      return this.playWeapon(fallback,'fire',options);
    if(!recorded){
      // Never start a synthesized substitute for a known MP3. A cold fetch,
      // failed response, or LRU eviction may delay the real sample, but must
      // not change an already-recorded main's timbre into INKWAVE PCM.
      if(loader?.declares(id,event)===false)loader.notMapped?.add(`${id}:${event}`);
      else loader?.ensure(id,event);
      const mainAttack=!id.includes(':')&&/^fire(?:_[a-z0-9]+)?$/.test(event);
      // The S3 catalog can emit fire_full/fire_alt even when the 2022 source
      // only recorded fire (notably Spinners at full charge). Prefer the real
      // regular shot over a non-existent specialized synthesized sample.
      if(mainAttack&&event!=='fire'&&bank.has(id,'fire')){
        if(bank.authorized.byEvent.has(`${id}:fire`)){
          return this.play(bank.name(id,'fire'),{...options,priority:options.priority??(options.actor?.isLocal?88:64)});}
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
      // Family-borrowed sounds still require a real recorded AudioBuffer.
      // A manifest/HTTP failure may NEVER enable authored synthetic PCM.
      if(borrowed){this._realAudioSuppressed=(this._realAudioSuppressed||0)+1;return null;}
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
    id=borrowedRecordedMainId(mainAudioSourceId(id));
    const bank=this.weaponBank(),name=bank?.name(id,event);
    if(!name)return null;
    if(id.startsWith('special:')&&this._realS3Loader?.declares(id,event)===false)return null;
    if(bank.authorized.byEvent.has(`${id}:${event}`))return this.loop(name,options);
    // A loop can begin after its source is decoded, provided the effect still
    // exists. Returning a permanent silent handle here leaves special effects
    // muted for their entire lifetime in kit-runtime's active map.
    const context=this.ctx,loader=this._realS3Loader,engine=this;
    if(loader?.retryPending?.(id,event))return null;
    const requestOwner={};
    let stopped=false,failed=false,actual=null,currentOptions={...options};
    const handle={
      // A pending loop counts as active to avoid duplicate registration. A
      // failed fetch does not: active gameplay may retry after loader backoff.
      get playing(){return !stopped&&!failed&&(actual?actual.playing!==false||!!actual._sfxDeferred:true);},
      get _sfxDeferred(){return !stopped&&!failed&&!!actual?._sfxDeferred;},
      set(update={}){if(stopped)return;if(!actual)currentOptions={...currentOptions,...update};actual?.set?.(update);},
      stop(fade=.15){if(stopped)return;stopped=true;loader?.cancelOwner?.(requestOwner);actual?.stop?.(fade);actual=null;},
    };
    if(!loader){failed=true;return handle;}
    loader.ensure(id,event,{owner:requestOwner}).then(()=>{
      if(stopped)return;
      if(engine.ctx!==context||engine._weaponBank!==bank||
         !bank.authorized.byEvent.has(`${id}:${event}`)){failed=true;return;}
      try{
        actual=engine.loop(name,currentOptions);
        if(!actual||actual.playing===false&&!actual._sfxDeferred){actual?.stop?.(.04);actual=null;failed=true;}
      }catch{failed=true;actual=null;}
    }).catch(()=>{failed=true;/* Missing/unavailable remains silent. */});
    return handle;
  };
  p.syncSpinnerCharge=function(runner){ return syncCatalogSpinnerCharge(this,runner); };
  const init=p.init;p.init=function(...args){const result=init.apply(this,args);
    // Only selected Splat Charger loadouts request their separate rise clip.
    if(this.ctx&&this._warmWeapons?.size){
      const bank=this.weaponBank();
      if(this._warmPreparedContext!==this.ctx||this._warmPreparedBank!==bank){
        this._warmPreparedContext=this.ctx;this._warmPreparedBank=bank;
        // prepareWeapon updates the selected set; iterate a snapshot so a
        // re-added entry cannot keep the live Set iterator running forever.
        for(const id of [...this._warmWeapons])this.prepareWeapon(id,{urgent:true});
      }
    }
    return result;
  };
  const stats=p.stats;p.stats=function(){const result=stats.call(this);for(const [key,list] of this.byName){if(!list.some(v=>!v.v.dead&&!v.stolen))this.byName.delete(key);}return {...result,weaponBank:this._weaponBank?.stats()||null,
    realS3Loader:this._realS3Loader?.stats()||null,realAudioSuppressed:this._realAudioSuppressed||0,authoredFallbackShots:this._realAudioFallbackShots||0,baseLatencySeconds:this.ctx?.baseLatency??null,outputLatencySeconds:this.ctx?.outputLatency??null,
    latencyMeaning:'reported Web Audio components; not measured end-to-end input latency'};};
  p.disposeWeaponAudio=function(){spinnerReleaseCache(this);disposeChargerRise(this.ctx);this.stopAll(.02);this._weaponBank?.dispose();this._weaponBank=null;this._realS3Loader=null;this._warmPreparedContext=null;this._warmPreparedBank=null;this._warmCombatCueBank=null;this._warmWeapons?.clear();};
  p.prewarmChargerChargeRise=function(weaponId='charger',chargeTime=1){
    if(!this.ctx||!usesChargerRise(weaponId))return false;
    // Pre-stretch the Splat Charger recorded rise in an offline Worker,
    // without blocking actual gameplay or changing playback pitch.
    void prewarmChargerRise(this,{weaponId,chargeTime,retry:true}).catch(()=>{});
    return true;
  };
  p.playChargerChargeRise=function(options){
    try{return playChargerRise(this,options);}
    catch{return null;} // Silence the optional modeled rise if buffer creation fails.
  };
  const priorDef=p._def;
  p._def=function(name){
    if(typeof name==='string'&&name.startsWith('spinnerClip:'))
      return spinnerClipDefinition(this,name.slice('spinnerClip:'.length));
    return priorDef.call(this,name);
  };
  const previousLoop=p.loopWeapon;
  p.loopWeapon=function(id,event,options={}){
    const source=mainAudioSourceId(id);
    if(event==='charge'&&spinnerAudioIds.has(source))
      return spinnerChargeAudioLoop(this,source,options,()=>previousLoop.call(
        this,id,source==='s3-spinner-downpour'?'spin':'charge',options));
    if(event==='charge'&&usesStringerCharge(source))
      return stringerChargeAudioLoop(this,source,options,()=>previousLoop.call(this,id,event,options));
    return previousLoop.call(this,id,event,options);
  };
  installChargeAudioLifecycle(Engine);
}
