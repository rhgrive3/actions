import assert from 'node:assert/strict';

// Runs in the real browser. Drive the native HUD spring on rendering frames;
// observe CSS animation completion without finishing/cancelling it ourselves.
export function waitForNativePadMap({index,timeoutMs=10000}){
 const hud=window.navigationHud,frame=window.navigationMapFrame,entrance=window.navigationMapEntrance;
 const started=performance.now();let last=started,frames=0,raf,timer,done=false;
 const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
 const visible=el=>{let opacity=1;for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden')return 0;opacity*=Number(s.opacity);}return opacity;};
 const snapshot=()=>{
  const beacon=hud.beacons[index],row=hud.legendRows[index],label=beacon.querySelector('.iw-bcn__label'),labelText=label.querySelector('b'),disc=beacon.querySelector('.iw-bcn__disc'),icon=beacon.querySelector('.iw-bcn__icon'),guide=hud.mapLegend.querySelector('.iw-lg__foot');
  const iconBox=rect(icon),iconRegion={x:iconBox.x+iconBox.width*.1,y:iconBox.y+iconBox.height*.1,width:iconBox.width*.8,height:iconBox.height*.8};
  const finiteRunning=hud.map.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect.getComputedTiming().iterations)&&(a.pending||a.playState!=='finished')).length;
  return {index,frames,elapsedMs:performance.now()-started,visibility:document.visibilityState,focused:document.hasFocus?.(),mapT:hud._mapT,mapV:hud._mapV,finiteRunning,
   entrance:entrance.map(a=>({name:a.animationName,playState:a.playState,currentTime:a.currentTime,endTime:a.effect.getComputedTiming().endTime})),
   mapOpacity:visible(hud.map),rowOpacity:visible(row),labelOpacity:visible(label),labelTextOpacity:visible(labelText),labelText:labelText.textContent,iconOpacity:visible(icon),discOpacity:visible(disc),guideOpacity:visible(guide),
   beaconIndices:hud.beacons.flatMap((b,i)=>b.classList.contains('is-hover')?[i]:[]),rowIndices:hud.legendRows.flatMap((r,i)=>r.classList.contains('is-hover')?[i]:[]),
   controllerIndex:controller.padJumpIndex,targetMatches:controller.padJumpTarget?.actor===window.navigationTargets[index],cursor:hud.mapCursor.classList.contains('is-on'),guide:guide.textContent,
   regions:{map:rect(hud.map),disc:rect(disc),label:rect(label),labelText:rect(labelText),icon:iconRegion,row:rect(row),unselectedRow:rect(hud.legendRows[0]),guide:rect(guide)},viewport:{width:innerWidth,height:innerHeight}};
 };
 return new Promise(resolve=>{
  const finish=(status,reason,state)=>{
   if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(raf);
   try{state??=snapshot();}catch(error){status='failed';reason=(reason?reason+'; ':'')+'native map snapshot failed: '+error.message;state={index,frames,elapsedMs:performance.now()-started};}
   resolve({...state,status,reason});
  };
  const tick=now=>{
   if(done)return;
   try{
    hud._updMap(frame,Math.max(0,Math.min(.05,(now-last)/1000)));last=now;frames++;
    const s=snapshot();
    if(!entrance.length||entrance.some(a=>a.playState==='idle'))return finish('failed','native map entrance missing or cancelled',s);
    if(entrance.every(a=>a.playState==='finished')&&s.mapT===1&&s.mapV===0&&!s.finiteRunning&&document.fonts.status==='loaded'&&Math.min(s.mapOpacity,s.rowOpacity,s.labelOpacity,s.labelTextOpacity,s.iconOpacity,s.discOpacity,s.guideOpacity)>=.99)return finish('ready',undefined,s);
    raf=requestAnimationFrame(tick);
   }catch(error){finish('failed','native map frame failed: '+error.message);}
  };
  timer=setTimeout(()=>finish('failed','native map presentation did not settle'),timeoutMs);
  raf=requestAnimationFrame(tick);
 });
}

// Decode the exact screenshot, not a DOM class or a separately redrawn fixture.
// Runs in the same browser, using its native PNG decoder and canvas readback.
export async function readPadMapScreenshot({png,regions,viewport}){
 const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Screenshot PNG decode failed'));img.src=png;});
 const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
 const sx=canvas.width/viewport.width,sy=canvas.height/viewport.height,out={width:canvas.width,height:canvas.height,scaleX:sx,scaleY:sy};
 for(const [name,r]of Object.entries(regions)){
  const x=Math.max(0,Math.floor(r.x*sx)),y=Math.max(0,Math.floor(r.y*sy)),w=Math.min(canvas.width-x,Math.ceil(r.width*sx)),h=Math.min(canvas.height-y,Math.ceil(r.height*sy));
  let bright=0,orange=0,borderOrange=0;
  if(w>0&&h>0){const data=ctx.getImageData(x,y,w,h).data;for(let py=0;py<h;py++)for(let px=0;px<w;px++){
   const i=(py*w+px)*4,R=data[i],G=data[i+1],B=data[i+2],isOrange=R>150&&G>60&&B<135&&R-G>40;
   if(Math.min(R,G,B)>=160)bright++;if(isOrange)orange++;
   const border=(py<3*sy||py>=h-3*sy)&&px>10*sx&&px<w-10*sx||(px<3*sx||px>=w-3*sx)&&py>10*sy&&py<h-10*sy;
   if(border&&isOrange)borderOrange++;
  }}
  out[name]={pixels:Math.max(0,w)*Math.max(0,h),bright,orange,borderOrange};
 }
 return out;
}

export function assertPadMapEvidence({state,pixels}){
 assert.equal(state.status,'ready',state.reason);assert(state.frames>0);
 assert(state.entrance.length>0&&state.entrance.every(a=>a.name==='iw-hud-slide'&&a.playState==='finished'&&a.currentTime>=a.endTime),'native entrance must really finish');
 assert.equal(state.mapT,1);assert.equal(state.mapV,0);assert.equal(state.finiteRunning,0);
 for(const key of ['mapOpacity','rowOpacity','labelOpacity','labelTextOpacity','iconOpacity','discOpacity','guideOpacity'])assert(state[key]>=.99,key+' is not visibly opaque');
 assert.deepEqual(state.beaconIndices,[state.index]);assert.deepEqual(state.rowIndices,[state.index]);assert.equal(state.controllerIndex,state.index);assert.equal(state.targetMatches,true);assert.equal(state.cursor,false);assert(state.guide.includes('A'));assert.equal(state.labelText,'Target '+state.index);
 for(const [name,r]of Object.entries(state.regions)){assert(Object.values(r).every(Number.isFinite)&&r.width>0&&r.height>0,name+' has no finite rendered bounds');assert(r.x>=0&&r.y>=0&&r.x+r.width<=state.viewport.width+1&&r.y+r.height<=state.viewport.height+1,name+' is outside the screenshot');}
 const unit=pixels.scaleX*pixels.scaleY;assert(unit>0&&Number.isFinite(unit));
 for(const name of ['icon','labelText','guide'])assert(pixels[name]?.bright>=8*unit,name+' has no visible native text/icon pixels');
 assert(pixels.disc.orange>=20*unit,'selected beacon has no native color pixels');
 assert(pixels.row.borderOrange>=8*unit,'selected row has no rendered selection border');
 assert(pixels.unselectedRow.borderOrange<pixels.row.borderOrange/3,'unselected row looks selected');
}
