// Admission for one expected browser media abort at the menu -> battle handoff.
// Preserve every raw request failure. Only an exactly named, retired menu
// recording may be classified as a lifecycle cancellation, and only after
// independently observing successful current battle recording delivery/playback.
const MENU_RECORDING='menu_the_ika_swing_aoi_kenban.mp3';
function battleReady(receipt) {
  if (!receipt?.assetURL || !Array.isArray(receipt.network) || !Array.isArray(receipt.snapshots)) return false;
  const response=receipt.network.find(row=>row.event==='response'&&row.url===receipt.assetURL&&row.status===200);
  // CDP loadingFinished identifies the request by ID; unlike the response,
  // it does not include a URL. Bind it to the exact successful response.
  const completed=typeof response?.requestId==='string'&&response.requestId.length>0&&
    receipt.network.some(row=>row.event==='finished'&&row.requestId===response.requestId&&
      (row.url===undefined||row.url===receipt.assetURL));
  const playing=receipt.snapshots.some(row=>{
    if(row.reason!=='native-playing-capture-ready')return false;
    const s=row.state,player=s?.current,media=player?.element;
    return s?.matchState==='playing'&&s.track==='battle'&&s.desiredTrack==='battle'&&
      player?.id==='battle'&&player.disposed===false&&player.failed===false&&
      media?.readyState>=3&&media.paused===false&&media.error===null&&media.currentSrc===receipt.assetURL;
  });
  return !!response&&completed&&playing;
}
export function classifyRetiredMenuAudioAbort({requests,siteURL,revision,receipt,gameplayState}={}) {
  const failures=Array.isArray(requests)?requests:[];
  const verified=[],unverified=[];
  if(typeof siteURL!=='string'||typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision))
    return {verified,unverified:[...failures]};
  const menu=new URL(`_versions/${revision}/assets/audio/${MENU_RECORDING}`,siteURL).href;
  const ready=gameplayState==='playing'&&battleReady(receipt);
  for(const failure of failures){
    if(ready&&verified.length===0&&failure?.url===menu&&failure.error==='net::ERR_ABORTED'){
      verified.push({...failure,reason:'Retired menu MediaElement canceled during verified battle-track handoff'});
    }else unverified.push(failure);
  }
  return {verified,unverified};
}
