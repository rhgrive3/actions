// #1671: queryBlocksBand returns queryBlocks' ids, in order, minus exactly
// those the caller's own first y test would reject.
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeFixture} from './fixture.mjs';
const {NativeLevel,THREE}=await nativeFixture();
let seed=7;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function level(){
 const L=Object.create(NativeLevel.prototype),V=(x,y,z)=>new THREE.Vector3(x,y,z);
 Object.assign(L,{bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},blocks:[],faces:[],_stamp:0});
 // Stacked source floors/walls (one chart face each) plus faceless objects.
 for(let i=0;i<1500;i++){
  const x=(rnd()-.5)*76,z=(rnd()-.5)*76,y=Math.floor(rnd()*6)*4+(rnd()-.5)*.4,sx=rnd()*6,sz=rnd()*6,h=rnd()<.3?rnd()*5:0,faced=rnd()<.85;
  const id=L.blocks.length,faces=[-1,-1,-1,-1,-1,-1],b={id,aabbMin:V(x,y,z),aabbMax:V(x+sx,y+h,z+sz),faces};
  if(faced){const f={id:L.faces.length,origin:V(x+rnd(),y+(rnd()-.5)*3,z)};L.faces.push(f);b.nativeFace=f.id;faces[0]=f.id;}
  L.blocks.push(b);
 }
 L.staticBlockCount=L.blocks.length;L._buildHash();return L;
}
function expected(L,minX,minZ,maxX,maxZ,y,reach,mode){
 return L.queryBlocks(minX,minZ,maxX,maxZ,[]).filter(id=>{
  const b=L.blocks[id];if(id>=L.staticBlockCount)return true;
  if(mode===0)return !(y<b.aabbMin.y-reach||y>b.aabbMax.y+reach);
  // regionStats reads only faces; its first face test is |origin.y-y| > 2.5.
  return b.faces.some(f=>f>=0&&!(Math.abs(L.faces[f].origin.y-y)>reach));
 });
}
test('splat and region bands keep queryBlocks order for every kept id',()=>{
 const L=level();let kept=0,total=0;
 for(let i=0;i<4000;i++){
  const cx=(rnd()-.5)*90,cz=(rnd()-.5)*90,r=rnd()*12,y=i%97===0?NaN:i%89===0?-0:(rnd()-.2)*26,mode=i&1,reach=mode?2.5:r;
  const got=L.queryBlocksBand(cx-r,cz-r,cx+r,cz+r,[],y,reach,mode),want=expected(L,cx-r,cz-r,cx+r,cz+r,y,reach,mode);
  // Faceless static objects contribute nothing to regionStats. At a NaN y
  // they may stay in the list (|Infinity-NaN|>2.5 is false), never reorder it.
  const all=L.queryBlocks(cx-r,cz-r,cx+r,cz+r,[]),faced=id=>id>=L.staticBlockCount||L.blocks[id].faces.some(f=>f>=0);
  assert.deepEqual(mode?got.filter(faced):got,want,'query '+i);
  assert.deepEqual(got,all.filter(id=>got.includes(id)),'kept ids keep queryBlocks order '+i);kept+=got.length;total+=L.queryBlocks(cx-r,cz-r,cx+r,cz+r,[]).length;
 }
 assert.ok(kept<total*.6,'the band removes stacked candidates: '+kept+'/'+total);
});
test('dynamic blocks appended to hash buckets after a query always reach the caller',()=>{
 const L=level(),V=(x,y,z)=>new THREE.Vector3(x,y,z);
 L.queryBlocksBand(-10,-10,10,10,[],0,3,0);
 // Ranked tower: _addBlock then direct bucket pushes, as ranked/world.mjs does.
 const id=L.blocks.length;L.blocks.push({id,aabbMin:V(-2,90,-2),aabbMax:V(2,91,2),faces:[-1,-1,-1,-1,-1,-1]});
 L.blockStamp=new Uint32Array(L.blocks.length);
 for(let z=L._hzi(-2);z<=L._hzi(2);z++)for(let x=L._hxi(-2);x<=L._hxi(2);x++)L.hash[z*L.hw+x].push(id);
 for(const mode of [0,1]){const got=L.queryBlocksBand(-3,-3,3,3,[],0,2.5,mode);assert.deepEqual(got,expected(L,-3,-3,3,3,0,2.5,mode));assert.ok(got.includes(id));}
 L.hash=L.hash.map(c=>c.slice());L.hash[L._hzi(0)*L.hw+L._hxi(0)].length=0;
 assert.deepEqual(L.queryBlocksBand(-3,-3,3,3,[],0,2.5,0),expected(L,-3,-3,3,3,0,2.5,0),'a replaced hash rebuilds every band');
});
