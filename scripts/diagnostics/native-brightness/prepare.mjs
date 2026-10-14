// Preparation follows the verified controlled-launch intro wait, without its
// yaw/pitch/follow override or firing. Only real lifecycle ticks advance state.
export async function prepareLightingScene(theme){
 const G=globalThis.NG,g=G.game;
 if(!['day','sunset'].includes(theme))throw Error('Unsupported theme');
 g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();globalThis.__resetPairRandom();g._setSettings({quality:'high',shadows:true,bloom:false});
 await g.startMatch({mapId:'inkblot',mode:'turf',difficulty:'normal',time:theme});
 g.debug.freeze();g.debug.freezeBots();g._skipRender=true;g.debug.fire(false);g.input.mouse.left=false;
 for(let i=0;i<240;i++)g._frame(1/60);
 let introTicks=0;while(G.match.state==='intro'&&introTicks<60){g._frame(1/60);introTicks++;}
 if(G.match.state!=='playing')throw Error('Native intro did not complete');
 for(let i=0;i<60;i++)g._frame(1/60);
 G.paint.flush(1/60);g.R.render();
 const a=G.local,grade=g.R.grade?.uniforms;
 const phase={mode:G.mode,match:G.match.state,spawn:a?.s3?.squidSpawn?.phase,menus:g.menus.current,wipeBusy:g.menus.wipe.busy,frozen:g.frozen,skipRender:g._skipRender,screenFxEnabled:G.screenfx?.pass?.enabled,extraPassEnabled:g.R.extraPass?.enabled,gradeHurt:grade?.uHurt?.value,gradeFlash:grade?.uFlash?.value};
 if(G.mode!=='match'||G.match.state!=='playing'||!a?.alive||G.match.controller?.a!==a||a.s3?.squidSpawn?.phase!=='aim'||a.intent.fire||g.input.mouse.left||g.menus.current!=null||g.menus.wipe.busy||g.frozen!==true||g._skipRender!==true)throw Error('Lighting scene not in settled frozen native playing AIM: '+JSON.stringify(phase));
 // Do not turn off effects just to make the diagnostic pass: reject live ones.
 if(!G.screenfx?.pass||G.screenfx.pass.enabled!==false||g.R.extraPass?.enabled===true||grade?.uHurt?.value!==0||grade?.uFlash?.value!==0)throw Error('Screen effects are not quiescent: '+JSON.stringify(phase));
 if(g.theme!==theme||g.settings.quality!=='high'||G.renderer.shadowMap.enabled!==true||G.level.manifest.id!=='inkblot')throw Error('Scene preparation changed requested rendering mode');
 const gl=G.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 return {theme:g.theme,quality:g.settings.quality,stage:G.level.manifest.id,source:G.level.manifest.sourceSha256,actor:a.pos.toArray(),camera:G.camera.position.toArray(),phase,introTicks,settleTicks:60,totalTicks:300+introTicks,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),framePolicy:'240 native ticks then bounded real intro-completion wait and60 settle ticks; no actor/camera/phase replacement'};
}
