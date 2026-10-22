import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { installInputPlatform } from '../platform-input.mjs';
import { installPlatformGame } from '../platform-game.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/core/input.js', import.meta.url), 'utf8');
const composed = adaptBuildSource('src/core/input.js', raw);
function target() {
  const live = [], added = [], removed = [];
  const capture = o => typeof o === 'boolean' ? o : !!o?.capture;
  return { live, added, removed,
    addEventListener(type, callback, options) {
      added.push({type, callback, options});
      if (!live.some(x => x.type === type && x.callback === callback && x.capture === capture(options)))
        live.push({type, callback, capture:capture(options)});
    },
    removeEventListener(type, callback, options) {
      removed.push({type,callback,capture:capture(options)});
      const i=live.findIndex(x=>x.type===type&&x.callback===callback&&x.capture===capture(options));
      if(i>=0)live.splice(i,1);
    },
    fire(type, event={}) { for(const x of [...live]) if(x.type===type && live.includes(x)) x.callback(event); }
  };
}
function fixture(source=composed) {
  const window=target(), document=Object.assign(target(),{hidden:false,hasFocus:()=>true,pointerLockElement:null});
  const env=Object.assign(window,{document,screen:{orientation:target()},console});
  class MobileInput { constructor(){this.destroyCalls=0;} destroy(){this.destroyCalls++;this._destroyed=true;} onDeviceChange(){} endFrame(){} }
  const G={mode:'menu',settings:{}};
  const context=vm.createContext({window,document,G,MobileInput,touchPrimary:false,isMobilePointer:e=>e.pointerType==='touch',
    console,performance,navigator:{getGamepads:()=>[]},installInputPlatform:C=>installInputPlatform(C,env)});
  // Evaluate the complete production-composed Input body; only imported browser/device surroundings are fixtures.
  vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export class Input','class Input')+'\nglobalThis.Input=Input;',context);
  const shared=window.live.length+document.live.length;
  return {window,document,env,G,Input:context.Input,shared,count:()=>window.live.length+document.live.length};
}
function dispose(input) { if(input.disposePlatform)input.disposePlatform();else input.mobile.destroy(); }

test('complete production-composed Input retires every owned listener across repeated replacement',()=>{
  const f=fixture();
  for(let i=0;i<20;i++){
    const input=new f.Input({});assert.equal(f.count()-f.shared,10);
    let calls=0;input.onKey=()=>{calls++;return true;};
    f.window.fire('keydown',{code:'KeyA',repeat:false});assert.equal(calls,1);
    dispose(input);dispose(input);
    assert.equal(f.count(),f.shared,'disposed Input must not remain rooted by window/document');
    assert.equal(input.mobile.destroyCalls,1);
    f.window.fire('keydown',{code:'KeyA',repeat:false});assert.equal(calls,1,'retired menu callback must not fire');
  }
});
test('capture/passive options and unrelated or newer instance listeners keep their ownership',()=>{
  const f=fixture(),a=new f.Input({}),b=new f.Input({});
  let foreign=0;const callback=()=>foreign++;f.window.addEventListener('keydown',callback,true);
  const pointer=f.window.added.filter(x=>x.type==='pointerdown');assert.equal(pointer.length,2);
  for(const p of pointer){assert.equal(p.options.capture,true);assert.equal(p.options.passive,true);}
  dispose(a);assert.equal(f.count(),f.shared+11);
  f.window.fire('keydown',{code:'KeyZ',repeat:false});assert.equal(b.down('KeyZ'),true);assert.equal(foreign,1);
  dispose(b);assert.equal(f.count(),f.shared+1);
  for(const p of pointer)assert.ok(f.window.removed.some(r=>r.callback===p.callback&&r.capture===true));
});
test('active keyboard and mouse event behavior remains unchanged',()=>{
  const f=fixture(),input=new f.Input({});input.locked=true;
  let prevented=0;const e={code:'Tab',repeat:false,preventDefault(){prevented++;}};
  f.window.fire('keydown',e);assert.equal(input.down('Tab'),true);assert.equal(input.wasPressed('Tab'),true);assert.equal(prevented,2);
  f.window.fire('keyup',{code:'Tab'});assert.equal(input.down('Tab'),false);
  f.window.fire('mousemove',{movementX:3,movementY:-2});assert.equal(input.mouse.dx,3);assert.equal(input.mouse.dy,-2);
  f.window.fire('mousedown',{button:0});assert.equal(input.mouse.left,true);assert.equal(input.mouse.leftPressed,true);
  f.window.fire('mouseup',{button:0});assert.equal(input.mouse.left,false);
  input.endFrame();assert.equal(input.mouse.dx,0);assert.equal(input.wasPressed('Tab'),false);
  dispose(input);
});
test('game platform disposal delegates to Input without touching shared owner or upstream source',()=>{
  const game=fs.readFileSync(new URL('../platform-game.mjs',import.meta.url),'utf8');
  assert.match(game,/this\.input\?\.disposePlatform\?\.\(\)/);
  assert.doesNotMatch(raw,/disposePlatform|_listenPlatform/);
});

test('real Game disposal calls Input retirement exactly once and retains unrelated lifecycle listeners',()=>{
  const f=fixture(),input=new f.Input({});
  class Game {}
  installPlatformGame(Game,f.G,f.env);
  const calls={driver:0,off:0,other:0,menus:[]};
  const game=new Game();Object.assign(game,{input,menus:{setPlatformDriven:v=>calls.menus.push(v)},platform:{
    disposed:false,driver:{dispose:()=>calls.driver++},off:()=>calls.off++,disposers:[()=>calls.other++]
  }});
  game.disposePlatform();game.disposePlatform();
  assert.equal(f.count(),f.shared);assert.equal(input.mobile.destroyCalls,1);
  assert.deepEqual(calls,{driver:1,off:1,other:1,menus:[false]});assert.equal(game.platform,null);
});
test('retired Input cannot issue a fallback from its already pending pointer-lock rejection',async()=>{
  const f=fixture();f.G.mode='match';f.G.match={state:'playing',attract:false,paused:false};
  let reject,calls=0;const pending=new Promise((_,no)=>{reject=no;});
  const input=new f.Input({requestPointerLock(){calls++;return pending;}});
  input.requestLock();assert.equal(calls,1);const ticket=input._pointerLockPending;assert.ok(ticket);
  dispose(input);reject(new Error('unadjusted movement unsupported'));await Promise.resolve();await Promise.resolve();
  assert.equal(calls,1);assert.equal(ticket.cancelled,true);assert.equal(input._pointerLockPending,null);
});
