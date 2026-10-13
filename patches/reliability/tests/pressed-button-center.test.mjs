import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const upstream=process.env.INKWAVE_UPSTREAM_SOURCE||path.join(root,'inkwave-public');
const raw=fs.readFileSync(path.join(upstream,'src/core/mobile.js'),'utf8');
// Source ownership contract; the dedicated browser gate executes minified production bytes.
const code=adaptTouchLayout('src/core/mobile.js',raw);
const layout=code.match(/  _layoutAll\(\) \{[\s\S]*?\n  \}/)?.[0];
assert(layout,'actual native layout method retained');
const ids=['fire','jump','sub','squid','special','map','pause','gyro','stick'];
const run=new Function('ORDER','layoutUnit','return ({'+layout+'})._layoutAll;')(ids,()=>1);
for(const viewport of [[1024,768],[844,390],[568,320],[320,568]])test('button visual center and stick ownership survive layout '+viewport.join('x'),()=>{
 const els=Object.fromEntries(ids.map(id=>[id,{style:{transform:'old-translation'}}]));let draw=0;
 const boxes=Object.fromEntries(ids.map((id,i)=>[id,{x:viewport[0]*(.4+i*.04),y:viewport[1]*.7,d:46+i*3}]));
 const owner={root:{},els,_stick:{active:false},_safe:()=>({l:0,r:0,t:0,b:0}),_box:id=>boxes[id],_drawStick:()=>draw++};run.call(owner);
 for(const id of ids){const s=els[id].style,b=boxes[id];assert.equal(s.width,s.height);
  if(id==='stick'){assert.equal(s.left,undefined);assert.match(s.transform,/^translate3d\(/);assert.equal(owner._stickHome,b);continue;}
  assert.equal(s.transform,'none');assert(Math.abs(parseFloat(s.left)+parseFloat(s.width)/2-b.x)<=.1);assert(Math.abs(parseFloat(s.top)+parseFloat(s.height)/2-b.y)<=.1);
  // Actual animated CSS and transform origin are checked by the browser gate.
 }
 assert.equal(draw,1);
});
test('input hit routing and pressed animation are not changed to hide the mismatch',()=>{
 const extract=s=>s.match(/  _hitButton\(x, y\) \{[\s\S]*?\n  \}/)[0];assert.equal(extract(code),extract(raw));
 const css=fs.readFileSync(path.join(upstream,'styles/mobile.css'),'utf8');assert.match(css,/\.iwm-b\.is-down[^}]*scale: \.92; transition: scale 40ms/s);
});
test('upstream position drift fails the build anchor instead of silently restoring translated scaling',()=>{
 assert.throws(()=>adaptTouchLayout('src/core/mobile.js',raw.replace('el.style.transform = `translate3d(${(b.x - b.d / 2)', 'el.style.transform = `translate3d(${(b.x - b.d * .5)')),/pressed button center/);
});
