import test from 'node:test';import assert from 'node:assert/strict';
import {inspectAccuracyReticle} from '../../../scripts/check-inkwave-hud-authority.mjs';
function fixture(){
 const style=initial=>Object.assign({setProperty(k,v){this[k]=v;},getPropertyValue(k){return this[k]||'';},removeProperty(k){delete this[k];}},initial);
 const xh={style:style({}),getAttribute(){return null;},removeAttribute(){this.style=style({});},setAttribute(){}};
 const ret={style:style({'--sp':'18.3','--bl':'0'}),parentElement:xh};
 const stroke={style:style({stroke:'rgb(255,255,255)',strokeWidth:'2',strokeOpacity:'1'}),parentElement:ret,getTotalLength:()=>90};
 const svg={style:style({}),parentElement:ret,getBoundingClientRect:()=>({left:100,right:180,top:100,bottom:180,width:80,height:80}),checkVisibility:()=>true,querySelectorAll:()=>[stroke]};
 ret.querySelector=()=>svg;ret.querySelectorAll=()=>[svg];
 globalThis.__splatlingProbe={holder:{xh,ret}};globalThis.innerWidth=1280;globalThis.innerHeight=720;
 globalThis.getComputedStyle=el=>({display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',transform:'none',...el.style,getPropertyValue:k=>el.style.getPropertyValue(k)});
 return {xh,ret,svg,stroke,close(){for(const k of ['__splatlingProbe','innerWidth','innerHeight','getComputedStyle'])delete globalThis[k];}};
}
test('accuracy acceptance rejects hidden or transparent ancestors even with identical computed spread/transform',()=>{
 const f=fixture();try{assert.deepEqual(inspectAccuracyReticle().errors,[]);for(const n of ['hidden','opacity']){const row=inspectAccuracyReticle(n);assert.equal(row.spread,18.3);assert.equal(row.negativeApplied,true);assert(row.errors.includes('visibility'));assert.deepEqual(inspectAccuracyReticle().errors,[]);}}finally{f.close();}
});
test('accuracy acceptance rejects missing strokes, clipped viewport and inflated spread with applied negatives',()=>{
 const f=fixture();try{f.stroke.style.stroke='none';assert(inspectAccuracyReticle().errors.includes('visibility'));f.stroke.style.stroke='white';f.svg.getBoundingClientRect=()=>({left:-1,right:79,top:100,bottom:180,width:80,height:80});assert(inspectAccuracyReticle().errors.includes('viewport'));const bad=inspectAccuracyReticle('spread');assert.equal(bad.negativeApplied,true);assert(bad.errors.includes('spread'));assert.equal(inspectAccuracyReticle().spread,18.3);}finally{f.close();}
});
