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
    for(const [old,event] of Object.entries({charger_charge:'charge',charger_full:'ready',roller_flick:'windup',roll:'roll',slosh_throw:'windup',splatling_wind:'windup',splatling_spin:'spin',splatling_ready:'ready'})){
      code=code.replace(new RegExp("G\\.audio\\?\\.(play|loop)\\('"+old+"',\\s*\\{",'g'),(_,method)=>`G.audio?.${method}Weapon?.(a.weapon.id, '${event}', { actor:a, `);
    }
  }
  if(rel==='src/net/netmatch.js'){
    code=code.replace(/G\.audio\?\.play\('dualies_roll'\s*,\s*\{[^{}]*\}\);/g,'void 0;');
    code=code.replace("G.audio?.loop?.(snd, { pos: a.pos, volume: 0 })", "G.audio?.loopWeapon?.(a.weapon.id, key==='charge'?'charge':key==='spin'?'spin':'roll', {actor:a, pos:a.pos,volume:0})");
    code=code.replace("G.audio?.play('roller_flick', { pos, volume: 0.8 })","G.audio?.playWeapon?.(a.weapon.id,'windup',{actor:a,pos,volume:.8})");
    code=code.replace("G.audio?.play('slosh_throw', { pos, volume: 0.55 })","G.audio?.playWeapon?.(a.weapon.id,'windup',{actor:a,pos,volume:.55})");
  }
  if(rel==='src/main.js'){
    // The existing one-per-hit HUD click stays authoritative. Source hit events
    // distinguish direct Blaster body contact from radius splash for its pitch.
    code=once(code,"on('hit', ({ attacker, victim, damage, killed }) => {",
      "on('hit', ({ attacker, victim, damage, killed, weaponId }) => {",'Blaster hit event identity');
    code=once(code,"G.audio?.play('hit_marker', { volume: 0.6 });",
      "G.audio?.play('hit_marker', { volume: 0.6, pitch: blasterHitCuePitch(attacker, weaponId) });",'Blaster hit marker articulation');
    code="import { blasterHitCuePitch } from '../../patches/splatoon3/runtime/audio/blaster-hit.mjs';\n"+code;
  }
  if(rel==='src/audio/music.js'){
    code="import { installOriginalAudioScore } from '../../patches/splatoon3/runtime/audio/music-score.mjs';\n"+code;
    code=once(code,'const compiled = new Map();','installOriginalAudioScore(SONGS);\nconst compiled = new Map();','original score');
    code=once(code,'if (cur && fade > 0 && cur.song.bpm === song.bpm)',"if (opts.sync !== false && track !== 'battle_final' && cur && fade > 0 && cur.song.bpm === song.bpm)",'final minute grid');
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
    // Added S3 catalogue weapons already emit weapon:fire. Avoid a second
    // legacy family shot alongside the admitted weapon-specific real sample.
    code=once(code,
      "G.audio?.play(r.family==='charger'?'shoot_charger':r.family==='blaster'?'shoot_blaster':'shoot_shooter',\n        {pos:a.isLocal?undefined:origin,volume:.45});",
      'void 0;', 'catalogue shared-shot dedup');
  }
  return code;
}
