import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {EventEmitter} from 'node:events';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import {createLocalRelay} from '../../scripts/lib/inkwave-local-relay-fixture.mjs';
const root=new URL('../../',import.meta.url);
const files=['check-inkwave-ranked-browser','check-inkwave-native-camera-basis','check-inkwave-native-online','check-inkwave-native-catalogue-online','check-inkwave-native-mahi-browser','check-inkwave-lemuria-unavailable','check-inkwave-room-gyro','check-inkwave-volley-vortex','check-five-shooter-network','check-inkwave-network-browser'];
class Socket extends EventEmitter{constructor(){super();this.sent=[];this.readyState=1;this.bufferedAmount=0;}send(x){this.sent.push(x);}close(){if(this.readyState!==1)return;this.readyState=3;this.emit('close');}}
const req=(name,create=false,compat='iw-gameplay-20261019-r2')=>({url:`/room/BCEFG?v=2&compat=${compat}&name=${name}${create?'&create=1':''}`,method:'GET',headers:{upgrade:'websocket'}});
for(const file of files)test(file+' real callback preserves admission, positive latency, and trace observations',async()=>{
 const s=fs.readFileSync(new URL('scripts/'+file+'.mjs',root),'utf8'),ast=parse(s,{sourceType:'module',ecmaVersion:'latest'});
 const call=ast.body.find(n=>n.type==='ExpressionStatement'&&n.expression.callee?.object?.name==='relay'&&n.expression.callee?.property?.name==='on'&&n.expression.arguments[0]?.value==='connection').expression;
 const body=s.slice(call.arguments[1].start,call.arguments[1].end);assert(!s.includes('.handleSession('));assert(s.includes(file==='check-inkwave-native-catalogue-online'?'createLocalRelay({rooms,worker})':'createLocalRelay({rooms})'));
 const rooms=new Map(),connector=createLocalRelay({rooms}),h=new Socket(),g=new Socket(),bad=new Socket();
 const probe=new Function('connectRelay',`let delay=7,delayFrames=3,wireFrame=11,packets=0;const wire=[],wireStarts=[],withheld=[],pending=[],trace=[],timeouts=[];const traceTick=(...args)=>trace.push(args),setTimeout=(fn,ms)=>timeouts.push({fn,ms});return {callback:(${body}),stats:()=>({packets,wire,wireStarts,withheld,pending,trace,timeouts}),flushTimers:()=>{for(const timer of timeouts.splice(0))timer.fn();}};`)(connector);
 try{
  assert.equal((await probe.callback(h,req('Host',true))).accepted,true);assert.equal((await probe.callback(g,req('Delay'))).accepted,true);assert.equal((await probe.callback(bad,req('Wrong',false,'iw-other-game-version'))).status,409);assert.equal(rooms.get('BCEFG').members.size,2);
  const held=probe.stats().withheld;if(file.includes('room-gyro')||file.includes('volley')){assert.equal(g.sent.length,0,'Delay welcome is withheld');assert.equal(held.length,1);held[0].ws.send(held[0].text);held.splice(0);}
  const welcome=g.sent.map(x=>JSON.parse(x)).find(x=>x.t==='welcome');assert.equal(welcome.proto,2);assert.equal(welcome.compat,'iw-gameplay-20261019-r2');
  const start='b|'+JSON.stringify({k:'start',id:'probe',map:'cargo',mode:'turf',proto:2,compat:welcome.compat});
  h.emit('message',start);
  if(file.includes('ranked')){assert.equal(g.sent.filter(x=>x.startsWith('m|')).length,0);assert.deepEqual(probe.stats().timeouts.map(x=>x.ms),[7]);probe.flushTimers();}
  assert.equal(g.sent.filter(x=>x.startsWith('m|')).length,1,'START reaches the peer once after its configured latency');
  const tick='s|'+welcome.id+'|'+JSON.stringify({k:'t',ts:13,u:[],e:[]});h.emit('message',tick);
  const row=probe.stats(),frameDelay=file.includes('shooter-network')||file.includes('network-browser');
  if(frameDelay){assert.equal(g.sent.filter(x=>x.startsWith('m|')).length,1);assert.equal(row.pending.length,1);assert.equal(row.pending[0].due,14,'original wireFrame + delayFrames');const item=row.pending.shift();assert.equal(item.ws,g);item.ws.send(item.text);}
  if(file.includes('ranked')){assert.deepEqual(row.timeouts.map(x=>x.ms),[7]);probe.flushTimers();}
  assert.equal(g.sent.filter(x=>x.startsWith('m|')).length,2,'directed tick reaches the peer once');
  if(file.includes('native-online')||file.includes('catalogue'))assert.deepEqual(row.trace,[[start,'Host'],[tick,'Host']]);
  if(file.includes('native-')){if(!file.includes('mahi'))assert.equal(row.packets,2);}
  if(file.includes('lemuria')||file.includes('mahi'))assert.deepEqual(row.wireStarts,[{map:'cargo',mode:'turf',...(file.includes('lemuria')?{id:'probe'}:{})}]);
  if(file.includes('room-gyro')||file.includes('volley'))assert.deepEqual(row.wire,[start,tick]);
  if(frameDelay){assert.deepEqual(row.wire.map(x=>({bytes:x.bytes,text:x.text})),[start,tick].map(text=>({bytes:Buffer.byteLength(text),text})));assert(row.wire.every(x=>Number.isFinite(x.at)));}
  // Closing before a delayed delivery cannot produce a post-close send.
  const previous=g.sent.length;h.emit('message',tick);const before=g.sent.length;assert.equal(before,previous+(frameDelay||file.includes('ranked')?0:1));g.close();probe.flushTimers();assert.equal(g.sent.length,before);
  for(const item of row.pending.splice(0))if(item.ws.readyState===1)item.ws.send(item.text);assert.equal(g.sent.length,before);
 }finally{h.close();g.close();bad.close();}assert.equal(rooms.get('BCEFG').members.size,0);
});
