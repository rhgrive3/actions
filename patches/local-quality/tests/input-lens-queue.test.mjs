import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const before = JSON.parse(fs.readFileSync(new URL('./fixtures/input-lens-queue-before.json', import.meta.url)));
const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const menu = adaptBuildSource('src/ui/menus.js', read('src/ui/menus.js'));
const method = (code, start, end) => code.slice(code.indexOf(start), code.indexOf(end, code.indexOf(start)));
const header = [...menu.matchAll(/const MENU_(?:MODIFIERS|BY_CODE|BY_KEY) = (?:\[[\s\S]*?\]|\{[\s\S]*?\});/g)].map(x=>x[0]).join('\n');
const currentKey = method(menu, '  handleKey(e) {', '  _modalBlocksKeys()');

test('actual menu key handler retains event consumption, repeat, modal and navigation order', () => {
  const values = [undefined, null, 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter', 'Space', 'Escape', 'Backspace', 'Tab', 'KeyQ', 'KeyE', 'KeyR', 'PageUp', 'PageDown', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'OS', 'constructor', '__proto__', 'toString', '?'];
  const run = (body, e, state) => {
    const trace = [], active = state.typing ? { tagName: 'INPUT', dataset: {orig:'old'}, value:'new', blur(){trace.push('blur');} } : null;
    const context = vm.createContext({ document: {activeElement:active} });
    const fn = vm.runInContext((body === currentKey ? header : '') + `({${body}}).handleKey`, context);
    const owner = { current: state.current, el:{contains:()=>true}, _modalBlocksKeys:()=>state.modal,
      _scr:{onKey(){trace.push('onKey');return state.consume;}, onHold(){trace.push('hold');}},
      setInputMode(x){trace.push(['mode',x]);}, _nav(x){trace.push(['nav',typeof x==='function'?'function:'+x.name:x&&typeof x==='object'?JSON.stringify(x):x]);return true;}, _titleGo(){trace.push('title');} };
    const result = fn.call(owner, {...e, preventDefault(){trace.push('prevent');}});
    return {result,trace,value:active?.value,cancel:active?.dataset.cancel};
  };
  for (const current of ['main','title','loading',null]) for (const typing of [false,true])
    for (const shiftKey of [false,true]) for (const repeat of [false,true]) for (const code of values) {
      const e={code,key:code,shiftKey,repeat}, state={current,typing,modal:code==='KeyQ',consume:code==='KeyE'};
      assert.deepEqual(run(currentKey,e,state),run(before.handleKey,e,state));
    }
});

function sliderFixture() {
  const nodes=[], resized=new Set();
  function h(tag, attrs={}) {
    const listeners=new Map(), classes=new Set();
    const node={tag,attrs,style:{setProperty(){}},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
      addEventListener(t,f){if(!listeners.has(t))listeners.set(t,new Set());listeners.get(t).add(f);},
      removeEventListener(t,f){listeners.get(t)?.delete(f);},
      dispatch(t,e={}){for(const f of [...(listeners.get(t)||[])])f({...e,preventDefault(){},stopPropagation(){}});},
      setPointerCapture(){},releasePointerCapture(){}, getBoundingClientRect(){return {left:0,width:100};},
      count:t=>listeners.get(t)?.size||0};nodes.push(node);return node;
  }
  const window={addEventListener:(t,f)=>resized.add(f),removeEventListener:(t,f)=>resized.delete(f)};
  const context=vm.createContext({h,window,DEFAULT_SETTINGS:{},clamp:(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),prefersReducedMotion:()=>true,restartAnim(){},performance:{now:()=>1000}});
  const fn=vm.runInContext(`({${method(menu,'  _slider(row, value) {','  _toggle(row, value) {')}})._slider`,context);
  const values=[],owner={_setSetting:(k,v)=>values.push(v),_sfx(){}};
  const slider=fn.call(owner,{key:'x',min:0,max:100,step:1,fmt:String},0);
  return {track:nodes.find(x=>x.attrs.class==='iw-slider__track iw-noclick'),slider,values,resized};
}
test('existing production slider already keeps one pointer owner through unrelated up/cancel and capture loss', () => {
  const f=sliderFixture(),t=f.track;
  t.dispatch('pointerdown',{pointerId:1,clientX:20,button:0});
  t.dispatch('pointerdown',{pointerId:2,clientX:80,button:0});
  assert.equal(t.count('pointermove'),1);assert.equal(f.resized.size,1);
  t.dispatch('pointerup',{pointerId:2});t.dispatch('pointercancel',{pointerId:2});
  t.dispatch('pointermove',{pointerId:2,clientX:90});
  t.dispatch('pointermove',{pointerId:1,clientX:60});
  assert.deepEqual(f.values,[20,60]);
  t.dispatch('lostpointercapture',{pointerId:1});
  for(const type of ['pointermove','pointerup','pointercancel','lostpointercapture'])assert.equal(t.count(type),0);
  assert.equal(f.resized.size,0);
  t.dispatch('pointerdown',{pointerId:2,clientX:10,button:2});assert.equal(t.count('pointermove'),0);
  t.dispatch('pointerdown',{pointerId:3,clientX:20,button:0});t.dispatch('pointercancel',{pointerId:3});
  assert.equal(t.count('pointermove'),0);f.slider.adjust(1);assert.equal(f.values.at(-1),21);
});

test('lens scalar coordinates preserve all particle arguments, mutation and random order', () => {
  const code=adaptBuildSource('src/fx/screenfx.js',read('src/fx/screenfx.js'));
  const after=method(code,'  splat(ch, cx, cy, size, aspect,','  // small single droplet');
  const run=(body,seed,opts)=>{
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
    const math=Object.create(Math);math.random=random;
    const context=vm.createContext({Math:math,TAU:Math.PI*2,rnd:(a,b)=>a+(b-a)*random()});
    const fn=vm.runInContext(`({${body}}).splat`,context);
    const records=[],owner={add(...args){const p={};records.push({args,p});return p;},dirty:false};
    fn.call(owner,1,opts.cx,opts.cy,opts.size,opts.aspect,opts);
    return {records:JSON.parse(JSON.stringify(records)),seed,dirty:owner.dirty};
  };
  for(let i=0;i<1200;i++){
    const opts={arms:i%10,sats:i%11,life:.1+i/100,cx:(i%13)/13,cy:(i%7)/7,size:(i%5)/20,aspect:[.75,1,16/9,21/9][i%4]};
    assert.deepEqual(run(after,i+1,opts),run(before.splat,i+1,opts));
  }
});

test('menu hover writes only changed values and measures geometry again after layout invalidation', () => {
  const values=new Map(),events=new Map(),globalEvents=new Map();let writes=0,reads=0;
  let rect={left:100,top:0,width:200,height:100};
  const style={getPropertyValue:k=>values.get(k)||'',setProperty(k,v){values.set(k,v);writes++;}};
  const element={style,classList:{add(){},remove(){}},getBoundingClientRect(){reads++;return rect;},addEventListener:(t,f)=>events.set(t,f)};
  const root={addEventListener(){},removeEventListener(){}};
  const window={addEventListener:(t,f)=>globalEvents.set(t,f),removeEventListener(){}};
  const fn=vm.runInNewContext(`({${method(menu,'  _fx(el,','  /** Ink splash')}})._fx`,{window,document:{fonts:null},clamp:(x,a=0,b=1)=>Math.max(a,Math.min(b,x))});
  const owner={el:root};fn.call(owner,element,{tilt:12});
  events.get('pointerenter')({clientX:225,clientY:50});assert.equal(reads,1);assert.equal(values.get('--mx'),'62.5%');
  const first=writes;
  for(let i=0;i<120;i++)events.get('pointermove')({clientX:225,clientY:50});
  assert.equal(writes,first);assert.equal(reads,1);
  rect={...rect,left:200};globalEvents.get('resize')();events.get('pointermove')({clientX:225,clientY:50});
  assert.equal(reads,2);assert.equal(values.get('--mx'),'12.5%');
  style.setProperty('--mx','external');events.get('pointermove')({clientX:225,clientY:50});assert.equal(values.get('--mx'),'12.5%');
  events.get('pointerleave')();assert.equal(values.get('--rx'),'0deg');
  events.get('pointerenter')({clientX:225,clientY:25});assert.equal(values.get('--rx'),'3.00deg');
});
