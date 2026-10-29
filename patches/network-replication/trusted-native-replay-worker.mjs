// Host-side worker/realm RPC adapter. The host supplies an already-created
// isolated native session and authenticates every operation out of band.
// Running this in an attacker's browser does not create a trusted authority.
import {advanceTrustedNativeReplay,peekTrustedNativeContact,commitTrustedNativeContact,inspectTrustedNativeReplay,disposeTrustedNativeReplay} from './trusted-native-replay.mjs';

export function attachTrustedNativeReplayWorker(port,session,{authorize,allowInspection=false}={}){
  if(typeof port?.postMessage!=='function'||typeof authorize!=='function'||!inspectTrustedNativeReplay(session))throw Error('Native worker session and trusted authorization callback required');
  let closed=false,lastId=0;
  const send=(id,result)=>{try{port.postMessage({id,...result});}catch(error){close();}};
  const handle=data=>{
    if(closed)return;
    const id=data?.id;
    if(!Number.isSafeInteger(id)||id<=lastId||id<=0){send(id,{ok:false,reason:'worker-request-order'});return;}
    lastId=id;
    if(!data||Object.keys(data).some(k=>!['id','operation','frame','claim'].includes(k))){send(id,{ok:false,reason:'invalid-worker-request'});return;}
    try{
      const auth=authorize(data);
      if(!auth||typeof auth.then==='function'){send(id,{ok:false,reason:'trusted-worker-authorization-required'});return;}
      if(data.operation==='advance'){send(id,advanceTrustedNativeReplay(session,data.frame,auth));return;}
      const state=inspectTrustedNativeReplay(session);
      if(auth.epoch!==state.epoch){send(id,{ok:false,reason:'worker-epoch-mismatch'});return;}
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
    }catch(error){send(id,{ok:false,reason:'native-worker-fault'});close();}
  };
  const listener=event=>handle(event.data);
  if(typeof port.addEventListener==='function'){port.addEventListener('message',listener);port.start?.();}
  else if(typeof port.on==='function')port.on('message',handle);
  else throw Error('Native worker message port required');
  function close(){
    if(closed)return;closed=true;
    port.removeEventListener?.('message',listener);port.off?.('message',handle);
    disposeTrustedNativeReplay(session);
  }
  return Object.freeze({close});
}
