import test from 'node:test';
import assert from 'node:assert/strict';
import {LayoutSample,menuLayoutSample} from '../layout-sample.mjs';
function fixture(){
 const listeners=new Map(),observers=[];let reads=0,styles=0,animations=[];
 const env={innerWidth:800,innerHeight:600,devicePixelRatio:2,addEventListener(n,fn){listeners.set(n,fn);},removeEventListener(n,fn){if(listeners.get(n)===fn)listeners.delete(n);},getComputedStyle(){styles++;return {opacity:'1'};},
 MutationObserver:class{constructor(cb){this.cb=cb;this.records=[];observers.push(this);}observe(){}takeRecords(){return this.records.splice(0);}disconnect(){this.dead=true;}},
 ResizeObserver:class{constructor(cb){this.cb=cb;}observe(){}disconnect(){this.dead=true;}}};
 const ignored={contains:n=>n?.ignored},root={getAnimations:()=>animations},target={getBoundingClientRect(){reads++;return {left:reads,width:10};}};
 return {env,root,target,ignored,listeners,observers,get reads(){return reads;},get styles(){return styles;},set animations(a){animations=a;}};
}
test('stationary observed layout samples once; same-task mutations, scroll, DPR and pending animation invalidate',()=>{
 const f=fixture(),c=new LayoutSample(f.root,f.ignored,f.env);
 const sample=()=>{c.begin();return [c.rect(f.target),c.opacity(f.target)];};
 sample();sample();assert.equal(f.reads,1);assert.equal(f.styles,1);
 f.observers[0].records.push({target:{ignored:true}});sample();assert.equal(f.reads,1);
 f.observers[0].records.push({target:f.root});sample();assert.equal(f.reads,2);
 f.listeners.get('scroll')();sample();assert.equal(f.reads,3);
 f.env.devicePixelRatio=3;sample();assert.equal(f.reads,4);
 f.animations=[{playState:'running',effect:{target:f.root}}];sample();sample();assert.equal(f.reads,6);
 f.animations=[{pending:true,effect:{target:f.root}}];sample();assert.equal(f.reads,7);
 f.animations=[];sample();sample();assert.equal(f.reads,7);
 c.dispose();assert.equal(f.listeners.size,0);assert.equal(c.rows.size,0);assert.equal(f.observers[0].dead,true);
});
test('unknown observer or animation support retains live rectangle reads',()=>{
 const f=fixture();delete f.env.ResizeObserver;const c=new LayoutSample(f.root,null,f.env);
 c.begin();c.rect(f.target);c.begin();c.rect(f.target);assert.equal(f.reads,2);c.dispose();
});
test('menu target/screen changes dispose previous ownership before creating a new cache',()=>{
 const f=fixture(),m={el:f.root,cursorEl:f.ignored,_scr:{el:f.root}};
 const first=menuLayoutSample(m,f.target,f.env);first.rect(f.target);
 assert.equal(menuLayoutSample(m,f.target,f.env),first);
 const next=menuLayoutSample(m,{},f.env);assert.notEqual(next,first);assert.equal(first.root,null);
 next.dispose();
});
test('canvas client size caches exact untransformed integers and ignores only its own bitmap mutations',async()=>{
 const {canvasCssSize,ignoreClientSizeMutation}=await import('../layout-sample.mjs'),f=fixture();let widths=0,heights=0;
 const canvas={parentElement:f.root,get clientWidth(){widths++;return 18;},get clientHeight(){heights++;return 74;}},owner={};
 const one=canvasCssSize(owner,canvas,f.env);canvasCssSize(owner,canvas,f.env);assert.equal(widths,1);assert.equal(heights,1);assert.equal(one.width,18);assert.equal(one.height,74);
 f.observers[0].records.push({type:'attributes',target:canvas,attributeName:'width'});canvasCssSize(owner,canvas,f.env);assert.equal(widths,1);
 f.observers[0].records.push({type:'attributes',target:canvas,attributeName:'class'});canvasCssSize(owner,canvas,f.env);assert.equal(widths,2);
 const ancestor={contains:e=>e===canvas,getAttribute:()=> 'width:18px;transform:translateY(2px)'};
 assert.equal(ignoreClientSizeMutation({type:'attributes',target:ancestor,attributeName:'style',oldValue:'width:18px;transform:translateY(1px)'},canvas),true);
 assert.equal(ignoreClientSizeMutation({type:'attributes',target:ancestor,attributeName:'style',oldValue:'width:30px;transform:translateY(1px)'},canvas),false);
 owner._queueCanvasLayout.dispose();
});
test('production touch safe-area probe stays cached across control edits and refreshes on root/viewport changes',async()=>{
 const fs=await import('node:fs'),vm=await import('node:vm'),{adaptBuildSource}=await import('../../../scripts/inkwave-source-composition.mjs');
 const text=adaptBuildSource('src/core/mobile.js',fs.readFileSync(new URL('../../../inkwave-public/src/core/mobile.js',import.meta.url),'utf8')),a=text.indexOf('  _safe() {'),b=text.indexOf('\n  setColor(',a),f=fixture();
 f.root.contains=node=>node?.control===true;
 class ProbeSample extends LayoutSample{constructor(root,ignored){super(root,ignored,f.env);}}
 const safe=vm.runInNewContext('({'+text.slice(a,b)+'})',{LayoutSample:ProbeSample,innerWidth:800,innerHeight:600})._safe;
 const mobile={root:f.root,_probe:f.target};
 for(let i=0;i<360;i++)safe.call(mobile);assert.equal(f.reads,1);
 f.observers[0].records.push({target:{control:true},type:'attributes',attributeName:'style'});safe.call(mobile);assert.equal(f.reads,1);
 f.observers[0].records.push({target:f.root,type:'attributes',attributeName:'class'});safe.call(mobile);assert.equal(f.reads,2);
 f.listeners.get('orientationchange')();safe.call(mobile);assert.equal(f.reads,3);
 mobile._queueSafeLayout.dispose();assert.equal(f.listeners.size,0);
 assert.ok(text.includes('this._queueSafeLayout?.dispose(); this._queueSafeLayout = null;'),'composed Mobile.destroy releases observations');
});
