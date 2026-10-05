// #478 offline subset. Reuse native navigation, equipment persistence and
// rematch. The immutable results identity owns this transient UI intent.
export function clearContinuation(menus, disposed = false) { menus._resultContinuation = null; if (disposed) menus._resultContinuationDisposed = true; }
export function continuationNavigation(menus, name, opts) {
  const c = menus._resultContinuation;
  if (!c) return;
  const prev = menus.current;
  const legal = !c.committed && menus._results === c.result && (
    c.opening && prev === 'results' && name === 'loadout' && opts.push ||
    prev === 'loadout' && name === 'locker' && opts.push ||
    prev === 'locker' && name === 'loadout' && opts.pop);
  if (!legal) clearContinuation(menus);
  else c.opening = false;
}
export function resultChangeButton(menus, result) {
  if (menus._resultContinuationDisposed || !result || result !== menus._results || result.online || result.mode === 'boss' || typeof menus.api.rematch !== 'function') return null;
  const generation = menus._swapToken;
  return menus._btn({id:'change-gear-continue',label:'CHANGE GEAR, THEN GO!',cls:'iw-btn--wide iw-in iw-in--pop',sound:'ui_click',accept:()=>{
    if (menus._resultContinuationDisposed || menus._swapToken !== generation || menus.current !== 'results' || menus._results !== result || menus._modal) return;
    menus._resultContinuation = {result,opening:true,committed:false};
    menus._go('loadout');
  }});
}
export function augmentContinuationLoadout(menus, screen) {
  const c = menus._resultContinuation;
  if (!c || c.result !== menus._results || c.committed) return;
  const box = screen.el.querySelector('.iw-loadout__look');
  if (!box) throw Error('INKWAVE continuation: native loadout actions missing');
  box.classList.add('iw-continuation-actions');
  const button=menus._btn({id:'continue-with-gear',label:'KEEP GOING',cls:'iw-btn--wide iw-btn--primary',sound:'ui_confirm',accept:()=>{
    if (menus._resultContinuation !== c || c.committed || menus.current !== 'loadout' || menus._scr !== screen || menus._results !== c.result || menus._modal) return;
    c.committed=true;button.disabled=true;
    const failed=()=>{
      if(menus._resultContinuation!==c||menus.current!=='loadout'||menus._scr!==screen||menus._results!==c.result)return;
      c.committed=false;button.disabled=false;menus.toast?.('Could not start the match. Try again.');
    };
    try { menus.api.prepareMatch?.();const result=menus.api.rematch();if(result?.catch)result.catch(failed); }
    catch {failed();}
  }});
  box.appendChild(button);
}
export function restoreOfflineResultShowcase(game, G, screen) {
  const m=game.match;
  if (screen!=='results'||G.netm||m?.mode!=='turf'||m.state!=='results'||game.showcase?.mode==='results')return;
  const team=m.local?.team??0,won=m.result?.winner===team;
  game.showcase.showResults(team,won,G.teamColors[team],m.actors.filter(a=>a.team===team).map(a=>({
    weapon:a.weaponId,style:a.character.style||{hair:a.slot%4,skin:(a.slot*3)%4},name:a.name,
  })));
}
