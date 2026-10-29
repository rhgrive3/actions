import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
const special=fs.readFileSync(new URL('../runtime/all-specials.mjs',import.meta.url),'utf8');
const start=special.indexOf("if(typeof projectileStep==='function')P._step="),end=special.indexOf("  if(typeof impact==='function')",start);
const current=special.slice(start,end);
const previous=`P._step=function(p,...args){
 const cause=p?.s3AllSpecial?projectileObjectCause(p):null;
 const advance=()=>p?.s3AllSpecialFlight?stepSourceFlight(this,p,args[0],projectileStep,api.G):projectileStep.call(this,p,...args);
 return cause&&!p?.ghost&&!p?.owner?.remote?withObjectDamageCause(p,advance,cause):advance();
};`;
test('actual special projectile wrapper preserves metadata getter order, scope, forwarding and throws',()=>{
 for(let n=0;n<5000;n++){
  function run(code){
   const log=[],P={},api={G:{}},owner={get remote(){log.push('remote');return !!(n&16);}};
   let reads=0;const p=n%23===0?null:{};
   if(p)for(const key of ['s3AllSpecial','s3AllSpecialFlight','ghost','owner'])Object.defineProperty(p,key,{get(){log.push(key);reads++;return key==='owner'?owner:key==='ghost'?!!(n&8):key==='s3AllSpecial'?!!(n&1):!!((n+reads)&2);}});
   const projectileStep=function(...args){log.push(['native',this===P,args[0]===p,...args.slice(1)]);if(n%7===0)throw Error('native');return 19;};
   const stepSourceFlight=function(system,obj,dt,base,game){log.push(['flight',system===P,obj===p,dt,base===projectileStep,game===api.G]);return base.call(system,obj,dt);};
   const projectileObjectCause=obj=>{log.push(['cause',obj===p]);return n%3?{id:n}:null;};
   const withObjectDamageCause=(obj,fn,cause)=>{log.push(['enter',obj===p,cause.id]);try{return fn();}finally{log.push('leave');}};
   new Function('P','api','projectileStep','stepSourceFlight','projectileObjectCause','withObjectDamageCause',code)(P,api,projectileStep,stepSourceFlight,projectileObjectCause,withObjectDamageCause);
   let result,error;try{result=P._step(p,1/([30,60,120][n%3]),'tail');}catch(e){error=e.message;}
   return {log,result,error};
  }
  assert.deepEqual(run(current),run(previous),`case ${n}`);
 }
});
test('actual Dualies finite guard eagerly reads three actor.pos accessors even on invalid first coordinate',()=>{
 const source=fs.readFileSync(new URL('../runtime/dualies-slide-paint.mjs',import.meta.url),'utf8');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='finiteActorPosition');
 const current=new Function(source.slice(node.start,node.end)+';return finiteActorPosition;')();
 const values=[0,-0,1,NaN,Infinity,-Infinity,null,undefined,'1',{},Symbol('x')];
 for(let n=0;n<1000;n++){
  function run(fn){const log=[];let seq=0;const actor={get pos(){log.push('pos');return new Proxy({},{get(t,key){log.push(key);return values[(n+seq++)%values.length];}});}};return {value:fn(actor),log};}
  assert.deepEqual(run(current),run(actor=>[actor.pos.x,actor.pos.y,actor.pos.z].every(Number.isFinite)));
 }
});
