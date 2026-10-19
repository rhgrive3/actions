import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { observeStreamedMusic } from '../lib/inkwave-streamed-music-diagnostics.mjs';
const assetURL='http://127.0.0.1:9999/_versions/rev/assets/audio/Jet_Arrow.mp3';
async function fixture({ fail=false, ownerGlobal='__G' }={}) {
 const events=new Map(), calls=[], receipt={};
 const media={currentSrc:assetURL,currentTime:1,duration:120,paused:false,ended:false,seeking:false,readyState:4,networkState:1,error:null,getAttribute:()=>assetURL};
 const player={id:'battle',disposed:false,failed:false,element:media};
 const window={__G:{music:{track:'battle',_desiredTrack:'battle',current:player,players:[player],ctx:{state:'running',currentTime:10}},match:{state:'playing'}}};
 const cdp={on:(name,fn)=>events.set(name,fn),send:async name=>calls.push(name)};
 const emit=(name,data)=>events.get(name)?.(data);
 const page={evaluate:async (fn,arg)=>vm.runInNewContext('('+fn.toString()+')(arg)', {window,arg})};
 const context={newCDPSession:async()=>{if(fail)throw Error('unsupported');return cdp;},close:async()=>{
  calls.push('close');emit('Network.loadingFailed',{requestId:'jet',timestamp:12,errorText:'net::ERR_ABORTED',canceled:true,type:'Media'});return 'closed';}};
 const observer=await observeStreamedMusic({context,page,assetURL,receipt,ownerGlobal});
 const request=(id,url=assetURL)=>emit('Network.requestWillBeSent',{requestId:id,timestamp:1,wallTime:2,type:'Media',request:{url,method:'GET',headers:{Range:'bytes=0-'}}});
 return {emit,calls,receipt,media,player,page,context,observer,request,window};
}
test('records only exact Jet request IDs and preserves HTTP/range evidence',async()=>{
 const f=await fixture();f.request('other',assetURL.replace('Jet_Arrow','other'));f.request('query',assetURL+'?x=1');f.request('jet');
 f.emit('Network.responseReceived',{requestId:'jet',timestamp:2,type:'Media',response:{url:assetURL,status:206,mimeType:'audio/mpeg',headers:{'Content-Range':'bytes 0-9/10'}}});
 f.emit('Network.loadingFinished',{requestId:'other',encodedDataLength:10});f.emit('Network.loadingFinished',{requestId:'jet',encodedDataLength:10});
 assert.deepEqual(f.calls,['Network.enable','Media.enable']);assert.deepEqual(f.receipt.network.map(x=>x.event),['request','response','finished']);assert.equal(f.receipt.network[0].range,'bytes=0-');assert.equal(f.receipt.network[1].status,206);
});
test('expected context-close cancel is distinguished but never automatically accepted',async()=>{
 const f=await fixture();f.request('jet');await f.observer.snapshot('playing');f.media.currentTime=5;
 assert.equal(await f.observer.close(),'closed');const row=f.receipt.network.at(-1);assert.equal(row.phase,'context-close');assert.equal(row.cancellationObserved,true);assert.equal(row.autoAccepted,false);
 assert.equal(f.receipt.snapshots[0].state.current.element.currentTime,1);assert.equal(f.receipt.snapshots[1].state.current.element.currentTime,5);assert.equal(f.calls.at(-1),'close');
});
test('real transport failure and MediaError stay explicit during capture',async()=>{
 const f=await fixture();f.request('jet');f.emit('Network.loadingFailed',{requestId:'jet',errorText:'net::ERR_CONNECTION_RESET',canceled:false,type:'Media'});
 f.emit('Media.playerPropertiesChanged',{playerId:'p',properties:[{name:'kURL',value:assetURL}]});f.emit('Media.playerErrorsRaised',{playerId:'p',errors:[{errorType:'PipelineError',code:2}]});
 f.media.error={code:2,message:'network failure'};await f.observer.snapshot('failed');assert.equal(f.receipt.network.at(-1).phase,'capture');assert.equal(f.receipt.network.at(-1).cancellationObserved,false);assert.equal(f.receipt.media.at(-1).event,'playerErrorsRaised');assert.equal(f.receipt.snapshots[0].state.current.element.error.code,2);
});
test('observes only Jet players including bounded pre-URL history',async()=>{
 const f=await fixture();f.emit('Media.playerEventsAdded',{playerId:'p',events:[{value:JSON.stringify({event:'kPlay'})}]});
 f.emit('Media.playerPropertiesChanged',{playerId:'other',properties:[{name:'kURL',value:'https://example.org/other.mp3'}]});assert.equal(f.receipt.media.length,0);
 f.emit('Media.playerEventsAdded',{playerId:'p',events:[{value:JSON.stringify({event:'kLoad',url:assetURL})}]});
 assert.equal(f.receipt.media.length,2);assert.ok(f.receipt.media.every(x=>x.data.playerId==='p'));
});
test('event volume, unknown player histories, and huge values are bounded',async()=>{
 const f=await fixture();for(let i=0;i<10000;i++)f.emit('Media.playerEventsAdded',{playerId:'unknown'+i,events:[{value:'x'.repeat(20000)}]});
 f.emit('Media.playerPropertiesChanged',{playerId:'p',properties:[{name:'kURL',value:assetURL}]});for(let i=0;i<1000;i++)f.emit('Media.playerMessagesLogged',{playerId:'p',messages:[{message:'x'.repeat(20000)}]});
 for(let i=0;i<1000;i++)f.request('jet'+i);assert.ok(f.receipt.media.length<=256);assert.ok(f.receipt.network.length<=128);assert.ok(f.receipt.dropped.media>0);assert.ok(f.receipt.dropped.network>0);assert.ok(JSON.stringify(f.receipt).length<600000);
});
test('unavailable CDP and closed-page snapshots remain diagnostic failures',async()=>{
 const f=await fixture({fail:true});assert.equal(f.receipt.enabled,false);assert.match(f.receipt.diagnostics[0].error,/unsupported/);f.page.evaluate=async()=>{throw Error('page closed');};await f.observer.close();assert.match(f.receipt.snapshots[0].error,/page closed/);assert.equal(f.calls.at(-1),'close');
});
test('observer does not call playback, seek, network mutation, or schedule timers',async()=>{
 const f=await fixture();Object.defineProperty(f.media,'currentTime',{get:()=>1,set:()=>assert.fail('seek')});f.media.play=()=>assert.fail('play');f.media.pause=()=>assert.fail('pause');f.media.load=()=>assert.fail('load');await f.observer.snapshot('observe');assert.deepEqual(f.calls,['Network.enable','Media.enable']);
});
test('runner keeps original failure gate, workload and local server byte-identical',()=>{
 const runner=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
 const gate="page.on('requestfailed', r => mimeErrors.push(`request failed ${r.url()}: ${r.failure()?.errorText || 'unknown'}`));";
 assert.ok(runner.includes(gate));assert.ok(runner.includes("report.status = report.errors.length ? 'failed' : 'passed';"));
 let restored=runner;
 const revert=(current,prior)=>{assert.equal(restored.split(current).length,2);restored=restored.replace(current,prior);};
 revert("import { observeStreamedMusic } from './lib/inkwave-streamed-music-diagnostics.mjs';\n",'');
 revert(`  const streamedMusicReceipt = { mobile };
  (report.streamedMusicDiagnostics ||= []).push(streamedMusicReceipt);
  const streamedMusic = await observeStreamedMusic({ context, page,
    assetURL: new URL(\`_versions/\${manifest.build.revision}/assets/audio/Jet_Arrow.mp3\`, address).href,
    receipt: streamedMusicReceipt });\n`,'');
 revert("  await streamedMusic.snapshot('native-playing-capture-ready');\n  return { context, page, close: streamedMusic.close };",'  return { context, page };');
 revert('  const { context, page, close } = await openGameContext({ mobile });','  const { context, page } = await openGameContext({ mobile });');
 revert('  await close();\n  return record;','  await context.close();\n  return record;');
 revert('finally { await visual.close(); }','finally { await visual.context.close(); }');
 assert.equal(crypto.createHash('sha256').update(restored).digest('hex'),'1fc5fa3f71f92e5b267b3db306ae0112900f255231791780a01ecd4fd941f9d3','Removing observation-only hunks restores the exact 67db runner, including workload and error gate');
 assert.equal(runner.match(/await close\(\);/g).length,1);assert.equal(runner.match(/await visual.close\(\);/g).length,1);
});

