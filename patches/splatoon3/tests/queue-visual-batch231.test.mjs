import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {krakenDashSweptContact} from '../runtime/all-specials.mjs';
import {S3_SHAPE} from '../runtime/s3-projectile-shapes.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function method(source,cls,key,bindings={}){const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});const c=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name===cls);const m=c.body.body.find(n=>n.key.name===key);return new Function(...Object.keys(bindings),'return ({'+source.slice(m.start,m.end)+'})['+JSON.stringify(key)+']')(...Object.values(bindings));}
function RibbonClass(source){const start=source.indexOf('class RibbonPool {'),end=source.indexOf('// Instanced shape pools',start);return new Function('THREE','RIBBON_VERT','RIBBON_FRAG','vfxRandom',source.slice(start,end<0?source.length:end)+'\nreturn RibbonPool;')(T,'','',()=>.25);}
test('circular ribbons retain exact chronological points and all uploaded vertices through wrap, expiry and eviction',()=>{
 const Old=RibbonClass(read('./fixtures/special-ribbons-before-oct23.txt')),New=RibbonClass(read('../runtime/special-vfx-kit.mjs'));
 for(const hz of [30,60,120])for(const additive of [false,true]){
  const a=new Old(T,3,8,additive,{value:0}),b=new New(T,3,8,additive,{value:0});let ar,br;
  for(let i=0;i<hz*3;i++){
   const now=i/hz;
   if(i%17===0){ar=a.start({spacing:.03,life:.2,flat:i%2===0});br=b.start({spacing:.03,life:.2,flat:i%2===0});}
   for(let j=0;j<3;j++){const x=Math.sin(now*7+j*.07),y=Math.cos(now*3),z=now+j*.02;a.push(ar,x,y,z,now);b.push(br,x,y,z,now);}
   if(i%23===0){a.end(ar);b.end(br);}
   a.update(now,new T.Vector3(2,3,4));b.update(now,new T.Vector3(2,3,4));
   assert.equal(b.list.length,a.list.length);for(let k=0;k<a.list.length;k++)assert.deepEqual(b.list[k].pts,a.list[k].pts);
   for(const key of ['pos','col','rib','side','face'])assert.deepEqual(b[key].array,a[key].array,key+' Hz'+hz+' step'+i);
   assert.deepEqual(b.mesh.geometry.drawRange,a.mesh.geometry.drawRange);
  }
  a.clear();b.clear();a.update(10,new T.Vector3());b.update(10,new T.Vector3());assert.equal(b.list.length,0);
 }
});
test('cached Explosher coefficients preserve every Float32 sparkle value including reused projectile seeds and saturation',()=>{
 const old=read('./fixtures/explosher-sparkles-before-oct23.txt'),source=read('../runtime/s3-projectile-shapes.mjs');
 const start=source.indexOf("    } else if (kind === 'explosher') {\n")+"    } else if (kind === 'explosher') {\n".length;
 const next=source.slice(start,source.indexOf('\n    }\n  }\n  bodyData',start));
 const fract=x=>x-Math.floor(x),hash=(a,b)=>fract(Math.sin(a*127.1+b*311.7)*43758.5453);
 const compile=body=>new Function('R','p','sparkPos','sparkSize','nk','f','S3_SHAPE','hash','fract','v','sp','cam','MAX_SPARK','for(let once=0;once<1;once++){'+body+'}return nk;');
 const fns=[compile(old),compile(next)],R={sparkleCoefficients:new WeakMap()},p={seed:2,age:0,pos:new T.Vector3(2,3,4)};
 for(const seed of [2,2,0,-0,13,13,4294967295])for(const age of [0,.01,.1,.7,2])for(const initial of [0,150,160]){
  p.seed=seed;p.age=age;const rows=fns.map(fn=>{const pos={array:new Float32Array(480)},size={array:new Float32Array(160)};const count=fn(R,p,pos,size,initial,new T.Vector3(.3,.4,.5),S3_SHAPE,hash,fract,new T.Vector3(),12,null,160);return{pos:pos.array,size:size.array,count};});assert.deepEqual(rows[1],rows[0]);
 }
});
test('scalar Kraken guards preserve planar, 3D and invalid contact results',()=>{
 const finite=Number.isFinite,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const old=(from,to,target,radius=1.5)=>{if(![from?.x,from?.z,to?.x,to?.z,target?.x,target?.z,radius].every(finite)||radius<0)return false;const missing=[from.y,to.y,target.y].filter(y=>y===undefined).length;if(missing!==0&&missing!==3)return false;if(missing===0&&![from.y,to.y,target.y].every(finite))return false;const dy=missing===3?0:to.y-from.y,dx=to.x-from.x,dz=to.z-from.z,lengthSq=dx*dx+dy*dy+dz*dz,proj=(target.x-from.x)*dx+(target.z-from.z)*dz+(missing===3?0:(target.y-from.y)*dy),t=lengthSq>1e-12?clamp(proj/lengthSq,0,1):0,x=target.x-(from.x+t*dx),z=target.z-(from.z+t*dz),y=missing===3?0:target.y-(from.y+t*dy);return x*x+y*y+z*z<=radius*radius;};
 const ys=[undefined,0,1,NaN,Infinity,null];for(const a of ys)for(const b of ys)for(const c of ys)for(const r of [-1,0,1.5,NaN]){const from={x:0,y:a,z:0},to={x:2,y:b,z:2},target={x:1,y:c,z:1};assert.equal(krakenDashSweptContact(from,to,target,r),old(from,to,target,r));}
});
test('TRY IT cancels only the detached news animation and retains remove-before-Boss ordering',()=>{
 const source=adaptBuildSource('src/ui/news.js',read('../../../inkwave-public/src/ui/news.js')),calls=[];
 const close=method(source,'WhatsNew','close',{clearTimeout(){},cancelAnimationFrame:id=>calls.push(['cancel',id])});
 const el={classList:{add(){}},remove(){calls.push(['remove']);}},news={M:{_modal:el},el,card:{classList:{add(){}}},_t:0,_raf:12,_tweens:[()=>{}],_tryBoss(){calls.push(['boss']);}};
 close.call(news,'try');assert.equal(news._raf,0);assert.equal(news._tweens.length,0);assert.deepEqual(calls,[['cancel',12],['remove'],['boss']]);
});
test('inventory indexing preserves first duplicate actor, string IDs, disappearance and marker positions',()=>{
 const source=read('../runtime/ranked/world.mjs'),before=read('./fixtures/clam-inventory-before-oct23.txt');
 const bindings={finite:Number.isFinite,idKey:v=>v==null?'':String(v),updateSmallClamInventory:(_T,s,n)=>{s.count=n;}};
 const old=new Function(...Object.keys(bindings),'return ({'+before+'})._updateInventories')(...Object.values(bindings)),next=method(source,'RankedWorld','_updateInventories',bindings);
 const actors=[{nid:1,team:0,pos:new T.Vector3(1,2,3),yaw:.5},{nid:'1',team:1,pos:new T.Vector3(100,2,3),yaw:1},{nid:2,team:1,pos:new T.Vector3(4,5,6),yaw:-.2},{team:0,slot:3,pos:new T.Vector3(7,8,9),yaw:NaN}];
 const make=()=>({mode:'clams',smallClamResources:{},THREE:T,match:{actors},_inventoryMarkers:new Map(['1','2','0:3','missing'].map(id=>[id,{visible:false,userData:{smallClams:{count:0},powerClam:{}},position:new T.Vector3(),rotation:{y:0}}])),_findActor(id){return this.match.actors.find(a=>String(a.nid??`${a.team}:${a.slot}`)===id)||null;}});
 const a=make(),b=make();
 for(const inventories of [{'1':{small:2},'2':{power:true}}, {'1':{small:0},'0:3':{small:5},missing:{power:true}},{}]){
  const engine={rule:{state:{inventories}}};old.call(a,engine);next.call(b,engine);
  for(const [id,marker] of a._inventoryMarkers){const other=b._inventoryMarkers.get(id);assert.equal(other.visible,marker.visible);assert.deepEqual(other.position,marker.position);assert.deepEqual(other.userData,marker.userData);assert.deepEqual(other.rotation,marker.rotation);}
  assert.equal(b._inventoryScratch.actors.size,0);assert.equal(b._inventoryScratch.present.size,0);
 }
});
test('unsupported special kinds allocate no Group or team color work',()=>{
 const source=read('../runtime/special-presentation.mjs'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});let node;
 function visit(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionDeclaration'&&n.id.name==='objectModel')node=n;for(const value of Object.values(n))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
 visit(ast);let groups=0,colors=0;const objectModel=new Function('THREE','colorOf','return ('+source.slice(node.start,node.end)+')')({Group:class{constructor(){groups++;}}},()=>{colors++;return 0;});
 for(const kind of ['storm','waveFront','unknown','cooler','inkVac'])for(let i=0;i<100;i++)assert.equal(objectModel({kind}),null);
 assert.equal(groups,0);assert.equal(colors,0);
});
test('idle local movement audio skips only absent handles and still fades existing loops after death',()=>{
 const raw=read('../../../inkwave-public/src/main.js'),source=adaptBuildSource('src/main.js',raw),calls=[];
 const update=method(source,'Game','_updateLocalLoops',{G:{audio:{loop:()=>{throw Error('must stay dormant');}}},damp:(v,to,hz,dt)=>to+(v-to)*Math.exp(-hz*dt)});
 const dormant={match:null};for(let i=0;i<100;i++)update.call(dormant,1/60);assert.equal(dormant._loops,undefined);
 const active={match:null,_loops:{swim:{_v:.5,set(p){calls.push(['set',p.volume]);},stop(){calls.push(['stop']);}}}};
 for(let i=0;i<100;i++)update.call(active,1/60);assert.ok(calls.some(c=>c[0]==='set'));assert.equal(calls.filter(c=>c[0]==='stop').length,1);assert.equal(active._loops.swim,null);
});
test('ranked objective projection scratch retains every Canvas command for all four ranked rules',()=>{
 const source=read('../runtime/ranked/ui.mjs'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const selected=ast.body.filter(n=>n.type==='FunctionDeclaration'&&['projectObjective','marker','drawObjectives'].includes(n.id.name)||n.type==='VariableDeclaration'&&n.declarations[0].id.name==='objectiveScratch');
 const compile=code=>new Function('strokeTowerRoute','finite','clamp01',code+'\nreturn drawObjectives;')(()=>false,(n,f=0)=>Number.isFinite(n)?n:f,n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0)));
 const old=compile(read('./fixtures/ranked-objective-projection-before-oct23.txt')),next=compile(selected.map(n=>source.slice(n.start,n.end)).join('\n'));
 const stage={zones:[{center:[1,0,2],size:[3,4]},{center:{x:3,y:0,z:4},size:[2,5]}],tower:{path:[[0,0,0],[1,0,3],[2,0,5]],checkpoints:[[{progress:.5}],[{progress:1}]]},rainmaker:{center:[2,0,3],checkpoints:[[[1,0,2]],[[3,0,4]]],goals:[[0,0,8],[0,0,-8]]},clams:{goals:[[0,0,8],[0,0,-8]]}};
 const state={zones:[{team:0},{team:-1}],position:[2,0,3],controllingTeam:1,pos:[2,0,3],checkpoint:{passed:[true,false],choice:[0,0],goalOpen:[true,false]},clams:[{pos:[1,0,2],kind:'power'},{pos:[3,0,4],kind:'small'}],inventories:{'7':{power:true}}};
 for(const mode of ['zones','tower','rainmaker','clams']){
  function draw(fn){const rows=[],outs=new Set(),ctx=new Proxy({},{get:(_o,key)=>(...args)=>rows.push([key,...args]),set:(_o,key,value)=>{rows.push([key,value]);return true;}}),minimap={ctx,s:2,toCanvas(x,z,out){outs.add(out);out.x=x*2+5;out.y=z*2+6;return out;}};
   fn(minimap,{mode,stage,rule:{state}},{match:{actors:[{nid:7,team:0,pos:new T.Vector3(1,2,3)}]}});return {rows,outs};}
  const a=draw(old),b=draw(next);assert.deepEqual(b.rows,a.rows,mode);assert.equal(b.outs.size,1,mode+' reuses one projection object');
 }
});
