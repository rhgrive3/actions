// Browser-serializable QA composition. The ordinary Game._intro HUD reveal is
// a real 3000 ms timer guarded by the owning match remaining in intro. Finishing
// intro synchronously before that timer would legitimately cancel the reveal.
// Hold only the noninteractive cinematic while its native timers/CSS settle;
// then call the unchanged native-frame helper. Never step or suppress a live
// gameplay frame, mutate UI, run timers manually, or extend the host deadline.
export function nativeTurfIntroWithUiFunction(completeIntro, deadline) {
  if (!Number.isFinite(deadline)) throw new Error('Native intro requires the original finite deadline');
  return new Function(`return async function(){
    const deadline=${JSON.stringify(deadline)};
    const g=window.__inkwave,G=window.__G,m=g?.match;
    const receipt={schema:1,startedAtMs:Date.now(),deadlineAtMs:deadline,waits:0,outcome:'pending',
      history:{count:0,first:[],recent:[],omitted:0,limits:{first:4,recent:8}}};
    window.__iwProjectileIntroUiReceipt=receipt;
    const budget=()=>{if(Date.now()>=deadline)throw new Error('Native cinematic UI deadline expired');};
    try{
    budget();
    if(!g || !m || m!==G?.match || G.mode!=='match' || m.attract || !m.local?.isLocal ||
       !m.controller || !G.projectiles || !G.renderer || !g.debug?.freeze ||
       !g.debug?.unfreeze || typeof g._frame!=='function' || g.frozen || g._skipRender ||
       m.paused || m.bossMode || m.boss || m.opts?.range || (m.mode && m.mode!=='turf') || G.netm)
      throw new Error('Native cinematic UI requires an initialized unpaused offline Turf match');
    if(m.state==='playing'){
      const result=(${completeIntro.toString()})();
      receipt.completedAtMs=Date.now();receipt.outcome='natural';
      return result;
    }
    if(m.state!=='intro')throw new Error('Native cinematic UI requires intro');
    const time=m.time,stateT=m.stateT,skipRender=g._skipRender;
    const intact=()=>{
      if(g.match!==m || G.match!==m || G.mode!=='match' || m.state!=='intro' ||
         m.time!==time || m.stateT!==stateT || m.paused || m.attract || m.bossMode ||
         m.boss || m.opts?.range || (m.mode && m.mode!=='turf') || G.netm ||
         !m.local?.isLocal || !m.controller || m.controller.orientationBlocked ||
         g.frozen!==true || g._skipRender!==true)
        throw new Error('Native cinematic ownership changed while waiting for UI');
    };
    g.debug.freeze();
    try{
      g._skipRender=true;
      while(true){
        budget();intact();
        const ui=window.__iwProjectileCaptureUiGate({phase:'intro-ui-wait',allowIntro:true,settled:false,requireHudSettled:true});
        receipt.lastUi=ui;
        const history=receipt.history;
        const sample=JSON.parse(JSON.stringify({attempt:++history.count,observedAtMs:ui.observedAtMs,
          state:m.state,stateT:m.stateT,ready:ui.ready,failed:ui.failed,captureFailed:ui.captureFailed,hud:ui.hud,ui:ui.ui}));
        if(history.first.length<4)history.first.push(sample);
        else{history.recent.push(sample);if(history.recent.length>8)history.recent.shift();}
        history.omitted=history.count-history.first.length-history.recent.length;
        if(ui.ready===true)break;
        receipt.waits++;
        await new Promise(resolve=>setTimeout(resolve,Math.min(50,deadline-Date.now())));
      }
      budget();intact();
      receipt.uiReadyAtMs=Date.now();receipt.outcome='native-ui-ready';
    }catch(error){receipt.outcome='failed';receipt.error=String(error?.message||error);throw error;}
    finally{
      g._skipRender=skipRender;
      g.debug.unfreeze();
      receipt.restoredAtMs=Date.now();
    }
    // No event-loop yield separates restoration from the native-frame helper.
    // Its own identity/offline guards run again and its while loop stops at
    // the first native playing transition without consuming any match time.
    try{
      budget();
      const result=(${completeIntro.toString()})();
      receipt.completedAtMs=Date.now();receipt.outcome='completed';
      return {...result,uiWait:{startedAtMs:receipt.startedAtMs,uiReadyAtMs:receipt.uiReadyAtMs,waits:receipt.waits}};
    }catch(error){receipt.outcome='failed';receipt.error=String(error?.message||error);throw error;}
    }catch(error){receipt.outcome='failed';receipt.error=String(error?.message||error);throw error;}
  }`)();
}
