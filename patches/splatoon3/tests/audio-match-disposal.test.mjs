import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
async function setup(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`
 export {Match} from './inkwave-public/src/game/match.js';
 export {installWeaponAudioRuntime} from './patches/splatoon3/runtime/audio/runtime.mjs';`});
 const loops=[];f.G.scene=new f.THREE.Scene();
 f.G.audio={ctx:{state:'running'},prepareWeapon(){},play(){},playWeapon(){},duck(){},loop(){return {playing:true,set(){},stop(){this.playing=false;}};},loopWeapon(id,event){const h={id,event,playing:true,stops:0,set(){},stop(){this.playing=false;this.stops++;}};loops.push(h);return h;}};
 f.installWeaponAudioRuntime(f.installedRuntime);
 function match(){const m=new f.Match({duration:180});m.state='playing';return m;}
 function start(m){f.G.match=m;const a=f.make('shooter');m.actors.push(a);a.character.root=new f.THREE.Group();a.character.dispose=()=>{};
  a._resolve=()=>{};a.weapon={...a.weapon,special:'inkVac',specialCost:100};a.special=100;a._startSpecial();a._updateSpecial(1/60);
  const h=loops.findLast(x=>x.id==='special:inkVac');assert(h,'actual special update admits a continuous sound');return {a,h};}
 return {...f,loops,match,start};
}
test('native Match.dispose immediately stops its continuous special audio without a state transition',async()=>{
 const f=await setup(),m=f.match(),{a,h}=f.start(m);let disposed=false;
 a.character.dispose=()=>{assert.equal(h.playing,false,'stop before releasing the character graph');disposed=true;};
 m.dispose();assert.equal(disposed,true);assert.equal(h.playing,false);assert.equal(h.stops,1);m.dispose();assert.equal(h.stops,1);
});
test('disposing an old match releases only its own actor loops and preserves the new match',async()=>{
 const f=await setup(),old=f.match(),a=f.start(old),next=f.match(),b=f.start(next);
 old.dispose();assert.equal(a.h.playing,false);assert.equal(b.h.playing,true);next.dispose();assert.equal(b.h.playing,false);
});
test('actor removal and splat stop an active special once before eventual match disposal',async()=>{
 for(const event of ['actor:removed','splatted']){
  const f=await setup(),m=f.match(),{a,h}=f.start(m);
  f.emit(event,event==='splatted'?{victim:a}:{actor:a});assert.equal(h.playing,false);assert.equal(h.stops,1);
  m.dispose();assert.equal(h.stops,1);
 }
});
