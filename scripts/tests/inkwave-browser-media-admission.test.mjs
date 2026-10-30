import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRetiredMenuAudioAbort } from '../lib/inkwave-browser-media-admission.mjs';
const rev='a'.repeat(64),siteURL='http://127.0.0.1:40000/';
const menu=new URL('_versions/'+rev+'/assets/audio/menu_the_ika_swing_aoi_kenban.mp3',siteURL).href;
const battle=new URL('_versions/'+rev+'/assets/audio/Jet_Arrow.mp3',siteURL).href;
const aborted={url:menu,error:'net::ERR_ABORTED'};
function receipt(){
 return {assetURL:battle,
   network:[{event:'response',requestId:'42',url:battle,status:200},{event:'finished',requestId:'42',url:battle}],
   snapshots:[{reason:'native-playing-capture-ready',state:{matchState:'playing',track:'battle',desiredTrack:'battle',
      current:{id:'battle',disposed:false,failed:false,element:{readyState:4,paused:false,error:null,currentSrc:battle}}}}]};
}
function run(requests,changes={}){
 return classifyRetiredMenuAudioAbort({requests,siteURL,revision:rev,receipt:receipt(),gameplayState:'playing',...changes});
}
test('one exactly versioned retired menu stream abort is recorded, not dropped, after independently verified battle playback',()=>{
 const r=run([aborted]);assert.equal(r.unverified.length,0);assert.equal(r.verified.length,1);
 assert.equal(r.verified[0].url,menu);assert.match(r.verified[0].reason,/Retired menu/);
});
test('all other aborts, actual media errors and duplicated cancellations fail closed',()=>{
 const other={url:new URL('_versions/'+rev+'/assets/audio/other.mp3',siteURL).href,error:'net::ERR_ABORTED'};
 const result=run([aborted,{url:menu,error:'net::ERR_FAILED'},other,aborted]);
 assert.equal(result.verified.length,1);assert.deepEqual(result.unverified,[{url:menu,error:'net::ERR_FAILED'},other,aborted]);
 assert.equal(run([{url:battle,error:'net::ERR_ABORTED'}]).unverified.length,1);
 assert.equal(run([{url:menu.replace(rev,'b'.repeat(40)),error:'net::ERR_ABORTED'}]).unverified.length,1);
});
test('missing playback/network or non-playing match never permits menu cancellation',()=>{
 for(const changes of [{gameplayState:'intro'},{receipt:{...receipt(),network:[]}},
   {receipt:{...receipt(),snapshots:[]}},
   {receipt:{...receipt(),network:[{event:'response',url:battle,requestId:'42',status:404},{event:'finished',url:battle,requestId:'42'}]}},
   {receipt:{...receipt(),snapshots:[{reason:'native-playing-capture-ready',state:{track:'battle',matchState:'playing',current:{id:'battle',element:{readyState:0}}}}]}},
   {revision:'untrusted'}]){
  const r=run([aborted],changes);assert.equal(r.verified.length,0);assert.deepEqual(r.unverified,[aborted]);
 }
});
