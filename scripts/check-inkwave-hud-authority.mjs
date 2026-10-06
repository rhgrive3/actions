// Acceptance inside the already-loaded production app; uses actual Actor -> Game
// HUD frames and actual native Judd DOM/FX. No replacement HUD implementation.
import path from 'node:path';
import fs from 'node:fs';

// Serialized into the browser by Playwright. SVG graphics need SVG geometry
// checks; checkVisibility is box-based. Keep its raw result for diagnosis.
export function inspectSplatlingStages({charge,streaming,left,first,second,settled=false,negative=null}) {
  const probe=globalThis.__splatlingProbe,h=probe.holder,runner=h._local().weaponRunner;
  if(!settled){runner.streaming=streaming;runner.burstT=left;h._updCrosshair({weapon:'splatling',charge},1/60);}
  const svg=h.ret.querySelector('svg'),rings=[h._chargeEl,h._chargeSecond],expected=[first,second],errors=[];
  let changed=null,oldStyle=null,oldRadius=null;
  if(negative){changed=negative==='hidden'?svg:negative==='opacity'||negative==='offscreen'?h.xh:rings[1];oldStyle=changed.getAttribute('style');oldRadius=changed.getAttribute('r');
    if(negative==='hidden')changed.style.visibility='hidden';
    if(negative==='opacity'){changed.style.setProperty('transition','none','important');changed.style.setProperty('opacity','0','important');}
    if(negative==='offscreen')changed.style.left='200vw';
    if(negative==='stroke')changed.style.stroke='none';
    if(negative==='zero-size')changed.setAttribute('r','0');
    if(negative==='progress')changed.style.strokeDashoffset='100';
  }
  try {
    const viewport={width:innerWidth,height:innerHeight};
    const box=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const css=el=>{const c=getComputedStyle(el);return{tag:el.tagName,display:c.display,visibility:c.visibility,opacity:c.opacity,contentVisibility:c.contentVisibility,stroke:c.stroke,strokeWidth:c.strokeWidth,strokeOpacity:c.strokeOpacity,strokeDashoffset:c.strokeDashoffset,transform:c.transform,transition:c.transition,transitionDuration:c.transitionDuration};};
    const ancestors=[];for(let el=svg;el;el=el.parentElement)ancestors.push(css(el));
    const svgVisible=svg.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
    if(!svgVisible||ancestors.some(c=>c.display==='none'||c.visibility==='hidden'||c.visibility==='collapse'||Number(c.opacity)<=0||c.contentVisibility==='hidden'))errors.push('container/ancestor hidden');
    const rows=rings.map((ring,i)=>{
      const bounds=box(ring),style=css(ring),progress=1-Number(ring.style.strokeDashoffset)/100;
      const computedProgress=1-parseFloat(style.strokeDashoffset)/100;
      let strokeSamples=0;const radius=ring.r.baseVal.value,cx=ring.cx.baseVal.value,cy=ring.cy.baseVal.value;
      for(let n=0;n<32;n++){const angle=(n+.5)*Math.PI*2/32;if(ring.isPointInStroke({x:cx+radius*Math.cos(angle),y:cy+radius*Math.sin(angle)}))strokeSamples++;}
      const rawCircleVisible=ring.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
      if(!Number.isFinite(progress)||Math.abs(progress-expected[i])>.0001)errors.push(`ring${i}: inline progress`);
      if(!Object.values(bounds).every(Number.isFinite)||bounds.width<=0||bounds.height<=0||bounds.left<0||bounds.right>innerWidth||bounds.top<0||bounds.bottom>innerHeight)errors.push(`ring${i}: geometry/viewport`);
      if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)<=0||style.stroke==='none'||style.stroke==='transparent'||/rgba\([^)]*,\s*0\s*\)/.test(style.stroke)||!(parseFloat(style.strokeWidth)>0)||!(Number(style.strokeOpacity)>0))errors.push(`ring${i}: stroke hidden`);
      if(settled&&(!Number.isFinite(computedProgress)||Math.abs(computedProgress-expected[i])>.001))errors.push('Splatling rendered ring has not reached expected progress');
      if(settled&&((expected[i]>0&&strokeSamples===0)||(expected[i]===0&&strokeSamples>1)))errors.push(`ring${i}: SVG stroke samples`);
      return{progress,computedProgress,rawCircleVisible,strokeSamples,bounds,style};
    });
    if(rows[1].bounds.width<=rows[0].bounds.width)errors.push('Splatling second stage is not a distinct outer ring');
    const negativeState=changed?{style:css(changed),inlineOpacity:changed.style.opacity,bounds:box(changed),radius:changed.getAttribute('r')}:null;
    const negativeApplied=!negative||({hidden:()=>negativeState.style.visibility==='hidden',opacity:()=>Number(negativeState.style.opacity)===0,offscreen:()=>negativeState.bounds.left>=innerWidth,stroke:()=>negativeState.style.stroke==='none','zero-size':()=>Number(negativeState.radius)===0,progress:()=>Number(changed.style.strokeDashoffset)===100})[negative]();
    const row={charge,streaming,left,expected,settled,negative,negativeState,negativeApplied,viewport,mount:probe.mount,svgVisible,svgBounds:box(svg),ancestors,rings:rows,errors};probe.last=row;return row;
  } finally {if(changed){if(oldStyle===null)changed.removeAttribute('style');else changed.setAttribute('style',oldStyle);if(oldRadius===null)changed.removeAttribute('r');else changed.setAttribute('r',oldRadius);}}
}