test('snapshot cap is explicit and close failures keep their original rejection',async()=>{
 const f=await fixture();for(let i=0;i<20;i++)await f.observer.snapshot('bounded');assert.equal(f.receipt.snapshots.length,8);assert.equal(f.receipt.dropped.snapshots,12);
 f.context.close=async()=>{throw Error('close failed');};await assert.rejects(f.observer.close(),/close failed/);assert.ok(f.receipt.closeStartedAt);assert.ok(f.receipt.closeFinishedAt);
});

test('both harnesses explicitly resolve their actual game global and report missing bindings',async()=>{
 for(const ownerGlobal of ['__G','s3ProbeG']) {
  const f=await fixture({ownerGlobal});if(ownerGlobal==='s3ProbeG'){f.window.s3ProbeG=f.window.__G;delete f.window.__G;}
  await f.observer.snapshot('bound');assert.equal(f.receipt.snapshots[0].state.ownerGlobal,ownerGlobal);assert.equal(f.receipt.snapshots[0].state.ownerPresent,true);assert.equal(f.receipt.snapshots[0].state.musicPresent,true);assert.equal(f.receipt.snapshots[0].state.current.element.currentTime,1);
  delete f.window[ownerGlobal];await f.observer.snapshot('unbound');assert.equal(f.receipt.snapshots[1].state.ownerPresent,false);assert.equal(f.receipt.snapshots[1].state.musicPresent,false);
 }
});
