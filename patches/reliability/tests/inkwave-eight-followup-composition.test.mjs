import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptEightFollowup } from '../inkwave-eight-followup-adapter.mjs';
const capture="    const p = this.lobby.players.find((x) => x.id === id);\n    if (!p) return;";
const apply="    this._fixTeams();\n    this._broadcastLobby();\n  }\n\n";
const base="    const l = this.lobby, wasMap = l.map;";
const bots="    l.bots = mapNoBots(l.map) ? false : (this._botsPref ?? l.bots);";
function composed(host){
  return capture+'\n    if (o.weapon && WEAPONS[o.weapon]) p.weapon = o.weapon;\n'+
    apply+(host?'  assignTeam(id, team) {\n  }\n\n':'')+'  setSettings(s = {}) {\n'+
    (host?base.slice(0,-1)+', oldMode = l.mode;':base)+'\n'+bots+'\n'+
    (host?'    if (oldMode !== l.mode) { l.teamsConfirmed=false; for (const p of l.players) p.ready=false; }\n':'')+
    '    this._broadcastLobby();\n';
}
for(const host of [false,true])test('readiness invalidation composes with host teams '+host,()=>{
  const result=adaptEightFollowup('src/net/session.js',composed(host));
  assert.match(result,/beforeWeapon/);
  assert.match(result,/beforeTeams/);
  assert.match(result,/beforeSettings/);
  assert.match(result,/afterSettings/);
  if(host)assert.match(result,/oldMode !== l.mode/);
});
test('malformed composition fails closed',()=>{
 assert.throws(()=>adaptEightFollowup('src/net/session.js','bad'),/anchor mismatch|conflict/);
});
