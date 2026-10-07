export function adaptTeamWipeout(rel,code,once){
 if(rel==='src/game/match.js'){
  code="import { resetTeamWipes, sampleTeamWipes, rearmTeamWipe, clearTeamWipes } from '../../patches/local-quality/team-wipeout.mjs';\n"+code;
  code=once(code,'  start() {','  start() {\n    resetTeamWipes(this);','wipeout match lifecycle seed');
  code=once(code,'    this.bossMode?.update(dt);','    sampleTeamWipes(this, emit);\n    this.bossMode?.update(dt);','wipeout post-owner-state sample');
  code=once(code,'  dispose() {','  dispose() {\n    clearTeamWipes(this);','wipeout match disposal');
  const hook="on('splatted', (e) => this._onSplatted(e))";
  if(code.split(hook).length!==3)throw Error('WIPEOUT expects both local and roster life subscriptions');
  return code.replaceAll(hook,hook+", on('respawn', ({ actor }) => rearmTeamWipe(this, actor))");
 }
 if(rel==='src/net/netmatch.js'){
  code="import { rearmTeamWipe } from '../../patches/local-quality/team-wipeout.mjs';\n"+code;
  return once(code,'    a.respawnTimer = 0;\n    a.net.spawnPending = true;','    a.respawnTimer = 0;\n    a.net.spawnPending = true;\n    rearmTeamWipe(this.match, a);','wipeout accepted remote respawn rearm');
 }
 if(rel==='src/ui/hud.js'){
  code="import { queueTeamWipeHud, flushTeamWipeHud, resetTeamWipeHud } from '../../patches/local-quality/team-wipeout.mjs';\n"+code;
  code=once(code,"      on('splatted', (e) => this._onSplatted(e)),","      on('team:wipeout', (e) => queueTeamWipeHud(this, e, G.match)),\n      on('splatted', (e) => this._onSplatted(e)),",'wipeout HUD subscriber');
  code=once(code,'  _startMatchHud(match) {','  _startMatchHud(match) {\n    resetTeamWipeHud(this);','wipeout HUD new match');
  code=once(code,'  dispose() {','  dispose() {\n    resetTeamWipeHud(this);','wipeout HUD disposal');
  code=once(code,'    if (!f) return;\n    this._t += dt;','    if (!f) return;\n    flushTeamWipeHud(this, G.match, tr);\n    this._t += dt;','wipeout after independent kill callouts');
  code=once(code,"      const enemies = this._actors().filter((a) => a.team !== me.team);\n      let big = false;\n      if (enemies.length >= 4 && enemies.every((a) => !a.alive)) { call = tr('WIPEOUT!'); sub = tr('The whole team is splatted'); big = true; }\n      else if (multi >= 2)","      if (multi >= 2)",'wipeout remove local-killer ownership');
  code=once(code,'if (call) this._callout(call, sub, multi >= 3 || big);','if (call) this._callout(call, sub, multi >= 3);','wipeout preserve non-wipe streak callouts');
  code=once(code,'  _callout(text, sub, big) {','  _callout(text, sub, big, sound = null) {','wipeout sound variant input');
  return once(code,"this._snd(big ? 'special_ready' : 'ui_confirm', { volume: big ? 0.7 : 0.55 });","this._snd(sound || (big ? 'special_ready' : 'ui_confirm'), { volume: big ? 0.7 : 0.55 });",'wipeout distinct team sound');
 }
 if(rel==='src/i18n.js')return once(code,"'The whole team is splatted': '相手チームを全員たおした',","'Your whole team is splatted': '味方全員が復活待ち', 'The whole team is splatted': '相手チームを全員たおした',",'wipeout own-team translation');
 if(rel==='styles/hud.css')return code+'\n.iw-call.is-own-wipeout .iw-call__txt { color: #111; text-shadow: 0 1px 0 rgba(255,255,255,.6); }\n.iw-call.is-enemy-wipeout .iw-call__txt { color: #fff; }\n';
 return code;
}
