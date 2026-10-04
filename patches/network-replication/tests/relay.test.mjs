import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RoomDurableObject} from '../../../server/src/index.js';

// Exercise the production fetch validation, adapting only the unavailable
// Cloudflare WebSocketPair and 101 Response primitives in Node.
test('production relay rejects late join to a locked running match',async()=>{
 const originalPair=globalThis.WebSocketPair,originalResponse=globalThis.Response,frames=[],closed=[];
 globalThis.WebSocketPair=class{constructor(){this[0]={};this[1]={accept(){},send(s){frames.push(JSON.parse(s));},close(...args){closed.push(args);}}}};
 globalThis.Response=class{constructor(_body,init){Object.assign(this,init);}};
 try{
  const room=new RoomDurableObject({},{});room.members.set('owner',{name:'Owner'});room.locked=true;
  const response=await room.fetch(new Request('https://relay/room/TEST?name=Late',{headers:{Upgrade:'websocket'}}));
  assert.equal(response.status,101);assert.deepEqual(frames,[{t:'err',e:'Match in progress'}]);assert.deepEqual(closed,[[1008,'Match in progress']]);assert.equal(room.members.size,1);
 }finally{if(originalPair===undefined)delete globalThis.WebSocketPair;else globalThis.WebSocketPair=originalPair;globalThis.Response=originalResponse;}
});
