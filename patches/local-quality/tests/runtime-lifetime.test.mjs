import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptQualitySource} from '../adapter.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
function fixture(patched){
 const source=patched?adaptQualitySource('src/ui/menus.js',raw):raw,observers=new Set(),listeners=new Set(),frames=new Set(),ready=[];let id=0,destroyed=0;
 const setup=source.slice(source.indexOf('    this._fitQ = 0;'),source.indexOf('\n    this._lastT =',source.indexOf('    this._fitQ = 0;')));
 const dispose=source.slice(source.indexOf('  dispose() {'),source.indexOf('\n  //',source.indexOf('  dispose() {')));
 class RO{observe(){observers.add(this);}disconnect(){observers.delete(this);}}
 const context={ResizeObserver:RO,window:{addEventListener:(n,f)=>listeners.add(f),removeEventListener:(n,f)=>listeners.delete(f)},document:{fonts:{ready:{then:f=>ready.push(f)},addEventListener:(n,f)=>listeners.add(f),removeEventListener:(n,f)=>listeners.delete(f)}},requestAnimationFrame:()=>{const n=++id;frames.add(n);return n;},cancelAnimationFrame:n=>frames.delete(n),safeCall:f=>f()};
 const Menus=vm.runInNewContext('class Menus{constructor(){this.el={remove(){}};this._cur={};this.wipe={cancel(){}};'+setup+'}\n'+dispose+'};Menus',context);
 return {Menus,observers,listeners,frames,ready,screen:()=>({destroy(){destroyed++;}}),destroyed:()=>destroyed};
}
test('negative control: native disposed menu retains font listener and resize observer',()=>{
 const f=fixture(false);for(let i=0;i<20;i++)new f.Menus().dispose();assert.equal(f.listeners.size,20);assert.equal(f.observers.size,20);
});
test('disposed menus release font/resize ownership, pending fit and screen effects; late font readiness cannot revive work',()=>{
 const f=fixture(true);for(let i=0;i<20;i++){const m=new f.Menus();m._scr=f.screen();m._refit();m.dispose();}
 assert.equal(f.listeners.size,0);assert.equal(f.observers.size,0);assert.equal(f.frames.size,0);assert.equal(f.destroyed(),20);
 f.ready.forEach(f=>f());assert.equal(f.frames.size,0);
});
