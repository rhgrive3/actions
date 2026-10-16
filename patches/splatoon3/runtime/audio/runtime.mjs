import { WEAPON_AUDIO, fireArticulation } from './weapon-recipes.mjs';
import { installKitAudio } from './kit-runtime.mjs';
import { withBlasterSplashHit, blasterHitCuePitch } from './blaster-hit.mjs';
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
const finite3=p=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function installWeaponAudioRuntime(api){
  const {G,on,Actor,WeaponRunner,Projectiles}=api,R=WeaponRunner.prototype;
  if(G.audio) G.audio.blasterHitCuePitch=blasterHitCuePitch;
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
  const stateFor=r=>r._mainAudioState||=( {id:null,engine:null,loops:{},wasReady:false,wasCharge:false,canopy:null,sBlastMode:null} );
  function options(a,pos=a?.pos,volume=1){
    const local=!!a?.isLocal,listener=G.camera?.position||G.local?.pos;
    let occ=0;
    if(!local&&a&&finite3(pos)&&finite3(listener)&&typeof G.physics?.los==='function'){
      let cached=obstruction.get(a);const now=G.time||0;
      if(!cached||now<cached.at||now-cached.at>=.1){let clear=true;try{clear=G.physics.los(listener,pos);}catch{}cached={at:now,value:clear?0:.78};obstruction.set(a,cached);}
      occ=cached.value;
    }
    return {actor:a,pos:local?undefined:finite3(pos)?pos:undefined,volume,priority:local?88:64,occlusion:occ};
  }
  function play(a,event,pos,volume=1,id=a?.weapon?.id){if(WEAPON_AUDIO[id]?.events.includes(event))return G.audio?.playWeapon?.(id,event,options(a,pos,volume));return null;}
  function stop(r){const s=r?._mainAudioState;if(!s)return;for(const h of Object.values(s.loops))h?.stop(.04);s.loops={};s.wasCharge=s.wasReady=false;s.pending=false;s.canopy=null;s.sBlastMode=null;active.delete(r);}
  function keepLoop(r,event,enabled,pitch=1){const s=stateFor(r),a=r.a;
    if(enabled&&WEAPON_AUDIO[a.weapon.id]?.events.includes(event)&&!!G.audio?.ctx&&G.audio.ctx.state!=='closed'){
      if(!s.loops[event]?.playing)s.loops[event]=G.audio?.loopWeapon?.(a.weapon.id,event,{...options(a,a.pos,.68),pitch});
      s.loops[event]?.set({pos:a.isLocal?undefined:a.pos,pitch,volume:.68});active.add(r);
    }else{ s.loops[event]?.stop(.06);delete s.loops[event];}
  }
  const listen=(event,fn)=>{const u=on?.(event,fn);if(typeof u==='function')unsubs.push(u);};
  listen('weapon:fire',e=>{
    const a=e?.actor,id=e?.weapon||a?.weapon?.id,r=WEAPON_AUDIO[id];
    if(!a||!r||a.alive===false)return;
    const articulation=fireArticulation(r,e);
    // Mark accepted shots during WeaponRunner.update. A charge interrupted by firing
    // must NOT play the separate cancel/release cue on top of its actual shot.
    const runner=a.weaponRunner;
    if(runner?._mainAudioState)runner._mainAudioState.firedThisUpdate=true;
    // The call is synchronous with the actual admitted projectile event, never with raw input.
    G.audio?.playWeapon?.(id,articulation,{...options(a,e.muzzle||a.pos,a.isLocal?.82:.68),variant:e.audioVariant});
  });
  listen('weapon:dodge',e=>play(e?.actor,'dodge',e?.actor?.pos,.8));
  listen('weapon:impact',e=>{
    const id=e?.weapon||e?.weaponId,a=e?.actor||e?.owner;
    if(!WEAPON_AUDIO[id]||e.kind==='roll')return;
    const event=['burst','blast','explosion'].includes(e.kind)?'explosion':'impact';
    if(!WEAPON_AUDIO[id].events.includes(event))return;
    // Impacts always remain positional, including the local owner's distant hits.
    const o=options(a,e.pos,.55);o.pos=finite3(e.pos)?e.pos:undefined;o.priority=58;
    G.audio?.playWeapon?.(id,event,o);
  });
  listen('weapon:canopy',e=>play(e?.actor,e?.event,e?.pos,.72));
  listen('splatted',e=>stop(e?.victim?.weaponRunner));
  listen('match:state',e=>{if(e?.state!=='playing')for(const r of active)stop(r);});
  listen('actor:removed',e=>stop((e?.actor||e)?.weaponRunner));
  const oldReset=R.reset;R.reset=function(...args){stop(this);this._mainAudioState=null;return oldReset.apply(this,args);};
  const oldUpdate=R.update;
  R.update=function(dt,input,...rest){
    const a=this.a,s=stateFor(this),id=a?.weapon?.id;
    if(s.id!==id||s.engine!==G.audio){stop(this);s.id=id;s.engine=G.audio;s.preloadedKit=null;G.audio?.prepareWeapon?.(id,{urgent:!!a?.isLocal});}
    // A selected kit may become available only after the user's first gesture
    // starts AudioContext. Preload the actual selected sub/special *events*
    // rather than decoding all 381 samples or warming every remote actor.
    const loader=G.audio?._realS3Loader,sub=a?.weapon?.sub,special=a?.weapon?.special;
    const kitKey=String(sub||'')+'|'+String(special||'');
    if(a?.isLocal&&loader&&G.audio?.ctx?.state!=='closed'&&s.preloadedKit!==kitKey){
      s.preloadedKit=kitKey;
      for(const [kit,events] of [['sub:'+sub,['fire','explosion']],['special:'+special,['open','fire','explosion','ready']]])
        for(const event of events)loader.ensure(kit,event).catch(()=>{});
    }
    s.firedThisUpdate=false;
    const result=oldUpdate.call(this,dt,input,...rest);
    // Legacy runners own redirected loops themselves; the catalog runners lacked them.
    if(!a?.weapon?.catalogRecord||a.remote)return result;
    if(!a.alive||a.form==='squid'||a.specialActive||a.superJumpState){stop(this);return result;}
    const r=WEAPON_AUDIO[id],c=this.catalogState;if(!r||!c)return result;
    if(r.sourceActor==='WeaponBlasterPrecision'){
      const mode=a.grounded?'long':'short';
      if(s.sBlastMode!==null&&mode!==s.sBlastMode)play(a,'mode_change',a.pos,.30);
      s.sBlastMode=mode;
    }
    const charging=!!this.charging,q=clamp(Number(this.charge)||0,0,1);
    keepLoop(this,'charge',charging,.66+q*.78);
    keepLoop(this,'spin',!!this.streaming,.94+clamp(Number(this.burstFrac)||0,0,1)*.25);
    keepLoop(this,'roll',!!this.rolling,.8+Math.min(1,Math.hypot(a.vel?.x||0,a.vel?.z||0)/8)*.25);
    if(charging&&q>=1&&!s.wasReady)play(a,'ready',a.pos,.7);
    if(s.wasCharge&&!charging&&!s.firedThisUpdate)play(a,'release',a.pos,.27);
    if(r.scope&&charging&&!s.wasCharge)play(a,'scope',a.pos,.26);
    if(c.pending&&!s.pending&&r.events.includes('windup'))play(a,'windup',a.pos,.55);
    s.pending=c.pending;s.wasReady=charging&&q>=1;s.wasCharge=charging;
    const canopy=c.canopy;
    if(canopy?.open&&!s.canopy?.open)play(a,'open',canopy.pos,.7);
    if(s.canopy?.open&&(!canopy?.open)&&!canopy?.launched)play(a,'close',a.pos,.6);
    if(canopy?.launched&&!s.canopy?.launched)play(a,'purge',canopy.pos,.75);
    s.canopy=canopy?{open:canopy.open,launched:canopy.launched}:null;
    return result;
  };
  const oldSet=Actor.prototype.setWeapon;
  Actor.prototype.setWeapon=function(id,...args){const r=oldSet.call(this,id,...args);G.audio?.prepareWeapon?.(this.weapon?.id,{urgent:!!this.isLocal});return r;};
  const kit=installKitAudio(api,{listen,options});
  const installed={version:1,weapons:Object.keys(WEAPON_AUDIO).length,dispose(){for(const u of unsubs)u();for(const r of active)stop(r);kit?.dispose();}};
  Object.defineProperty(R,INSTALL,{value:installed});return installed;
}
