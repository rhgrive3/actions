// #478. Reuse native navigation, equipment persistence and
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
  if (menus._resultContinuationDisposed || !result || result !== menus._results || result.mode === 'boss' || typeof (result.online ? menus.api.netContinue : menus.api.rematch) !== 'function') return null;
  const generation = menus._swapToken;
  return menus._btn({id:'change-gear-continue',label:'CHANGE GEAR, THEN GO!',cls:'iw-btn--wide iw-in iw-in--pop',sound:'ui_click',accept:()=>{
    if (menus._resultContinuationDisposed || menus._swapToken !== generation || menus.current !== 'results' || menus._results !== result || menus._modal) return;
    if (result.online && menus.api.netContinue('change') !== true) return;
    if (result.online) menus._onlineResultWaiting=null;
    menus._resultContinuation = {result,opening:true,committed:false};
    menus._go('loadout');
  }});
}
export function resultKeepButton(menus, result) {
  if (!result?.online || result.mode === 'boss' || typeof menus.api.netContinue !== 'function') return null;
  const generation = menus._swapToken;
  const button = menus._btn({id:'keep-going',label:'KEEP GOING',cls:'iw-btn--wide iw-btn--primary iw-in iw-in--pop',sound:'ui_confirm',accept:()=>{
    if (menus._resultContinuationDisposed || menus._swapToken !== generation || menus.current !== 'results' || menus._results !== result || menus._modal || button.disabled) return;
    if (menus.api.netContinue('keep') !== true) return;
    menus._onlineResultWaiting=result;button.disabled=true;
    const label=button.querySelector?.('.iw-btn__label');if(label)label.textContent='WAITING FOR PLAYERS';
  }});
  if(menus._onlineResultWaiting===result){button.disabled=true;const label=button.querySelector?.('.iw-btn__label');if(label)label.textContent='WAITING FOR PLAYERS';}
  return button;
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
    try {
      if (c.result.online) {
        if (menus.api.netContinue('keep') !== true) { failed(); return; }
        menus._onlineResultWaiting=c.result;
        menus.show('results',{wipe:true});
      } else { menus.api.prepareMatch?.();const result=menus.api.rematch();if(result?.catch)result.catch(failed); }
    }
    catch {failed();}
  }});
  box.appendChild(button);
  // The gear owner's absolute sibling otherwise covers this second action on
  // desktop. Keep its live controls/listeners in the same scrollable flow.
  const gear = screen.el.querySelector('.s3-gear');
  if (gear) box.appendChild(gear);
}
export function restoreResultShowcase(game, G, screen) {
  const m=game.match;
  if (screen!=='results'||m?.mode!=='turf'||m.state!=='results'||game.showcase?.mode==='results')return;
  const team=m.result?.winner;
  if(team!==0&&team!==1)return;
  game.showcase.showResults(team,true,G.teamColors[team],m.actors.filter(a=>a.team===team).map(a=>({
    weapon:a.weaponId,style:a.character.style||{hair:a.slot%4,skin:(a.slot*3)%4},name:a.name,
  })));
}

export const restoreOfflineResultShowcase = restoreResultShowcase;
