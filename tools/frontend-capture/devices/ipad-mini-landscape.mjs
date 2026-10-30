// QA only. CSS-size emulation, not a physical iPad or Safari certification.
export const device=Object.freeze({id:'ipad-mini-landscape',viewport:Object.freeze({width:1133,height:744}),isMobile:true,hasTouch:true,deviceScaleFactor:1});
export function validateLandscapeReadback(value){
 if(!value||value.width!==1133||value.height!==744||value.dpr!==1||value.landscape!==true||!(value.touchPoints>0))throw Error('iPad mini landscape emulation readback mismatch');
 if(value.visualViewport&&(Math.abs(value.visualViewport.width-1133)>1||Math.abs(value.visualViewport.height-744)>1||Math.abs(value.visualViewport.scale-1)>0.001))throw Error('Unexpected visual viewport scale or dimensions');
 return true;
}
export async function captureDevice(api){
 // Common runner owns every screen/tab/modal capture and safe native navigation.
 // This supplement only records actual landscape geometry without CSS/DOM mutations.
 const readback=await api.page.evaluate(()=>{
  const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;};
  const visibleScreens=[...document.querySelectorAll('.iw-screen:not(.is-leaving)')].filter(visible);
  const containers=visibleScreens.flatMap(root=>[root,...root.querySelectorAll('*')]).filter(e=>{
   const s=getComputedStyle(e);return visible(e)&&(/auto|scroll/.test(s.overflowX+s.overflowY))&&(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1);
  }).slice(0,64).map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,classes:String(e.className).slice(0,160),bounds:{x:r.x,y:r.y,width:r.width,height:r.height},scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight,clientWidth:e.clientWidth,clientHeight:e.clientHeight,scrollLeft:e.scrollLeft,scrollTop:e.scrollTop};});
  return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,landscape:matchMedia('(orientation: landscape)').matches,touchPoints:navigator.maxTouchPoints,userAgent:navigator.userAgent,visualViewport:visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null,visibleScreens:visibleScreens.map(e=>({id:e.id,screen:e.dataset.screen??null})),scrollableContainers:containers};
 });
 validateLandscapeReadback(readback);
 return {deviceId:device.id,scope:'Chromium mobile CSS viewport emulation; DPR1 output1133x744, not native device density or Safari validation',readback,commonFlowOwnsCoverage:true,extraScreenshots:0};
}
