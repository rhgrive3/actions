// Node-only platform shim for browser QA. Admission and membership always run
// through the production Worker fetch/RoomDurableObject, never handleSession.
import * as productionWorker from '../../server/src/index.js';

class Endpoint {
  constructor() { this.listeners=new Map();this.pending=[];this.closed=null;this.external=null; }
  accept() {}
  get bufferedAmount() { return this.peer.external?.bufferedAmount || 0; }
  send(data) { if(this.closed)throw new Error('Closed fixture endpoint');this.peer.emit('message',{data}); }
  addEventListener(kind,fn) {
    this.listeners.set(kind,fn);
    if(kind==='message')for(const event of this.pending.splice(0))fn(event);
    if(kind==='close'&&this.closed)fn(this.closed);
  }
  emit(kind,event) {
    const fn=this.listeners.get(kind);
    if(fn)fn(event);
    else if(kind==='message') {
      // Only pre-binding control messages can queue; live traffic is forwarded.
      if(this.pending.length>=16)throw new Error('Unbound relay fixture overflow');
      this.pending.push(event);
    }
  }
  close(code=1000,reason='bye') {
    if(this.closed)return;
    this.closed={code,reason};this.emit('close',this.closed);
    if(!this.peer.closed){this.peer.closed={code,reason};this.peer.emit('close',this.peer.closed);}
  }
}

// The production fetch functions currently do all platform construction before
// returning their Promise. Restore globals synchronously, never across await.
function fetchWithWorkerPlatform(request,env,worker) {
  const response=globalThis.Response,pair=globalThis.WebSocketPair;
  globalThis.Response=class {
    constructor(body,init={}) {
      if(init.status===101)return {status:101,webSocket:init.webSocket};
      return new response(body,init);
    }
  };
  globalThis.WebSocketPair=class {
    constructor(){this[0]=new Endpoint();this[1]=new Endpoint();this[0].peer=this[1];this[1].peer=this[0];}
  };
  try {return worker.default.fetch(request,env,{});}
  finally {globalThis.Response=response;if(pair===undefined)delete globalThis.WebSocketPair;else globalThis.WebSocketPair=pair;}
}

export function createLocalRelay({rooms=new Map(),worker=productionWorker}={}) {
  const env = {ROOMS: {
    idFromName: code => code,
    get(code) {
      return {fetch(request) {
        let room = rooms.get(code);
        if (!room) rooms.set(code, room = new worker.RoomDurableObject({}, {}));
        return room.fetch(request);
      }};
    },
  }};
  return async function connect(ws,request,{send,receive}={}) {
    let endpoint=null,closed=false;
    ws.on('message',data=>{if(!endpoint||closed)return;const text=data.toString();receive?.(text);endpoint.send(text);});
    ws.on('close',()=>{closed=true;endpoint?.close();});
    const input={url:new URL(request.url,'http://localhost').href,method:request.method||'GET',headers:new Headers(request.headers)};
    const response=await fetchWithWorkerPlatform(input,env,worker);
    if(response.status!==101){
      const reason=await response.text();
      if(ws.readyState===1){ws.send(JSON.stringify({t:'err',e:reason}));ws.close(1008,reason.slice(0,120));}
      return {status:response.status,accepted:false};
    }
    endpoint=response.webSocket;endpoint.external=ws;
    if(closed||ws.readyState!==1){endpoint.close();return {status:101,accepted:false};}
    const deliver=text=>{if(ws.readyState===1)ws.send(text);};
    endpoint.addEventListener('message',({data})=>send?send(data,deliver):deliver(data));
    endpoint.addEventListener('close',({code,reason})=>{if(ws.readyState===1)ws.close(code,reason);});
    return {status:101,accepted:!endpoint.closed};
  };
}
