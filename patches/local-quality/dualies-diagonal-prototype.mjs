// LOCAL next-candidate prototype, now hooked by this overlay's candidate
// compiler only. Not published; browser/retail validation is still pending.
// Exact native Splat Dualies: diagonal outer ticks and merged-only13px visual radius.
// Live radius remains (17px + --sp * 1px); no reference spacing fit is claimed.
import {DIAGONAL_QUADRANTS} from './diagonal-slash-primitive.mjs';
export const DUALIES_DIAGONAL_PROTOTYPE_CLASS='iw-reticle-dualies-diagonal-prototype';
const MARK=DUALIES_DIAGONAL_PROTOTYPE_CLASS;
const INSTALLED=Symbol.for('inkwave.evidence.dualiesDiagonalPrototype');
const BASE=(17/Math.sqrt(2)).toFixed(8),COEFF=(1/Math.sqrt(2)).toFixed(8);
const extent=`calc(${BASE}px + var(--sp, 0) * ${COEFF}px)`;
export const DUALIES_DIAGONAL_PROTOTYPE_CSS=DIAGONAL_QUADRANTS.map((q,i)=>{
 const x=q.x<0?`calc(0px - ${extent})`:extent;
 const y=q.y<0?`calc(0px - ${extent})`:extent;
 return `.iw-ret--dualies.${MARK} > .iw-ret__tick:nth-child(${i+3}) { transform: translate(${x}, ${y}) rotate(${q.angle}deg); }`;
}).join('\n');
// No replacement geometry/node allocation during native draws. Marker scopes
// tick transforms. ONLY the existing #1158 merged circle receives approximate
// 13px visual radius while genuine native turret/is-lock is active. Both twin
// circles remain literal native projection/kick handles with untouched radii.
export const DUALIES_MERGED_PROTOTYPE_RADIUS='13';
const NATIVE_MERGED_RADIUS=6.2;
function attr(node,name){return node?.getAttribute?.(name)??null;}
function releaseRadius(state){
 if(state.merged&&state.applied){state.merged.setAttribute('r',state.rawRadius);state.applied=false;}
 state.merged=null;state.rawRadius=null;
}
function knownMerged(hud,state){
 const ret=hud.ret,svg=ret?.querySelector?.('.iw-ret__svg');
 const rows=ret?.querySelectorAll?.('.iw-ret__merged');
 if(!rows||rows.length!==1||!svg||svg.parentNode!==ret||ret.children?.[1]!==svg)return null;
 const node=rows[0],left=svg.querySelector('.iw-ret__twin.l'),right=svg.querySelector('.iw-ret__twin.r');
 if(String(node.tagName).toLowerCase()!=='circle'||node.parentNode!==svg||attr(node,'cx')!=='0'||attr(node,'cy')!=='0'||attr(svg,'viewBox')!=='-40 -40 80 80')return null;
 if(!left||!right||left.parentNode!==svg||right.parentNode!==svg||hud._twin?.[0]!==right||hud._twin?.[1]!==left)return null;
 if(attr(left,'cx')!=='-10.5'||attr(right,'cx')!=='10.5'||Number(attr(left,'r'))!==6.2||Number(attr(right,'r'))!==6.2)return null;
 const raw=attr(node,'r');
 if(raw==null||!raw.trim()||(state.merged===node&&state.applied?raw!==DUALIES_MERGED_PROTOTYPE_RADIUS:Number(raw)!==NATIVE_MERGED_RADIUS))return null;
 return node;
}
export function installDualiesDiagonalPrototype(HUD,WEAPONS){
 const p=HUD?.prototype;if(!p||!WEAPONS||Object.hasOwn(p,INSTALLED))return;
 const build=p._buildReticle,update=p._updCrosshair;
 if(typeof build!=='function'||typeof update!=='function')throw TypeError('native HUD methods required');
 const states=new WeakMap();
 function sync(hud,kind){
  let state=states.get(hud);const ret=hud.ret;
  if(!state){state={ret:null,merged:null,rawRadius:null,applied:false};states.set(hud,state);}
  if(state.ret!==ret){releaseRadius(state);if(state.ret?.classList?.contains(MARK))state.ret.classList.remove(MARK);state.ret=ret;}
  const id=hud._L?.weapon;
  const weapon=id==='dualies'&&Object.hasOwn(WEAPONS,id)?WEAPONS[id]:null;
  const active=!!(weapon&&weapon.id==='dualies'&&weapon.kind==='dualies'&&kind==='dualies'&&ret?.classList?.contains('iw-ret--dualies'));
  if(ret?.classList&&ret.classList.contains(MARK)!==active)active?ret.classList.add(MARK):ret.classList.remove(MARK);
  if(!active){releaseRadius(state);return;}
  const merged=knownMerged(hud,state);
  if(!merged){releaseRadius(state);return;}
  if(state.merged!==merged){releaseRadius(state);state.merged=merged;state.rawRadius=attr(merged,'r');}
  const locked=ret.classList.contains('is-lock')&&hud._local?.()?.weaponRunner?.s3Turret===true;
  if(locked&&!state.applied){state.rawRadius=attr(merged,'r');merged.setAttribute('r',DUALIES_MERGED_PROTOTYPE_RADIUS);state.applied=true;}
  else if(!locked&&state.applied){merged.setAttribute('r',state.rawRadius);state.applied=false;}
 }
 Object.defineProperty(p,INSTALLED,{value:true});
 p._buildReticle=function(...args){const result=build.apply(this,args);sync(this,args[0]);return result;};
 p._updCrosshair=function(...args){const result=update.apply(this,args);sync(this,this._L?.kind);return result;};
}
