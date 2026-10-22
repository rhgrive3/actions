// QA-only, read-only and identity-free: serialize independently inside each page.
export function readOpeningPeerDiagnostic() {
  const G=globalThis.__G, game=globalThis.__inkwave, doc=globalThis.document;
  const number=v=>Number.isFinite(v)?v:null;
  const phase=v=>['aim','flight','landing'].includes(v)?v:null;
  const adoption=v=>({sequence:number(v?.sequence),tick:number(v?.tick),spawnPhase:phase(v?.squidSpawn?.phase)});
  return {
    hidden:typeof doc?.hidden==='boolean'?doc.hidden:null,
    visibility:['visible','hidden','prerender'].includes(doc?.visibilityState)?doc.visibilityState:null,
    gameTime:number(G?.time),frozen:game?.frozen===true,
    timerDeltaMs:number(game?.timer?._delta),timerElapsedMs:number(game?.timer?._elapsed),
    playing:G?.match?.state==='playing',paused:G?.match?.paused===true,
    actors:(Array.isArray(G?.match?.actors)?G.match.actors:[]).slice(0,2).map(a=>({
      local:a.isLocal===true,remote:a.remote===true,alive:a.alive===true,grounded:a.grounded===true,
      ready:a.net?.ready===true,spawnPhase:phase(a.s3?.squidSpawn?.phase),
      wait:number(a.s3?.squidSpawn?.wait),playWait:number(a.s3?.squidSpawn?.playWait),
      ownerReplicated:a.s3?.squidSpawn?.ownerReplicated===true,
      acceptedSequence:number(a.net?._adoptionSeq),acceptedTick:number(a.net?._adoptionTick),
      acceptedOwnerMatches:a.net?._adoptionTickOwner!=null&&a.net._adoptionTickOwner===a.owner,
      sampled:adoption(a.net?.cur?.adoption),
      buffered:adoption(Array.isArray(a.net?.buf)?a.net.buf.at(-1)?.adoption:null),
    })),
  };
}

// A crashed/unresponsive page cannot replace the original test failure or delay
// cleanup indefinitely. Never print thrown messages, URLs, actor IDs or wire data.
export async function collectOpeningPeerDiagnostics(pages,{timeoutMs=1500}={}) {
  return Promise.all(pages.slice(0,2).map(async(page,index)=>{
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(()=>page.evaluate(readOpeningPeerDiagnostic)).then(snapshot=>({peer:index,status:'captured',snapshot}),()=>({peer:index,status:'unavailable'})),
        new Promise(resolve=>{timer=setTimeout(()=>resolve({peer:index,status:'timeout'}),timeoutMs);}),
      ]);
    } finally {clearTimeout(timer);}
  }));
}
