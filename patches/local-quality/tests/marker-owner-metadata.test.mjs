import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const read = rel => adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8'));
const main = read('src/main.js'), hud = read('src/ui/hud.js');
const from = main.indexOf('    // ally markers'), to = main.indexOf('    // contextual prompts', from);
assert.ok(from >= 0 && to > from);
const markerBlock = main.slice(from, to);
const start = hud.indexOf('  _updMarkers(ms) {'), end = hud.indexOf('  _updPrompt(', start);
assert.ok(start >= 0 && end > start);

function element() {
  const children = new Map(), names = new Set();
  return {style:{setProperty(k,v){this[k]=v;}},lastChild:{style:{}},names,
    classList:{toggle(k,on){if(on)names.add(k);else names.delete(k);}},
    querySelector(key){if(!children.has(key))children.set(key,{});return children.get(key);}};
}
function rig({legacyProducer=false}={}) {
  const actor=(name,weapon,ready,x=0,team=0,isLocal=false)=>({name,weaponId:weapon,ready,team,isLocal,alive:true,form:'kid',
    character:{},pos:new THREE.Vector3(x,0,-5),specialReady(){return this.ready;}});
  const me=actor('me','shooter',false,0,0,true),a=actor('Player','charger',true,-2),b=actor('Player','roller',false,2),enemy=actor('Player','blaster',true,3,1);
  const G={teamHex:['#ffaa00','#0000ff'],actors:[me,a,b,enemy]},match={actors:G.actors};G.match=match;
  const camera=new THREE.PerspectiveCamera(60,16/9,.1,100);camera.updateMatrixWorld();
  const produce=new Function('G','THREE','m','a','cam','innerWidth','innerHeight',markerBlock+'\nreturn markers;');
  const H=new Function('G','clamp','toHex','colorVars','weaponIcon','kindOf','return class {'+hud.slice(start,end)+'}')(G,
    (x,min,max)=>Math.max(min,Math.min(max,x)),x=>x,()=>{},x=>x,x=>x);
  const view=Object.assign(new H(),{_L:{},_actors:()=>match.actors,markers:[element(),element()]});
  const game={};
  function update(){const rows=produce.call(game,G,THREE,match,me,camera,1280,720);if(legacyProducer)for(const row of rows){delete row.weapon;delete row.specialReady;}view._updMarkers(rows);return rows;}
  return {G,match,me,a,b,enemy,game,view,update};
}

test('#1186 negative control: omitted owner metadata resolves both markers to the last same-name actor',()=>{
  const f=rig({legacyProducer:true});f.update();
  assert.deepEqual(f.view.markers.map(x=>x._ready),[true,true]);
  assert.deepEqual(f.view.markers.map(x=>x.querySelector('.iw-mk__w').innerHTML),['blaster','blaster']);
});

test('#1186 same display names cannot borrow another ally or enemy marker weapon/readiness',()=>{
  const f=rig(),rows=f.update();assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.name),['Player','Player']);
  assert.deepEqual(f.view.markers.map(x=>x._ready),[true,false]);
  assert.deepEqual(f.view.markers.map(x=>x.querySelector('.iw-mk__w').innerHTML),['charger','roller']);
  assert.deepEqual(rows.map(x=>[x.weapon,x.specialReady]),[['charger',true],['roller',false]]);
  assert.ok(rows.every(row=>Object.values(row).every(v=>typeof v!=='object')),'marker transport contains scalars, never Actor references');
});

test('#1186 death and respawn reuse same-name/same-position marker slots without stale icons',()=>{
  const f=rig();f.a.ready=f.b.ready=false;f.a.pos.copy(f.b.pos);
  const rows=f.update(),first=rows[0];
  f.a.alive=false;f.update();
  assert.equal(f.game._hudMarkers[0],first,'existing per-frame storage stays pooled');
  assert.equal(f.view.markers[0].querySelector('.iw-mk__w').innerHTML,'roller');
  assert.equal(f.view.markers[1].style.display,'none');
  f.b.ready=true;f.update();assert.equal(f.view.markers[0]._ready,true);
  f.a.alive=true;f.update();
  assert.deepEqual(f.view.markers.map(x=>x.querySelector('.iw-mk__w').innerHTML),['charger','roller']);
  assert.deepEqual(f.view.markers.map(x=>x._ready),[false,true]);
  assert.equal(f.view.markers[1].style.display,'');
});

test('#1186 legacy marker fixtures without scalar metadata preserve the unique-name fallback',()=>{
  const f=rig();f.a.name='unique-a';f.b.name='unique-b';
  const rows=f.update().map(row=>{const legacy={...row};delete legacy.specialReady;delete legacy.weapon;return legacy;});
  f.view._updMarkers(rows);
  assert.deepEqual(f.view.markers.map(x=>x._ready),[true,false]);
  assert.deepEqual(f.view.markers.map(x=>x.querySelector('.iw-mk__w').innerHTML),['charger','roller']);
});

test('#1186 native Session permits identical display names for distinct player ids',()=>{
  const session=read('src/net/session.js'),start=session.indexOf('  _newPlayer(id, name, o) {'),end=session.indexOf('\n  }',start);
  assert.ok(start>=0&&end>start);
  const Session=new Function('WEAPONS','randomStyle','return class {'+session.slice(start,end+4)+'}');
  const s=new (Session({charger:{},roller:{}},()=>({})))();
  const a=s._newPlayer('peer-a','Player',{weapon:'charger'}),b=s._newPlayer('peer-b','Player',{weapon:'roller'});
  assert.notEqual(a.id,b.id);assert.equal(a.name,b.name);assert.notEqual(a.weapon,b.weapon);
});
