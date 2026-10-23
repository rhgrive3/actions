import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {publicBuildIdentity,verifyPublishedSource} from './inkwave-public-boot-evidence.mjs';
import {validOwnerTickAdvance} from '../../patches/network-replication/snapshot-guard.mjs';

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function ownerClockRelayPayload(text){
  if(typeof text!=='string'||!text.startsWith('m|'))return null;
  const end=text.indexOf('|',2);if(end<0)return null;
  let start=end+1,forwardedAt=null;
  if(text[start]==='@'){
    const stop=text.indexOf('|',start),stamp=text.slice(start+1,stop);
    if(stop<0||!/^\d{1,16}$/.test(stamp))return null;
    forwardedAt=Number(stamp);if(!Number.isSafeInteger(forwardedAt))return null;
    start=stop+1;
  }
  try{return {from:text.slice(2,end),data:JSON.parse(text.slice(start)),forwardedAt};}catch{return null;}
}

// Delay/drop are exclusively at the real WebSocket delivery boundary. Keep the
// first and newest tick while holding a startup backlog, explicitly discarding
// superseded intermediate ticks. Never rewrite a message, a browser clock, a
// guard, a peer state or a native world/Character implementation.
export function ownerClockRelayProbe(relay){
  const wire=[],connections=[],gates=[];let gate=null;
  relay.prependListener('connection',(ws,request)=>{
    const destination=new URL(request.url,'http://localhost').searchParams.get('name');
    connections.push({destination,at:Date.now(),event:'open'});
    ws.on('close',()=>connections.push({destination,at:Date.now(),event:'close'}));
    const native=ws.send.bind(ws);
    ws.send=(text,...args)=>{
      const row=ownerClockRelayPayload(text);
      if(row){
        const d=row.data;
        wire.push({at:Date.now(),destination,from:row.from,forwardedAt:row.forwardedAt,kind:d.k,ts:d.ts,simulationTick:d.u,oc:d.oc,match:d.ocm??d.m??d.id,nonce:d.n,bytes:Buffer.byteLength(text),sha256:hash(text)});
        if(wire.length>20000)throw new Error('Clock browser wire receipt overflow');
        if(gate?.active&&d.k==='t'){
          let held=gate.peers.get(destination);
          if(!held){held={destination,from:row.from,first:{text,args,ts:d.ts,at:Date.now()},last:null,count:0,native,ws};gate.peers.set(destination,held);}
          held.last={text,args,ts:d.ts,at:Date.now()};held.count++;
          return;
        }
      }
      return native(text,...args);
    };
  });
  const describe=()=>gate&&({label:gate.label,startedAt:gate.startedAt,active:gate.active,peers:[...gate.peers.values()].map(p=>({destination:p.destination,from:p.from,firstTs:p.first.ts,lastTs:p.last?.ts,firstHeldAt:p.first.at,lastHeldAt:p.last?.at,firstSha256:hash(p.first.text),lastSha256:p.last&&hash(p.last.text),ticks:p.count,discardedIntermediate:Math.max(0,p.count-2)}))});
  return {wire,connections,gates,
    arm(label){assert(!gate?.active);gate={label,startedAt:Date.now(),active:true,peers:new Map()};},
    describe,
    releaseFirst(){assert.equal(gate.peers.size,2);for(const p of gate.peers.values()){assert.equal(p.ws.readyState,1);p.native(p.first.text,...p.first.args);}return describe();},
    releaseLatest(){const receipt=describe();gate.active=false;for(const p of gate.peers.values())if(p.last&&p.last.ts>p.first.ts)p.native(p.last.text,...p.last.args);gates.push(receipt);return receipt;},
  };
}

