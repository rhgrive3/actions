import test from 'node:test';
import assert from 'node:assert/strict';
import {installKitAudio} from '../runtime/audio/kit-runtime.mjs';
test('stable local special loop skips noop sets while remote movement and ownership transitions stay live',()=>{
  class Actor{_updateSpecial(){} _startSpecial(){}}
  class Projectiles{throwBomb(){} _push(){} _blastBurst(){}}
  const events=new Map(),loops=[];
  const G={audio:{loopWeapon(id,event,options){const h={id,event,options,playing:true,updates:[],stop(){this.playing=false;},set(update){this.updates.push(update);}};loops.push(h);return h;}}};
  const audio=installKitAudio({G,Actor,Projectiles},{listen:(name,fn)=>events.set(name,fn),options:(actor,pos,volume)=>({actor,pos:actor.isLocal?undefined:pos,volume})});
  const a=new Actor();Object.assign(a,{isLocal:true,alive:true,pos:{x:0,y:1,z:2},specialActive:{id:'inkVac'}});
  for(let i=0;i<120;i++)a._updateSpecial(1/60);
  assert.equal(loops.length,1);assert.equal(loops[0].updates.length,0);assert.equal(loops[0].options.volume,.25);
  a.isLocal=false;
  for(let i=0;i<120;i++){a.pos.x=i;a._updateSpecial(1/60);}
  assert.equal(loops[0].updates.length,120);assert.equal(loops[0].updates.at(-1).pos,a.pos);
  a.isLocal=true;a._updateSpecial(1/60);a._updateSpecial(1/60);assert.equal(loops[0].updates.length,121);
  a.specialActive=null;a._updateSpecial(1/60);assert.equal(loops[0].playing,false);
  audio.dispose();
});

test('a live special retains its parked mute owner and releases it once at the special boundary',()=>{
 class Actor{_updateSpecial(){} _startSpecial(){}}class Projectiles{throwBomb(){} _push(){} _blastBurst(){}}
 let made=0,stops=0;const handle={playing:false,_sfxDeferred:true,set(){},stop(){stops++;this._sfxDeferred=false;}};
 const G={audio:{loopWeapon(){made++;return handle;}}},audio=installKitAudio({G,Actor,Projectiles},{listen(){},options:()=>({})});
 const a=new Actor();Object.assign(a,{isLocal:true,alive:true,pos:{x:0,y:1,z:2},specialActive:{id:'inkVac'}});for(let i=0;i<500;i++)a._updateSpecial(1/60);
 assert.equal(made,1);assert.equal(stops,0);handle.playing=true;handle._sfxDeferred=false;a._updateSpecial(1/60);assert.equal(made,1);
 a.specialActive=null;a._updateSpecial(1/60);a._updateSpecial(1/60);assert.equal(stops,1);audio.dispose();
});