// #560: computed spread is evidence only when the actual SVG can be painted.
export function inspectAccuracyReticle(negative=null) {
  const probe=globalThis.__splatlingProbe,h=probe.holder,svg=h.ret.querySelector('svg');
  const old=h.xh.getAttribute('style'),oldSpread=h.ret.style.getPropertyValue('--sp');
  if(negative==='hidden')h.xh.style.setProperty('visibility','hidden','important');
  if(negative==='opacity'){h.xh.style.setProperty('transition','none','important');h.xh.style.setProperty('opacity','0','important');}
  if(negative==='spread')h.ret.style.setProperty('--sp','25.3');
  try {
    const ancestors=[];for(let el=svg;el;el=el.parentElement){const c=getComputedStyle(el);ancestors.push({display:c.display,visibility:c.visibility,opacity:c.opacity,contentVisibility:c.contentVisibility});}
    const b=svg?.getBoundingClientRect(),bounds=b?{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}:null;
    const visible=!!svg&&svg.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!ancestors.some(c=>c.display==='none'||c.visibility==='hidden'||c.visibility==='collapse'||Number(c.opacity)<=0||c.contentVisibility==='hidden');
    const strokes=svg?[...svg.querySelectorAll('circle,path')].map(el=>{const c=getComputedStyle(el);return{length:el.getTotalLength(),stroke:c.stroke,width:parseFloat(c.strokeWidth),opacity:Number(c.opacity)*Number(c.strokeOpacity),visibility:c.visibility};}):[];
    const paintable=strokes.some(x=>x.length>0&&x.width>0&&x.opacity>0&&x.visibility==='visible'&&x.stroke!=='none'&&x.stroke!=='transparent'&&!/rgba\([^)]*,\s*0\s*\)/.test(x.stroke));
    const css=getComputedStyle(h.ret),spread=+css.getPropertyValue('--sp'),bloom=+css.getPropertyValue('--bl');
    const geometry=[...h.ret.querySelectorAll('.iw-ret__tick,.iw-ret__svg')].map(el=>getComputedStyle(el).transform),errors=[];
    if(spread!==18.3||bloom!==0)errors.push('spread');
    if(!visible||!paintable)errors.push('visibility');
    if(!bounds||!Object.values(bounds).every(Number.isFinite)||bounds.width<=0||bounds.height<=0||bounds.left<0||bounds.right>innerWidth||bounds.top<0||bounds.bottom>innerHeight)errors.push('viewport');
    const changed=getComputedStyle(h.xh),negativeApplied=!negative||(negative==='spread'?spread===25.3:negative==='hidden'?changed.visibility==='hidden':Number(changed.opacity)===0);
    const row={spread,bloom,geometry,visible,paintable,bounds,ancestors,strokes,negative,negativeApplied,errors};probe.last=row;return row;
  } finally {if(old===null)h.xh.removeAttribute('style');else h.xh.setAttribute('style',old);if(oldSpread)h.ret.style.setProperty('--sp',oldSpread);else h.ret.style.removeProperty('--sp');}
}

