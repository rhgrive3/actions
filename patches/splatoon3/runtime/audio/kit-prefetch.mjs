import {KIT_AUDIO} from './kit-recipes.mjs';
import {sourceEventRoute, EXTRA_SPECIAL_ACTION_SOURCE} from './extra-source-routes.mjs';

// Speculation belongs to the currently selected local kit. Required playback
// requests and already-started decodes remain owned by the loader.
export function cancelRecordedKitPrefetch(state) {
  const row=state.kitPrefetch;
  if(row)row.loader.cancelOwner?.(row.owner);
  state.kitPrefetch=null;
  state.preloadedKit=null;
}

function requestsFor(sub,special) {
  const requests=[],seen=new Set();
  const add=(id,event)=>{const key=id+':'+event;if(seen.has(key))return;seen.add(key);requests.push({id,event,key,next:0,promise:null,attempted:false});};
  for(const id of ['sub:'+sub,'special:'+special])for(const event of KIT_AUDIO[id]?.events||[]){
    add(id,event);
    const extra=sourceEventRoute(id,event);if(extra)add(extra,'fire');
  }
  for(const [action,cue] of Object.entries(EXTRA_SPECIAL_ACTION_SOURCE))if(action.startsWith(special+':'))add(cue,'fire');
  // Queue immediate shots first, after the selected main's existing priority
  // request. Do not move speculative kit work ahead of required START audio.
  requests.sort((a,b)=>(b.event==='fire')-(a.event==='fire'));
  return requests;
}

export function refreshRecordedKitPrefetch(state,loader,context,sub,special,now=Date.now) {
  const key=String(sub||'')+'|'+String(special||'');
  let row=state.kitPrefetch;
  if(!row||row.loader!==loader||row.context!==context||row.key!==key){
    cancelRecordedKitPrefetch(state);
    row=state.kitPrefetch={loader,context,key,owner:{},requests:requestsFor(sub,special),resident:null,generation:-1,status:null,next:0,dirty:true};
    state.preloadedKit=key;
  }
  const bank=loader.bank?.authorized;
  const changed=row.resident!==bank?.loaded||row.generation!==bank?.generation||row.status!==loader.status;
  if(!changed&&!row.dirty&&row.next===Infinity)return row;
  const stamp=now();
  if(!changed&&!row.dirty&&stamp<row.next)return row;
  row.resident=bank?.loaded;row.generation=bank?.generation;row.status=loader.status;row.dirty=false;row.next=Infinity;
  const batch=[];
  const submit=()=>{
    if(!batch.length)return;
    const combined=typeof loader.ensureMany==='function'?loader.ensureMany(batch,{owner:row.owner}):null;
    for(const request of batch){
      const promise=request.promise=combined?(loader.inFlight?.get(request.key)||combined):loader.ensure(request.id,request.event,{owner:row.owner});
      promise?.then(()=>{if(state.kitPrefetch===row){if(loader.isEventResident?.(request.id,request.event))request.next=0;row.dirty=true;}},()=>{if(state.kitPrefetch===row)row.dirty=true;});
    }
    batch.length=0;
  };
  for(const request of row.requests){
    const {id,event,key:requestKey}=request;
    if(loader.declares?.(id,event)===false)continue;
    if(loader.isEventResident?.(id,event))continue;
    // Long continuous cues retain demand paging in their real loop handles;
    // an eviction must not continually reload unused spin/charge variants.
    if(request.attempted&&(event==='spin'||event==='charge'))continue;
    if(loader.inFlight?.has(requestKey)){
      // Join ownership once when entering a kit; ensure's existing in-flight
      // branch shares the promise and does not start a second decode.
      if(request.promise!==loader.inFlight.get(requestKey)){
        const joined=request.promise=loader.ensure(id,event,{owner:row.owner});
        joined?.then(()=>{if(state.kitPrefetch===row)row.dirty=true;},()=>{if(state.kitPrefetch===row)row.dirty=true;});
      }
      row.next=Math.min(row.next,stamp+1000);continue;
    }
    const retry=Math.max(request.next,loader.manifestRetryAt||0,loader.retryAfter?.get(requestKey)||0);
    if(retry>stamp){row.next=Math.min(row.next,retry);continue;}
    request.attempted=true;request.next=stamp+1000;
    batch.push(request);if(batch.length===2)submit();
    row.next=Math.min(row.next,stamp+1000);
  }
  submit();
  return row;
}
