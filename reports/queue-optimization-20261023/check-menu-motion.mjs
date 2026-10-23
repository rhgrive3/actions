import fs from 'node:fs';
import {chromium} from 'playwright';
import {adaptBuildSource} from '../../scripts/inkwave-source-composition.mjs';
const rel='src/ui/menus.js',code=adaptBuildSource(rel,fs.readFileSync(new URL('../../inkwave-public/'+rel,import.meta.url),'utf8'));
const a=code.indexOf('  _fx(el, {'),b=code.indexOf('\n  }\n',a),body=code.slice(a,b+5);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();const result=await page.evaluate(async body=>{
  const root=document.createElement('main'),parent=document.createElement('div'),card=document.createElement('button');document.body.append(root);root.append(parent);parent.append(card);
  const owner={el:root},fn=new Function('clamp',`return ({${body}})._fx;`)(x=>Math.max(0,Math.min(1,x)));
  fn.call(owner,card);let measures=0;card.getBoundingClientRect=()=>{measures++;return {left:0,top:0,width:100,height:100};};
  const move=()=>card.dispatchEvent(new PointerEvent('pointermove',{clientX:20,clientY:30}));
  parent.dispatchEvent(new TransitionEvent('transitionrun',{bubbles:true,propertyName:'width'}));
  parent.dispatchEvent(new TransitionEvent('transitionrun',{bubbles:true,propertyName:'height'}));
  move();move();const duringTwo=measures;
  parent.dispatchEvent(new TransitionEvent('transitionend',{bubbles:true,propertyName:'width'}));move();move();
  if(measures!==duringTwo+2||!owner._fxLayout.motion.has(parent))throw Error('second property lost');
  parent.dispatchEvent(new TransitionEvent('transitionend',{bubbles:true,propertyName:'height'}));move();const settled=measures;move();if(measures!==settled||owner._fxLayout.motion.size)throw Error('motion did not settle');
  parent.dispatchEvent(new AnimationEvent('animationstart',{bubbles:true,animationName:'float'}));
  parent.dispatchEvent(new AnimationEvent('animationstart',{bubbles:true,animationName:'float'}));
  parent.dispatchEvent(new AnimationEvent('animationend',{bubbles:true,animationName:'float'}));if(!owner._fxLayout.motion.has(parent))throw Error('duplicate animation lost');
  parent.remove();await Promise.resolve();await Promise.resolve();
  if(owner._fxLayout.motion.size)throw Error('detached node retained');
  for(const off of owner._fxLayout.listeners)off();owner._fxLayout.motion.clear();root.remove();
  return {browser:navigator.userAgent,actualComposedMethod:true,concurrentPropertiesPreserved:true,duplicateAnimationsPreserved:true,settledRectReadsSkipped:true,detachedMotionTargets:0,disposed:true};
 },body);fs.writeFileSync(new URL('./menu-motion-chromium.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