// #565: render real native Showcase characters from a private result receiver.
// Result input is a fixture; this does not claim a new winner/scoring test.
export async function checkWinnerPodium({page,evidence,sourceSha,contentHash}) {
  let primaryError=null,failureReceipt=null;
  try {
    await page.evaluate(async()=>{
      const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href),live=G.game;
      if(G.netm)throw Error('winner podium probe requires offline acceptance session');
      const showcase=new live.showcase.constructor(live.showcase.r,live.CharacterClass);
      globalThis.__winnerPodiumProbe={showcase};showcase._warmup();
    });
    await page.waitForFunction(()=>globalThis.__winnerPodiumProbe?.showcase._warmState==='done',null,{timeout:90000});
    const receipt=await page.evaluate(async()=>{
      const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
      const {restoreOfflineResultShowcase}=await import(new URL('patches/local-quality/result-continuation.mjs',document.baseURI).href);
      const THREE=await import('three'),live=G.game,s=globalThis.__winnerPodiumProbe.showcase,r=s.r;
      const initialProfile=JSON.stringify(live.profile),savedProfile=localStorage.getItem('inkwave.profile');
      const actorsSnapshot=()=>JSON.stringify(live.match.actors.map(a=>({team:a.team,alive:a.alive,weapon:a.weaponId,pos:a.pos.toArray(),stats:a.stats})));
      const originalActors=actorsSnapshot(),matchIdentity=live.match,images=[],states=[];
      const timeout=globalThis.setTimeout,audio=G.audio,timers=[],sounds=[];
      const oldTarget=r.getRenderTarget(),oldColor=r.getClearColor(new THREE.Color()),oldAlpha=r.getClearAlpha();
      let selected=null;
      const trace=globalThis.__winnerPodiumProbe.trace={states,phase:'setup',selected:null};
      const originalShow=s.showResults;
      s.showResults=function(team,won,color,styles){selected={team,won,color:color.getHexString(),names:styles.map(a=>a.name),weapons:styles.map(a=>a.weapon)};trace.selected=selected;return originalShow.call(this,team,won,color,styles);};
      const capture=(name,winner,expectedNames)=>{
        trace.phase=name;trace.expectedNames=expectedNames;
        for(let frame=0;frame<180;frame++)s.update(1/60);
        if(s.mode!=='results'||!s.won||s.chars.length!==4||s.chars.some(c=>!c.root.visible||!c._landed||c.dance!=='victory'))throw Error('winner podium native choreography regression');
        if(selected.team!==winner||!selected.won||selected.color!==G.teamColors[winner].getHexString()||JSON.stringify(selected.names)!==JSON.stringify(expectedNames))throw Error('winner podium roster/color regression');
        r.setRenderTarget(null);r.setClearColor(0x181c24,1);r.clear(true,true,true);
        const gl=r.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,before=new Uint8Array(w*h*4),after=new Uint8Array(w*h*4);
        gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,before);s.render();gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,after);
        let changed=0;for(let i=0;i<after.length;i+=4)if(Math.abs(after[i]-before[i])+Math.abs(after[i+1]-before[i+1])+Math.abs(after[i+2]-before[i+2])>12)changed++;
        if(changed<1000||gl.getError()!==gl.NO_ERROR)throw Error('winner podium not painted');
        s.scene.updateMatrixWorld(true);s.camera.updateMatrixWorld(true);
        const characters=s.chars.map(c=>{let visibleMeshes=0;c.root.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes?.position?.count)return;for(let p=o;p;p=p.parent)if(!p.visible)return;const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.some(m=>m?.visible!==false&&m?.opacity>0))visibleMeshes++;});const box=new THREE.Box3().setFromObject(c.root),center=box.getCenter(new THREE.Vector3()).project(s.camera);return{name:c.name,dance:c.dance,visible:c.root.visible,visibleMeshes,landed:c._landed,center:center.toArray()};});
        if(characters.some(c=>c.visibleMeshes===0||c.center.some(x=>!Number.isFinite(x))||c.center.some(x=>Math.abs(x)>1)))throw Error('winner podium character outside camera');
        images.push({name,png:r.domElement.toDataURL('image/png')});return{...selected,characters,paintedPixels:changed,width:w,height:h};
      };
      try {
        globalThis.setTimeout=(fn,ms)=>{timers.push({fn,ms});return -timers.length;};G.audio={play:name=>sounds.push(name)};
        for(const winner of [0,1]){
          const localTeam=1-winner,actors=live.match.actors.map(a=>({...a,isLocal:false,stats:{...a.stats},character:{style:{...a.character.style}}}));
          if(actors.filter(a=>a.team===winner).length!==4)throw Error('winner podium requires complete team');
          const local=actors.find(a=>a.team===localTeam);local.isLocal=true;
          const m={mode:'turf',state:'judge',actors,local,result:{winner,coverage:winner?[.4,.6]:[.6,.4]},setState(state){this.state=state;}};
          const receiver=Object.create(Object.getPrototypeOf(live));
          let result;
          Object.assign(receiver,{match:m,profile:JSON.parse(initialProfile),palette:live.palette,mapDef:live.mapDef,rig:{overview(){}},hud:{hideSplatted(){},setVisible(){},judge:async()=>({winner})},showcase:s,menus:{current:'results',showResults:data=>{result=data;},show(){}},_playMusic:name=>sounds.push(name)});
          await receiver._judge();
          if(result?.win!==false||receiver.profile.wins!==live.profile.wins||result.players.find(a=>a.isSelf)?.team!==localTeam)throw Error('winner podium changed local loss perspective');
          const expectedNames=actors.filter(a=>a.team===winner).map(a=>a.name);
          const initial=capture(`winner-podium-${winner}-loss`,winner,expectedNames),xp=receiver.profile.xp;
          s.showLoadout('roller',G.teamColors[localTeam],local.character.style);for(let frame=0;frame<30;frame++)s.update(1/60);
          if(s.mode!=='loadout')throw Error('winner podium gear preview did not open');
          restoreOfflineResultShowcase(receiver,G,'results');
          const restored=capture(`winner-podium-${winner}-back`,winner,expectedNames);
          if(receiver.profile.xp!==xp)throw Error('winner podium Back awarded XP twice');
          states.push({winner,localTeam,localWin:result.win,xpGained:result.xp.gained,initial,restored});
        }
        const musicTimers=timers.filter(t=>t.ms===2600);if(musicTimers.length!==2)throw Error('winner podium result music timer ownership');
        for(const t of musicTimers)t.fn();
        if(sounds.filter(x=>x==='defeat_jingle').length!==2||sounds.filter(x=>x==='results_lose').length!==2||sounds.includes('victory_fanfare')||sounds.includes('results_win'))throw Error('winner podium changed local loss audio/music');
      } catch(error) {
        trace.error=String(error);trace.mode=s.mode;trace.won=s.won;trace.choreography=s.chars.map(c=>({name:c.name,dance:c.dance,visible:c.root.visible,landed:c._landed}));
        const failure=globalThis.__winnerPodiumProbe.failure={trace};
        try {r.setRenderTarget(null);r.setClearColor(0x181c24,1);r.clear(true,true,true);s.render();failure.png=r.domElement.toDataURL('image/png');failure.captureKind='private fixture before cleanup';}catch(captureError){failure.captureError=String(captureError);}
        throw error;
      } finally {
        globalThis.setTimeout=timeout;G.audio=audio;r.setRenderTarget(oldTarget);r.setClearColor(oldColor,oldAlpha);
        if(savedProfile===null)localStorage.removeItem('inkwave.profile');else localStorage.setItem('inkwave.profile',savedProfile);
      }
      if(G.game.match!==matchIdentity||JSON.stringify(live.profile)!==initialProfile||actorsSnapshot()!==originalActors||localStorage.getItem('inkwave.profile')!==savedProfile)throw Error('winner podium fixture leaked into live session');
      return{states,images,sounds,delayedMusicCallbacks:2,profileRestored:true,liveActorsUnchanged:true,fixtureResultInput:true};
    });
    for(const {name,png}of receipt.images)fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from(png.split(',')[1],'base64'));
    delete receipt.images;
    fs.writeFileSync(path.join(evidence,'winner-podium-probe.json'),JSON.stringify({status:'passed',sourceSha,contentHash,...receipt},null,2));
    return receipt;
  } catch(error){
    primaryError=error;
    const diagnostic=await page.evaluate(()=>{
      const p=globalThis.__winnerPodiumProbe;if(p?.failure)return p.failure;
      const s=p?.showcase,d={trace:p?.trace||null,warmState:s?._warmState,mode:s?.mode,won:s?.won,choreography:s?.chars.map(c=>({name:c.name,dance:c.dance,visible:c.root.visible,landed:c._landed}))};
      if(s?.mode){const r=s.r,target=r.getRenderTarget(),color=r.getClearColor(s.color.clone()),alpha=r.getClearAlpha();try{r.setRenderTarget(null);r.setClearColor(0x181c24,1);r.clear(true,true,true);s.render();d.png=r.domElement.toDataURL('image/png');d.captureKind='private fixture before cleanup';}catch(e){d.captureError=String(e);}finally{r.setRenderTarget(target);r.setClearColor(color,alpha);}}
      return d;
    }).catch(e=>({readError:String(e)}));
    if(diagnostic.png){fs.writeFileSync(path.join(evidence,'winner-podium-failure.png'),Buffer.from(diagnostic.png.split(',')[1],'base64'));delete diagnostic.png;}
    failureReceipt={status:'failed',sourceSha,contentHash,error:String(error),diagnostic};
    fs.writeFileSync(path.join(evidence,'winner-podium-probe.json'),JSON.stringify(failureReceipt,null,2));throw error;
  } finally {
    try {await page.evaluate(()=>{try{globalThis.__winnerPodiumProbe?.showcase.dispose();}finally{delete globalThis.__winnerPodiumProbe;}});}
    catch(cleanupError){
      const receipt={...(failureReceipt||{status:'failed',sourceSha,contentHash}),cleanupError:String(cleanupError)};
      try{fs.writeFileSync(path.join(evidence,'winner-podium-probe.json'),JSON.stringify(receipt,null,2));}catch(writeError){console.error('winner podium cleanup receipt',String(writeError));}
      if(!primaryError)throw cleanupError;
    }
  }
}

