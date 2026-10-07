import test from 'node:test';import assert from 'node:assert/strict';
import{inspectSplatlingStages,splatlingStageAnimationsSettled}from '../../../scripts/check-inkwave-hud-authority.mjs';
function run(negative=null,inspect=inspectSplatlingStages){
 const saved={probe:globalThis.__splatlingProbe,style:globalThis.getComputedStyle,width:globalThis.innerWidth,height:globalThis.innerHeight};
 const base={display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',stroke:'rgb(255, 255, 255)',strokeWidth:'4.5',strokeOpacity:'1',strokeDashoffset:'0',transform:'none'};
 const node=(tag,parent=null)=>({tagName:tag,parentElement:parent,style:{...base,setProperty(k,v){this[k]=v;}},getAttribute(k){return k==='style'?JSON.stringify(this.style):k==='r'&&this.r?String(this.r.baseVal.value):null;},setAttribute(k,v){if(k==='style')this.style={...JSON.parse(v),setProperty(k,v){this[k]=v;}};if(k==='r')this.r.baseVal.value=Number(v);},removeAttribute(){},getBoundingClientRect(){const size=this.r?this.r.baseVal.value*2:80,left=xh.style.left==='200vw'?2000:600-size/2;return{x:left,y:400-size/2,left,right:left+size,top:400-size/2,bottom:400+size/2,width:size,height:size};}});
 const xh=node('DIV'),ret=node('DIV',xh),svg=node('svg',ret);svg.checkVisibility=()=>svg.style.visibility==='visible'&&Number(getComputedStyle(xh).opacity)>0;ret.querySelector=()=>svg;
 const rings=[21,28].map(r=>{const x=node('circle',svg);Object.assign(x,{r:{baseVal:{value:r}},cx:{baseVal:{value:0}},cy:{baseVal:{value:0}},checkVisibility:()=>false,isPointInStroke(p){let angle=Math.atan2(p.y,p.x);if(angle<0)angle+=Math.PI*2;return this.style.stroke!=='none'&&angle/(Math.PI*2)<1-Number(this.style.strokeDashoffset)/100;}});return x;});
 const runner={},h={xh,ret,_chargeEl:rings[0],_chargeSecond:rings[1],_local:()=>({weaponRunner:runner}),_updCrosshair(){rings[0].style.strokeDashoffset='0';rings[1].style.strokeDashoffset='50';}};
 globalThis.__splatlingProbe={holder:h};globalThis.getComputedStyle=el=>el===xh&&el.style.opacity==='0'&&el.style.transition!=='none'?{...el.style,opacity:'1'}:el.style;globalThis.innerWidth=1280;globalThis.innerHeight=800;
 try{return inspect({charge:5/6,streaming:false,left:0,first:1,second:.5,negative});}finally{globalThis.__splatlingProbe=saved.probe;globalThis.getComputedStyle=saved.style;globalThis.innerWidth=saved.width;globalThis.innerHeight=saved.height;}
}
test('boxless SVG shape may be visible through root, geometry and stroke evidence',()=>{const r=run();assert.deepEqual(r.errors,[]);assert.equal(r.svgVisible,true);assert(r.rings.every(x=>x.rawCircleVisible===false));assert(r.rings.every(x=>x.strokeSamples>0));});
for(const negative of ['hidden','opacity','offscreen','stroke','zero-size','progress'])test('reticle probe rejects '+negative,()=>{const r=run(negative);assert(r.errors.length>0);assert.equal(r.negative,negative);assert.equal(r.negativeApplied,true);});

test('opacity negative disables transition and verifies computed zero, not just inline assignment',()=>{const r=run('opacity');assert.equal(r.negativeState.style.opacity,'0');assert.equal(r.negativeState.style.transition,'none');assert(r.errors.includes('container/ancestor hidden'));});

test('old inline-only opacity mutation reproduces the CI unapplied-negative state',()=>{const old=Function('return ('+inspectSplatlingStages.toString().replace("changed.style.setProperty('transition','none','important');",'')+')')();const r=run('opacity',old);assert.equal(r.negativeState.inlineOpacity,'0');assert.equal(r.negativeState.style.opacity,'1');assert.equal(r.negativeApplied,false);assert.deepEqual(r.errors,[]);});

test('CI late CSS sample is still rejected by the unchanged rendered-progress threshold',()=>{
 const row=run(null,args=>{
  const h=globalThis.__splatlingProbe.holder,css=globalThis.getComputedStyle;
  h._updCrosshair();
  globalThis.getComputedStyle=el=>el===h._chargeEl?{...css(el),strokeDashoffset:'0.116px'}:css(el);
  return inspectSplatlingStages({...args,settled:true});
 });
 assert.equal(row.rings[0].progress,1);
 assert.equal(row.rings[0].computedProgress,.99884);
 assert(row.errors.includes('Splatling rendered ring has not reached expected progress'));
 const endpoint=run(null,args=>{
  globalThis.__splatlingProbe.holder._updCrosshair();
  return inspectSplatlingStages({...args,settled:true});
 });
 assert.deepEqual(endpoint.errors,[]);
 assert.deepEqual(endpoint.rings.map(r=>r.computedProgress),[1,.5]);
});

test('ring settling waits for the rendering timeline even after 100ms of wall time',()=>{
 const prior={probe:globalThis.__splatlingProbe,css:globalThis.getComputedStyle};
 const finite={pending:true,playState:'running',effect:{getTiming:()=>({iterations:1})}};
 const infinite={pending:false,playState:'running',effect:{getTiming:()=>({iterations:Infinity})}};
 const calls=[],rings=[0,1].map(i=>({i,flushed:false,getAnimations(options){calls.push(['animations',i]);assert.deepEqual(options,{subtree:true});assert(this.flushed);return i===0?[finite]:[infinite];}}));
 globalThis.__splatlingProbe={holder:{_chargeEl:rings[0],_chargeSecond:rings[1]},xh:{getAnimations(){throw Error('unrelated mount animation was inspected');}}};
 globalThis.getComputedStyle=ring=>({get strokeDashoffset(){calls.push(['flush',ring.i]);ring.flushed=true;return '0.116px';}});
 try{
  const wallElapsed=100;assert.equal(wallElapsed>=100,true);
  assert.equal(splatlingStageAnimationsSettled(),false,'a pending transition is not a settled ring');
  finite.pending=false;assert.equal(splatlingStageAnimationsSettled(),false,'running render timeline outlives the wall-clock sleep');
  finite.playState='paused';assert.equal(splatlingStageAnimationsSettled(),false);
  finite.playState='finished';finite.pending=true;assert.equal(splatlingStageAnimationsSettled(),false);
  finite.pending=false;assert.equal(splatlingStageAnimationsSettled(),true,'finite endpoint reached; continuous native pulse is irrelevant');
  assert.deepEqual(calls.slice(0,4),[['flush',0],['animations',0],['flush',1],['animations',1]]);
 }finally{globalThis.__splatlingProbe=prior.probe;globalThis.getComputedStyle=prior.css;}
});

test('style flush materializes a not-yet-enumerated transition before deciding that the rings are idle',()=>{
 const prior={probe:globalThis.__splatlingProbe,css:globalThis.getComputedStyle};
 let materialized=false;
 const animation={pending:false,playState:'running',effect:{getTiming:()=>({iterations:1})}};
 const ring={getAnimations:()=>materialized?[animation]:[]};
 globalThis.__splatlingProbe={holder:{_chargeEl:ring,_chargeSecond:ring}};
 globalThis.getComputedStyle=()=>({get strokeDashoffset(){materialized=true;return '100px';}});
 try{
  assert.equal(ring.getAnimations().length,0,'old pre-flush enumeration can appear empty');
  assert.equal(splatlingStageAnimationsSettled(),false);
  animation.playState='finished';assert.equal(splatlingStageAnimationsSettled(),true);
 }finally{globalThis.__splatlingProbe=prior.probe;globalThis.getComputedStyle=prior.css;}
});
