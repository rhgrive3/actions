import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptSixFollowup } from '../inkwave-six-followup-adapter.mjs';
const legacy = "    return !this.startBlock() && this.lobby.players.every((p) => p.ready || p.id === this.myId);";
const legacyStart = "    if (!this.isHost || this.state !== 'lobby' || !this.tr || this.startBlock()) return false;";
const host = "    return !this.startBlock() && (this.lobby.mode === 'boss' || !!this.lobby.teamsConfirmed) &&\n      this.lobby.players.every(p=>p.ready || (p.id===this.myId && this.lobby.mode==='boss'));";
const hostStart = "    if (!this.isHost || this.state !== 'lobby' || !this.tr || !this.canStart()) return false;";
test('turf min two humans composes after host-owned readiness',()=>{
  const s=adaptSixFollowup('src/net/session.js',host+'\n'+hostStart);
  assert.match(s,/this\.lobby\.players\.length >= 2/);
  assert.match(s,/this\.lobby\.teamsConfirmed/);
  assert.match(s,/!this\.canStart\(\)/);
  assert.doesNotMatch(s,/&&\nreturn !this\.startBlock/);
});
test('pre-host-team native fallback remains valid',()=>{
  const s=adaptSixFollowup('src/net/session.js',legacy+'\n'+legacyStart);
  assert.match(s,/length >= 2/);
  assert.match(s,/length < 2/);
});
test('missing anchors fail closed',()=>{
  assert.throws(()=>adaptSixFollowup('src/net/session.js','bad'),/anchor mismatch/);
});
