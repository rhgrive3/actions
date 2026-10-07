import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
const root=path.resolve(new URL('../../../',import.meta.url).pathname),site=process.env.INKWAVE_RANGE_SIGNAGE_SITE;
async function fixture({ready=true,pending=false}={}){
 const calls=[],loads=[],resolve=[];
 const context2d=new Proxy({measureText:t=>({width:t.length*8})},{get:(o,k)=>k in o?o[k]:(...args)=>calls.push([k,...args]),set:(o,k,v)=>(o[k]=v,true)});
 const ctx=vm.createContext({console,document:{createElement:()=>({width:0,height:0,getContext:()=>context2d}),fonts:{check:()=>ready,load:font=>{loads.push(font);return pending?new Promise(r=>resolve.push(r)):Promise.resolve([]);}}}});
 const mods=new Map(),base=site||root;
 const load=file=>{if(mods.has(file))return mods.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:ctx,identifier:file});mods.set(file,m);return m;};
 const entry=load(path.join(base,'patches/practice-range/runtime/signage.mjs'));
 await entry.link((spec,from)=>{
  if(spec==='./strings.mjs'){const key='strings';if(!mods.has(key))mods.set(key,new vm.SyntheticModule(['L','isJa'],function(){this.setExport('L',s=>s);this.setExport('isJa',false);},{context:ctx}));return mods.get(key);}
  return load(spec==='three'?path.join(site||path.join(root,'inkwave-public'),'vendor/three/build/three.module.js'):path.resolve(path.dirname(from.identifier),spec));
 });await entry.evaluate();return{Ctor:entry.namespace.RangeSignage,calls,loads,resolve,scene:{add(m){m.parent={remove(child){child.parent=null;}};}}};
}
test('LOW/touch atlas uses quarter pixels with identical layout, world positions and UVs',async()=>{
 const f=await fixture(),high=new f.Ctor(f.scene,{quality:'high'},{touch:false});assert.equal(high.canvas.width,2048);
 for(const [quality,touch]of [['low',false],['high',true],['low',true]]){
  const low=new f.Ctor(f.scene,{quality},{touch});assert.equal(low.canvas.width,1024);assert.equal(low.canvas.height,1024);assert.equal(low.tex.image,low.canvas);assert.equal(low.mat.map,low.mat.emissiveMap);
  for(const name of ['position','normal','uv'])assert.deepEqual([...low.mesh.geometry.attributes[name].array],[...high.mesh.geometry.attributes[name].array]);
  assert.deepEqual([...low.cells.values()],[...high.cells.values()]);
  assert([...low.cells.values()].every(c=>c.x>=0&&c.y>=0&&c.x+c.pw<=2048&&c.y+c.ph<=2048));
  let disposed=0;for(const obj of [low.tex,low.mat,low.mesh.geometry])obj.addEventListener('dispose',()=>disposed++);low.dispose();assert.equal(disposed,3);assert.equal(low.mesh.parent,null);
 }
 assert(f.calls.some(c=>c[0]==='scale'&&c[1]===.5&&c[2]===.5));assert.equal(f.loads.length,0,'ready fonts do not trigger redundant redraw');high.dispose();
});
test('late fonts redraw only a live constrained atlas and never a disposed one',async()=>{
 const f=await fixture({ready:false,pending:true}),a=new f.Ctor(f.scene,{quality:'low'}),v=a.tex.version;
 assert.equal(f.loads.length,2);f.resolve.splice(0).forEach(r=>r([]));await new Promise(setImmediate);assert.equal(a.tex.version,v+1);assert.equal(a.canvas.width,1024);a.dispose();
 const b=new f.Ctor(f.scene,{quality:'low'}),last=b.tex.version;b.dispose();f.resolve.splice(0).forEach(r=>r([]));await new Promise(setImmediate);assert.equal(b.tex.version,last);
});
