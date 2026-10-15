// Serialized browser predicate. Read-only; retains the diagnostic opacity
// contract. Geometry and all final-state assertions remain independent.
export function pauseEntranceReady() {
  const roots = [...document.querySelectorAll('.iwr-pausescr:not(.is-leaving)')];
  if (roots.length !== 1 || window.__G?.match?.paused !== true) return false;
  const root = roots[0];
  const elements = [root, root.querySelector('.iw-head'), root.querySelector('.iwr-pause'),
    root.querySelector('.iwr-pause__menu'), ...root.querySelectorAll('.iwr-pause__menu .iw-in')];
  if (elements.length < 7 || elements.some(e => !e)) return false;
  for (const element of elements) for (let e = element; e; e = e.parentElement) {
    const style = getComputedStyle(e), opacity = Number(style.opacity);
    if (style.display === 'none' || style.visibility !== 'visible'
      || !Number.isFinite(opacity) || Math.abs(opacity - 1) > .01) return false;
    if (e.getAnimations({subtree:false}).some(a => a.pending
      || a.playState === 'running' || a.playState === 'paused')) return false;
  }
  return true;
}

export async function waitForPauseEntrance(page) {
  // Replace the former fixed 1200ms sleep, never add to its budget.
  await page.waitForFunction(pauseEntranceReady, null, {polling:'raf', timeout:1200});
}

export function collectPauseEntranceEvidence() {
  const root=document.querySelector('.iwr-pausescr:not(.is-leaving)');
  const elements=root?[root,root.querySelector('.iw-head'),root.querySelector('.iwr-pause'),
    root.querySelector('.iwr-pause__menu'),...root.querySelectorAll('.iwr-pause__menu .iw-in')]:[];
  return {clock:{performance:performance.now(),timeline:document.timeline.currentTime},
    paused:window.__G?.match?.paused,elements:elements.map(element=>{
      if(!element)return {missing:true};const chain=[];
      for(let e=element;e;e=e.parentElement){const s=getComputedStyle(e);
        chain.push({classes:e.className,opacity:s.opacity,display:s.display,visibility:s.visibility,
          animations:e.getAnimations({subtree:false}).map(a=>({name:a.animationName,pending:a.pending,
            playState:a.playState,currentTime:a.currentTime}))});}
      return {classes:element.className,chain};
    })};
}

export function assertArtifactDigest(key,actual,artifacts,manifestDigest){
 if(typeof key!=='string'||(!Object.hasOwn(artifacts,key)&&key!=='inkwave-build.json'))throw Error('Unlisted artifact '+key);
 if(typeof actual!=='string'||actual!==(key==='inkwave-build.json'?manifestDigest:artifacts[key]))throw Error('Served artifact mismatch '+key);
}
