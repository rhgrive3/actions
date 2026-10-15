// Hosted component probe. Actual Menus DOM, CSS and Showcase-produced projections.
// Caller injects the reviewed native-style helper as source, never a replacement style object.
export async function lobbyProbe({input=null,styleHelper}) {
 const check=(ok,m)=>{if(!ok)throw Error('Lobby probe: '+m);};
 const {G}=await import(new URL('src/core/ctx.js',document.baseURI));
 const {Menus}=await import(new URL('src/ui/menus.js',document.baseURI));
 const game=G.game,menus=G.menus,sc=game?.showcase,net=G.net;
 check(game===globalThis.__inkwave&&menus===game.menus&&menus instanceof Menus,'native module identity');
 check(game.frozen&&menus.current==='lobby'&&menus._scr?.name==='lobby','frozen ordinary lobby');
 check(net?.isMock&&net.state==='lobby'&&sc?.mode==='lobby'&&sc.lob?.ready&&sc.lob.room,'native offline room ready');
 const observe=(0,eval)('('+styleHelper+')'),original=sc.lobbySlotAnchor,own=Object.getOwnPropertyDescriptor(sc,'lobbySlotAnchor'),extTick=menus._extTick,savedMode=sc.mode,savedBots=net.lobby.bots;
 const restorers=[],frames=[],writes=[],natural=[],naturalObservation=[];let slots=[];
 const read=()=>Array.from({length:8},(_,k)=>{const a=original.call(sc,k>>2,k&3,{});if(!a)return null;check(['x','y','s','vis'].every(p=>Number.isFinite(a[p])),'finite actual projection');return{x:a.x,y:a.y,s:a.s,vis:a.vis,behind:!!a.behind};});
 const finish=()=>{for(const a of menus._scr.el.getAnimations({subtree:true})){const end=a.effect?.getComputedTiming().endTime;if(Number.isFinite(end))a.finish();else if(a.animationName==='iw-open-bob'){a.pause();a.currentTime=0;}}};
 const restoreStyles=()=>{const errors=[];for(const restore of restorers.splice(0).reverse()){try{restore();}catch(e){errors.push(e);}}if(errors.length)throw new AggregateError(errors,'Style cleanup failed');};
 const mount=()=>{restoreStyles();menus.show('lobby',{force:true,wipe:false,light:false,instantLeave:true,back:true});check(menus._scr.name==='lobby','native remount');slots=[...menus._scr.el.querySelectorAll('.iw-plate.is-open')];check(slots.length===8,'exact eight native open nodes');finish();for(const [i,el]of slots.entries())restorers.push(observe(el,(key,value)=>{if(key==='transform')writes.push({i,value});}));};
 try {
  // Synchronous controlled ticks cannot interleave the automatic menu RAF.
  menus._extTick=performance.now();
  slots=[...menus._scr.el.querySelectorAll('.iw-plate.is-open')];check(slots.length===8,'natural eight slots');
  for(const [i,el]of slots.entries())restorers.push(observe(el,(key,value)=>{if(key==='transform')writes.push({i,value});}));
  const capture=label=>{const anchors=read(),n=writes.length;menus._scr.tick(1/60);natural.push({label,anchors,bots:net.lobby.bots!==false});naturalObservation.push({label,assignments:writes.length-n,transforms:slots.map(el=>el.style.transform),visible:slots.map(el=>el.classList.contains('is-on'))});};
  check(read().some(a=>a&&a.vis>.5),'at least one actual visible free slot');
  for(let i=0;i<60;i++)capture('fixed'+i);
  // Showcase.render refreshes this camera before normal menu projection reads.
  function advanceNativeLobby(sc,width,height){sc.update(1/60);sc._fdt=1/60;sc._lobCamera(width,height);}
  for(let i=0;i<60;i++){advanceNativeLobby(sc,innerWidth,innerHeight);capture('moving'+i);}
  const mode=sc.mode;try{sc.mode='main';capture('hidden');}finally{sc.mode=mode;}
  capture('return0');capture('return1');capture('external-repair');net.setSettings({bots:false});check(net.lobby.bots===false,'native bots off');capture('bots-off');net.setSettings({bots:true});check(net.lobby.bots===true,'native bots on');capture('bots-on');capture('reenter');
  input ||= natural;
  check(input.length===127,'complete phase input');
  mount();let active=input[0].anchors,calls=[];
  Object.defineProperty(sc,'lobbySlotAnchor',{configurable:true,writable:true,value(row,i,out={}){const k=row*4+i;calls.push(k);const a=active[k];return a?Object.assign(out,a):null;}});
  for(const f of input){
   if(net.lobby.bots!==f.bots)net.setSettings({bots:f.bots});check(net.lobby.bots===f.bots,'native input bots');active=f.anchors;check(active.length===8,'eight source anchors');
   if(f.label==='reenter')mount();
   if(f.label==='external-repair')for(const el of slots)el.style.transform='none';
   const start=writes.length;calls=[];menus._scr.tick(1/60);check(calls.join(',')==='0,1,2,3,4,5,6,7','unchanged anchor call sequence');finish();
   const rows=slots.map((el,i)=>{
    const c=getComputedStyle(el),r=el.getBoundingClientRect(),on=el.classList.contains('is-on');
    const ghost=el.querySelector('.iw-plate__ghost'),stack=el.querySelector('.iw-plate__stack');check(ghost&&stack,'native visible descendants');
    const g=getComputedStyle(ghost),gr=ghost.getBoundingClientRect(),st=getComputedStyle(stack),sr=stack.getBoundingClientRect();
    const ancestors=[];for(let n=ghost;n;n=n.parentElement){const z=getComputedStyle(n);ancestors.push({tag:n.tagName,classes:n.className,opacity:z.opacity,display:z.display,visibility:z.visibility});}
    const row={i,on,classes:el.className,transform:el.style.transform,computedTransform:c.transform,opacity:c.opacity,display:c.display,visibility:c.visibility,rect:[r.x,r.y,r.width,r.height],text:el.textContent,icon:el.querySelector('.iw-plate__plus').innerHTML,child:{rect:[gr.x,gr.y,gr.width,gr.height],opacity:g.opacity,display:g.display,visibility:g.visibility,color:g.color,background:g.backgroundColor},stack:{rect:[sr.x,sr.y,sr.width,sr.height],opacity:st.opacity,scale:st.scale,translate:st.translate},ancestors,bobPhase:0};
    globalThis.LOBBY_PROBE_PARTIAL={label:f.label,row,completedFrames:frames};
    const bob=stack.getAnimations().filter(a=>a.animationName==='iw-open-bob');if(on)check(bob.length===1&&bob[0].playState==='paused'&&bob[0].currentTime===0,'shared native bob phase');
    check([...row.rect,...row.child.rect,...row.stack.rect].every(Number.isFinite),'finite native rect');
    if(on)check(gr.width>0&&gr.height>0&&gr.right>0&&gr.bottom>0&&gr.left<innerWidth&&gr.top<innerHeight&&ancestors.every(a=>Number(a.opacity)>0&&a.display!=='none'&&a.visibility==='visible'),'visible slot child endpoint');
    return row;
   });
   frames.push({label:f.label,rows,assignments:writes.length-start,calls:[...calls]});
  }
  return {status:'passed',input,natural,naturalObservation,frames,restored:true,moduleURLs:{ctx:new URL('src/core/ctx.js',document.baseURI).href,menus:new URL('src/ui/menus.js',document.baseURI).href},scope:'Actual native lobby DOM/CSS endpoint parity using shared native Showcase projection trace; controlled ticks, not frame-time/FPS or network-room proof'};
 } finally {
  const errors=[];for(const restore of restorers.reverse()){try{restore();}catch(e){errors.push(e);}}
  try{if(own)Object.defineProperty(sc,'lobbySlotAnchor',own);else delete sc.lobbySlotAnchor;}catch(e){errors.push(e);}
  menus._extTick=extTick;sc.mode=savedMode;try{net.setSettings({bots:savedBots});}catch(e){errors.push(e);}
  check(sc.lobbySlotAnchor===original&&sc.mode===savedMode&&net.lobby.bots===savedBots,'native hooks and room settings restored');if(errors.length)throw new AggregateError(errors,'Lobby cleanup failed');
 }
}
