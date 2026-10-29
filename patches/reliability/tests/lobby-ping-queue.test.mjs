import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {validMeUpdate} from '../session-admission.mjs';
const code=adaptBuildSource('src/net/session.js',fs.readFileSync(new URL('../../../inkwave-public/src/net/session.js',import.meta.url),'utf8'));
function method(name){const start=code.indexOf('  '+name+'('),end=name==='update'?code.indexOf('\n}',start):start+code.slice(start).search(/\n  [A-Za-z_]\w*\(/);assert.ok(start>=0&&end>start);return new Function('validMeUpdate','WEAPONS','return ({'+code.slice(start,end)+'})')(validMeUpdate,{shooter:{},roller:{}})[name];}
const update=method('update'),apply=method('_applyMe');
test('production guest lobby ping sends only changes, retries false, and resets by host/transport/lobby identity',()=>{
 let sends=0,accept=true,updates=0;const tr={rtt:20.1,sendTo(host,o){sends++;assert.equal(o.k,'me');return accept;}};
 const s={tr,state:'lobby',isHost:false,hostId:'h',lobby:{},match:{update(){updates++;}}};
 for(let i=0;i<8;i++)update.call(s,2);assert.equal(sends,1);assert.equal(updates,8);
 tr.rtt=20.4;update.call(s,2);assert.equal(sends,1);tr.rtt=20.6;update.call(s,2);assert.equal(sends,2);
 accept=false;tr.rtt=23;update.call(s,2);update.call(s,2);assert.equal(sends,4);accept=true;update.call(s,2);update.call(s,2);assert.equal(sends,5);
 s.hostId='new';update.call(s,2);s.lobby={};update.call(s,2);s.tr={...tr};update.call(s,2);assert.equal(sends,8);
});
test('production host unchanged ping avoids broadcast only for a valid ping-only update',()=>{
 let broadcasts=0,fixes=0;const p={id:'g',ping:20,weapon:'shooter',team:0};const s={hostId:'h',lobby:{players:[p],teamsConfirmed:true},_fixTeams(){fixes++;},_broadcastLobby(){broadcasts++;}};
 apply.call(s,'g',{k:'me',ping:20.3});assert.equal(broadcasts,0);assert.equal(fixes,0);
 apply.call(s,'g',{k:'me',ping:21});assert.equal(broadcasts,1);assert.equal(p.ping,21);
 apply.call(s,'g',{k:'me',ping:21,name:'Changed'});assert.equal(broadcasts,2);assert.equal(p.name,'Changed');
 apply.call(s,'unknown',{k:'me',ping:22});apply.call(s,'g',{k:'me',ping:Infinity});assert.equal(broadcasts,2);
});
