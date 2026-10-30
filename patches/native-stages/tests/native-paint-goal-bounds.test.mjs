import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const original=fs.readFileSync(new URL('./fixtures/native-bots-3715e29d.mjs.txt',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(original).digest('hex'),'dd6c3ce9b7c616b2e4f509a7669161dc4400a193c1dd2905994e41de4771be86');
const math=Object.create(Math);
const before=new Function('Math',original.replace('export function','function')+'\nreturn nativePaintGoalIds;')(math);
const f=await fixture({productionComposition:true,adaptRuntime:adaptBuildSource,
 extraExports:"export {nativePaintGoalIds} from './patches/native-stages/runtime/engine.mjs';"});
const after=f.nativePaintGoalIds;

function grid(width,step=1){
 const nodes=[];
 for(let z=0;z<width;z++)for(let x=0;x<width;x++)nodes.push({id:nodes.length,x:x*step,y:0,z:z*step,zone:-1,nativePaintable:true,nb:[]});
 for(const n of nodes)for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]){
  const x=n.id%width+dx,z=Math.floor(n.id/width)+dz;
  if(x>=0&&x<width&&z>=0&&z<width)n.nb.push({to:z*width+x});
 }
 return{nodes,valid:new Uint8Array(nodes.length).fill(1),start:0,nearest(){return this.start;}};
}
const brain=(x=0,z=0,team=0)=>({a:{pos:{x,y:0,z},team}});
function compare(navs,brains){
 const result=[before(brains[0],{nav:navs[0]}),after(brains[1],{nav:navs[1]})];
 assert.deepEqual(Array.from(result[1]),Array.from(result[0]),'ordered goal IDs');
 for(const key of ['seen','queue'])assert.deepEqual(Array.from(navs[1]._nativePaintGoalWork?.[key]||[]),Array.from(navs[0]._nativePaintGoalWork?.[key]||[]),key);
 assert.equal(navs[1]._nativePaintGoalWork?.stamp,navs[0]._nativePaintGoalWork?.stamp,'generation stamp');
 return result;
}

test('near and wide directed grids retain goals, enemy-zone barriers, nonpaintable nodes and visited order',()=>{
 for(const [width,step]of [[24,1],[80,2]])for(const team of [0,1]){
  const navs=[grid(width,step),grid(width,step)],brains=[brain(12,15,team),brain(12,15,team)];
  for(const nav of navs){
   for(const n of nav.nodes){if(n.id%19===0)n.nativePaintable=false;if(n.id%37===0)nav.valid[n.id]=0;}
   // One-way departures and enemy spawn strips must still govern reachability.
   for(let z=0;z<width;z++)nav.nodes[z*width+Math.floor(width/2)].zone=1-team;
   nav.nodes[0].nb=[{to:1}];nav.nodes[1].nb=nav.nodes[1].nb.filter(e=>e.to!==0);
  }
  compare(navs,brains);
  assert(!brains[1]._nativeGoalIds.ids.some(id=>id%width>width/2),'cannot cross the enemy strip');
 }
});

test('circle and square boundaries, signed zeros and nonfinite inputs match the frozen predicate exactly',()=>{
 const values=[-Infinity,-Number.MAX_VALUE,-34.00000000000001,-34,-33.99999999999999,-24.041630560342615,-0,0,24.041630560342615,33.99999999999999,34,34.00000000000001,Number.MAX_VALUE,Infinity,NaN];
 const nodes=values.flatMap(x=>values.map(z=>({id:0,x,y:0,z,zone:-1,nativePaintable:true,nb:[]})));
 nodes.forEach((n,id)=>{n.id=id;if(id+1<nodes.length)n.nb.push({to:id+1});});
 for(const [x,z]of [[0,0],[-0,-0],[34,34],[1e300,-1e300],[Infinity,Infinity],[NaN,0]]){
  const make=()=>({nodes:structuredClone(nodes),valid:new Uint8Array(nodes.length).fill(1),nearest:()=>0});
  compare([make(),make()],[brain(x,z),brain(x,z)]);
 }
});

test('cache identity, start/team changes, graph replacement, resize and stamp wrap keep their contracts',()=>{
 const navs=[grid(12),grid(12)],brains=[brain(),brain()];
 const first=compare(navs,brains),cached=compare(navs,brains);
 for(let i=0;i<2;i++)assert.equal(cached[i],first[i],'same cache object');
 for(let i=0;i<2;i++){navs[i].start=1;brains[i].a.pos.x=4;}
 compare(navs,brains);
 for(let i=0;i<2;i++){brains[i].a.team=1;navs[i]._nativePaintGoalWork.stamp=0xffffffff;}
 compare(navs,brains);assert.equal(navs[1]._nativePaintGoalWork.stamp,1);
 const replaced=[grid(20),grid(20)];compare(replaced,brains);
 for(let i=0;i<2;i++){const smaller=grid(4);replaced[i].nodes=smaller.nodes;replaced[i].valid=smaller.valid;replaced[i].start=1;}
 compare(replaced,brains);assert.equal(replaced[1]._nativePaintGoalWork.seen.length,16);
 for(const nav of replaced)nav.start=-1;
 assert.deepEqual(Array.from(after(brains[1],{nav:replaced[1]})),[]);
 assert.deepEqual(before(brains[0],{nav:replaced[0]}),[]);
});

test('wide queries skip only exterior hypot calls and still evaluate the exact boundary',()=>{
 const navs=[grid(120),grid(120)],brains=[brain(60,60),brain(60,60)],calls=[0,0],points=[];
 const saved=f.VM_MATH.hypot;
 math.hypot=(...args)=>{calls[0]++;return Math.hypot(...args);};
 f.VM_MATH.hypot=(...args)=>{calls[1]++;points.push(args);return saved(...args);};
 try{compare(navs,brains);}finally{delete math.hypot;f.VM_MATH.hypot=saved;}
 assert.equal(calls[0],14400);assert.equal(calls[1],69*69);
 assert(points.some(([x,z])=>x===34&&z===0),'circle boundary uses original hypot');
 assert(points.some(([x,z])=>x===34&&z===34),'square corner still uses original circle rejection');
});
