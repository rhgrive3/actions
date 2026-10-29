import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../runtime/ranked/world.mjs',import.meta.url),'utf8'),start=source.indexOf('  _syncTower('),current=source.slice(start,source.indexOf('\n  beforeActors(',start)),old=fs.readFileSync(new URL('./fixtures/tower-sync-before-bearing-031426fc.mjs.txt',import.meta.url),'utf8');
class V {constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}copy(v){return this.set(v.x,v.y,v.z);}normalize(){const n=Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)||1;return this.set(this.x/n,this.y/n,this.z/n);}equals(v){return this.x===v.x&&this.y===v.y&&this.z===v.z;}addScaledVector(v,k){this.x+=v.x*k;this.y+=v.y*k;this.z+=v.z*k;return this;}setY(y){this.y=y;return this;}}
const xyz=v=>[v.x,v.y,v.z];
test('actual Tower sync retains transforms, collider axes and live signed-zero/NaN bearing edits across repeated syncs',()=>{
 function run(code){const log=[],math=Object.create(Math),native=[Math.atan2,Math.cos,Math.sin];
  const fn=new Function('RankedWorld','finite','INVALID_BEARING','setVec','updateBlockBounds','TOWER_NATIVE_TRIG','Math','return ({'+code+'})._syncTower;')({prototype:{}},Number.isFinite,[0,0,1],(v,a)=>v.set(...a),b=>log.push(['bounds',...xyz(b.axes[0]),...xyz(b.axes[2])]),native,math);
  const w={mode:'tower',towerBlock:{center:new V(),axes:[new V(),new V(),new V()]},_position:new V(),_lastPosition:new V(),_forward:new V(),_side:new V(),_towerPathTotal:1,_towerSegmentLengths:[1],_towerBearings:[[1,0]],_towerProgress:.5,_towerPosition:()=>[1,2,3],_refreshRideLatches:()=>log.push('latch'),tower:{position:new V(),rotation:{},updateMatrixWorld:()=>log.push('matrix')},_updateTowerPaintGeometry:()=>log.push('paint'),level:{markCollisionChanged:()=>log.push('collision')}};
  const values=[0,-0,1,-1,NaN,Infinity,-Infinity,1e-300,1e300];
  for(let i=0;i<2000;i++){
   const j=Math.floor(i/4);w._towerBearings[0]=[values[j%values.length],values[Math.floor(j/values.length)%values.length]];
   if(i===100)math.cos=x=>{log.push(['customCos',x]);return Math.cos(x);};if(i===150)math.cos=Math.cos;
   fn.call(w,{rule:{state:{progress:.5}}},false);
   log.push([w.tower.rotation.y,...xyz(w.towerBlock.axes[0]),...xyz(w.towerBlock.axes[2]),...xyz(w._forward),...xyz(w._side),...xyz(w.tower.position)]);
  }
  return log;}
 assert.deepEqual(run(current),run(old));
});
