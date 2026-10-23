import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,extraExports:"export {NetSession} from './inkwave-public/src/net/session.js';"});
f.G.game={profile:{name:'Local',weapon:'shooter',style:{hair:2}},settings:{}};
function rig(count){const s=new f.NetSession(),sent=[];s.myId='p1';s.hostId='p0';s.state='lobby';s.tr={broadcast(d){sent.push(JSON.parse(JSON.stringify(d)));return true;},lock(){return true;},close(){}};for(let i=0;i<count;i++)s._members.set('p'+i,'Name'+i);return{s,sent};}
for(const count of [2,3,8])test(`new host reconstructs authenticated ${count}-member lobby before its first snapshot`,()=>{
 const {s,sent}=rig(count);s._control({t:'leave',id:'p0',host:'p1'});
 assert.deepEqual(Array.from(s.lobby.players,p=>p.id),Array.from(s._members.keys()));assert.equal(s.lobby.players[0].weapon,'shooter');assert.equal(s.lobby.players[0].style.hair,2);
 assert.equal(s.lobby.players.filter(p=>p.host).length,1);assert(s.lobby.players.every(p=>!p.ready));assert.equal(s.lobby.teamsConfirmed,false);assert.equal(sent.length,1);assert.equal(sent[0].l.players.length,count-1);
 s.setMe({weapon:'roller'});assert.equal(s.lobby.players.find(p=>p.id==='p1').weapon,'roller');
 if(count>2){s.myId='p2';s._control({t:'leave',id:'p1',host:'p2'});assert.deepEqual(Array.from(s.lobby.players,p=>p.id),Array.from(s._members.keys()));assert.equal(s.lobby.players.filter(p=>p.host).length,1);}
 s.leave(true);
});
test('host migration preserves validated equipment, removes stale/duplicate rows and rejects old host snapshots',()=>{
 const {s,sent}=rig(3),existing=s._newPlayer('p2','Existing',{weapon:'roller',style:{hair:3}});existing.team=1;existing.ready=true;
 s.lobby.players=[s._newPlayer('p0','Old',{}),existing,{...existing},s._newPlayer('forged','Forged',{})];
 s._control({t:'leave',id:'p0',host:'p1'});assert.equal(s.lobby.players[0],existing);assert.equal(existing.weapon,'roller');assert.equal(existing.style.hair,3);assert.equal(existing.ready,false);assert.equal(s.lobby.players.length,2);
 s._message('p0',{k:'lobby',l:{...sent[0].l,players:[]}});assert.equal(s.lobby.players.length,2);
 s._control({t:'leave',id:'p0',host:'p1'});assert.equal(s.lobby.players.length,2);s.leave(true);
});
test('host callback room replacement prevents stale reconciliation, lobby broadcast or unlock',()=>{
 const {s}=rig(3);let sends=0;const replacement={broadcast(){sends++;return true;},lock(){throw Error('stale unlock');},close(){}};
 s.on('host',()=>{s._roomAttempt++;s.tr=replacement;s.lobby=s._blankLobby();});
 s._control({t:'leave',id:'p0',host:'p1'});assert.equal(s.lobby.players.length,0);assert.equal(sends,0);s.leave(true);
});
test('starting and playing migration never reconstructs a lobby roster',()=>{
 for(const state of ['starting','match']){const {s}=rig(3);s.state=state;let leaves=0;s.match={onLeave(){leaves++;},dispose(){}};s._control({t:'leave',id:'p0',host:'p1'});assert.equal(leaves,1);assert.equal(s.lobby.players.length,0);s.leave(true);}
});