export function verifyOwnerClockSite(site,sourceSha){
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
  const identity=publicBuildIdentity(manifest),source=verifyPublishedSource(manifest,root,sourceSha);
  for(const [file,digest]of Object.entries(manifest.artifacts))assert.equal(hash(fs.readFileSync(path.join(site,file))),digest,file);
  const worker=fs.readFileSync(path.join(root,'server/src/index.js'));
  assert.equal(hash(worker),hash(execFileSync('git',['show',sourceSha+':server/src/index.js'],{cwd:root,maxBuffer:4*1024*1024})),'production relay must match the pinned source revision');
  const harnessSha256=Object.fromEntries(['scripts/check-inkwave-native-online.mjs','scripts/lib/inkwave-owner-clock-browser.mjs','scripts/lib/inkwave-local-relay-fixture.mjs'].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));
  return {...source,...identity,relaySha256:hash(worker),harnessSha256};
}

export async function runOwnerClockBrowser({pages,relay,site,out,sourceSha}){
  const identity=verifyOwnerClockSite(site,sourceSha);
  const receipt={status:'running',issue:1767,scope:'owner-clock acceptance only; later Charger air/keep changes are excluded from this foundation build',...identity,transport:'real browser WebSocket + production Worker fetch / RoomDurableObject',
    browserContexts:2,browserVersion:pages[0].context().browser()?.version(),world:'full production Game/Match/stage/Actor/Character; low-quality renderer',
    controls:'native real performance.now; guards and peer state unchanged; native frame stepping with skipped render between screenshots',
    relayFault:'hold first/newest owner ticks for at least seven real seconds; discard superseded intermediate ticks explicitly',
    cases:[],connections:relay.connections,wire:relay.wire,limits:['Local Node adapts the Cloudflare WebSocket upgrade; not the deployed relay service.','Two isolated browser contexts share one Chromium process.','Software rendering and manually scheduled native frames do not establish physical-device frame pacing or Switch parity.']};
  const write=()=>fs.writeFileSync(path.join(out,'owner-clock-browser.json'),JSON.stringify(receipt,null,2)+'\n');
  const pump=async()=>{
    await Promise.all(pages.map(page=>page.evaluate(()=>{NG.game._skipRender=true;NG.game._frame(1/60);} )));
    await new Promise(resolve=>setTimeout(resolve,20));
  };
  const until=async(test,label,timeout=180000)=>{
    const deadline=Date.now()+timeout;let last,nextLog=Date.now()+15000;
    while(Date.now()<deadline){await pump();last=await test();if(last)return;
      if(Date.now()>=nextLog){console.log('owner clock wait '+label);nextLog=Date.now()+15000;}}
    throw new Error('Clock browser timeout: '+label+'; '+JSON.stringify(last));
  };
  const snapshot=()=>Promise.all(pages.map(page=>page.evaluate(async()=>{
    const G=NG,nm=G.netm,{ownerClockStatus}=await import(new URL('patches/network-replication/owner-clock.mjs',document.baseURI));
    return {id:G.net.myId,host:G.net.hostId,code:G.net.code,state:G.net.state,sessionVersion:G.net.ownerClockVersion,
      match:nm?.cfg.id,bound:!!nm?.match,gameState:G.match?.state,time:performance.now()/1000,sim:G.time,clockNative:Function.prototype.toString.call(performance.now).includes('[native code]'),
      characters:G.actors.map(a=>({nid:a.nid,owner:a.owner,remote:a.remote,character:a.character?.constructor.name,meshChildren:a.character?.root?.children.length,buffer:a.net?.buf?.length??0})),
      peers:nm?[...nm.peers].map(([id,p])=>({id,lastTs:p.lastTs,lastReceiveAt:p.lastReceiveAt,lastEventSeq:p._lastEventSeq,physics:p.physicsPoints?.slice(-2),buffered:nm.match?.actors.filter(a=>a.owner===id).map(a=>a.net?.buf?.length??0)})):[],
      proof:nm?[...G.net._members.keys()].filter(id=>id!==G.net.myId).map(id=>({id,...ownerClockStatus(nm,id)})):[],
      starts:globalThis.ownerClockStarts||[]};
  })));
  try{
    for(const page of pages)await page.evaluate(()=>{
      const s=NG.net,g=NG.game;globalThis.ownerClockStarts=[];
      const begin=s._begin;s._begin=async function(cfg){const row={match:cfg.id,enter:performance.now()/1000};ownerClockStarts.push(row);try{return await begin.call(this,cfg);}finally{row.finish=performance.now()/1000;row.bound=!!this.match?.match;}};
      const nativeStart=g.startNetMatch;g.startNetMatch=async function(cfg,nm){const row=ownerClockStarts.findLast(r=>r.match===cfg.id);if(row)row.nativeStart=performance.now()/1000;return nativeStart.call(this,cfg,nm);};
    });
    async function start(label,newRoom){
      console.log('owner clock browser '+label);
      if(newRoom){
        const code=await pages[0].evaluate(()=>NG.net.create('Clock Host'));
        await pages[1].evaluate(code=>NG.net.join(code,'Clock Guest'),code);
        await until(async()=>{const states=await Promise.all(pages.map(p=>p.evaluate(()=>NG.net.lobby.players.length)));return states.every(n=>n===2);},'room membership');
      }
      await pages[0].evaluate(()=>NG.net.setSettings({map:'tidewater',mode:'turf',bots:false}));
      await until(async()=>await pages[1].evaluate(()=>NG.net.lobby.map==='tidewater'&&NG.net.lobby.mode==='turf'&&!NG.net.lobby.bots),'room rules');
      await pages[0].evaluate(()=>{if(!NG.net.confirmTeams())throw new Error('Clock teams refused');});
      await until(async()=>await pages[1].evaluate(()=>NG.net.lobby.teamsConfirmed),'confirmed teams');
      await pages[1].evaluate(()=>NG.net.setMe({ready:true}));await pages[0].evaluate(()=>NG.net.setMe({ready:true}));
      await until(async()=>await pages[0].evaluate(()=>NG.net.canStart()),'ready members');
      relay.arm(label);
      await pages[0].evaluate(()=>{if(!NG.net.start())throw new Error('Clock match start refused');});
      await until(async()=>{const states=await snapshot();return states.every(s=>s.state==='match'&&s.bound&&s.proof.length===1&&s.proof[0].origin)&&relay.describe()?.peers.length===2;},'native async bind and clock ACK');
      const bound=await snapshot();
      for(const s of bound){assert.equal(s.sessionVersion,1);assert.equal(s.clockNative,true);assert.equal(s.proof[0].required,true);assert.equal(s.proof[0].awaiting,false);assert(s.peers.every(p=>p.lastTs===undefined&&p.lastReceiveAt===undefined),'held ticks cannot establish accepted owner watermarks');assert(s.characters.every(c=>c.buffer===0),'held ticks cannot populate actor snapshots');assert.equal(s.characters.length,2);assert(s.characters.every(c=>c.character&&c.meshChildren>0),'native Characters must have real mesh children');assert(s.starts.at(-1)?.nativeStart&&s.starts.at(-1)?.bound,'real NetSession._begin must finish native Game.startNetMatch');}
      await until(async()=>relay.describe().peers.every(p=>Date.now()-p.firstHeldAt>=7000),'seven real seconds of startup backlog',30000);
      const delayed=relay.releaseFirst();
      await until(async()=>{const states=await snapshot();return states.every(s=>s.peers.length===1&&s.peers[0].lastTs===delayed.peers.find(p=>p.from===s.peers[0].id)?.firstTs);},'first delayed snapshot');
      const first=await snapshot(),latest=relay.releaseLatest();
      for(const p of latest.peers)assert(p.lastTs-p.firstTs>5,'catch-up must exceed unchanged five-second old-origin grace');
      await until(async()=>{const states=await snapshot();return states.every(s=>s.peers.length===1&&s.peers[0].lastTs>=latest.peers.find(p=>p.from===s.peers[0].id)?.lastTs);},'valid catch-up after delayed bound first tick');
      const caughtUp=await snapshot();
      const originalGuard=first.map((s,i)=>({peer:s.peers[0].id,firstTimestamp:s.peers[0].lastTs,firstReceivedAt:s.peers[0].lastReceiveAt,
        caughtUpTimestamp:caughtUp[i].peers[0].lastTs,caughtUpReceivedAt:caughtUp[i].peers[0].lastReceiveAt,
        oldGateAccepted:validOwnerTickAdvance(caughtUp[i].peers[0].lastTs,s.peers[0].lastTs,caughtUp[i].peers[0].lastReceiveAt,s.peers[0].lastReceiveAt)}));
      assert(originalGuard.every(row=>!row.oldGateAccepted),'real received pair must reproduce the original stale-origin rejection');
      await until(async()=>{const states=await snapshot();return states.every(s=>s.gameState==='playing');},'real native Match intro completion');
      const deadline=Date.now()+1200;while(Date.now()<deadline)await pump();
      const progressing=await snapshot();
      for(let i=0;i<2;i++){assert(progressing[i].peers[0].lastTs>caughtUp[i].peers[0].lastTs+.5,'ordinary owner snapshots must continue');assert.deepEqual(progressing[i].proof[0].origin,bound[i].proof[0].origin,'backlog and progress must not rebase proof');assert(progressing[i].characters.some(c=>c.remote&&c.buffer>0),'real remote Actor must receive snapshots');}
      const row={label,bound,delayed,first,latest,caughtUp,originalGuard,progressing};receipt.cases.push(row);write();
      return row;
    }
    const cold=await start('cold-start',true);
    await Promise.all(pages.map(p=>p.evaluate(()=>NG.game.netMatchEnd())));
    const rematch=await start('same-room-rematch',false);
    assert.notEqual(rematch.bound[0].match,cold.bound[0].match);
    await Promise.all(pages.map(p=>p.evaluate(()=>NG.game.netMatchEnd())));
    await Promise.all(pages.map(p=>p.evaluate(()=>NG.net.leave())));
    await until(async()=>relay.connections.filter(row=>row.event==='close').length>=2,'real WebSocket closures',15000);
    const reconnect=await start('socket-reconnect',true);
    assert.notEqual(reconnect.bound[0].match,rematch.bound[0].match);
    assert.notEqual(reconnect.bound[0].id,cold.bound[0].id,'new WebSocket admission has a new relay member identity');
    assert.equal(relay.connections.filter(row=>row.event==='open').length,4);
    const queries=relay.wire.filter(row=>row.kind==='ocq'),replies=relay.wire.filter(row=>row.kind==='oca');
    assert(queries.length>=6&&replies.length>=6,'every phase requires real relay-carried freshness requests and replies');
    for(const row of queries)assert(/^[a-f0-9]{32}$/.test(row.nonce));
    receipt.requestCount=queries.length;receipt.replyCount=replies.length;
    for(let i=0;i<pages.length;i++){
      const capture=await pages[i].evaluate(()=>{NG.renderer.render(NG.scene,NG.camera);return {drawCalls:NG.renderer.info.render.calls,triangles:NG.renderer.info.render.triangles,contextLost:NG.renderer.getContext().isContextLost()};});
      assert(capture.drawCalls>0&&capture.triangles>0&&!capture.contextLost);
      (receipt.render??=[]).push(capture);
      await pages[i].screenshot({path:path.join(out,'clock-reconnect-peer-'+i+'.png'),timeout:90000});
    }
    receipt.status='passed';write();return receipt;
  }catch(error){receipt.status='failed';receipt.error=String(error.stack||error);receipt.states=await snapshot().catch(e=>[{error:e.message}]);write();throw error;}
}
