import test from 'node:test';
import assert from 'node:assert/strict';
import { installMenuQuality } from '../menu.mjs';

function fixture() {
  let ms=500,seq=0;
  const tasks=new Map(),calls=[];
  const env={
    performance:{now:()=>ms}, document:{hidden:false},
    setTimeout:(fn,delay)=>{const id=++seq;tasks.set(id,{fn,at:ms+delay});return id;},
    clearTimeout:(id)=>tasks.delete(id),
    requestAnimationFrame:()=>0,cancelAnimationFrame(){},
  };
  class Menus {
    constructor(){this.current='title';this._scr={name:'title',el:{classList:{add(){}}}};this._swapToken=1;this._shownAt=0;this._leavingTitle=false;this.el={};this._raf=0;}
    _titleGo(){throw new Error('unowned native timer executed');}
    _sfx(name){calls.push(name);}
    show(next){this.current=next;this._swapToken++;this._scr={name:next,el:{classList:{add(){}},style:{}}};calls.push('show:'+next);}
    dispose(){calls.push('dispose');}
  }
  installMenuQuality(Menus,env);
  const m=new Menus();
  const advance=(dt)=>{
    ms+=dt;
    for(const [id,task] of [...tasks])if(task.at<=ms){tasks.delete(id);task.fn();}
  };
  return {m,advance,calls,tasks,env};
}
test('#950 title confirmation transitions once after its original 200ms',()=>{
 const f=fixture();f.m._titleGo();f.m._titleGo();assert.equal(f.tasks.size,1);
 f.advance(199);assert.equal(f.m.current,'title');
 f.advance(1);assert.equal(f.m.current,'main');
 assert.equal(f.calls.filter(s=>s==='show:main').length,1);
});
test('#950 subsequent navigation and re-entered title cannot be stolen by the previous timer',()=>{
 const f=fixture();f.m._titleGo();f.m.show('settings');
 f.advance(200);assert.equal(f.m.current,'settings');
 f.m.show('title');f.m._shownAt=0;f.m._titleGo();
 f.m.show('main');f.m.show('title');f.advance(200);
 assert.equal(f.m.current,'title');
});
test('#950 dispose clears pending title timeout and prevents screen resurrection',()=>{
 const f=fixture();f.m._titleGo();f.m.dispose();
 assert.equal(f.tasks.size,0);f.advance(200);
 assert.equal(f.m.current,'title');f.m.show('main');
 assert.equal(f.m.current,'title');
 assert.deepEqual(f.calls.filter(s=>s==='show:main'),[]);
});
