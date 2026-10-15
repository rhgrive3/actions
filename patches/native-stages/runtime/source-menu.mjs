import {nativeStageBuild} from './build-config.mjs';
const IDs=nativeStageBuild?.stages.map(s=>s.id)||[];
// Original abstract menu artwork, not a screenshot or invented stage layout.
export function nativeStageArt(id,time){
 if(!nativeStageBuild||!IDs.includes(id))return null;
 const color=['#e19752','#4ac5b6','#b092db','#78b97b','#67afca'][IDs.indexOf(id)%5],dark=time==='dusk';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect width="800" height="450" fill="${dark?'#161928':'#252940'}"/><path d="M0 390C150 160 260 470 430 235S660 215 800 10V450H0Z" fill="${color}" opacity=".8"/><path d="M-30 340C140 120 300 370 420 190S650 110 840 -20" fill="none" stroke="${color}" stroke-width="34"/><circle cx="400" cy="205" r="83" fill="#ffffff" opacity=".15"/><path d="M360 192L400 168L440 192L400 218Z M360 192V237L400 260V218 M440 192V237L400 260" fill="none" stroke="#ffffff" stroke-width="10" stroke-linejoin="round"/><text x="400" y="326" fill="#ffffff" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle">INKWAVE 3D</text></svg>`;
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
