import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptSource} from '../adapter.mjs';

const root=new URL('../../../inkwave-public/',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('#1039 guest-owned team writes cannot enter host lobby and confirmation travels as one host-authored state',()=>{
  const source=read('src/net/session.js'),built=adaptSource('src/net/session.js',source);
  assert.ok(!built.includes("if (ch.team === 0 || ch.team === 1 || ch.team === 'auto') o.team = ch.team;"));
  assert.ok(!built.includes("if (o.team === 'auto') p.team = 'auto';"));
  assert.match(built,/assignTeam\(id, team\)/);
  assert.match(built,/confirmTeams\(\)/);
  assert.match(built,/teamsConfirmed: !!l\.teamsConfirmed/);
  assert.match(built,/this\.lobby\.teamsConfirmed = !!l\.teamsConfirmed/);
  assert.match(built,/!this\.canStart\(\)/);
  assert.match(built,/all.*player.*final.*ready|this\.lobby\.players\.every\(/);
  assert.throws(()=>adaptSource('src/net/session.js',built),/conflict/, 'a generated tree cannot be re-patched');
});

test('#1039 per-player host assignment UI and confirm action do not reuse guest setMe(team)',()=>{
  const src=read('src/ui/menus.js'),built=adaptSource('src/ui/menus.js',src);
  assert.ok(!built.includes('net.setMe({ team: v })'));
  assert.match(built,/net\.assignTeam\(p\.id,team\)/);
  assert.match(built,/net\.assignTeam\(me\.id,v\)/);
  assert.match(built,/net\.confirmTeams\(\)/);
  assert.match(built,/confirmTeamsBtn\.style\.display/);
  assert.match(built,/bossMode\(\) \|\| !host/);
});

test('#1039 Turf host gets its own READY after host-confirmed teams; START only launches', () => {
  const built=adaptSource('src/ui/menus.js',read('src/ui/menus.js'));
  // Without this, the host had no READY control and canStart() (Turf: every player incl. host ready) never became true.
  assert.ok(!built.includes("      if (isHost()) { tryStart(); return; }"), 'host READY key is no longer forwarded to START in Turf');
  assert.match(built,/if \(isHost\(\) && bossMode\(\)\) \{ tryStart\(\); return; \}/);
  assert.match(built,/if \(!bossMode\(\) && !lob\.teamsConfirmed\)/, 'READY is refused until the host confirms teams');
  assert.match(built,/const barItems = \(\) => \[wChip, lChip, teamRow, emoteBtn, \.\.\.\(isHost\(\) \? \(bossMode\(\) \? \[startBtn\] : \[readyBtn, startBtn\]\) : \[readyBtn\]\)\];/);
  assert.match(built,/return i < 1 \? copyBtn : isHost\(\) && bossMode\(\) \? startBtn : readyBtn;/);
  assert.match(built,/readyBtn\.style\.display = host && !bossMode\(\) \? 'flex' : '';/, 'inline display overrides the lobby CSS that hides READY for hosts');
});

test('#1039 host READY is accepted by the session only after confirmation and does not bypass the ready gate', () => {
  const built=adaptSource('src/net/session.js',read('src/net/session.js'));
  const applyBody=built.match(/  _applyMe\(id, o\) \{([\s\S]*?)\n  \}/)?.[1];
  assert.ok(applyBody, 'native _applyMe is present');
  const apply=new Function('WEAPONS','id','o',applyBody);
  let broadcasts=0;
  const host={ isHost:true, state:'lobby', myId:'host', hostId:'host', _fixTeams(){}, _broadcastLobby(){ broadcasts++; },
    lobby:{ mode:'turf', teamsConfirmed:false, players:[{id:'host',team:0,weapon:'shooter',ready:false},{id:'guest',team:1,weapon:'shooter',ready:false}] } };
  apply.call(host,{shooter:{}},'host',{ready:true});
  assert.equal(host.lobby.players[0].ready,false,'host READY before confirmation is refused');
  host.lobby.teamsConfirmed=true;
  apply.call(host,{shooter:{}},'host',{ready:true});
  assert.equal(host.lobby.players[0].ready,true,'host READY after confirmation is accepted');
  assert.equal(broadcasts,2);
});
