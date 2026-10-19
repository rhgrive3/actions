// Runs after all existing gameplay, network and platform adapters.
// Locked upstream source is never changed. Anchors fail closed if upstream changes.
function once(code,from,to,label){if(!code.includes(from))throw new Error('audio adapter anchor: '+label);return code.replace(from,to);}
export function adaptWeaponAudio(rel,code){
  if(rel==='src/audio/audio.js'){
    code="import { connectOutputSafety } from '../../patches/splatoon3/runtime/audio/output-safety.mjs';\nimport { installWeaponAudioEngine } from '../../patches/splatoon3/runtime/audio/engine.mjs';\nimport { audioEmitterKey, selectVictim } from '../../patches/splatoon3/runtime/audio/bank.mjs';\n"+code;
    code=once(code,'hp.connect(glue); glue.connect(lim); lim.connect(ctx.destination);','hp.connect(glue); glue.connect(lim); this.outputSafety=connectOutputSafety(ctx,lim);','sample peak protection');
    code=once(code,'const d = SFX[name];','const d = this.resolveWeaponSound?.(name) || SFX[name];','definitions');
    code=once(code,'const t = Math.max(now, o.at ?? now) + (o.delay || 0);',`const t = Math.max(now, Number.isFinite(o.at) ? o.at : now) + Math.max(0, Number.isFinite(o.delay) ? o.delay : 0);
    const emitterKey = name + ':' + audioEmitterKey(o);
    const priority = Number.isFinite(o.priority) ? o.priority : (/^(ui_|match_|count|last_|special_ready|low_ink)/.test(name) ? 98 : (d.priority ?? 35));`,'scheduled time');
    code=code.replace('this.last.get(name)','this.last.get(emitterKey)').replace('this.last.set(name, t);',`this.last.set(emitterKey, t);
    if(this.last.size>512)this.last.delete(this.last.keys().next().value);
    if(this.byName.size>128)for(const [key,rows] of this.byName){if(!rows.some(v=>!v.v.dead&&!v.stolen))this.byName.delete(key);}`).replace('this.byName.get(name)','this.byName.get(emitterKey)').replace('this.byName.set(name,','this.byName.set(emitterKey,');
    code=once(code,'while (this.voices.length >= MAX_VOICES) this._steal(this.voices.shift(), now);',`while (this.voices.length >= MAX_VOICES) {
        const victim=selectVictim(this.voices,priority);
        if(!victim){this.counts.dropped++;return null;}
        this.voices.splice(this.voices.indexOf(victim),1);this._steal(victim,now);
      }`,'voice allocation');
    code=once(code,'const voice = this._voice(d, t, o.pos, vol);',`const voice = this._voice(d, t, validPos(o.pos) ? o.pos : undefined, vol);
    voice.priority=priority;
    const obstruction=Math.min(1,Math.max(0,Number(o.occlusion)||0));
    if(obstruction&&voice.lp){voice.lp.frequency.value=Math.min(voice.lp.frequency.value,22000*Math.pow(.055,obstruction));voice.vol*=1-obstruction*.38;voice.out.gain.value=voice.vol;}`,'spatial priority');
    code=once(code,'export const audio = new AudioEngine();','installWeaponAudioEngine(AudioEngine);\nexport const audio = new AudioEngine();','installation');
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
    for(const [old,event] of Object.entries({charger_charge:'charge',charger_full:'ready',roller_flick:'windup',roll:'roll',slosh_throw:'windup',splatling_wind:'windup',splatling_spin:'charge',splatling_ready:'ready'})){
      code=code.replace(new RegExp("G\\.audio\\?\\.(play|loop)\\('"+old+"',\\s*\\{",'g'),(_,method)=>`G.audio?.${method}Weapon?.(a.weapon.id, '${event}', { actor:a, `);
    }
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
    code=code.replace(/G\.audio\?\.play\('dualies_roll'\s*,\s*\{[^{}]*\}\);/g,'void 0;');
    code=code.replace("G.audio?.loop?.(snd, { pos: a.pos, volume: 0 })", "G.audio?.loopWeapon?.(a.weapon.id, key==='charge'?'charge':key==='spin'?'spin':'roll', {actor:a, pos:a.pos,volume:0})");
    code=code.replace("G.audio?.play('roller_flick', { pos, volume: 0.8 })","G.audio?.playWeapon?.(a.weapon.id,'windup',{actor:a,pos,volume:.8})");
    code=code.replace("G.audio?.play('slosh_throw', { pos, volume: 0.55 })","G.audio?.playWeapon?.(a.weapon.id,'windup',{actor:a,pos,volume:.55})");
  }
  if(rel==='src/game/weapons.js'){
    // Preserve any installed Slosher volley argument: the sixth optional
    // field carries the actual admitted shot's charge, NOT its damage.
    const signature5='applyHit(attacker, victim, dmg, weaponId, slosherVolleyId) {';
    const signature4='applyHit(attacker, victim, dmg, weaponId) {';
    const signature=code.includes(signature5)?signature5:signature4;
    code=once(code,signature,signature.slice(0,-3)+', chargeFraction = null) {',
      'admitted hit records original shot charge fraction');
    code=once(code,
      "emit('hit', { attacker, victim, damage: dmg, killed, weaponId });",
      "emit('hit', { attacker, victim, damage: dmg, killed, weaponId, charge: chargeFraction });",
      'hit event charge metadata');
    code=once(code,
      "this.applyHit(a, victim.e, dmg, 'charger');",
      "this.applyHit(a, victim.e, dmg, 'charger', undefined, charge);",
      'native Charger hit uses shot charge, never damage proxy');
    code=once(code,
      "G.audio.play('ink_hit_body', { pos: _vh, volume: (victim.isLocal ? 0.3 : 0.4) + Math.min(0.45, dmg / 260), pitch: dmg >= 60 ? 0.8 : 1.05 });",
      "if (!/^(?:charger(?:-|$)|s3-charger-)/.test(String(weaponId||''))) " +
      "G.audio.play('ink_hit_body', { pos: _vh, volume: (victim.isLocal ? 0.3 : 0.4) + Math.min(0.45, dmg / 260), pitch: dmg >= 60 ? 0.8 : 1.05 });",
      'do not layer authored body-hit noise over original Charger direct hit MP3');
  }
  if(rel==='src/main.js'){
    code="import { sourceChargerHitCue } from '../patches/splatoon3/runtime/audio/combat-hit-classifier.mjs';\n"+code;
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
        "    if(typeof G.audio?.requireRecordedMainShot!=='function') throw new Error('Recorded weapon audio is not installed');\n" +
        '    const selectedShotReady=G.audio.requireRecordedMainShot('+selected+').then(value=>({value}),error=>({error}));',
        label+' start selected recorded MP3');
      method=once(method,
        '    await this._fade(1, 350);\n    if (!flow.current()) return;',
        '    await this._fade(1, 350);\n    if (!flow.current()) return;\n' +
        '    const selectedShotState=await selectedShotReady;\n    if (!flow.current()) return;\n    if(selectedShotState.error)throw selectedShotState.error;',
        label+' wait for MP3 before gameplay');
      code=code.slice(0,lo)+method+code.slice(hi);
    };
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
      "on('hit', ({ attacker, victim, damage, killed, weaponId, charge }) => {",'Blaster hit event identity');
    code=once(code,"G.audio?.play('hit_marker', { volume: 0.6 });",
      "G.audio?.play('hit_marker', { volume: 0.6, pitch: G.audio?.blasterHitCuePitch?.(attacker, weaponId) ?? 1 });",'Blaster hit marker articulation');
    // Real S3 recorded body-hit and splat cues are separate from the gunshot.
    // This exact conditional uses the admitted projectile weaponId / splat
    // cause, not the equipped kit's sub/special, so a bomb splat never sounds
    // like a full-charge Charger direct.
    code=once(code,
      "G.audio?.play('hit_marker', { volume: 0.6, pitch: G.audio?.blasterHitCuePitch?.(attacker, weaponId) ?? 1 });",
      "const chargerCue=sourceChargerHitCue(weaponId,charge); " +
      "if (chargerCue) G.audio?.playWeapon?.(chargerCue,'fire',{volume:.76,priority:95}); " +
      "else G.audio?.play('hit_marker', { volume: 0.6, pitch: G.audio?.blasterHitCuePitch?.(attacker, weaponId) ?? 1 });",
      'source verified Charger hit feedback only');
    code=once(code,
      "G.audio?.play('splat_enemy', { volume: 0.9 });",
      "if (/^(?:charger(?:-|$)|s3-charger-)/.test(String(cause||''))) " +
      "G.audio?.playWeapon?.('combat:splat','fire',{volume:.82,priority:96}); " +
      "else G.audio?.play('splat_enemy', { volume: 0.9 });",
      'source verified Charger splat splash only');
    // Native projectile code also played its old INKWAVE synthesized ink
    // body contact sound, even when the exact Charger MP3 is now used by HUD.
    // Suppress that layer only for charged direct-hit contacts, not wall ink,
    // other weapons, or authoritative hit/death logic.
        // Reuse already-loaded runtime audio for hit classification, preserving the core preload graph.
  }
  if(rel==='src/audio/music.js'){
    code="import { installOriginalAudioScore } from '../../patches/splatoon3/runtime/audio/music-score.mjs';\n"+code;
    code=once(code,'const compiled = new Map();','installOriginalAudioScore(SONGS);\nconst compiled = new Map();','original score');
    const streamingGrid = 'if (cur && !element && !(cur instanceof StreamedTrack) && fade > 0 && cur.song.bpm === song.bpm)';
    const standardGrid = 'if (cur && fade > 0 && cur.song.bpm === song.bpm)';
    const activeGrid = code.includes(streamingGrid) ? streamingGrid : standardGrid;
    if (code.split(activeGrid).length !== 2) throw new Error('audio adapter ambiguous final minute grid');
    code=once(code,activeGrid,activeGrid.replace('if (cur &&',"if (opts.sync !== false && track !== 'battle_final' && cur &&"),'final minute grid');
    code=once(code,'let t0 = now + 0.06, sync = false;',"let t0 = Number.isFinite(opts.at) ? Math.max(now,opts.at) : now + (track==='battle_final' ? .015 : .06), sync = false;",'music clock');
  }
  if(rel==='patches/splatoon3/runtime/weapons.mjs'){
    // Full-charge bypass hits must retain the actual shot ratio, not a
    // synthetic 95+ damage test. No collision/damage behavior is modified.
    code=once(code,
      "this.applyHit(a, actor, w.damageMax, 'charger')",
      "this.applyHit(a, actor, w.damageMax, 'charger', undefined, charge)",
      'native full-charge through hit metadata');
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
      'this.applyHit(p.owner,target,amount,p.wid)',
      'this.applyHit(p.owner,target,amount,p.wid,undefined,d.charge)',
      'catalogued Charger original shot charge metadata');
    // Added S3 catalogue weapons already emit weapon:fire. Avoid a second
    // legacy family shot alongside the admitted weapon-specific real sample.
    code=once(code,
      "G.audio?.play(r.family==='charger'?'shoot_charger':r.family==='blaster'?'shoot_blaster':'shoot_shooter',\n        {pos:a.isLocal?undefined:origin,volume:.45});",
      'void 0;', 'catalogue shared-shot dedup');
  }
  return code;
}