export async function checkHudAuthority({ page, evidence, sourceSha = null, contentHash = null }) {
  const result = await page.evaluate(async () => {
    const { G } = await import(new URL('src/core/ctx.js', document.baseURI).href);
    const g=G.game,a=g.match.local,h=g.hud;
    if(!h.sp.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))throw Error('Desktop special gauge is hidden');
    const saved={special:a.special,active:a.specialActive};
    const frames=[];
    try {
      for(const [fraction,ready,filled] of [[0,false,0],[.47,false,10],[.9999,false,22],[1,true,23],[1,true,23],[0,false,0],[.5,false,11]]){
        a.specialActive=null;a.special=a.specialCost()*fraction;g._updateHud(1/60);
        const count=h.sp.querySelectorAll('.iw-sp__segment').length;
        const lit=h.sp.querySelectorAll('.iw-sp__segment.is-filled').length;
        const isReady=h.sp.classList.contains('is-ready');
        if(count!==23||lit!==filled||isReady!==ready)throw Error(`Special state ${fraction}: ${count}/${lit}/${isReady}`);
        if(h.sp.querySelector('.iw-sp__pct,.iw-sp__liquid')||/%/.test(h.sp.textContent))throw Error('Precise/continuous gauge leaked');
        if(h.sp.getAttribute('aria-valuenow')!==String(filled))throw Error('Accessible segment count drift');
        const color=getComputedStyle(h.sp.querySelector('.iw-sp__segment')).fill;
        if(!color||color==='none')throw Error('Segment has no paint');
        frames.push({fraction,count,lit,isReady,color});
      }
    } finally {a.special=saved.special;a.specialActive=saved.active;g._updateHud(1/60);}
    return {frames};
  });
  const viewport=page.viewportSize();
  try {
    for(const width of [1280]){
      await page.setViewportSize({width,height:width===375?812:800});
      await page.evaluate(async()=>{const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);const a=G.game.match.local;globalThis.__hudSavedSpecial=a.special;a.special=a.specialCost()*.47;G.game._updateHud(1/60);});
      await page.screenshot({path:path.join(evidence,`special-23-segments-${width}.png`),animations:'disabled',timeout:90000});
      await page.evaluate(async()=>{const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);G.game.match.local.special=globalThis.__hudSavedSpecial;delete globalThis.__hudSavedSpecial;G.game._updateHud(1/60);});
    }
  } finally {if(viewport)await page.setViewportSize(viewport);}
  // Desktop CI explicitly mounts the actual touch controller. This is native
  // DOM/frame coverage, not a claim of physical phone or permission testing.
  const resumeForTouch=await page.evaluate(async()=>{
    const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
    // Release desktop pointer lock through the normal pause path before resizing.
    // A deferred locked mousemove must not retake keyboard ownership mid-capture.
    if(document.pointerLockElement&&!G.game.match.paused){G.game.pause();return true;}
    return false;
  });
  if(resumeForTouch)await page.waitForFunction(()=>!document.pointerLockElement);
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  try {
    result.touch=await page.evaluate(async(resumeForTouch)=>{
      const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
      const {MobileInput}=await import(new URL('src/core/mobile.js',document.baseURI).href);
      const g=G.game,a=g.match.local,original=g.input.mobile;
      const m=original.root?original:new MobileInput(original.canvas,g.input);
      const saved={original,m,created:m!==original,inputActive:m.active,device:g.input.lastDevice,special:a.special,active:a.specialActive,visible:m.visible,touch:document.documentElement.classList.contains('iw-touch-ui')};
      globalThis.__hudTouchFixture=saved;
      m.active=true;if(!m.root)m._install();
      g.input.mobile=m;g.input.lastDevice='touch';document.documentElement.classList.add('iw-touch-ui');m.setVisible(true);
      if(resumeForTouch)g.resume();
      const rows=[];
      for(const [fraction,ready,filled]of [[0,false,0],[.47,false,10],[.99999,false,22],[1,true,23],[1,true,23],[0,false,0],[.47,false,10]]){
        a.specialActive=null;a.special=a.specialCost()*fraction;g._updateHud(1/60);
        const count=m.els.special.querySelectorAll('.iwm-sp-segment').length;
        const lit=m.els.special.querySelectorAll('.iwm-sp-segment.is-filled').length;
        if(count!==23||lit!==filled||m.els.special.classList.contains('is-ready')!==ready)throw Error('Touch special segment state drift');
        rows.push({fraction,count,lit,ready});
      }
      if(getComputedStyle(g.hud.sp).display!=='none')throw Error('Touch replacement did not hide desktop gauge');
      if(!m.els.special.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))throw Error('Touch special button is not visible');
      return rows;
    },resumeForTouch);
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    const touchState=()=>page.evaluate(async()=>{
      const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href),m=G.game.input.mobile;
      return {owner:G.game.input.lastDevice,buttonVisible:!!m.els?.special?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),desktopHidden:getComputedStyle(G.game.hud.sp).display==='none',segments:m.els?.special?.querySelectorAll('.iwm-sp-segment').length};
    });
    const requireTouch=state=>{if(state.owner!=='touch'||!state.buttonVisible||!state.desktopHidden||state.segments!==23)throw Error('Touch capture lost native ownership/visibility: '+JSON.stringify(state));};
    result.touchBeforeCapture=await touchState();requireTouch(result.touchBeforeCapture);
    await page.locator('.iwm-b--special').screenshot({path:path.join(evidence,'special-23-segments-touch-button.png'),animations:'disabled',timeout:90000});
    await page.screenshot({path:path.join(evidence,'special-23-segments-touch.png'),animations:'disabled',timeout:90000});
    result.touchAfterCapture=await touchState();requireTouch(result.touchAfterCapture);
  } finally {
    await page.evaluate(async()=>{
      const s=globalThis.__hudTouchFixture;if(!s)return;
      const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
      G.game.input.mobile=s.original;G.game.input.lastDevice=s.device;G.game.match.local.special=s.special;G.game.match.local.specialActive=s.active;
      if(s.created)s.m.destroy();else {s.m.active=s.inputActive;s.m.setVisible(s.visible);}
      document.documentElement.classList.toggle('iw-touch-ui',s.touch);G.game._updateHud(1/60);delete globalThis.__hudTouchFixture;
    });
    if(viewport)await page.setViewportSize(viewport);
  }
  result.alphaTies=await page.evaluate(async()=>{
    const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
    const {Match}=await import(new URL('src/game/match.js',document.baseURI).href);
    const {awardFlow}=await import(new URL('patches/splatoon3/runtime/flow.mjs',document.baseURI).href);
    // Invoke the loaded native judge with frozen coverage and an isolated result
    // sink. Do not finish the live rendering match or send network traffic.
    const coverage=G.paint.coverage,net=G.netm,random=Math.random,rows=[];
    try {
      Math.random=()=>{throw Error('Exact Turf judge used randomness');};
      for(const [values,winner]of [[[0,0],0],[[.4,.4],0],[[.4,.3996],0],[[.3996,.4],1]])for(const team of [0,1]){
        const cov=Object.freeze(values.slice()),m=Object.create(Match.prototype);let packet;
        Object.assign(m,{local:{team},bossMode:null,setState(state){this.state=state;}});
        G.paint.coverage=()=>cov;G.netm={sendResult(value){packet=value;}};m._judge();
        if(m.result.winner!==winner||packet.winner!==winner||m.result.coverage!==cov||m.state!=='judge')throw Error('Native Alpha result mismatch');
        rows.push({coverage:values,winner:m.result.winner,localTeam:team});
      }
    } finally {G.paint.coverage=coverage;G.netm=net;Math.random=random;}
    return rows;
  });
  result.judges=await page.evaluate(async()=>{
    const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href),h=G.game.hud,rows=[];
    const paused=h.paused;h.paused=true;
    try {
      for(const [winner,percents] of [[0,[40,39.96]],[1,[39.96,40]],[0,[40,40]],[1,[40,40]]]){
        const t=h._fxTime,p=h.judge({winner,percents}),tick=h._fxMap.get('judge');
        h._fxTime=t+3.9;tick(0);
        const el=h.overLayer.querySelector('.iw-jd:not(.is-out)');
        if(!el||!el.classList.contains(winner===0?'is-win-a':'is-win-b')||el.classList.contains('is-tie'))throw Error('Judd contradicted authoritative winner');
        const nums=[...el.querySelectorAll('.iw-jd__num')].map(n=>n.textContent);
        h._fxTime=t+5.2;tick(0);const actual=await p;
        if(actual.winner!==winner)throw Error('Judd completion drift');
        rows.push({winner,percents,nums});
      }
    } finally {h.paused=paused;}
    return rows;
  });
  await page.waitForTimeout(800);
  if(await page.locator('.iw-jd').count())throw Error('Judd overlay survived completed cleanup');
  // Isolated display probe: uses native HUD callout + production WIPEOUT
  // presentation, never changes the live actors, scores or Match state.
  result.teamWipeoutFlow=await page.evaluate(async()=>{
    const {G,emit}=await import(new URL('src/core/ctx.js',document.baseURI).href);
    const {Match}=await import(new URL('src/game/match.js',document.baseURI).href);
    const {awardFlow}=await import(new URL('patches/splatoon3/runtime/flow.mjs',document.baseURI).href);
    const {Vector3}=await import('three');
    const profile=await (await fetch(new URL('patches/splatoon3/profile.json',document.baseURI))).json();
    for(const [remaining,expected] of [[10,20],[15,25],[25,30]]){const state={active:true,remaining};awardFlow(state,'splat',1,profile.flow);if(state.remaining!==expected)throw Error('Flow extension is not ten seconds capped at thirty');}
    const old={match:G.match,actors:G.actors},m=new Match({});
    try {
      m.actors=Array.from({length:8},(_,i)=>({team:i>>2,alive:true,pos:new Vector3(i*4,0,0),s3:{flow:{active:false,remaining:0,score:0,idleTime:2}},update(){}}));
      m.local=m.actors[0];m.state='playing';m.time=60;G.match=m;G.actors=m.actors;
      m.update(1/60);m.actors.slice(4).forEach(a=>a.alive=false);m.update(1/60);
      const fp=a=>a.s3.flow.score*profile.flow.progress.referenceThreshold/profile.flow.threshold;
      const first=m.actors.slice(0,4).map(fp);emit('team:wipeout',{match:m,team:1,sequence:1});m.update(1/60);
      const once=m.actors.slice(0,4).every(a=>Math.abs(fp(a)-10)<1e-9);
      if(!first.every(x=>Math.abs(x-10)<1e-9)||!once)throw Error('WIPEOUT Flow team award missing or repeated');
      return {first,once};
    } finally {G.match=old.match;G.actors=old.actors;}
  });
  result.teamWipeouts=[];
  for(const own of [false,true]){
    try {
      const row=await page.evaluate(async(own)=>{
        const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
        const {queueTeamWipeHud,flushTeamWipeHud}=await import(new URL('patches/local-quality/team-wipeout.mjs',document.baseURI).href);
        const {t}=await import(new URL('src/i18n.js',document.baseURI).href);
        const native=G.game.hud,me=G.game.match.local;
        const holder=Object.create(Object.getPrototypeOf(native));
        holder.callouts=native.callouts.cloneNode(false);holder.callouts.dataset.wipeoutProbe='true';
        native.callouts.parentElement.appendChild(holder.callouts);
        globalThis.__wipeoutProbe=holder.callouts;
        holder._local=()=>me;holder._live=()=>true;
        const sounds=[];holder.playSound=name=>sounds.push(name);
        const match={mode:'turf',state:'playing',actors:G.game.match.actors};
        const timeout=globalThis.setTimeout,timers=[];
        try {
          globalThis.setTimeout=(...args)=>{const id=timeout(...args);timers.push(id);return id;};
          queueTeamWipeHud(holder,{match,team:own?me.team:1-me.team,sequence:1},match);
          flushTeamWipeHud(holder,match,t);
        } finally {globalThis.setTimeout=timeout;timers.forEach(clearTimeout);}
        const el=holder.callouts.lastElementChild;
        for(const animation of el.getAnimations({subtree:true})){animation.pause();animation.currentTime=600;}
        const label=el.querySelector('.iw-call__txt'),sub=el.querySelector('.iw-call__sub');
        const rect=label.getBoundingClientRect(),color=getComputedStyle(label).color;
        const visible=label.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&getComputedStyle(el).opacity==='1';
        const expected=own?'rgb(17, 17, 17)':'rgb(255, 255, 255)';
        if(label.textContent!=='WIPEOUT!!!'||color!==expected||!visible||rect.width<=0||rect.left<0||rect.right>innerWidth||rect.top<0||rect.bottom>innerHeight)throw Error('WIPEOUT visibility/color/label regression');
        if(!el.classList.contains(own?'is-own-wipeout':'is-enemy-wipeout')||sounds.length!==1||sounds[0]!== (own?'defeat_jingle':'special_ready'))throw Error('WIPEOUT team variant regression');
        if(sub.textContent!==t(own?'Your whole team is splatted':'The whole team is splatted'))throw Error('WIPEOUT subtitle regression');
        return {own,color,visible,label:label.textContent,subtitle:sub.textContent,sound:sounds[0],width:rect.width};
      },own);
      await page.screenshot({path:path.join(evidence,`wipeout-${own?'own':'enemy'}-team.png`),timeout:90000});
      const retained=await page.locator('[data-wipeout-probe] .iw-call__txt').isVisible();
      if(!retained)throw Error('WIPEOUT probe disappeared during capture');
      result.teamWipeouts.push({...row,retained});
    } finally {await page.evaluate(()=>{globalThis.__wipeoutProbe?.remove();delete globalThis.__wipeoutProbe;});}
  }
  Object.assign(result, await checkUiVisualProbes({page,evidence,sourceSha,contentHash}));
  return result;
}

