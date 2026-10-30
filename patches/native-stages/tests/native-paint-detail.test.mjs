import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeFixture } from './fixture.mjs';
import { convertSource } from '../runtime/source-convert.mjs';

let runtime;
async function setup(slope=0) {
  const f=await(runtime||=nativeFixture({renderOnly:true})),{THREE}=f;
  const rows=[];let vertex=0;
  for(let tile=0;tile<24;tile++){
    const x=tile*16;
    rows.push('o Fld_Floor'+tile,'usemtl Concrete00');
    const normal=new THREE.Vector3(0,1,-slope).normalize();
    for(const p of [[x,0,0],[x,8*slope,8],[x+8,0,0],[x+8,8*slope,8]])rows.push('v '+p.join(' '),'vn '+normal.toArray().join(' '));
    const [a,b,c,d]=[1,2,3,4].map(i=>`${vertex+i}//${vertex+i}`);rows.push(`f ${a} ${b} ${c}`,`f ${c} ${b} ${d}`);vertex+=4;
  }
  const data=convertSource({id:'detail',bounds:{minX:0,maxX:400,minZ:0,maxZ:8},spawnPads:[[2,0,2],[390,0,2]],spawnBarrier:0},rows.join('\n'),'newmtl Concrete00\nKd 1 1 1\n',{});
  f.G.level=new f.NativeLevel(data);f.G.netm=null;
  const state={target:null,autoClear:true,scissorTest:false,color:new THREE.Color(),alpha:1,draws:0,vertices:0};
  const renderer={
    getContext:()=>({}),initRenderTarget(){},getRenderTarget:()=>state.target,setRenderTarget:v=>state.target=v,
    getClearColor:o=>o.copy(state.color),getClearAlpha:()=>state.alpha,setClearColor:(c,a)=>{state.color.set(c);state.alpha=a;},
    getViewport:o=>o.set(2,3,400,300),getScissor:o=>o.set(4,5,300,200),setViewport(){},setScissor(){},
    getScissorTest:()=>state.scissorTest,setScissorTest:v=>state.scissorTest=v,clear(){},
    render(scene){state.draws++;state.vertices+=scene.children[0].geometry.drawRange.count;},
    get autoClear(){return state.autoClear;},set autoClear(v){state.autoClear=v;},
  };
  class Paint extends f.PaintSystem{
    _initGPU(){this.mat=new THREE.ShaderMaterial();this.texture=new THREE.Texture();this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}
    _pushQuad(){} _drawQuads(){} clear(){this.grid.fill(0);this.growing.length=0;}
    dispose(){this.mat.dispose();this.texture.dispose();}
  }
  const paint=f.G.paint=new Paint(renderer,f.G.level,{atlasSize:1024,maxDensity:3.2768});
  const material=f.nativeInkMaterial(paint,null,null),detail=paint.nativeDetail;
  assert.ok(detail);
  const stamp=(x,seed=.2,kind='ink-contact')=>{
    const face=f.G.level.faces.find(f=>x>f.bounds[0][0]&&x<f.bounds[1][0]);
    paint.splat(new THREE.Vector3(x,4*slope,4),1,0,{face:face.id,kind,seed,instant:true,stretch:new THREE.Vector3(0,0,1),stretchAmt:-.2});
  };
  return {f,paint,detail,renderer,state,material,stamp};
}

test('native detail retains immutable coverage after pooled growth records are reused',async()=>{
  const t=await setup();
  for(let n=0;n<40;n++)t.stamp(4,n/41);
  const records=[...t.detail.pages.values()][0].records;
  assert.equal(records.size,40);
  assert.equal(new Set([...records.values()].map(r=>r.g.seed)).size,40);
  const grid=Array.from(t.paint.grid);t.paint.flush(0);
  assert.deepEqual(Array.from(t.paint.grid),grid,'detail is not a second gameplay paint owner');
  assert.ok(t.state.vertices>0,'source triangles, rather than replacement floor quads, are rasterized');
  assert.equal(t.detail.target.width,1024);assert.equal(t.detail.target.height,1024);
  assert.equal(t.state.target,null);assert.equal(t.state.autoClear,true);assert.equal(t.state.scissorTest,false);
  t.paint.dispose();t.material.dispose();
});

test('native detail has sixteen resident pages and replays an evicted floor on revisit',async()=>{
  const t=await setup();t.stamp(4);t.paint.setView(new t.f.THREE.Vector3(4,8,4));t.paint.flush(0);
  const original=[...t.detail.pages.values()][0],snapshot=[...original.records.values()][0];
  for(let tile=1;tile<24;tile++){
    t.stamp(tile*16+4,tile/25);t.paint.setView(new t.f.THREE.Vector3(tile*16+4,8,4));t.paint.flush(0);
  }
  assert.ok(t.detail.pages.size>16);assert.equal(t.detail.slots.filter(Boolean).length,16);
  assert.equal(original.slot,-1);assert.equal(original.records.get(snapshot.id),snapshot);
  const before=t.state.vertices;t.paint.setView(new t.f.THREE.Vector3(4,8,4));t.paint.flush(0);
  assert.ok(original.slot>=0&&original.ready);assert.ok(t.state.vertices>before);
  t.paint.dispose();t.material.dispose();
});

test('native detail clearing and disposal release history and restore the paint owner',async()=>{
  const t=await setup();t.stamp(4);t.paint.flush(0);
  assert.ok(t.detail.pages.size>0);
  t.paint.clear();assert.equal(t.detail.pages.size,0);assert.ok(t.detail.slots.every(v=>v===null));
  assert.ok(t.detail.uniforms.uNativeDetailPages.value.every(v=>v.toArray().every(x=>x===0)));
  t.stamp(4,.3);t.paint.flush(0);assert.ok(t.detail.pages.size>0);
  t.paint.dispose();assert.equal(t.detail.disposed,true);assert.equal(t.paint.nativeDetail,null);assert.equal(t.detail.pages.size,0);
  t.detail.dispose();t.material.dispose();
});

test('native detail follows an inclined source floor in its own plane',async()=>{
  const t=await setup(.75);t.stamp(4);t.paint.setView(new t.f.THREE.Vector3(4,12,4));
  const grid=Array.from(t.paint.grid);t.paint.flush(0);
  const page=t.detail.slots.find(Boolean);assert.ok(page?.ready);
  assert.ok(Math.abs(page.plane.n.y-.8)<1e-5);assert.ok(Math.abs(page.plane.n.z+.6)<1e-5);
  assert.ok(t.state.vertices>0);assert.deepEqual(Array.from(t.paint.grid),grid);
  t.paint.dispose();t.material.dispose();
});

test('native detail follows the game camera when PaintSystem.setView is unused',async()=>{
  const t=await setup();
  for(let tile=0;tile<24;tile++)t.stamp(tile*16+4,tile/25);
  t.f.G.camera={position:new t.f.THREE.Vector3(4,8,4)};
  t.paint.flush(0);
  const first=[...t.detail.pages.values()].find(p=>p.x===0);
  assert.ok(first.slot>=0&&first.ready,'a distant bot stamp must not move the local detail view');
  t.paint.dispose();t.material.dispose();t.f.G.camera=null;
});
