import test from 'node:test';import assert from 'node:assert/strict';
import{inspectSplatlingStages}from '../../../scripts/check-inkwave-hud-authority.mjs';
function run(negative=null){
 const saved={probe:globalThis.__splatlingProbe,style:globalThis.getComputedStyle,width:globalThis.innerWidth,height:globalThis.innerHeight};
 const base={display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',stroke:'rgb(255, 255, 255)',strokeWidth:'4.5',strokeOpacity:'1',strokeDashoffset:'0',transform:'none'};
 const node=(tag,parent=null)=>({tagName:tag,parentElement:parent,style:{...base},getAttribute(k){return k==='style'?JSON.stringify(this.style):k==='r'&&this.r?String(this.r.baseVal.value):null;},setAttribute(k,v){if(k==='style')this.style=JSON.parse(v);if(k==='r')this.r.baseVal.value=Number(v);},removeAttribute(){},getBoundingClientRect(){const size=this.r?this.r.baseVal.value*2:80,left=xh.style.left==='200vw'?2000:600-size/2;return{x:left,y:400-size/2,left,right:left+size,top:400-size/2,bottom:400+size/2,width:size,height:size};}});
 const xh=node('DIV'),ret=node('DIV',xh),svg=node('svg',ret);svg.checkVisibility=()=>svg.style.visibility==='visible'&&Number(xh.style.opacity)>0;ret.querySelector=()=>svg;
 const rings=[21,28].map(r=>{const x=node('circle',svg);Object.assign(x,{r:{baseVal:{value:r}},cx:{baseVal:{value:0}},cy:{baseVal:{value:0}},checkVisibility:()=>false,isPointInStroke(p){let angle=Math.atan2(p.y,p.x);if(angle<0)angle+=Math.PI*2;return this.style.stroke!=='none'&&angle/(Math.PI*2)<1-Number(this.style.strokeDashoffset)/100;}});return x;});
 const runner={},h={xh,ret,_chargeEl:rings[0],_chargeSecond:rings[1],_local:()=>({weaponRunner:runner}),_updCrosshair(){rings[0].style.strokeDashoffset='0';rings[1].style.strokeDashoffset='50';}};
 globalThis.__splatlingProbe={holder:h};globalThis.getComputedStyle=el=>el.style;globalThis.innerWidth=1280;globalThis.innerHeight=800;
 try{return inspectSplatlingStages({charge:5/6,streaming:false,left:0,first:1,second:.5,negative});}finally{globalThis.__splatlingProbe=saved.probe;globalThis.getComputedStyle=saved.style;globalThis.innerWidth=saved.width;globalThis.innerHeight=saved.height;}
}
test('boxless SVG shape may be visible through root, geometry and stroke evidence',()=>{const r=run();assert.deepEqual(r.errors,[]);assert.equal(r.svgVisible,true);assert(r.rings.every(x=>x.rawCircleVisible===false));assert(r.rings.every(x=>x.strokeSamples>0));});
for(const negative of ['hidden','opacity','offscreen','stroke','zero-size','progress'])test('reticle probe rejects '+negative,()=>{const r=run(negative);assert(r.errors.length>0);assert.equal(r.negative,negative);});
