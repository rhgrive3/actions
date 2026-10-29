// QA-only readiness for the already-started initial attract owners. Never call
// warmAll, schedule frames, create owners, or alter native resource counters.
export async function awaitExistingExplosherAttractWarmup(G,game,timeoutMs=20000){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw Error('Invalid initial attract warmup timeout');
 const match=game.match,actors=match?.actors,scene=G.scene,renderer=G.renderer,hooks=game.fxHooks;
 if(G.game!==game||G.match!==match||!match?.attract||!Array.isArray(actors)||actors.length!==8||game._explosherInitialAttractWarmupObserved)throw Error('Expected initial eight-owner attract warmup');
 const owners=actors.map(actor=>{
  const character=actor.character,promise=character?._warmed;
  if(!character||character._sourceMotionDisposed||character.root?.parent!==scene||!promise||typeof promise.then!=='function')throw Error('Missing already-started initial Character warmup');
  return {actor,character,promise,root:character.root};
 });
 const state=()=>({gameTime:G.time,hookTime:game.fxHooks?.time,hookStamp:game.fxHooks?.stamp,sprayT:game.fxHooks?.sprayT,featherT:game.fxHooks?.featherT});
 const before=state();if(Object.values(before).some(v=>!Number.isFinite(v)))throw Error('Invalid initial warmup state');
 let timer,results;
 try{results=await Promise.race([Promise.all(owners.map(o=>o.promise)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Initial attract warmup timeout')),timeoutMs);})]);}
 finally{clearTimeout(timer);}
 if(G.game!==game||G.match!==match||game.match!==match||match.actors!==actors||G.scene!==scene||G.renderer!==renderer||game.fxHooks!==hooks||actors.length!==owners.length)throw Error('Initial attract owner replaced during warmup');
 owners.forEach((o,i)=>{if(actors[i]!==o.actor||o.actor.character!==o.character||o.character._warmed!==o.promise||o.character._sourceMotionDisposed||o.character.root!==o.root||o.root.parent!==scene||!results[i])throw Error('Initial Character warmup failed or owner disposed/replaced');});
 const after=state();if(Object.keys(before).some(k=>!Object.is(before[k],after[k])))throw Error('Initial attract simulated state advanced during warmup');
 // This marker is QA metadata on the controlled Game, never a production flag.
 game._explosherInitialAttractWarmupObserved=true;
 return {controlledInitialCondition:true,naturalBootAccepted:false,alreadyStartedOnly:true,ownerCount:owners.length,settled:true,before,after};
}
