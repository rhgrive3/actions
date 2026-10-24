import { WEAPON_AUDIO, fireArticulation } from './weapon-recipes.mjs';
import { mainAudioSourceId } from './bank.mjs';
import { installKitAudio } from './kit-runtime.mjs';
import { withBlasterSplashHit } from './blaster-hit.mjs';
import { sourceEventRoute, EXTRA_SPECIAL_ACTION_SOURCE } from './extra-source-routes.mjs';
const INSTALL=Symbol.for('inkwave.weapon-audio.runtime.v1');
// Exactly one runtime owns each admitted shot. The old native/catalogue
// family SFX never layer over real weapon audio or substitute missing MP3s.
const LEGACY_SHOT_NAME=/^shoot_(?:shooter|dualies|splatling|blaster|charger)$/;
function stopLegacyShotDoublePlay(audio){
  if(!audio||typeof audio.play!=='function'||audio.__iwRealShotGuard)return;
  const original=audio.play;
  audio.play=function(name,...args){
    if(typeof name==='string'&&LEGACY_SHOT_NAME.test(name))return null;
    return original.call(this,name,...args);
  };
  Object.defineProperty(audio,'__iwRealShotGuard',{value:true,configurable:true});
}
const finite3=p=>{if(!p)return false;const x=p.x,y=p.y,z=p.z;return Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z);};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function installWeaponAudioRuntime(api){
  const {G,on,Actor,WeaponRunner,Projectiles}=api,R=WeaponRunner.prototype;
  stopLegacyShotDoublePlay(G.audio);
  if(R[INSTALL])return R[INSTALL];
  // The direct body hit precedes _blastBurst; only the radius damage executed
  // *inside* the already-installed native burst is an indirect Blaster hit.
  // Keep the distinction scoped per actor without modifying hit/HP packets.
  const oldBurst=Projectiles?.prototype?._blastBurst;
  if(oldBurst)Projectiles.prototype._blastBurst=function(p,...args){
    if(p?.type!=='blast'||p.ghost)return oldBurst.call(this,p,...args);
    return withBlasterSplashHit(p.owner,()=>oldBurst.call(this,p,...args));
  };
  const unsubs=[],active=new Set(),obstruction=new WeakMap();
  const stateFor=r=>r._mainAudioState||=( {id:null,engine:null,loops:{},loopUpdates:{},wasReady:false,wasCharge:false,keepEmergePlayed:false,canopy:null,sBlastMode:null} );
  // One-shot spatial work runs only when the engine resolves a playable source.
  // Loop options stay eager: their pending handles may start after decoding.
  const deferredOcclusion=Symbol.for('inkwave.weapon-audio.resolve-occlusion'),deferredPosition=Symbol.for('inkwave.weapon-audio.occlusion-position');
  function resolveOcclusion(o){o.occlusion=occlusion(o.actor,o[deferredPosition]);}
  function occlusion(a,pos){
    const listener=G.camera?.position||G.local?.pos;
    if(!a?.isLocal&&a&&finite3(pos)&&finite3(listener)&&typeof G.physics?.los==='function'){
      let cached=obstruction.get(a);const now=G.time||0;
      if(!cached||now<cached.at||now-cached.at>=.1){let clear=true;try{clear=G.physics.los(listener,pos);}catch{}cached={at:now,value:clear?0:.78};obstruction.set(a,cached);}
      return cached.value;
    }
    return 0;
  }
  function options(a,pos=a?.pos,volume=1,defer=false){
    const local=!!a?.isLocal,o={actor:a,pos:local?undefined:finite3(pos)?pos:undefined,volume,priority:local?88:64,occlusion:defer?0:occlusion(a,pos)};
    if(defer){o[deferredOcclusion]=resolveOcclusion;o[deferredPosition]=pos;}
    return o;
  }
  function play(a,event,pos,volume=1,id=a?.weapon?.id){id=mainAudioSourceId(id);if(WEAPON_AUDIO[id]?.events.includes(event))return G.audio?.playWeapon?.(id,event,options(a,pos,volume,true));return null;}
  function stop(r){const s=r?._mainAudioState;if(!s)return;s.chargeRise?.stop?.(.04);s.chargeRise=null;for(const h of Object.values(s.loops))h?.stop(.04);s.loops={};s.wasCharge=s.wasReady=false;s.keepEmergePlayed=false;s.pending=false;s.canopy=null;s.sBlastMode=null;active.delete(r);}
  function keepLoop(r,event,enabled,pitch=1){if(!enabled&&!r?._mainAudioState?.loops[event])return;const s=stateFor(r),a=r.a,id=mainAudioSourceId(a?.weapon?.id);
    if(enabled&&WEAPON_AUDIO[id]?.events.includes(event)&&!!G.audio?.ctx&&G.audio.ctx.state!=='closed'){
      if(!s.loops[event]?.playing)s.loops[event]=G.audio?.loopWeapon?.(id,event,{...options(a,a.pos,.68),pitch});
      if(s.loops[event]){
        const update=s.loopUpdates[event] ||= {pos:undefined,pitch:1,volume:.68};
        update.pos=a.isLocal?undefined:a.pos;update.pitch=pitch;update.volume=.68;
        s.loops[event].set(update);
      }
      active.add(r);
    }else{ s.loops[event]?.stop(.06);delete s.loops[event];}
  }
  const listen=(event,fn)=>{const u=on?.(event,fn);if(typeof u==='function')unsubs.push(u);};
  listen('weapon:fire',e=>{
    const a=e?.actor,id=mainAudioSourceId(e?.weapon||a?.weapon?.id),r=WEAPON_AUDIO[id];
    if(!a||!r||a.alive===false)return;
    const articulation=fireArticulation(r,e);
    // Mark accepted shots during WeaponRunner.update. A charge interrupted by firing
    // must NOT play the separate cancel/release cue on top of its actual shot.
    const runner=a.weaponRunner;
    if(runner?._mainAudioState)runner._mainAudioState.firedThisUpdate=true;
    // The call is synchronous with the actual admitted projectile event, never with raw input.
    G.audio?.playWeapon?.(id,articulation,{...options(a,e.muzzle||a.pos,a.isLocal?.82:.68,true),variant:e.audioVariant});
  });
  // Source HoldNoise is a single onset, including the documented
  // full-charge-keep squid-to-kid return. Only replay on emergence when the
  // S3 gameplay owner *actually retained* the full charge (scopes/empty
  // charge/no-store weapons must not receive a phantom cue).
  listen('actor:form',e=>{
    const a=e?.actor,r=a?.weaponRunner;
    if(!r||WEAPON_AUDIO[mainAudioSourceId(a?.weapon?.id)]?.family!=='charger')return;
    const s=stateFor(r);
    // The actor:form event itself is an actual transition edge. Do not
    // retain a separate squid flag here: catalog WeaponRunner.update invokes
    // stop() on every squid frame, which resets transient audio state before
    // this kid-form event is emitted. Rely on the gameplay s3Stored identity.
    if(e.form!=='kid'||a.alive===false)return;
    // Native Actor._events emits form after WeaponRunner.update. Use the
    // surviving gameplay-owned store rather than assuming a particular
    // resurfaced flag value or an earlier event-dispatch order.
    const stored=r.s3Stored,scoped=WEAPON_AUDIO[mainAudioSourceId(a.weapon?.id)]?.scope===true||a.weapon?.scoped===true||a.weapon?.scopedCharge===true;
    // Goo Tuber can legally keep a partial charge; the real s3Stored owner,
    // not a fabricated full-only audio threshold, determines eligibility.
    if(!scoped&&Number.isFinite(stored?.charge)&&stored.charge>0&&!s.keepEmergePlayed){
      play(a,'charge',a.pos,a.isLocal?.55:.35);
      s.keepEmergePlayed=true;
    }
  });
  listen('weapon:dodge',e=>play(e?.actor,'dodge',e?.actor?.pos,.8));
  listen('weapon:impact',e=>{
    const id=mainAudioSourceId(e?.weapon||e?.weaponId),a=e?.actor||e?.owner;
    if(!WEAPON_AUDIO[id]||e.kind==='roll')return;
    const event=['burst','blast','explosion'].includes(e.kind)?'explosion':'impact';
    if(!WEAPON_AUDIO[id].events.includes(event))return;
    // Impacts always remain positional, including the local owner's distant hits.
    const o=options(a,e.pos,.55,true);o.pos=finite3(e.pos)?e.pos:undefined;o.priority=58;
    G.audio?.playWeapon?.(id,event,o);
  });
  listen('weapon:canopy',e=>play(e?.actor,e?.event,e?.pos,.72));
  listen('splatted',e=>stop(e?.victim?.weaponRunner));
  listen('match:state',e=>{if(e?.state!=='playing')for(const r of active)stop(r);});
  listen('actor:removed',e=>stop((e?.actor||e)?.weaponRunner));
  const oldReset=R.reset;R.reset=function(...args){stop(this);this._mainAudioState=null;return oldReset.apply(this,args);};
  const oldUpdate=R.update;
  R.update=function(dt,input,...rest){
    const a=this.a,s=stateFor(this),id=mainAudioSourceId(a?.weapon?.id);
    if(s.id!==id||s.engine!==G.audio){stop(this);s.id=id;s.engine=G.audio;s.preloadedKit=null;G.audio?.prepareWeapon?.(id,{urgent:!!a?.isLocal});if(a?.isLocal&&WEAPON_AUDIO[id]?.family==='charger')G.audio?.prewarmChargerChargeRise?.(a.weapon?.chargeTime);}
    // A selected kit may become available only after the user's first gesture
    // starts AudioContext. Preload the actual selected sub/special *events*
    // rather than decoding all 381 samples or warming every remote actor.
    const loader=G.audio?._realS3Loader,sub=a?.weapon?.sub,special=a?.weapon?.special;
    if(a?.isLocal&&loader&&G.audio?.ctx?.state!=='closed'){
    const kitKey=String(sub||'')+'|'+String(special||'');
    if(s.preloadedKit!==kitKey){
      s.preloadedKit=kitKey;
      for(const [kit,events] of [['sub:'+sub,['fire','explosion']],['special:'+special,['open','fire','explosion','ready','release','spin']]])
        for(const event of events){
          loader.ensure(kit,event).catch(()=>{});
          const extra=sourceEventRoute(kit,event);
          if(extra)loader.ensure(extra,'fire').catch(()=>{});
        }
      for(const [action,cue] of Object.entries(EXTRA_SPECIAL_ACTION_SOURCE))
        if(action.startsWith(special+':'))loader.ensure(cue,'fire').catch(()=>{});
    }
    }
    s.firedThisUpdate=false;
    const result=oldUpdate.call(this,dt,input,...rest);
    const recipe=WEAPON_AUDIO[id],isCharger=recipe?.family==='charger';
    // Native weapon runners also tick while submerged. Their audio wrapper
    // does not enter the catalog stop() branch, so explicitly clear the
    // previous charge edge without clearing the gameplay-owned saved charge.
    if(isCharger&&a?.form==='squid'){s.chargeRise?.stop?.(.04);s.chargeRise=null;s.wasCharge=false;s.wasReady=false;s.keepEmergePlayed=false;}
    // Fresh Charger charging has exactly one recorded onset; never start an
    // AudioBufferSource loop or a guessed per-frame pitch ramp.
    // Remote replicas own the onset in NetMatch._voices; do not also fire it
    // from WeaponRunner.update if a remote runner is ticked for prediction.
    if(isCharger&&a?.remote!==true&&a?.alive!==false&&a.form!=='squid'&&!a.specialActive&&!a.superJumpState){
      const nowCharging=!!this.charging;
      if(nowCharging&&!s.wasCharge&&!s.keepEmergePlayed){
        // The selected Splatune source excerpt ALREADY contains its own
        // mechanical onset followed by the ascending Charger tone. Play that
        // original at 1x with the exact measured source offset and length.
        // Never layer the old recorded HoldNoise click on top.
        s.chargeRise=G.audio?.playChargerChargeRise?.({
          volume:a.isLocal?.55:.28,
        })||null;
        if(s.chargeRise)active.add(this);
        else play(a,'charge',a.pos,a.isLocal?.55:.35); // if asset has not loaded
      }
      if(!nowCharging){
        s.chargeRise?.stop?.(.04);s.chargeRise=null;
        if(isCharger)active.delete(this);
      }
      if(!nowCharging&&!this.s3Stored)s.keepEmergePlayed=false;
      if(!a?.weapon?.catalogRecord)s.wasCharge=nowCharging;
    }
    // Other weapon families still own their true continuous loop events.
    if(!a?.weapon?.catalogRecord||a.remote)return result;
    if(!a.alive||a.form==='squid'||a.specialActive||a.superJumpState){stop(this);return result;}
    const r=WEAPON_AUDIO[id],c=this.catalogState;if(!r||!c)return result;
    if(r.sourceActor==='WeaponBlasterPrecision'){
      const mode=a.grounded?'long':'short';
      if(s.sBlastMode!==null&&mode!==s.sBlastMode)play(a,'mode_change',a.pos,.30);
      s.sBlastMode=mode;
    }
    const charging=!!this.charging,q=clamp(Number(this.charge)||0,0,1);
    if(!isCharger)keepLoop(this,'charge',charging,.66+q*.78);
    keepLoop(this,'spin',!!this.streaming,.94+clamp(Number(this.burstFrac)||0,0,1)*.25);
    keepLoop(this,'roll',!!this.rolling,.8+Math.min(1,Math.hypot(a.vel?.x||0,a.vel?.z||0)/8)*.25);
    if(charging&&q>=1&&!s.wasReady&&!s.keepEmergePlayed)play(a,'ready',a.pos,.7);
    if(s.wasCharge&&!charging&&!s.firedThisUpdate)play(a,'release',a.pos,.27);
    if(r.scope&&charging&&!s.wasCharge)play(a,'scope',a.pos,.26);
    if(c.pending&&!s.pending&&r.events.includes('windup'))play(a,'windup',a.pos,.55);
    s.pending=c.pending;s.wasReady=charging&&q>=1;s.wasCharge=charging;
    const canopy=c.canopy;
    if(canopy?.open&&!s.canopy?.open)play(a,'open',canopy.pos,.7);
    if(s.canopy?.open&&(!canopy?.open)&&!canopy?.launched)play(a,'close',a.pos,.6);
    if(canopy?.launched&&!s.canopy?.launched)play(a,'purge',canopy.pos,.75);
    if(canopy){const prior=s.canopy||(s.canopy={});prior.open=canopy.open;prior.launched=canopy.launched;}else s.canopy=null;
    return result;
  };
  const oldSet=Actor.prototype.setWeapon;
  Actor.prototype.setWeapon=function(id,...args){const r=oldSet.call(this,id,...args);G.audio?.prepareWeapon?.(this.weapon?.id,{urgent:!!this.isLocal});if(this.isLocal&&WEAPON_AUDIO[mainAudioSourceId(this.weapon?.id)]?.family==='charger')G.audio?.prewarmChargerChargeRise?.(this.weapon?.chargeTime);return r;};
  const kit=installKitAudio(api,{listen,options});
  const installed={version:1,weapons:Object.keys(WEAPON_AUDIO).length,dispose(){for(const u of unsubs)u();for(const r of active)stop(r);kit?.dispose();}};
  Object.defineProperty(R,INSTALL,{value:installed});return installed;
}
