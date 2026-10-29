#!/usr/bin/env node
// Read V8 samples without treating idle time or blocking GL calls as FPS.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

function modulePath(url){
  if(!url)return '';
  try{return decodeURIComponent(new URL(url).pathname).replace(/^\/_versions\/[a-f0-9]+\//,'').replace(/^\//,'');}
  catch{return url;}
}

export function analyzeCpuProfile(profile,{top=30}={}){
  if(!Array.isArray(profile.nodes)||!Array.isArray(profile.samples)||!Array.isArray(profile.timeDeltas)||profile.samples.length!==profile.timeDeltas.length)
    throw Error('Complete V8 sample/timeDelta arrays required');
  const nodes=new Map(),parents=new Map(),frames=new Map(),self=new Map(),inclusive=new Map(),paths=new Map();
  for(const node of profile.nodes){
    if(!Number.isSafeInteger(node.id)||nodes.has(node.id)||!node.callFrame)throw Error('Invalid CPU node');
    nodes.set(node.id,node);
    const c=node.callFrame;
    const frame={module:modulePath(c.url),url:c.url||'',functionName:c.functionName||'',line:c.lineNumber,column:c.columnNumber};
    frames.set(node.id,{...frame,key:JSON.stringify(frame)});
    for(const child of node.children||[]){if(parents.has(child))throw Error('CPU node has multiple parents');parents.set(child,node.id);}
  }
  const scopes={gameFrame:0,matchUpdate:0,render:0,actorResolve:0,sourceMotion:0,respawn:0,garbageCollector:0,idle:0,program:0,glProgramQuery:0};
  const add=(map,key,ms)=>map.set(key,(map.get(key)||0)+ms);
  let sampledMs=0;
  for(let i=0;i<profile.samples.length;i++){
    const id=profile.samples[i],delta=profile.timeDeltas[i];
    if(!nodes.has(id)||!Number.isFinite(delta)||delta<0)throw Error('Invalid CPU sample');
    const ms=delta/1000;sampledMs+=ms;add(self,frames.get(id).key,ms);
    const visited=new Set(),functions=new Set(),stack=[];let node=id;
    while(node!==undefined){
      if(visited.has(node)||!nodes.has(node))throw Error('CPU parent cycle or missing parent');
      visited.add(node);const frame=frames.get(node);stack.push(frame);
      if(!functions.has(frame.key)){add(inclusive,frame.key,ms);functions.add(frame.key);}
      node=parents.get(node);
    }
    const leaf=stack[0],has=(module,name)=>stack.some(f=>f.module===module&&(!name||f.functionName===name));
    if(has('src/main.js','_frame'))scopes.gameFrame+=ms;
    if(has('src/game/match.js','update'))scopes.matchUpdate+=ms;
    if(has('src/core/renderer.js','render'))scopes.render+=ms;
    if(has('src/game/actor.js','_resolve'))scopes.actorResolve+=ms;
    if(stack.some(f=>f.module.startsWith('src/game/motion/')))scopes.sourceMotion+=ms;
    if(has('patches/splatoon3/runtime/respawn-lifecycle.mjs'))scopes.respawn+=ms;
    if(leaf.functionName==='(garbage collector)')scopes.garbageCollector+=ms;
    if(leaf.functionName==='(idle)')scopes.idle+=ms;
    if(leaf.functionName==='(program)')scopes.program+=ms;
    if(leaf.functionName==='getProgramParameter')scopes.glProgramQuery+=ms;
    add(paths,JSON.stringify(stack.reverse().map(f=>f.key)),ms);
  }
  const rows=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,top).map(([key,ms])=>({...JSON.parse(key),ms}));
  return {samples:profile.samples.length,durationMs:(profile.endTime-profile.startTime)/1000,sampledMs,scopes,
    self:rows(self),inclusive:rows(inclusive),hotPaths:[...paths].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([key,ms])=>({ms,frames:JSON.parse(key).map(k=>JSON.parse(k))})),
    limits:['Sample-weighted observed V8 states, not actual CPU thread time, frame distributions or displayed FPS.',
      'Inclusive scopes overlap; a blocking getProgramParameter sample can represent driver wait.',
      'These short normal-RAF windows include cold clip/program creation and cannot identify a steady-state dominant cost by themselves.']};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const outIndex=process.argv.indexOf('--out'),output=outIndex<0?null:process.argv[outIndex+1];
  const inputs=process.argv.slice(2).filter((_,i)=>outIndex<0||i!==outIndex-2&&i!==outIndex-1);
  const reports=inputs.map(file=>{const bytes=fs.readFileSync(file);return {file,sha256:createHash('sha256').update(bytes).digest('hex'),...analyzeCpuProfile(JSON.parse(bytes))};});
  if(output)fs.writeFileSync(output,JSON.stringify(reports,null,2)+'\n');
  console.log(JSON.stringify(reports.map(({file,sha256,durationMs,samples,scopes,self})=>({file,sha256,durationMs,samples,scopes,self:self.slice(0,10)})),null,2));
}
