// Read-only native UI/surface admission. Never hides UI or advances simulation.
export function explosherSurfaceReady(s) {
 return !!s && s.nativeCanvas === true && s.uniqueGameCanvas === true && s.rendererOwner === true
  && s.canvasVisible === true && Number.isInteger(s.width) && s.width > 0
  && Number.isInteger(s.height) && s.height > 0 && s.menuCurrent === null
  && s.menuScreen === null && s.menuStarting === false && s.wipeRunning === false
  && s.wipeRunClass === false && s.leavingScreens === 0 && s.labFrozen === false;
}
export function readExplosherCaptureSurface() {
 const g=window.__inkwave,G=window.__G,m=g?.menus,r=g?.R?.renderer,c=r?.domElement;
 if(!m?.wipe || !m.wipeEl || !m.layer || !m.root || !c)throw Error('Missing native capture surface owner');
 const visible=e=>{let opacity=1;for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);opacity*=Number(s.opacity);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')return false;}return e.isConnected&&Number.isFinite(opacity)&&opacity>0.6;};
 const canvases=[...document.querySelectorAll('canvas')];if(canvases.length>32)throw Error('Canvas inventory exceeds diagnostic bound');
 const rect=c.getBoundingClientRect(),ids=[...document.querySelectorAll('#game-canvas')];
 return {nativeCanvas:c instanceof HTMLCanvasElement,uniqueGameCanvas:ids.length===1&&ids[0]===c,
  rendererOwner:G.renderer===r,canvasVisible:visible(c)&&rect.width>0&&rect.height>0,
  width:c.width,height:c.height,menuCurrent:m.current,menuScreen:m._scr?.name??null,
  menuStarting:!!m._starting,wipeRunning:m.wipe.running,wipeRunClass:m.wipeEl.classList.contains('is-run'),
  leavingScreens:m.layer.querySelectorAll('.is-leaving').length,labFrozen:m.root.classList.contains('iw-lab-freeze'),
  wipe:{mode:m.wipe.r?.mode??null,time:m.wipe.r?.t??null,midDone:m.wipe.r?.midDone??null},
  canvases:canvases.map((e,index)=>({index,id:e.id,className:e.className,native:e===c,visible:visible(e),width:e.width,height:e.height})),
  centerStack:document.elementsFromPoint(rect.left+rect.width/2,rect.top+rect.height/2).slice(0,8).map(e=>({tag:e.tagName,id:e.id,className:typeof e.className==='string'?e.className:''}))};
}
