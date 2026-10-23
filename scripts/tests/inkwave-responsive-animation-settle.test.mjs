import test from 'node:test';
import assert from 'node:assert/strict';
import {responsiveAnimationsSettled as settled} from '../lib/inkwave-responsive-animation-settle.mjs';
function run(animations,fn){const old={document:globalThis.document,getComputedStyle:globalThis.getComputedStyle,innerHeight:globalThis.innerHeight,innerWidth:globalThis.innerWidth};Object.assign(globalThis,{document:{getAnimations:()=>animations},getComputedStyle:e=>e.style,innerHeight:800,innerWidth:400});try{fn();}finally{Object.assign(globalThis,old);}}
const animation=(target,playState='running',iterations=1)=>({playState,effect:{target,getTiming:()=>({iterations})}});
test('running or paused visible finite animations remain mandatory',()=>run([animation({checkVisibility:()=>true})],()=>{assert.equal(settled(),false);}));
test('dormant offscreen card can wait until scroll but then must actually settle',()=>{let visible=false;const a=animation({checkVisibility:()=>visible});run([a],()=>{assert.equal(settled(),true);visible=true;assert.equal(settled(),false);a.playState='paused';assert.equal(settled(),false);a.playState='finished';assert.equal(settled(),true);});});
test('fallback excludes only offscreen auto-contained cards, not ordinary entrance transforms',()=>{const target={nodeType:1,style:{contentVisibility:'auto'},getBoundingClientRect:()=>({top:900,bottom:1000,left:0,right:100})};run([animation(target)],()=>{assert.equal(settled(),true);target.style.contentVisibility='visible';assert.equal(settled(),false);});});
test('existing infinite decoration and completed or cancelled animations never block',()=>run([animation({},'running',Infinity),animation({},'finished'),animation({},'idle')],()=>assert.equal(settled(),true)));
