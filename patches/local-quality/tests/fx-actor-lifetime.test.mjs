import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../reliability/tests/controls-fixture.mjs';
async function setup() {
 const f=await fixture({match:true,fxHooks:true});
 f.G.fx={};f.G.scene={remove(){}};f.G.camera=null;
 const hooks=f.initFxHooks(f.G);
 function match(n=8) {const m=new f.Match({});m.actors=Array.from({length:n},()=>f.make('roller'));m.unsubs=[];f.G.actors=m.actors;return m;}
 function remember(a){hooks._state(a);hooks._flick(a);assert(hooks.st.has(a));assert(hooks.flickT.has(a));}
 return {...f,hooks,match,remember};
}
test('25 native 4v4 disposals release actor and Roller caches even with effects disabled',async()=>{
 const f=await setup();
 const projectileMaps=[f.hooks.bombs,f.hooks.clouds,f.hooks.heads];
 projectileMaps.forEach(m=>m.set('projectile-sentinel',{}));
 for(let cycle=0;cycle<25;cycle++) {const m=f.match();m.actors.forEach(f.remember);f.hooks.enabled=false;f.G.fx=null;m.dispose();for(const a of m.actors){assert.equal(f.hooks.st.has(a),false);assert.equal(f.hooks.flickT.has(a),false);}f.hooks.enabled=true;f.G.fx={};}
 assert.deepEqual([f.hooks.bombs,f.hooks.clouds,f.hooks.heads],projectileMaps);
 projectileMaps.forEach(m=>assert(m.has('projectile-sentinel')));
});
test('native actor removal deletes only departed actor; late old Match disposal preserves newer cache',async()=>{
 const f=await setup(),old=f.match(2);old.actors.forEach(f.remember);const departed=old.actors[0],teammate=old.actors[1];
 old.removeActor(departed);assert.equal(f.hooks.st.has(departed),false);assert.equal(f.hooks.flickT.has(departed),false);assert(f.hooks.st.has(teammate));
 const next=f.match(2);next.actors.forEach(f.remember);const state=f.hooks.st.get(next.actors[0]);old.dispose();assert.equal(f.hooks.st.has(teammate),false);assert.equal(f.hooks.st.get(next.actors[0]),state);
 f.G.actors=next.actors;f.emit('actor:enemyInk',{actor:next.actors[0],on:true});assert.equal(state.onEnemy,true);f.emit('respawn',{actor:next.actors[0]});assert.equal(f.hooks.st.get(next.actors[0]),state);assert.equal(state.init,true);assert.equal(f.hooks.stats().respawn,1);next.dispose();
});
test('FxHooks alone cannot retain Actor after missing lifecycle or a late event', {skip:!global.gc}, async()=>{
 const f=await setup();
 const reference=(()=>{const a=f.make('roller');f.remember(a);f.emit('actor:removed',{actor:a});f.emit('actor:enemyInk',{actor:a,on:true});assert(f.hooks.st.has(a),'late native event can recreate a weak entry');f.hooks._flick(a);return new WeakRef(a);})();
 f.G.actors=[];f.G.local=null;f.G.match=null;
 let collected=false;
 for(let n=0;n<30;n++){await new Promise(r=>setImmediate(r));global.gc();await new Promise(r=>setImmediate(r));if(!reference.deref()){collected=true;break;}}
 assert.equal(collected,true,'Actor must be collectable while boot-long FxHooks remains alive');
 assert(f.hooks);
});
test('native frame polling fills and updates the weak cache, then removal remains effective',async()=>{
 const f=await setup(),m=f.match();
 f.hooks.update(1/60);
 for(const a of m.actors){assert(f.hooks.st.has(a));assert.equal(f.hooks.st.get(a).init,true);}
 const a=m.actors[0],state=f.hooks.st.get(a);a.alive=false;f.hooks.update(1/60);assert.equal(state.alive,false);a.alive=true;f.hooks.update(1/60);assert.equal(state.alive,true);assert.equal(f.hooks.st.get(a),state);
 m.dispose();f.hooks.update(1/60);assert.equal(f.hooks.st.has(a),false);
});
