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