// Narrow diagnostic entry; full HUD acceptance calls the exact same assertions.
export async function checkUiVisualProbes({page,evidence,sourceSha=null,contentHash=null}) {
  const result={};
  // #508 display-only reticle fixture uses the loaded native HUD methods.
  // Live actors/weapon state and weapon timing are never changed.
  result.splatlingStages=[];
  try {
    await page.evaluate(async()=>{
      const {G}=await import(new URL('src/core/ctx.js',document.baseURI).href);
      const {WEAPONS}=await import(new URL('src/config.js',document.baseURI).href);
      const h=G.game.hud,holder=Object.create(Object.getPrototypeOf(h));
      const xh=h.xh.cloneNode(false),ret=h.ret.cloneNode(false);xh.appendChild(ret);h.xh.parentElement.appendChild(xh);
      const old=h.xh.style.visibility;h.xh.style.visibility='hidden';
      globalThis.__splatlingProbe={xh,native:h.xh,old,holder};
      const a={alive:true,weapon:WEAPONS.splatling,weaponRunner:{streaming:false}};
      Object.assign(holder,{xh,ret,_L:{weapon:'splatling',kind:'splatling'},_kick:0,_bloom:0,shield:document.createElement('div'),subChip:document.createElement('div'),_local:()=>a,_restart(){}});
      holder._buildReticle('splatling');xh.className='iw-xh iw-xh--splatling';
      const style=getComputedStyle(xh);globalThis.__splatlingProbe.mount={opacity:style.opacity,visibility:style.visibility,display:style.display,animations:xh.getAnimations({subtree:true}).map(a=>({playState:a.playState,timing:a.effect?.getTiming()}))};
    });
    await page.evaluate(async()=>{const xh=globalThis.__splatlingProbe.xh;await Promise.all(xh.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
    for(const [name,charge,streaming,left,first,second]of [['first',2/3,false,0,1,0],['second',5/6,false,0,1,.5],['full',1,false,0,1,1],['partial-stream',1,true,80/60,1,0]]){
      let row=await page.evaluate(inspectSplatlingStages,{charge,streaming,left,first,second});
      if(row.errors.length)throw Error('Splatling stage geometry/progress regression: '+JSON.stringify(row));
      await page.waitForTimeout(100);
      row=await page.evaluate(inspectSplatlingStages,{charge,streaming,left,first,second,settled:true});
      if(row.errors.length)throw Error('Splatling stage geometry/progress regression: '+JSON.stringify(row));
      await page.screenshot({path:path.join(evidence,`splatling-reticle-${name}.png`),timeout:90000});
      result.splatlingStages.push({name,...row});
    }
    result.splatlingNegatives=[];
    for(const negative of ['hidden','opacity','offscreen','stroke','zero-size','progress']){
      const row=await page.evaluate(inspectSplatlingStages,{charge:5/6,streaming:false,left:0,first:1,second:.5,negative});
      if(!row.negativeApplied)throw Error('Splatling negative control setup failed '+negative+': '+JSON.stringify(row));
      const expectedError={hidden:'container/ancestor hidden',opacity:'container/ancestor hidden',offscreen:'ring1: geometry/viewport',stroke:'ring1: stroke hidden','zero-size':'ring1: geometry/viewport',progress:'ring1: inline progress'}[negative];
      if(!row.errors.includes(expectedError))throw Error('Splatling negative control accepted '+negative+': '+JSON.stringify(row));
      result.splatlingNegatives.push(row);
      await page.evaluate(async()=>{const xh=globalThis.__splatlingProbe.xh;await Promise.all(xh.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
    }
    // #560: private native HUD clone, with the live match left untouched.
    result.authoritativeSpread=[];
    for(const weapon of ['shooter','dualies','splatling','blaster']){
      await page.evaluate(async weapon=>{
        const h=globalThis.__splatlingProbe.holder;h.spIcon=document.createElement('div');
        h._kick=0;h._bloom=0;h._updCrosshair({weapon,charge:.5,crosshair:{spread:18.3}},0);
        await Promise.all(h.xh.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
      },weapon);
      const before=await page.evaluate(inspectAccuracyReticle);
      await page.evaluate(async weapon=>{
        const h=globalThis.__splatlingProbe.holder;h._kick=1;h._bloom=1;h._updCrosshair({weapon,charge:.5,crosshair:{spread:18.3}},0);
        await Promise.all(h.xh.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
      },weapon);
      const after=await page.evaluate(inspectAccuracyReticle);
      if(before.errors.length||after.errors.length||JSON.stringify(before.geometry)!==JSON.stringify(after.geometry))throw Error('authoritative reticle spread/visibility regression: '+JSON.stringify({weapon,before,after}));
      const negatives=[];
      for(const mutation of ['spread','hidden','opacity']){
        const row=await page.evaluate(inspectAccuracyReticle,mutation),expected=mutation==='spread'?'spread':'visibility';
        if(!row.negativeApplied||!row.errors.includes(expected))throw Error('reticle spread negative control accepted '+mutation);
        negatives.push(row);
        await page.evaluate(async()=>{const xh=globalThis.__splatlingProbe.xh;await Promise.all(xh.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
      }
      const restored=await page.evaluate(inspectAccuracyReticle);if(restored.errors.length)throw Error('reticle negative cleanup remained hidden');
      await page.screenshot({path:path.join(evidence,`authoritative-spread-${weapon}.png`),timeout:90000});
      result.authoritativeSpread.push({weapon,before,after,negatives});
    }
    fs.writeFileSync(path.join(evidence,'authoritative-spread-probe.json'),JSON.stringify({status:'passed',sourceSha,contentHash,states:result.authoritativeSpread},null,2));
    fs.writeFileSync(path.join(evidence,'splatling-reticle-probe.json'),JSON.stringify({status:'passed',sourceSha,contentHash,stages:result.splatlingStages,negatives:result.splatlingNegatives},null,2));
  } catch(error) {
    const diagnostic=await page.evaluate(()=>globalThis.__splatlingProbe?.last||null).catch(()=>null);
    await page.screenshot({path:path.join(evidence,'splatling-reticle-failure.png'),timeout:90000}).catch(()=>{});
    fs.writeFileSync(path.join(evidence,'splatling-reticle-probe.json'),JSON.stringify({status:'failed',sourceSha,contentHash,error:String(error),stages:result.splatlingStages,diagnostic},null,2));
    throw error;
  } finally {await page.evaluate(()=>{const s=globalThis.__splatlingProbe;if(s){s.xh.remove();s.native.style.visibility=s.old;delete globalThis.__splatlingProbe;}});}
  result.winnerPodium=await checkWinnerPodium({page,evidence,sourceSha,contentHash});
  return result;
}
