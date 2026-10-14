// Preparation follows the verified controlled-launch intro wait, without its
// yaw/pitch/follow override. AIM is captured separately before ordinary firing.
export async function prepareLightingScene(theme){
 const G=globalThis.NG,g=G.game;
 if(!['day','sunset'].includes(theme))throw Error('Unsupported theme');
 g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();globalThis.__resetPairRandom();g._setSettings({quality:'high',shadows:true,bloom:false});
 await g.startMatch({mapId:'inkblot',mode:'turf',difficulty:'normal',time:theme==='sunset'?'dusk':'day'});
 g.debug.freeze();g.debug.freezeBots();g._skipRender=true;g.debug.fire(false);g.input.mouse.left=false;
 for(let i=0;i<240;i++)g._frame(1/60);
 let introTicks=0;while(G.match.state==='intro'&&introTicks<60){g._frame(1/60);introTicks++;}
 if(G.match.state!=='playing')throw Error('Native intro did not complete');
 for(let i=0;i<60;i++)g._frame(1/60);
 G.paint.flush(1/60);g.R.render();
 const a=G.local,grade=g.R.grade?.uniforms;
 const phase={mode:G.mode,match:G.match.state,spawn:a?.s3?.squidSpawn?.phase,menus:g.menus.current,wipeBusy:g.menus.wipe.busy,frozen:g.frozen,skipRender:g._skipRender,screenFxEnabled:G.screenfx?.pass?.enabled,extraPassEnabled:g.R.extraPass?.enabled,gradeHurt:grade?.uHurt?.value,gradeFlash:grade?.uFlash?.value,shimmer:G.screenfx?.s?.shimmer,fxScalars:Object.fromEntries(Object.entries(G.screenfx?.s??{}).filter(([,v])=>typeof v==='number'&&Number.isFinite(v))),lensParts:G.screenfx?.stats?.lensParts??null,invuln:Number.isFinite(a.invuln)?a.invuln:String(a.invuln)};
 if(G.mode!=='match'||G.match.state!=='playing'||!a?.alive||G.match.controller?.a!==a||a.s3?.squidSpawn?.phase!=='aim'||a.intent.fire||g.input.mouse.left||g.menus.current!=null||g.menus.wipe.busy||g.frozen!==true||g._skipRender!==true)throw Error('Lighting scene not in settled frozen native playing AIM: '+JSON.stringify(phase));
 if(g.theme!==theme||g.settings.quality!=='high'||G.renderer.shadowMap.enabled!==true||G.level.manifest.id!=='inkblot')throw Error('Scene preparation changed requested rendering mode: '+JSON.stringify({expectedTheme:theme,actualTheme:g.theme,time:g.time,quality:g.settings.quality,shadows:G.renderer.shadowMap.enabled,stage:G.level.manifest.id}));
 const gl=G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 return {theme:g.theme,quality:g.settings.quality,stage:G.level.manifest.id,source:G.level.manifest.sourceSha256,actor:a.pos.toArray(),camera:G.camera.position.toArray(),phase,introTicks,settleTicks:60,totalTicks:300+introTicks,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),framePolicy:'240 native ticks then bounded real intro-completion wait and60 settle ticks; no actor/camera/phase replacement'};
}

// Advance only genuine controller input and native lifecycle. No scene edits.
export function landLightingScene(){
 const G=globalThis.NG,g=G.game,a=G.local,grade=g.R.grade?.uniforms;
 const snapshot=()=>({match:G.match.state,spawn:a.s3?.squidSpawn?.phase??null,actor:a.pos.toArray(),camera:G.camera.position.toArray(),grounded:a.grounded,groundHit:!!a.ground?.hit,alive:a.alive,invuln:Number.isFinite(a.invuln)?a.invuln:String(a.invuln),shimmer:G.screenfx?.s?.shimmer,fxScalars:Object.fromEntries(Object.entries(G.screenfx?.s??{}).filter(([,v])=>typeof v==='number'&&Number.isFinite(v))),lensParts:G.screenfx?.stats?.lensParts??null,screenFxEnabled:G.screenfx?.pass?.enabled,extraPassEnabled:g.R.extraPass?.enabled,gradeHurt:grade?.uHurt?.value,gradeFlash:grade?.uFlash?.value});
 const receipt={policy:'Real released-to-mouse-fire launch; native flight/ground landing and natural FX decay; no actor, phase, camera or FX replacement',aim:snapshot(),trace:[],flightTicks:0,settleTicks:0};
 globalThis.__lightingLandingReceipt=receipt;
 const record=()=>{const row=snapshot(),last=receipt.trace.at(-1);if(!last||last.spawn!==row.spawn)receipt.trace.push({...row,tick:receipt.flightTicks});receipt.latest=row;};
 if(G.match.state!=='playing'||G.match.controller?.a!==a||!a.alive||a.s3?.squidSpawn?.phase!=='aim'||a.intent.fire||g.input.mouse.left)throw Error('Landing preparation requires released native AIM');
 try{g.input.mouse.left=true;g._frame(1/60);record();if(a.s3?.squidSpawn?.phase!=='flight'||!a.intent.fire)throw Error('Ordinary input failed to launch');}finally{g.input.mouse.left=false;}
 while(a.s3?.squidSpawn&&receipt.flightTicks<240){g._frame(1/60);receipt.flightTicks++;record();}
 const grounded=()=>a.alive&&a.grounded&&!!a.ground?.hit&&!a.s3?.squidSpawn&&G.match.state==='playing'&&G.match.controller?.a===a;
 if(!grounded())throw Error('Native flight did not land on real ground: '+JSON.stringify(receipt.latest));
 receipt.landed=snapshot();
 const quiet=()=>G.screenfx?.pass?.enabled===false&&g.R.extraPass?.enabled!==true&&grade?.uHurt?.value===0&&grade?.uFlash?.value===0;
 // A minimum second settles the normal camera; the 10s bound also captures
 // effects that never become quiescent instead of hiding them.
 while(receipt.settleTicks<600&&(receipt.settleTicks<60||!quiet())){g._frame(1/60);receipt.settleTicks++;record();if(!grounded())throw Error('Native landed actor became unstable: '+JSON.stringify(receipt.latest));}
 if(!quiet())throw Error('Landed ScreenFX did not decay naturally: '+JSON.stringify(receipt.latest));
 if(a.intent.fire||g.input.mouse.left||g.frozen!==true||g._skipRender!==true||g.menus.current!=null||g.menus.wipe.busy)throw Error('Landed scene is not frozen with released input');
 G.paint.flush(1/60);g.R.render();receipt.final=snapshot();return receipt;
}

export function captureAimReference(){
 // WebGL drawing buffers can be discarded between browser tasks. Render/read
 // synchronously in this callback; the capture function reads before any await.
 globalThis.NG.game.R.render();
 return globalThis.__captureNativeCanvas('aim-reference-active-fx');
}
