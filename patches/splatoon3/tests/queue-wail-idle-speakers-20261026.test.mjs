import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {buildSubModel,isSharedGeometry} from '../runtime/sub-models.mjs';
import '../runtime/special-models.mjs';

const source=fs.readFileSync(new URL('../runtime/special-presentation.mjs',import.meta.url),'utf8');
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-wail-idle-speakers-before-1878.json',import.meta.url),'utf8'));
function declaration(text,name){
  const node=parse(text,{ecmaVersion:'latest',sourceType:'module'}).body.map(n=>n.declaration||n).find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
  assert.ok(node,name);return text.slice(node.start,node.end);
}
function world(old){
  let install=old?frozen.install:declaration(source,'installSpecialModels');
  // Expose only the private admission index in this extracted-function harness;
  // every producer, consumer, reset, Three model and disposal path is real code.
  if(!old){assert.equal(install.split('const speakerCandidates = new Set();').length,2);install=install.replace('const speakerCandidates = new Set();','const speakerCandidates = api.testCandidates = new Set();');}
  const apply=new Function('buildSubModel','isSharedGeometry','INSTALL','OBJECTS','ROUNDS','SPECIAL_PROJECTILE_MODELS',declaration(source,'disposeModel')+';'+install+';return installSpecialModels;')(buildSubModel,isSharedGeometry,Symbol(),Symbol(),Symbol(),{});
  class Projectiles{constructor(){this.list=[];this._s3AllSpecialObjects=[];this._s3WailTails=[];}update(dt){return dt;}clear(){this.list.length=0;this._s3AllSpecialObjects.length=0;this._s3WailTails.length=0;}}
  const G={time:0,scene:new T.Scene(),actors:[],teamColors:[0x2266aa]},listeners=[],api={THREE:T,G,Projectiles,on(name,fn){if(name==='all:special')listeners.push(fn);}};
  apply(api);const projectiles=new Projectiles(),stats={walks:0,visits:0};
  const actors=Array.from({length:8},(_,i)=>({id:i,remote:i!==2,alive:false,team:0,color:0x123400+i}));
  function roster(values){Object.defineProperty(values,Symbol.iterator,{configurable:true,value:function*(){stats.walks++;for(let i=0;i<this.length;i++){stats.visits++;yield this[i];}}});G.actors=values;}
  roster([...actors]);
  function mark(index=0,slot=0,activation=1,local=false,override={}){
    const e={actor:actors[index],id:'killerWail',activation,index:slot,action:'laser',pos:[index+slot/10,2,slot],target:[index,3,20+slot],...override};
    if(local)for(const fn of listeners)fn(e);else api.specialModelsReplay(e);
  }
  function step(time){G.time=time;stats.walks=stats.visits=0;assert.equal(projectiles.update(1/60),1/60);G.scene.updateMatrixWorld(true);return snapshot();}
  function snapshot(){return G.scene.children.filter(o=>o.name==='killer-wail-surviving-speaker').map(o=>({position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),matrix:o.matrixWorld.elements.slice(),color:o.children[0].getObjectByProperty('isMesh',true)?.material.color.getHex()}));}
  return{G,api,projectiles,actors,stats,roster,mark,step,snapshot};
}
function pair(){return[world(true),world(false)];}
function same(worlds,time){const result=worlds.map(w=>w.step(time));assert.deepEqual(result[1],result[0],`time ${time}`);return result[1];}

