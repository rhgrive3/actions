// Runs after all existing gameplay, network and platform adapters.
// Locked upstream source is never changed. Anchors fail closed if upstream changes.
function once(code,from,to,label){if(!code.includes(from))throw new Error('audio adapter anchor: '+label);return code.replace(from,to);}
export function adaptWeaponAudio(rel,code){
  if(rel==='src/audio/audio.js'){
    code="import { TEX, texture } from '../../patches/splatoon3/runtime/audio/grain-texture.mjs';\nimport { prewarmGrainTextures, installGrainPrewarmCleanup } from '../../patches/splatoon3/runtime/audio/grain-prewarm.mjs';\nimport { ReverbPrewarm, installReverbPrewarmCleanup } from '../../patches/splatoon3/runtime/audio/reverb-prewarm.mjs';\nimport { connectOutputSafety, installFiniteAudioInputs } from '../../patches/splatoon3/runtime/audio/output-safety.mjs';\nimport { installWeaponAudioEngine } from '../../patches/splatoon3/runtime/audio/engine.mjs';\nimport { installAudioSpatialDsp } from '../../patches/splatoon3/runtime/audio/spatial-dsp.mjs';\nimport { audioEmitterKey, selectVictim } from '../../patches/splatoon3/runtime/audio/bank.mjs';\n"+code;
    const grainStart = code.indexOf('const TEX = {'), grainEnd = code.indexOf('/* ------------------------------------------------------------------------------------------------------------\n * Engine', grainStart);
    if (grainStart < 0 || grainEnd < grainStart) throw new Error('audio adapter anchor: shared grain implementation');
    code = code.slice(0, grainStart) + 'export { texture };\n\n' + code.slice(grainEnd);
    code=once(code, '  _warm() {', '  _warm() {\n    if (prewarmGrainTextures(this, () => this._warm())) return;', 'off-thread context-owned grain prewarm with original timers fallback');
    code=once(code, '    this.music = musicSingleton;', '    this.music = musicSingleton;\n    this._reverbPrewarm = new ReverbPrewarm();', 'start bounded speculative reverb preparation without creating/unlocking context');
    code=once(code, '    this.ctx = ctx;', '    this.ctx = ctx;\n    const preparedReverbs = this._reverbPrewarm?.take(ctx, this.opts.music !== false); this._reverbPrewarm = null;', 'accept only actual context sample rate');
    code=once(code, 'this.conv.buffer = makeImpulse(ctx, 1.5, 3.4, { pre: 0.012, seed: 3 });', 'this.conv.buffer = preparedReverbs?.[0] || makeImpulse(ctx, 1.5, 3.4, { pre: 0.012, seed: 3 });', 'ready SFX reverb or immediate original fallback');
    code=once(code, 'this.music._init(ctx, this.musicBus, { offline: this.offline });', 'this.music._init(ctx, this.musicBus, { offline: this.offline, impulse: preparedReverbs?.[1] });', 'independent ready music reverb');
    code=once(code,'hp.connect(glue); glue.connect(lim); lim.connect(ctx.destination);','hp.connect(glue); glue.connect(lim); this.outputSafety=connectOutputSafety(ctx,lim);','sample peak protection');
    code=once(code,'const d = SFX[name];','const d = this.resolveWeaponSound?.(name) || SFX[name];','definitions');
    code=once(code,'const t = Math.max(now, o.at ?? now) + (o.delay || 0);',`const t = Math.max(now, Number.isFinite(o.at) ? o.at : now) + Math.max(0, Number.isFinite(o.delay) ? o.delay : 0);
    const emitterKey = name + ':' + audioEmitterKey(o);
    const priority = Number.isFinite(o.priority) ? o.priority : (/^(ui_|match_|count|last_|special_ready|low_ink)/.test(name) ? 98 : (d.priority ?? 35));`,'scheduled time');
    code=code.replace('this.last.get(name)','this.last.get(emitterKey)').replace('this.last.set(name, t);',`// Commit emitter time only after a voice has been admitted and built.
    if(this.last.size>512)this.last.delete(this.last.keys().next().value);
    if(this.byName.size>128)for(const [key,rows] of this.byName){if(!rows.some(v=>!v.v.dead&&!v.stolen))this.byName.delete(key);}`).replace('this.byName.get(name)','this.byName.get(emitterKey)').replace('this.byName.set(name,','this.byName.set(emitterKey,');
    code=once(code,'list.push(voice); this.voices.push(voice);','this.last.set(emitterKey,t); if(this.last.size>512)this.last.delete(this.last.keys().next().value);\n    list.push(voice); this.voices.push(voice);','only successful one-shots commit min-gap timestamp');
    code=once(code,'while (this.voices.length >= MAX_VOICES) this._steal(this.voices.shift(), now);',`while (this.voices.length >= MAX_VOICES) {
        const victim=selectVictim(this.voices,priority);
        if(!victim){this.counts.dropped++;return null;}
        this.voices.splice(this.voices.indexOf(victim),1);this._steal(victim,now);
      }`,'voice allocation');
    code=once(code,'const voice = this._voice(d, t, o.pos, vol);',`const voice = this._voice(d, t, validPos(o.pos) ? o.pos : undefined, vol);
    voice.priority=priority;
    const obstruction=Math.min(1,Math.max(0,Number(o.occlusion)||0));
    voice.occlusion=obstruction;
    if(obstruction&&voice.lp){voice.lp.frequency.value=Math.min(voice.lp.frequency.value,22000*Math.pow(.055,obstruction));voice.vol*=1-obstruction*.38;voice.out.gain.value=voice.vol;}`,'spatial priority');
    code=once(code,'    if (this.loops.size >= MAX_LOOPS) this.loops.values().next().value.stop(0.05);',`    const priority = Number.isFinite(o.priority) ? o.priority : 35;
    if (this.loops.size >= MAX_LOOPS) {
      let victim = null;
      for (const h of this.loops) if (!victim || h.priority < victim.priority) victim = h;
      if (!victim || victim.priority > priority) { this.counts.dropped++; return NOOP_HANDLE; }
      victim.stop(0.05);
    }`,'loop priority admission before graph creation');
    code=once(code,'    let stopped = false;\n    const h = {\n      name,','    let stopped = false;\n    const h = {\n      name, priority,','retain live loop admission priority');
    code=once(code,
      '    fadeG.linearRampToValueAtTime(1, t + 0.06);\n    const fadeNow = (now) => Math.min(1, Math.max(0, (now - t) / 0.06));',
      '    const attack=Number.isFinite(o.fadeIn)?Math.max(.001,Math.min(.06,o.fadeIn)):.06;\n    fadeG.linearRampToValueAtTime(1,t+attack);\n    const fadeNow=(now)=>Math.min(1,Math.max(0,(now-t)/attack));',
      'short phase crossfades preserve recorded charge-cue attacks');
    code=once(code,
      'if (p.pitch != null && Number.isFinite(+p.pitch) && ctl.pitch) ctl.pitch(Math.max(0.05, +p.pitch), now);',
      'if (p.pitch != null && Number.isFinite(+p.pitch) && ctl.pitch) ctl.pitch(Math.max(d.progressControlled?0:0.05, +p.pitch), now);',
      'recorded charge can truly pause without changing other loop pitch admission');
    code=once(code,'export const audio = new AudioEngine();','installWeaponAudioEngine(AudioEngine);\ninstallAudioSpatialDsp(AudioEngine,distCut);\ninstallReverbPrewarmCleanup(AudioEngine);\ninstallGrainPrewarmCleanup(AudioEngine);\nexport const audio = new AudioEngine();','installation');
    // The platform layer wraps loop updates, so validate at the final public
    // boundary before either its dedupe state or the native mixer can change.
    code=once(code,'installAudioPlatform(AudioEngine);','installAudioPlatform(AudioEngine);\ninstallFiniteAudioInputs(AudioEngine);','finite inputs outside the platform loop wrapper');
  }
  if(rel==='src/game/weapons.js'){
    code=code.replace("emit('bomb:explode', { actor: b.owner,","emit('bomb:explode', { subId:b.s3Sub?.id||'bomb',actor:b.owner,");
    code=code.replace("emit('bomb:arm', { actor: b.owner,","emit('bomb:arm', { subId:b.s3Sub?.id||'bomb',actor:b.owner,");
    code=code.replace("type: 'blast', owner: a,", "type: 'blast', wid:w.id, owner: a,");
    code=code.replace("emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m, dir, hand });", "emit('weapon:fire', { actor:a,weapon:w.id,muzzle:m,dir,hand,mode:a.weaponRunner?.s3Turret||a.weaponRunner?.lockT>0?'turret':'normal' });");
    code=code.replace("emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone(), hand });", "emit('weapon:fire', { actor:a,weapon:w.id,muzzle:m.clone(),dir:dir.clone(),hand,mode:a.weaponRunner?.s3Turret||a.weaponRunner?.lockT>0?'turret':'normal' });");
    code=code.replace("weapon: w.id, projectileFirst,", "weapon:w.id,vertical:!!a.weaponRunner?.s3FlickVertical,projectileFirst,");

    code=code.replace(/emit\('weapon:impact', \{ pos: (_v|at|hit\.point|c),/g,"emit('weapon:impact', { actor:p.owner, weapon:p.wid, pos: $1,");
    code=code.replace("emit('weapon:impact', { pos: end,","emit('weapon:impact', { actor:a,weapon:w.id,pos:end,");
    code=code.replace(/G\.audio\?\.play\('bomb_throw'\s*,\s*\{[^{}]*\}\);/g,'void 0;');
    code=code.replace(/G\.audio\?\.play\('bomb_explode'\s*,\s*\{[^{}]*\}\);/g,'void 0;');
    // The weapon:fire event owns fire audio for local and remote actors. Keep game and VFX code intact.
    code=code.replace(/G\.audio\?\.play\('shoot_(?:shooter|dualies|splatling|blaster|charger)'\s*,\s*\{[^{}]*\}\);/g,'void 0;');
    code=code.replace(/G\.audio\?\.play\('blaster_boom'\s*,\s*(\{[^{}]*\})\);/g,"if(!G.audio?.weaponBank?.()?.realOnly&&!G.audio?.weaponBank?.()?.has(p.wid,'explosion'))G.audio?.play('blaster_boom',$1);");
    code=code.replace(/G\.audio\?\.play\('blaster_pump'\s*,\s*\{[^{}]*\}\);/g,'void 0;');
    code=code.replace(/G\.audio\?\.play\(snd\s*,\s*\{[^{}]*\}\);/g,'void 0;');
    code=code.replace(/G\.audio\?\.play\('dualies_roll'\s*,\s*\{[^{}]*\}\);/g,'void 0;');
    if(rel==='src/game/weapons.js'){
      // Charger onset is an authored-by-source one-shot owned by the shared
      // audio runtime state transition, NOT a looping legacy charger motor.
      // Keep its native charge state/timing untouched and leave no loop handle.
      code=once(code,
        "if (a.isLocal || a._nearCamera()) this.chargeLoop = G.audio?.loop('charger_charge', { pos: a.isLocal ? undefined : a.pos, volume: a.isLocal ? 0.55 : 0.35, pitch: 1 });",
        "this.chargeLoop = null;",
        'native Charger starts with no fake repeating onset');
    }
    for(const [old,event] of Object.entries({charger_charge:'charge',charger_full:'ready',roller_flick:'windup',roll:'roll',slosh_throw:'windup',splatling_wind:'windup',splatling_spin:'charge',splatling_ready:'ready'})){
      code=code.replace(new RegExp("G\\.audio\\?\\.(play|loop)\\('"+old+"',\\s*\\{",'g'),(_,method)=>`G.audio?.${method}Weapon?.(a.weapon.id, '${event}', { actor:a, `);
    }
    // The recorded motor's rate now follows the actual admitted charge, not a
    // fixed 2022 loop speed. The two Ready cues are owned by the loop wrapper:
    // suppress only the old local one-shot; leave its visual/rumble edge intact.
    code=once(code,
      "this.spinLoop?.set({ pitch: 0.6 + 0.85 * this.charge, pos });",
      "this.spinLoop?.set({ progress:this.charge, pos });",
      'local Splatling charge progress into shared audio');
    code=once(code,
      "if (a.isLocal) G.audio?.playWeapon?.(a.weapon.id, 'ready', { actor:a,  volume: 0.7 });\n        rumble(a, 0.05, 0.28, 60);",
      "/* Full-charge Ready is fired once by the recorded charge-loop stage owner. */\n        rumble(a, 0.05, 0.28, 60);",
      'local Splatling does not duplicate full-charge Ready');
    // Native Splatling keeps one loop handle through charging and streaming.
    // Its existing 'splatling_spin' starts during CHARGE, so play the sourced
    // motor-charge MP3 there. At the admitted release, change ownership to
    // MotorFire (spin) rather than continuing the charge motor or duplicating
    // the legacy procedural oscillator.
    code=once(code,
      "this.streaming = true; this.cooldown = 0; this.bloom = 0;",
      `this.streaming = true; this.cooldown = 0; this.bloom = 0;
      this.spinLoop?.stop(0.06);
      this.spinLoop = (a.isLocal || a._nearCamera())
        ? G.audio?.loopWeapon?.(w.id, 'spin', {actor:a,pos,volume:a.isLocal?0.6:0.4,pitch:1.5})
        : null;`,
      'native Splatling motor phase transition');
  }
  if(rel==='src/net/netmatch.js'){
    code="import { usesChargerRise } from '../../patches/splatoon3/runtime/audio/charger-charge-rise.mjs';\n"+code;
    // A first remote charge is an edge-triggered one-shot. Starting the fetch
    // at that edge is too late for a cold AudioContext, and the edge cannot be
    // replayed without inventing a second onset. Prepare only actual remote
    // Charger roster members as soon as their weapon identity is available.
    code=once(code,
      '    a.remote = a.owner !== this.myId;',
      '    a.remote = a.owner !== this.myId;\n    if (a.remote && usesChargerRise(a.weapon?.id)) G.audio?.prewarmChargerChargeRise?.(a.weapon.id,a.weapon.chargeTime);',
      'prewarm remote Charger rise when roster actor is set up');
    code=code.replace(/G\.audio\?\.play\('dualies_roll'\s*,\s*\{[^{}]*\}\);/g,'void 0;');
    // Network-owned Charger begins at the observed charge edge. Do not create
    // a repeating remote HoldNoise. Preserve Splatling/Roller loop handling.
    // Added Chargers retain kind=catalog; only their declared Charger behavior
    // joins this onset route. Other catalogue families keep their existing audio.
    code=once(code,
      "let h = this._voiceLoop(a, near, 'charge', wr.charging && k === 'charger', 'charger_charge');\n      if (h) h.set({ pos: a.pos, volume: 0.35, pitch: 1 + wr.charge * 1.5 });",
      "if (a.net.loops?.charge) { a.net.loops.charge.stop?.(.05); a.net.loops.charge=null; }\n      const chargerStarting = wr.charging && (k === 'charger' || k === 'catalog' && a.weapon.behaviorKind === 'charger');\n      if (chargerStarting && !a.net._chargerOnsetActive && near) { const wid=a.weapon.id,chargeTime=a.weapon.chargeTime; G.audio?.prewarmChargerChargeRise?.(wid,chargeTime); a.net._chargerRise = usesChargerRise(wid)?G.audio?.playChargerChargeRise?.({volume:.28,pos:a.pos,weaponId:wid,chargeTime,progress:wr.charge})||null:null; }\n      if ((!chargerStarting || !near) && a.net._chargerRise) { a.net._chargerRise.stop(.04); a.net._chargerRise=null; }\n      if(chargerStarting)a.net._chargerRise?.set?.({progress:wr.charge,pos:a.pos});\n      a.net._chargerOnsetActive = chargerStarting;\n      let h;",
      'network Charger onset is a one-shot, never a remote loop');
    code=once(code,
      "_stopLoops(a) { const L = a.net?.loops; if (L) for (const k in L) { L[k]?.stop?.(0.05); L[k] = null; } }",
      "_stopLoops(a) { a.net?._chargerRise?.stop?.(.04); if(a.net){a.net._chargerRise=null;a.net._chargerOnsetActive=false;} const L = a.net?.loops; if (L) for (const k in L) { L[k]?.stop?.(0.05); L[k] = null; } }",
      'remote Charger rise releases on replication disposal');
    // A remote spinner has two separate recorded motor phases. Do not keep
    // MotorFire alive during charging, and do not invoke old splatling_spin.
    code=once(code,
      "h = this._voiceLoop(a, near, 'spin', (wr.charging || wr.streaming) && k === 'splatling', 'splatling_spin');\n      if (h) h.set({ pos: a.pos, volume: 0.4, pitch: wr.streaming ? 1.5 : 0.6 + 0.85 * wr.charge });",
      "const isSpinner = k === 'splatling' || (k === 'catalog' && (a.weapon.behaviorKind === 'splatling' || a.weapon.catalogRecord?.family === 'splatling')) || a.weapon.id?.startsWith('s3-spinner-');\n      h = this._voiceLoop(a, near, 'spinnerCharge', isSpinner && wr.charging && !wr.streaming, 'splatling_spin');\n      if (h) h.set({ pos: a.pos, volume: 0.4, progress: wr.charge });\n      h = this._voiceLoop(a, near, 'spin', isSpinner && wr.streaming, 'splatling_spin');\n      if (h) h.set({ pos: a.pos, volume: 0.4 });",
      'remote Spinner charges with Motor and streams with MotorFire, never one sustained old motor');
    code=once(code,
      "      h = this._voiceLoop(a, near, 'roll',",
      "      const isBow = a.weapon.catalogRecord?.family === 'stringer' || a.weapon.behaviorKind === 'stringer' || a.weapon.id?.startsWith('s3-stringer-');\n      const chargeAudible = near && a.form !== 'squid' && !a.specialActive && !a.superJumpState;\n      h = this._voiceLoop(a, chargeAudible, 'bowCharge', isBow && wr.charging, 'charger_charge');\n      if(h)h.set({pos:a.pos,volume:.4,progress:wr.charge});\n      h = this._voiceLoop(a, near, 'roll',",
      'remote Stringers own one progress-aware recorded charge loop');
    code=code.replace("isSpinner && wr.charging && !wr.streaming", "isSpinner && wr.charging && !wr.streaming && a.form !== 'squid' && !a.specialActive && !a.superJumpState");
    code=code.replace("isSpinner && wr.streaming,", "isSpinner && wr.streaming && !a.specialActive && !a.superJumpState,");
    code=once(code, "    const L = a.net.loops;", "    const L = a.net.loops;\n    if(L[key]?.playing===false){L[key].stop?.(.02);L[key]=null;}", 'failed replica loops can recover');
    code=code.replace("G.audio?.loop?.(snd, { pos: a.pos, volume: 0 })", "G.audio?.loopWeapon?.(a.weapon.id, key==='bowCharge'?'charge':key==='spinnerCharge'?'charge':key==='spin'?'spin':'roll', {actor:a,pos:a.pos,volume:0,progress:a.weaponRunner.charge})");
    code=code.replace("G.audio?.play('roller_flick', { pos, volume: 0.8 })","G.audio?.playWeapon?.(a.weapon.id,'windup',{actor:a,pos,volume:.8})");
    code=code.replace("G.audio?.play('slosh_throw', { pos, volume: 0.55 })","G.audio?.playWeapon?.(a.weapon.id,'windup',{actor:a,pos,volume:.55})");
  }
  if(rel==='src/game/weapons.js'){
    // Keep the locked upstream's argument ABI intact: runtime Slosher and
    // host/owner wrappers do not forward a sixth positional argument.
    code=once(code,
      "if (victim) { len = victim.d; this.applyHit(a, victim.e, dmg, 'charger'); }",
      `if (victim) { len = victim.d;
      const oldHitAudio=a._sourceChargerAudioHit;
      a._sourceChargerAudioHit={chargerDirect:true,charge};
      try{this.applyHit(a,victim.e,dmg,'charger');}
      finally{a._sourceChargerAudioHit=oldHitAudio;}
    }`,
      'native admitted Charger shot sound metadata');
    code=once(code,
      "emit('hit', { attacker, victim, damage: dmg, killed, weaponId });",
      "emit('hit', { attacker, victim, damage: dmg, killed, weaponId, hitMeta:attacker?._sourceChargerAudioHit??null });",
      'admitted hit carries transient original-charge sound hint');
    code=once(code,
      "G.audio.play('ink_hit_body', { pos: _vh, volume: (victim.isLocal ? 0.3 : 0.4) + Math.min(0.45, dmg / 260), pitch: dmg >= 60 ? 0.8 : 1.05 });",
      "if (!attacker?.isLocal) " +
      "G.audio.play('ink_hit_body', { pos: _vh, volume: (victim.isLocal ? 0.3 : 0.4) + Math.min(0.45, dmg / 260), pitch: dmg >= 60 ? 0.8 : 1.05 });",
      'do not double-play authored body hit over source Charger cue');
  }
  if(rel==='src/main.js'){
    code=once(code,
      "    const hs = alive ? Math.hypot(a.vel.x, a.vel.z) : 0;\n    want('swim', alive && a.anim.form === 'swim' && hs > 0.5, Math.min(0.6, hs / 11.8 * 0.6 + 0.08), 0.6 + Math.min(1, hs / 11.8));",
      "    const swimming = alive && a.anim.form === 'swim';\n    if (swimming || L.swim) {\n      const hs = alive ? Math.hypot(a.vel.x, a.vel.z) : 0;\n      want('swim', swimming && hs > 0.5, Math.min(0.6, hs / 11.8 * 0.6 + 0.08), 0.6 + Math.min(1, hs / 11.8));\n    }",
      'skip inactive swim sound math while preserving its fading handle');
    code=once(code,
      'G.audio = audioMod.audio; G.music = musicMod.music;',
      "G.audio = audioMod.audio; G.music = musicMod.music; if (G.music) G.music.onFileError = () => this.menus?.toast?.(this.settings?.lang === 'en' ? 'Jet Arrow could not play. Check your connection or audio settings. No substitute music will play.' : 'Jet Arrowを再生できません。通信・音声設定を確認してください。旧BGMには切り替えません。', { kind: 'error', ms: 7000 });",
      'visible Jet Arrow error without old-BGM fallback');
    code="import { claimPreloadedMusic, cancelPreloadedMusic } from '../patches/splatoon3/runtime/audio/music-preload-owner.mjs';\n" +
         "import { sourceChargerHitCue } from '../patches/splatoon3/runtime/audio/combat-hit-classifier.mjs';\n" +
         "import { blasterHitCueKind } from '../patches/splatoon3/runtime/audio/blaster-hit.mjs';\n"+code;
    code=once(code,'prepareMatch: () => self._prepareGyro(),',
      'prepareMatch: () => { G.audio?.init?.(); self._applyAudioVolumes(); if(self.menus?._setup?.mode!==\'boss\') G.music?.preloadFile?.(\'battle\',{prime:true}); G.audio?.prepareWeapon?.(self.profile.weapon||\'shooter\',{urgent:true}); self._prepareGyro(); },',
      'iPad start tap initializes audio and warms the selected recorded shot before screen wipe');
    // Loadout changes occur in the real menu, well before the shooting clock.
    // The 2022 shooter MP3 is demand-paged on that user gesture, not first
    // discovered by the shot that is supposed to play it.
    code=once(code,
      "self.profile.weapon = weapon; saveJSON('inkwave.profile', self.profile);",
      "self.profile.weapon = weapon; saveJSON('inkwave.profile', self.profile); G.audio?.prepareWeapon?.(weapon,{urgent:true});",
      'main-weapon loadout MP3 prefetch');

    // A recorded first shot must not race MP3 download/decoding. Reserve the
    // preload synchronously while the start gesture still owns AudioContext;
    // await the exact recording before the existing START flow proceeds past
    // its guarded fade. On load failure the existing menu startup recovery
    // handles the rejection instead of admitting an inaudible battle.
    const patchStartShot=(start,end,selected,label)=>{
      const lo=code.indexOf(start),hi=code.indexOf(end,lo+start.length);
      if(lo<0||hi<0)throw new Error('audio adapter start boundary: '+label);
      let method=code.slice(lo,hi);
      method=once(method,
        '    G.audio?.init?.();\n    if (!flow.current()) return;',
        '    G.audio?.init?.();\n    if (!flow.current()) return;\n' +
        "    if (" + (label === 'offline' ? "o?.mode" : "cfg?.mode") + " !== 'boss') G.music?.preloadFile?.('battle', { prime: true });\n" +
        '    const battlePreload=claimPreloadedMusic(G.music,flow); this._battlePreload=battlePreload;\n    let battleAdmitted=false;\n    try {\n' +
        "    if(typeof G.audio?.requireRecordedMainShot!=='function') throw new Error('Recorded weapon audio is not installed');\n" +
        '    const selectedShotReady=G.audio.requireRecordedMainShot('+selected+').then(value=>({value}),error=>({error}));',
        label+' start selected recorded MP3');
      method=once(method,
        '    await this._fade(1, 350);\n    if (!flow.current()) return;',
        '    await this._fade(1, 350);\n    if (!flow.current()) return;\n' +
        '    const selectedShotState=await selectedShotReady;\n    if (!flow.current()) return;\n    if(selectedShotState.error)throw selectedShotState.error;',
        label+' wait for MP3 before gameplay');
      if(!/\n  }\s*$/.test(method))throw new Error('audio adapter start completion boundary: '+label);
      method=method.replace(/\n  }\s*$/, '\n    battleAdmitted=true;\n    } finally { if(!battleAdmitted)cancelPreloadedMusic(battlePreload); }\n  }\n');
      code=code.slice(0,lo)+method+code.slice(hi);
    };
    code=once(code,'  _startAttract() {','  _startAttract() {\n    cancelPreloadedMusic(this._battlePreload); this._battlePreload=null;','abandoned online wait releases only its own primed media');
    // Native-stage admission rewrites the offline signature before the audio pass.
    patchStartShot('  async startMatch(o = {}, flow = null) {',
      '\n  // ---- online (src/net/session.js', "this.profile.weapon||'shooter'",'offline');
    patchStartShot('  async startNetMatch(cfg, nm) {',
      '\n  // Compile every shader variant',
      "cfg?.roster?.find(r=>r.owner===G.net?.myId&&!r.bot)?.weapon",'online');
    // A missing MP3 must be visible, rather than leaving a silent game
    // running with no clue why the selected main weapon cannot fire audio.
    code=once(code,
      "this.menus.toast?.(t('Could not start the match. Please try again.'), { kind: 'error' });",
      "this.menus.toast?.(/音源|MP3|音声出力|Recorded weapon/.test(String(error?.message||'')) ? '本家ブキ射撃音源を読み込めませんでした。通信・音声設定を確認して再試行してください。' : t('Could not start the match. Please try again.'), { kind: 'error' });",
      'visible recorded sound preload failure');
    // The existing one-per-hit HUD click stays authoritative. Source hit events
    // distinguish direct Blaster body contact from radius splash for its pitch.
    code=once(code,"on('hit', ({ attacker, victim, damage, killed }) => {",
      "on('hit', ({ attacker, victim, damage, killed, weaponId, hitMeta }) => {",'Blaster hit event identity');
    code=once(code,"G.audio?.play('hit_marker', { volume: 0.6 });",
      "G.audio?.play('hit_marker', { volume: 0.6, pitch: G.audio?.blasterHitCuePitch?.(attacker, weaponId) ?? 1 });",'Blaster hit marker articulation');
    // Real S3 recorded body-hit and splat cues are separate from the gunshot.
    // Charge-specific criticals use the admitted projectile's stored charge,
    // never the equipped kit's sub/special, damage threshold or kill state.
    // Other hit and splat confirmations use the same verified recorded MP3s.
    code=once(code,
      "G.audio?.play('hit_marker', { volume: 0.6, pitch: G.audio?.blasterHitCuePitch?.(attacker, weaponId) ?? 1 });",
      "const chargerCue=sourceChargerHitCue(weaponId,hitMeta?.chargerDirect===true?hitMeta.charge:null); " +
      "const directBlaster=blasterHitCueKind(attacker,weaponId,damage)==='direct'; " +
      "const recordedCue=(chargerCue==='combat:critical'||directBlaster)?'combat:critical':'combat:damage'; " +
      "G.audio?.playWeapon?.(recordedCue,'fire',{volume:.76,priority:95});",
      'source-verified combat recordings by actual hit and charge classification');
    code=once(code,
      "G.audio?.play('splat_enemy', { volume: 0.9 });",
      "G.audio?.playWeapon?.('combat:splat','fire',{volume:.82,priority:96});",
      'source verified Charger splat splash only');
    // Native projectile code also played its old INKWAVE synthesized ink
    // body contact sound, even when the exact Charger MP3 is now used by HUD.
    // Suppress that layer only for the local attacker's hit confirmation
    // (which now uses recorded HitEf); remote and local-victim positional body
    // cues, hit/death authority, and paint remain untouched.
        // Reuse already-loaded runtime audio for hit classification, preserving the core preload graph.
  }
  if(rel==='src/audio/music.js'){
    code=once(code, '  play(track, opts = {}) {', `  play(track, opts = {}) {
    // Validate before remapping, retiring a track, or queuing a request.
    let requestedFade;
    try { requestedFade = Number(opts.fade ?? 1.0); } catch { return; }
    if (!Number.isFinite(requestedFade)) return;`, 'finite music fade before state changes');
    code=once(code, 'const fade = Math.max(0, opts.fade ?? 1.0);', 'const fade = Math.max(0, requestedFade);', 'reuse the validated music fade');
    const noiseStart=code.indexOf('export function noiseBuffer('),noiseEnd=code.indexOf('\n// Stereo reverb impulse:',noiseStart);
    if(noiseStart<0||noiseEnd<noiseStart)throw new Error('audio adapter anchor: noise scratch ownership');
    let noise=code.slice(noiseStart,noiseEnd);
    noise=once(noise,'const w = new Float32Array(len);',"const w = kind === 'white' ? d : new Float32Array(len);",'white noise uses its final channel');
    noise=once(noise,"if (kind === 'white') d.set(w);", "if (kind === 'white') { /* The channel already owns the exact Float32 samples. */ }",'white noise avoids the duplicate copy');
    noise=once(noise,'const tmp = new Float32Array(len);','const tmp = w;','reuse colored noise input after its final IIR read');
    code=code.slice(0,noiseStart)+noise+code.slice(noiseEnd);
    const impulseStart = code.indexOf('export function makeImpulse('), impulseEnd = code.indexOf('\n// tanh drive curve', impulseStart);
    if (impulseStart < 0 || impulseEnd < impulseStart) throw new Error('audio adapter anchor: shared impulse implementation');
    code = "import { buildImpulse } from '../../patches/splatoon3/runtime/audio/reverb-impulse.mjs';\n" + code.slice(0, impulseStart) +
      'export function makeImpulse(ctx, seconds = 1.6, decay = 3.2, opt = {}) { return buildImpulse(ctx, seconds, decay, opt); }\n' + code.slice(impulseEnd);
    code=once(code, 'conv.buffer = makeImpulse(ctx, 2.2, 2.4, { seed: 5, bright: 0.7, dark: 0.08 });', 'conv.buffer = opt.impulse || makeImpulse(ctx, 2.2, 2.4, { seed: 5, bright: 0.7, dark: 0.08 });', 'ready music reverb or immediate original fallback');

    code="import { installOriginalAudioScore } from '../../patches/splatoon3/runtime/audio/music-score.mjs';\n"+code;
    code=once(code,'const compiled = new Map();','installOriginalAudioScore(SONGS);\nconst compiled = new Map();','original score');
    const streamingGrid = 'if (cur && !element && !(cur instanceof StreamedTrack) && fade > 0 && cur.song.bpm === song.bpm)';
    const standardGrid = 'if (cur && fade > 0 && cur.song.bpm === song.bpm)';
    const activeGrid = code.includes(streamingGrid) ? streamingGrid : standardGrid;
    if (code.split(activeGrid).length !== 2) throw new Error('audio adapter ambiguous final minute grid');
    code=once(code,activeGrid,activeGrid.replace('if (cur &&',"if (opts.sync !== false && track !== 'battle_final' && cur &&"),'final minute grid');
    code=once(code,'let t0 = now + 0.06, sync = false;',"let t0 = Number.isFinite(opts.at) ? Math.max(now,opts.at) : now + (track==='battle_final' ? .015 : .06), sync = false;",'music clock');
  }
  if(rel==='patches/splatoon3/runtime/weapons-charger-flight.mjs'){
    code=code.replace("emit('weapon:impact',{pos:job.pos,","emit('weapon:impact',{actor:job.owner,weapon:job.weapon?.id||'charger',pos:job.pos,");
  }
  if(rel==='patches/splatoon3/runtime/weapons-fidelity.mjs'){
    code=code.replace("context.G.audio?.play('blaster_boom',{pos:point,volume:.7});", "if(context.G.audio?.weaponBank?.()?.has(p.wid,'explosion'))context.G.audio.playWeapon(p.wid,'explosion',{actor:p.owner,pos:point,volume:.7});else if(!context.G.audio?.weaponBank?.()?.realOnly)context.G.audio?.play('blaster_boom',{pos:point,volume:.7});");

    code=code.replace(/emit\('weapon:impact',\s*\{\s*pos:/g,"emit('weapon:impact',{actor:p.owner,weapon:p.wid,pos:");
  }
  if(rel==='patches/splatoon3/runtime/main-weapon-catalog.mjs'){
    code=once(code,
      "      cost=Math.min(Math.max(0,a.ink),Object.is(target,fundedTarget)?cost:Math.max(0,inkAt(r,target)*mod-s.paid));",
      "      const chargeInkNeeded=Object.is(target,fundedTarget)?cost:Math.max(0,inkAt(r,target)*mod-s.paid);\n      cost=Math.min(Math.max(0,a.ink),chargeInkNeeded);",
      'retain canonical unpaid charge delta for audio only');
    code=once(code,
      "      s.chargeF=target;",
      `      s.chargeF=target;
      let audibleFrames=target;
      if(cost+EPS<chargeInkNeeded){
        if(s.audioPaid!==s.paid||s.audioMod!==mod){
          s.audioPaid=s.paid;s.audioMod=mod;
          s.audioFundedFrames=fundedChargeFrames(r,s.paid,mod);
        }
        audibleFrames=Math.min(target,s.audioFundedFrames);
      }
      runner.s3ChargeAudioProgress=audibleFrames/full;`,
      'do not announce unfunded visual charge as ready');

    // Added S3 catalogue weapons already emit weapon:fire. Avoid a second
    // legacy family shot alongside the admitted weapon-specific real sample.
    code=once(code,
      "G.audio?.play(r.family==='charger'?'shoot_charger':r.family==='blaster'?'shoot_blaster':'shoot_shooter',\n        {pos:a.isLocal?undefined:origin,volume:.45});",
      'void 0;', 'catalogue shared-shot dedup');
  }
  return code;
}
