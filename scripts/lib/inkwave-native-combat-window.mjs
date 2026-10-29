// Only observe the production RAF. A slow software renderer still needs three
// real frames; elapsed wall time alone is not a sufficient gameplay sample.
export function beginNativeCombatWindow({mapId,minimumMs}) {
 const G=globalThis.__G,g=globalThis.__inkwave,p=globalThis.__gameplayProbe;
 if(!Number.isFinite(minimumMs)||minimumMs<=0)throw Error('Positive combat duration required');
 if(!G||!g||!p)throw Error('Native gameplay observer unavailable');
 p.combatWindow={match:new WeakRef(G.match),level:new WeakRef(G.level),mapId,minimumMs,startedAt:performance.now(),startTime:G.time,startFrames:p.totalFrames};
}

export function inspectNativeCombatWindow() {
 const G=globalThis.__G,g=globalThis.__inkwave,p=globalThis.__gameplayProbe,w=p?.combatWindow;
 if(!w||!G||!g)throw Error('Native combat window unavailable');
 if(G.match!==w.match.deref()||G.level!==w.level.deref()||g.mapDef?.id!==w.mapId||G.match?.state!=='playing'||G.mode!=='match'||G.actors?.length!==8||g.frozen||g._skipRender||p.contextLost)throw Error('Native combat scene changed during sampling');
 const elapsedMs=performance.now()-w.startedAt,frames=p.totalFrames-w.startFrames;
 if(!Number.isFinite(elapsedMs)||elapsedMs<0||!Number.isInteger(frames)||frames<0)throw Error('Invalid native combat observation');
 if(elapsedMs<w.minimumMs||frames<3||!(G.time>w.startTime))return false;
 return {elapsedMs,frames,startTime:w.startTime,endTime:G.time,minimumMs:w.minimumMs};
}

export async function waitForNativeCombatWindow(page,{mapId,minimumMs,extraTimeoutMs=120000}) {
 if(!Number.isFinite(extraTimeoutMs)||extraTimeoutMs<=0)throw Error('Positive native combat timeout required');
 await page.evaluate(beginNativeCombatWindow,{mapId,minimumMs});
 let handle;
 try{
  handle=await page.waitForFunction(inspectNativeCombatWindow,null,{polling:100,timeout:minimumMs+extraTimeoutMs});
  return await handle.jsonValue();
 }finally{
  await handle?.dispose();
  await page.evaluate(()=>{delete globalThis.__gameplayProbe?.combatWindow;});
 }
}
