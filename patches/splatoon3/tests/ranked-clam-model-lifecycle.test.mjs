import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {RankedWorld} from '../runtime/ranked/world.mjs';
import {ClamsRule} from '../runtime/ranked/clams.mjs';
const stage={clams:{spawns:[],goals:[[-5,0,0],[5,0,0]]}};
function setup(team){const scene=new THREE.Scene(),actor={nid:'player',id:'player',team,alive:true,pos:new THREE.Vector3(0,0,0)};const G={scene,time:0};const engine={event(){}};engine.rule=new ClamsRule(engine,stage);const world=new RankedWorld({G,THREE},{mode:'clams',actors:[actor]},stage);const update=()=>{const before=JSON.stringify(engine.rule.state);world.update(engine,1/60);scene.updateMatrixWorld(true);assert.equal(JSON.stringify(engine.rule.state),before,'presentation must not mutate rules');};return{scene,actor,engine,world,update};}
for(const team of [0,1])test(`real rule pickup and world small 1..7/power conversion/drop team ${team}`,()=>{
 const {scene,actor,engine,world,update}=setup(team),r=engine.rule;
 for(let n=1;n<=8;n++){
  const clam=r._newClam('small',null,[0,0,0]);update();const field=world._clamMarkers.get(clam.id).mesh;
  assert.equal(field.geometry,world.smallClamResources.geometry);assert.equal(field.material,world.smallClamResources.material);assert.equal(field.visible,true);
  assert.equal(r._pickup(clam,actor,{}),true);update();assert.equal(field.visible,false);
  const group=world._inventoryMarkers.get('player');assert.ok(group,'native inventory marker required');const small=group.userData.smallClams,power=group.userData.powerClam;
  assert.equal(group.parent,world.clamsGroup);assert.equal(small.count,n<8?n:0);assert.equal(small.visible,n<8);assert.equal(power.visible,n===8);
  assert.equal(small.geometry,world.smallClamResources.geometry);assert.equal(small.material,world.smallClamResources.material);
 }
 r.state.inventories.player.power=false;r.state.inventories.player.small=3;update();r._dropSmallInventory('player',[0,0,0],team);update();assert.equal(world._inventoryMarkers.get('player').visible,false);
 const drops=r.state.clams.filter(c=>c.kind==='small');assert.equal(drops.length,3);for(const c of drops)assert.equal(world._clamMarkers.get(c.id).mesh.visible,true);
 const old=r.state.clams[0];r.state.clams=[];update();assert.equal(world._clamMarkers.get(old.id).mesh.visible,false);r.state.clams=[old];update();assert.equal(world._clamMarkers.get(old.id).mesh.visible,true);
 const before=world._clamMarkers.get(old.id).mesh;old.kind='power';old.team=team;update();assert.equal(world._clamMarkers.get(old.id).mesh,before);assert.equal(before.geometry,world.powerClamResources.geometry);assert.equal(before.name,`power-clam-${old.id}`);
 world.dispose();assert.equal(world.group.parent,null);assert.equal(scene.children.length,0);
});
test('instance resources and shared geometry/material dispose exactly once after reuse',()=>{
 const {engine,world,update}=setup(0);engine.rule.state.inventories.player={small:7,power:false,team:0};update();const group=world._inventoryMarkers.get('player');assert.ok(group,'native inventory marker required');const small=group.userData.smallClams;let counts=[0,0,0,0,0];[small,world.smallClamResources.geometry,world.smallClamResources.material,world.powerClamResources.geometry,world.powerClamResources.material].forEach((o,i)=>o.addEventListener('dispose',()=>counts[i]++));
 for(const power of [true,false,true,false]){engine.rule.state.inventories.player.power=power;update();}world.dispose();world.dispose();assert.deepEqual(counts,[1,1,1,1,1]);
});
test('carried row follows actual carrier position and yaw at four headings',()=>{
 const {actor,engine,world,update}=setup(0);engine.rule.state.inventories.player={small:7,power:false,team:0};
 for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const power of [false,true]){
 actor.yaw=yaw;actor.pos.set(3,2,-4);engine.rule.state.inventories.player.power=power;update();const m=world._inventoryMarkers.get('player');assert.ok(m,'native inventory marker required');
 assert.ok(Math.abs(m.position.x-(3-Math.sin(yaw)*.72))<1e-8);assert.ok(Math.abs(m.position.z-(-4-Math.cos(yaw)*.72))<1e-8);assert.equal(m.position.y,2+(power?.34:.16));assert.equal(m.rotation.y,yaw);
 const child=power?m.userData.powerClam:m.userData.smallClams;assert.equal(child.visible,true);assert.ok(child.matrixWorld.elements.every(Number.isFinite));
 }world.dispose();
});
