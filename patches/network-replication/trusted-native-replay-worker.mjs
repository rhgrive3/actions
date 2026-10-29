// Host-side worker/realm RPC adapter. The host supplies an already-created
// isolated native session and authenticates every operation out of band.
// Running this in an attacker's browser does not create a trusted authority.
import {advanceTrustedNativeReplay,peekTrustedNativeContact,commitTrustedNativeContact,inspectTrustedNativeReplay,disposeTrustedNativeReplay} from './trusted-native-replay.mjs';
import {createNativeCommandScheduler,enrollNativeCommandSchedulerPeer,receiveNativeCommandSchedulerPacket,checkNativeCommandScheduler,disposeNativeCommandScheduler,revokeNativeCommandSchedulerOwner} from './native-command-scheduler.mjs';

export function attachTrustedNativeReplayWorker(port,session,{authorize,allowInspection=false,commandRoom=null}={}){
  if(typeof port?.postMessage!=='function'||typeof authorize!=='function'||!inspectTrustedNativeReplay(session))throw Error('Native worker session and trusted authorization callback required');
  // Explicit trusted host configuration, never inferred from a request. Legacy
  // callers keep their existing complete-frame API. Scheduled rooms cannot use
  // that API to bypass authenticated per-owner admission and the room barrier.
  const scheduler=commandRoom===null?null:createNativeCommandScheduler(session,commandRoom);
  let closed=false,lastId=0,handling=false,faultPending=false;
  const send=(id,result)=>{
    if(scheduler&&faultPending&&result.ok&&close())result={ok:false,reason:'native-worker-fault'};
    try{port.postMessage({id,...result});}catch(error){if(!close()&&scheduler)faultPending=true;}
  };
  const processRequest=data=>{
    if(closed)return;
    const id=data?.id;
    if(!Number.isSafeInteger(id)||id<=0||!scheduler&&id<=lastId){send(id,{ok:false,reason:'worker-request-order'});return;}
    // Scheduled mode uses IDs only for RPC correlation. Input sequences and
    // native contact capabilities own replay admission, so an owner's large
    // or repeated request ID cannot block another owner's room participation.
    if(!scheduler)lastId=id;
    const fields=scheduler?['id','operation','packet','capability','claim']:['id','operation','frame','claim'];
    if(!data||Object.keys(data).some(k=>!fields.includes(k))){send(id,{ok:false,reason:'invalid-worker-request'});return;}
    try{
      const auth=authorize(data);
      if(!auth||typeof auth.then==='function'){send(id,{ok:false,reason:'trusted-worker-authorization-required'});return;}
      if(data.operation==='advance'&&!scheduler){send(id,advanceTrustedNativeReplay(session,data.frame,auth));return;}
      const state=inspectTrustedNativeReplay(session);
      if(auth.epoch!==state.epoch){send(id,{ok:false,reason:'worker-epoch-mismatch'});return;}
      if(scheduler){
        const status=checkNativeCommandScheduler(scheduler);
        if(!status.ok){send(id,status);return;}
        if(data.operation==='enroll'){send(id,enrollNativeCommandSchedulerPeer(scheduler,data.capability,auth));return;}
        if(data.operation==='commands'){send(id,receiveNativeCommandSchedulerPacket(scheduler,data.packet,auth));return;}
      }
      if(data.operation==='claim'){
        const actor=state.actors.find(a=>a.nid===data.claim?.attacker);
        if(!actor||auth.from!==actor.owner){send(id,{ok:false,reason:'worker-claim-owner'});return;}
        const receipt=peekTrustedNativeContact(session,data.claim),effect=receipt&&commitTrustedNativeContact(session,receipt);
        // Private capabilities never cross the port. The authenticated host
        // receives the committed native result, not a client-mintable token.
        send(id,effect?{ok:true,effect}:{ok:false,reason:'no-native-contact'});return;
      }
      if(data.operation==='inspect'&&allowInspection&&auth.inspect===true){send(id,{ok:true,state});return;}
      send(id,{ok:false,reason:'unsupported-worker-operation'});
    }catch(error){send(id,{ok:false,reason:'native-worker-fault'});if(!close()&&scheduler)faultPending=true;}
  };
  const handle=data=>{
    if(closed)return;
    // Real MessageChannel dispatch is asynchronous. Preserve the same safety
    // for a host adapter which dispatches synchronously from a native callback.
    if(scheduler&&handling){send(data?.id,{ok:false,reason:'reentrant-native-command-worker'});return;}
    if(scheduler)handling=true;
    try{processRequest(data);}
    finally{if(scheduler){handling=false;if(faultPending){faultPending=false;close();}}}
  };
  const listener=event=>handle(event.data);
  if(typeof port.addEventListener==='function'){port.addEventListener('message',listener);port.start?.();}
  else if(typeof port.on==='function')port.on('message',handle);
  else throw Error('Native worker message port required');
  function close(){
    if(closed)return scheduler?true:undefined;
    if(scheduler&&!disposeNativeCommandScheduler(scheduler))return false;
    closed=true;
    port.removeEventListener?.('message',listener);port.off?.('message',handle);
    disposeTrustedNativeReplay(session);
    return scheduler?true:undefined;
  }
  return Object.freeze(scheduler?{close,revokeOwner:owner=>!closed&&revokeNativeCommandSchedulerOwner(scheduler,owner)}:{close});
}
