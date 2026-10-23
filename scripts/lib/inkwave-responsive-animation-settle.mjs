// Serialized by Playwright. Dormant content-visibility cards animate only after
// scrolling into view; each action scrolls first and waits again before capture.
export function responsiveAnimationsSettled() {
  return document.getAnimations().every(animation => {
    if (animation.effect?.getTiming().iterations === Infinity) return true;
    // A pending play can restart even a currently finished/idle finite object.
    if (animation.pending === true) return false;
    if (['finished','idle'].includes(animation.playState)) return true;
    const target=animation.effect?.target;
    if (target?.checkVisibility && !target.checkVisibility({contentVisibilityAuto:true})) return true;
    // Fallback for engines without checkVisibility's content-visibility option.
    for(let element=target;element?.nodeType===1;element=element.parentElement){
      if(getComputedStyle(element).contentVisibility!=='auto')continue;
      const r=element.getBoundingClientRect();
      if(r.bottom<=0||r.right<=0||r.top>=innerHeight||r.left>=innerWidth)return true;
    }
    return false;
  });
}
