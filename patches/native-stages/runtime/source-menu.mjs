import {nativeStageBuild} from './build-config.mjs';
const IDs=nativeStageBuild?.stages.map(s=>s.id)||[];
// Original abstract menu artwork, not a screenshot or invented stage layout.
export function nativeStageArt(id,time){
 if(!nativeStageBuild||!IDs.includes(id))return null;
 const color=['#e19752','#4ac5b6','#b092db','#78b97b','#67afca'][IDs.indexOf(id)%5],dark=time==='dusk';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect width="800" height="450" fill="${dark?'#161928':'#252940'}"/><path d="M0 390C150 160 260 470 430 235S660 215 800 10V450H0Z" fill="${color}" opacity=".8"/><path d="M-30 340C140 120 300 370 420 190S650 110 840 -20" fill="none" stroke="${color}" stroke-width="34"/><circle cx="400" cy="205" r="83" fill="#ffffff" opacity=".15"/><path d="M360 192L400 168L440 192L400 218Z M360 192V237L400 260V218 M440 192V237L400 260" fill="none" stroke="#ffffff" stroke-width="10" stroke-linejoin="round"/><text x="400" y="326" fill="#ffffff" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle">ZEVANT 3D</text></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
export function sourceLoadingStatus(name){
 if(nativeStageBuild?.mode!=='browser-direct'||typeof document==='undefined')return {update(){},close(){}};
 const el=document.createElement('div');el.id='native-stage-loading';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
 Object.assign(el.style,{position:'fixed',inset:'0',zIndex:'10000',display:'grid',placeContent:'center',gap:'16px',textAlign:'center',background:'rgba(18,21,35,.96)',color:'white',font:'600 18px system-ui',padding:'24px'});
 const title=document.createElement('div');title.textContent=name;title.style.fontSize='28px';const label=document.createElement('div');el.append(title,label);document.body.append(el);
 function update(phase,bytes,total){
  label.textContent=phase==='download'?'地形を取得しています'+(bytes?' · '+(bytes/1048576).toFixed(1)+(total?' / '+(total/1048576).toFixed(1):'')+' MB':''):phase==='textures'||phase==='ready'?'画像を読み込んでいます':phase==='navigation'?'対戦を準備しています':'地形を準備しています';
 }
 const listener=e=>{if(nativeStageBuild.stages.find(s=>s.name===name)?.id===e.detail?.id)update(e.detail.phase,e.detail.bytes,e.detail.total);};
 globalThis.addEventListener('inkwave:native-source-progress',listener);update('download');
 return {update,close(){globalThis.removeEventListener('inkwave:native-source-progress',listener);el.remove();}};
}


// A failed rollback is terminal for this page instance: the game loop is frozen
// by the world owner before showing this control. Reload is an explicit user action.
export function showNativeWorldRecovery(game){
 if(typeof document==='undefined')return null;
 const existing=game.R?._contextRecoveryOverlay||game._nativeWorldRecoveryOverlay;
 if(existing)return existing;
 const overlay=document.createElement('div');
 overlay.className='iw-webgl-recovery iw-native-world-recovery';
 overlay.setAttribute('role','alertdialog');overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-label','Stage recovery required');
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483640;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;background:rgba(12,14,28,.96);color:#fff;font:600 16px/1.5 system-ui;text-align:center';
 const message=document.createElement('p');
 message.textContent='ステージを安全な状態に戻せなかったため、ゲームを停止しました。再読み込みしてください。';
 const button=document.createElement('button');button.type='button';button.textContent='ゲームを再読み込み';
 button.style.cssText='padding:12px 24px;border-radius:10px;border:2px solid #fff;background:#333e68;color:#fff;font:inherit;cursor:pointer';
 button.addEventListener('click',()=>globalThis.location.reload());
 overlay.append(message,button);(document.body||game.R?.container||document.documentElement).appendChild(overlay);
 game._nativeWorldRecoveryOverlay=overlay;
 // Reuse the optional WebGL recovery owner's existing duplicate-dialog latch.
 // This does not mark a context as lost or change that owner's render state.
 if(game.R)game.R._contextRecoveryOverlay=overlay;
 button.focus?.();return overlay;
}