for(const hz of [30,60,120])test(`accepted speaker tails retain all positions, orientations, order and lifetimes at ${hz} Hz`,()=>{
  const worlds=pair();
  const events=[
    [.1,w=>{for(const owner of [1,0])for(const slot of [5,0,3,1,4,2])w.mark(owner,slot);} ],
    [.2,w=>{w.actors[0].alive=true;w.actors[0].specialActive={id:'killerWail'};}],
    [.25,w=>{w.actors[0].alive=false;}],
    [.27,w=>w.mark(0,1)],
    [.35,w=>w.mark(1,3,2)],
    [.4,w=>w.mark(1,0,2,false,{pos:[NaN,2,0]})],
    [.43,w=>w.mark(1,0,3,false,{action:'activate'})],
    [.5,w=>w.mark(2,0,4,true)],
    [.55,w=>{w.actors[2].remote=true;}],
    [.6,w=>{w.projectiles._s3WailTails=[{actor:w.actors[3],state:{serial:5,t:0,beamPairs:[{index:0,until:.15,origins:[new T.Vector3(3,2,0),new T.Vector3(4,2,0)],direction:new T.Vector3(0,0,1)}]}}];}],
  ];let event=0;
  for(let frame=0;frame<=hz;frame++){
    const time=frame/hz;
    while(event<events.length&&events[event][0]<=time+1e-10){const[at,fn]=events[event++];for(const w of worlds){w.G.time=at;fn(w);}}
    for(const w of worlds)for(const tail of w.projectiles._s3WailTails)tail.state.t=time-.6;
    same(worlds,time);
  }
  assert.equal(worlds[1].api.testCandidates.size,0);assert.equal(worlds[1].snapshot().length,0);
  assert.equal(worlds[1].stats.visits,0);assert.equal(worlds[0].stats.visits,8);
});

test('speaker admission survives roster replacement/rejoin, activate/clear, and a clock rewind without stale index retention',()=>{
  const worlds=pair();same(worlds,0);
  for(const w of worlds){w.G.time=1;w.mark(0);w.mark(1);}
  assert.equal(same(worlds,1).length,2);
  for(const w of worlds)w.roster([w.actors[1]]);
  assert.equal(same(worlds,1.04).length,1);
  for(const w of worlds)w.roster([w.actors[0],w.actors[1]]);
  assert.equal(same(worlds,1.08).length,2,'same actor can rejoin before its existing mark expires');
  for(const w of worlds){w.G.time=1.09;w.mark(0,0,2,false,{action:'activate'});}
  assert.equal(same(worlds,1.09).length,1);
  assert.equal(same(worlds,1.3).length,0);assert.equal(worlds[1].api.testCandidates.size,0);
  for(const w of worlds)w.roster([]);
  same(worlds,.9);
  for(const w of worlds)w.roster([w.actors[1]]);
  assert.equal(same(worlds,1.05).length,1,'original WeakMap mark is observable again during a rewound clock');
  assert.equal(same(worlds,1.31).length,0);
  for(const w of worlds){w.G.time=5;w.mark(1);w.projectiles.clear();}
  assert.equal(worlds[1].api.testCandidates.size,0);
  assert.equal(same(worlds,0).length,0);assert.equal(worlds[1].stats.walks,0);
  for(const w of worlds){w.G.time=5;w.mark(1);}
  assert.equal(same(worlds,0).length,0,'future marks are not drawn early');
  assert.equal(same(worlds,5).length,1);
  same(worlds,5.3);assert.equal(worlds[1].api.testCandidates.size,0);
});

test('idle updates do not walk 0/1/4/8 actor rosters; accepted events inside a synchronous scene callback retain roster draw order',()=>{
  for(const count of [0,1,4,8]){
    const worlds=pair();for(const w of worlds)w.roster(w.actors.slice(0,count));
    for(let i=0;i<60;i++){same(worlds,i/60);assert.equal(worlds[1].stats.walks,0);assert.equal(worlds[0].stats.visits,count);}
  }
  const worlds=pair();
  for(const w of worlds){
    w.G.time=1;w.mark(0);let once=false;const add=w.G.scene.add;
    w.G.scene.add=function(...objects){const result=add.apply(this,objects);if(!once){once=true;w.mark(1);}return result;};
  }
  assert.equal(same(worlds,1).length,2);
  for(const w of worlds)w.roster([]);
  same(worlds,1.1);assert.equal(worlds[1].api.testCandidates.size,2,'recent marks remain bounded until their original expiry, permitting a rejoin');
  same(worlds,1.2);assert.equal(worlds[1].api.testCandidates.size,0);
});
