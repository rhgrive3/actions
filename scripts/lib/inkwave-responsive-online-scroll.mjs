import assert from 'node:assert/strict';

const OWNERS = ['.iw-hub__body', '.iw-hub__me'];
export function readOnlineScroll({ownerSelector = null, targetSelector = null} = {}) {
  const root = document.querySelector('.iw-online.iw-screen:not(.is-leaving)');
  if (!root) return {missing: 'online'};
  const rect = el => { const r=el.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
  const owner = ownerSelector && root.querySelector(ownerSelector);
  const target = targetSelector && root.querySelector(targetSelector);
  const style = el => { const s=getComputedStyle(el); return {overflowY:s.overflowY,touchAction:s.touchAction,display:s.display,visibility:s.visibility,opacity:Number(s.opacity)}; };
  const state = {inputMode:globalThis.menus?._input||null,activeTag:document.activeElement?.tagName||null,activeOwnerIndex:[...root.querySelectorAll('.iw-hub__body,.iw-hub__me')].findIndex(el=>el.contains(document.activeElement)),root:{...rect(root),...style(root),scrollTop:root.scrollTop},documentScroll:document.scrollingElement.scrollTop,
    owners:[...root.querySelectorAll('.iw-hub__body,.iw-hub__me')].map(el=>({className:el.className,...rect(el),...style(el),scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight})),viewport:{width:innerWidth,height:innerHeight}};
  if (ownerSelector && !owner) return {...state,missing:ownerSelector};
  if (targetSelector && !target) return {...state,missing:targetSelector};
  if (target) {
    const r=rect(target), x=(r.left+r.right)/2,y=(r.top+r.bottom)/2,hit=document.elementFromPoint(x,y);
    const clips=[];let visible=true;
    const inspectVisibility=el=>{const s=style(el);if(s.display==='none'||s.visibility!=='visible'||s.opacity<=0)visible=false;};
    const inspectClip=el=>{
      const cs=getComputedStyle(el),er=rect(el),sx=el.offsetWidth?er.width/el.offsetWidth:1,sy=el.offsetHeight?er.height/el.offsetHeight:1;
      const clip={left:er.left+el.clientLeft*sx,top:er.top+el.clientTop*sy,right:er.left+(el.clientLeft+el.clientWidth)*sx,bottom:er.top+(el.clientTop+el.clientHeight)*sy};
      const rejectX=/(auto|scroll|hidden|clip)/.test(cs.overflowX)&&(r.left<clip.left-1||r.right>clip.right+1);
      const rejectY=/(auto|scroll|hidden|clip)/.test(cs.overflowY)&&(r.top<clip.top-1||r.bottom>clip.bottom+1);
      if(rejectX||rejectY)clips.push({className:el.className,clip,rejectX,rejectY});
    };
    for(let el=target;el;el=el.parentElement){inspectVisibility(el);if(el!==target)inspectClip(el);if(el===root)break;}
    // Only BODY/HTML may have zero flow height around this fixed UI. Every
    // other outer paint-clipping wrapper, including .iw-ui, still clips it.
    for(let el=root.parentElement;el;el=el.parentElement){inspectVisibility(el);if(el!==document.body&&el!==document.documentElement)inspectClip(el);}
    state.target={...r,visible,disabled:!!target.disabled,hit:!!hit&&(hit===target||target.contains(hit)),hitClass:hit?.className||null,clips,
      owner:owner?owner.contains(target):root.contains(target),text:target.textContent?.trim()||'',scrollWidth:target.scrollWidth,clientWidth:target.clientWidth,scrollHeight:target.scrollHeight,clientHeight:target.clientHeight};
  }
  return state;
}

export function assertOnlineScrollLayout(state) {
  assert(!state.missing,`online scroll missing ${state.missing}`);
  assert(state.root.display!=='none'&&state.root.visibility==='visible'&&state.root.opacity>0,'online root must be visually present');
  assert.equal(state.root.overflowY,'hidden','short landscape contains overflow in its two local owners');
  assert(Math.abs(state.root.scrollTop)<=1,'hidden root must not programmatically rescue clipped controls');
  assert(Math.abs(state.documentScroll)<=1,'document must not rescue clipped controls');
  assert.equal(state.owners.length,2,'both online scroll owners must exist');
  for(const owner of state.owners){
    assert.equal(owner.overflowY,'auto',`${owner.className}: real local scroll owner`);
    assert(owner.touchAction.split(' ').includes('pan-y'),`${owner.className}: vertical touch scrolling`);
    assert(owner.clientHeight>0&&owner.width>0,`${owner.className}: nonempty scroll viewport`);
    assert(owner.left>=-1&&owner.right<=state.viewport.width+1&&owner.top>=-1&&owner.bottom<=state.viewport.height+1,`${owner.className}: scroll viewport clipped by screen`);
  }
}

export function assertOnlineScrollMovement(before,after,index,direction) {
  const delta=after.owners[index].scrollTop-before.owners[index].scrollTop;
  assert(direction*delta>1,`${before.owners[index].className}: native input must move its local scroll owner`);
  assert(Math.abs(after.root.scrollTop-before.root.scrollTop)<=1,'root must not substitute for local scroll owner');
  assert(Math.abs(after.documentScroll-before.documentScroll)<=1,'document must not substitute for local scroll owner');
  assert(Math.abs(after.owners[1-index].scrollTop-before.owners[1-index].scrollTop)<=1,'other panel must scroll independently');
}

export function assertOnlineTarget(state,label,{readable=false}={}) {
  assert(!state.missing,`${label}: missing target/owner`);const t=state.target;
  assert(t?.visible&&t.owner&&!t.disabled,`${label}: enabled visible target must belong to its owner`);
  assert(t.width>0&&t.height>0&&t.left>=-1&&t.right<=state.viewport.width+1&&t.top>=-1&&t.bottom<=state.viewport.height+1,`${label}: complete target must enter viewport`);
  assert.equal(t.clips.length,0,`${label}: complete target clipped ${JSON.stringify(t.clips)}`);
  assert(t.hit,`${label}: center hit intercepted by ${t.hitClass}`);
  if(readable){assert(t.text,`${label}: error text must be present`);assert(t.scrollWidth<=t.clientWidth+1&&t.scrollHeight<=t.clientHeight+1,`${label}: error text truncated`);}
}

export async function checkResponsiveOnlineScroll(page,{settle,errorOnly=false}={}) {
  let state=await page.evaluate(readOnlineScroll);assertOnlineScrollLayout(state);
  const engine=page.context().browser().browserType().name();
  assert(['chromium','webkit'].includes(engine),'supported responsive browser engine');
  const inputMethod=engine==='webkit'?'native-keyboard-home-end':'native-mouse-wheel';
  const result={engine,inputMethod,physicalTouchSwipeVerified:false,owners:state.owners,gestures:[],targets:[]};
  if(!errorOnly){
    let moved=0;
    for(let index=0;index<OWNERS.length;index++){
      state=await page.evaluate(readOnlineScroll);const owner=state.owners[index],max=owner.scrollHeight-owner.clientHeight;
      if(max<=1)continue;
      // Mobile WebKit rejects wheel input. This case is already explicitly in
      // attached-keyboard mode: use native Home/End defaults, not a synthetic
      // touch swipe or a programmatic scroll/style/context-profile mutation.
      if(engine==='webkit'){
        assert.equal(state.inputMode,'kbm','native keyboard proof requires the existing attached-keyboard state');
        await page.locator('.iw-online:not(.is-leaving) '+OWNERS[index]+' button:not(:disabled)').first().focus();
        const focused=await page.evaluate(readOnlineScroll);assertOnlineScrollLayout(focused);
        assert.equal(focused.activeTag,'BUTTON','native scroll focus stays on an existing enabled button');
        assert.equal(focused.activeOwnerIndex,index,'native scroll focus must belong to this panel');
        assert(Math.abs(focused.owners[1-index].scrollTop-state.owners[1-index].scrollTop)<=1,'focus must not scroll the sibling panel');
      }else await page.mouse.move(owner.left+Math.min(12,owner.width/2),(owner.top+owner.bottom)/2);
      const scroll=delta=>engine==='webkit'?page.keyboard.press(delta<0?'Home':'End'):page.mouse.wheel(0,delta);
      await scroll(-owner.scrollHeight);await page.waitForFunction(selector=>document.querySelector('.iw-online:not(.is-leaving) '+selector).scrollTop<=1,OWNERS[index],{timeout:5000});
      const before=await page.evaluate(readOnlineScroll);
      await scroll(Math.max(160,owner.clientHeight));
      await page.waitForFunction(({selector,top})=>document.querySelector('.iw-online:not(.is-leaving) '+selector).scrollTop>top+1,{selector:OWNERS[index],top:before.owners[index].scrollTop},{timeout:5000});
      // End can animate asynchronously in WebKit. Wait for its native scroll
      // to finish before issuing Home; otherwise the two motions can race.
      if(engine==='webkit')await page.waitForFunction(selector=>{const el=document.querySelector('.iw-online:not(.is-leaving) '+selector);return el.scrollTop>=el.scrollHeight-el.clientHeight-1;},OWNERS[index],{timeout:5000});
      const down=await page.evaluate(readOnlineScroll);assertOnlineScrollMovement(before,down,index,1);
      await scroll(-owner.scrollHeight);
      await page.waitForFunction(selector=>document.querySelector('.iw-online:not(.is-leaving) '+selector).scrollTop<=1,OWNERS[index],{timeout:5000});
      const up=await page.evaluate(readOnlineScroll);assertOnlineScrollMovement(down,up,index,-1);
      result.gestures.push({inputMethod,owner:OWNERS[index],before:before.owners[index].scrollTop,down:down.owners[index].scrollTop,up:up.owners[index].scrollTop});moved++;
    }
    assert(moved>0,'short landscape content must exercise at least one overflowing local owner');
  }
  const targets=errorOnly?[['.iw-hub__body','.iw-jstat.is-on .iw-jstat__txt',true]]:[
    ['.iw-hub__body','.iw-hubcard--create'],['.iw-hub__body','.iw-code-input'],
    ['.iw-hub__body','.iw-join__btns button:not(.is-go)'],['.iw-hub__body','.iw-join__btns .is-go'],
    ['.iw-hub__body','.iw-hub__steps'],['.iw-hub__me','.iw-name__input'],
    ['.iw-hub__me','.iw-hub__chip:not(.iw-lchip)'],['.iw-hub__me','.iw-lchip'],[null,'.iw-backbtn']];
  for(const [ownerSelector,targetSelector,readable]of targets){
    const beforeReveal=await page.evaluate(readOnlineScroll);
    const locator=page.locator('.iw-online:not(.is-leaving) '+targetSelector).first();
    await locator.scrollIntoViewIfNeeded();await page.mouse.move(0,0);if(settle)await settle(page);
    let snapshot=await page.evaluate(readOnlineScroll,{ownerSelector,targetSelector});assertOnlineScrollLayout(snapshot);assertOnlineTarget(snapshot,targetSelector,{readable});
    if(!readable&&targetSelector!=='.iw-hub__steps')await locator.tap({trial:true});
    snapshot=await page.evaluate(readOnlineScroll,{ownerSelector,targetSelector});assertOnlineScrollLayout(snapshot);assertOnlineTarget(snapshot,targetSelector,{readable});
    for(let index=0;index<OWNERS.length;index++)if(OWNERS[index]!==ownerSelector)assert(Math.abs(snapshot.owners[index].scrollTop-beforeReveal.owners[index].scrollTop)<=1,`${targetSelector}: unrelated panel must not rescue target`);
    result.targets.push({selector:targetSelector,...snapshot.target});
  }
  return result;
}
