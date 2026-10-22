import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {adaptMinimapDirty} from '../../minimap-dirty-adapter.mjs';
import {adaptMinimapResources} from '../../../local-quality/minimap-resource-adapter.mjs';
import {installMinimapDirty,_emptyInkDirty} from '../../runtime/minimap-dirty.mjs';
const raw=fs.readFileSync(new URL('../../../../inkwave-public/src/game/minimap.js',import.meta.url),'utf8');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2);return s.replace(a,b);};
export function minimapHarness(installUi){
 const events={},canvases=[];const G={settings:{minimap:true},teamHex:['#ff8a14','#2f5bff'],game:{theme:'day'},match:{attract:false},projectiles:{bombs:[],clouds:[]}};
 const mk=()=>{const canvas={width:0,height:0,id:canvases.length};canvases.push(canvas);const state={},commands=[],stack=[];const ctx=new Proxy({commands,save(){commands.push(['save',[],{...state}]);stack.push({...state});},restore(){commands.push(['restore',[],{...state}]);const prior=stack.pop();for(const key of Object.keys(state))delete state[key];Object.assign(state,prior);},createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData(img,...args){canvas.image=Array.from(img.data);},drawImage(src,...args){if(src===canvases[1])commands.length=0;commands.push(['drawImage',src.id,src.image||null,args,{...state}]);}}, {get(o,k){if(k in o)return o[k];if(k in state)return state[k];return(...args)=>commands.push([k,args,{...state}]);},set(o,k,v){state[k]=v;return true;}});canvas.getContext=()=>ctx;return canvas;};
 const ctx=vm.createContext({console,G,document:{createElement:mk},requestIdleCallback:()=>1,setTimeout:()=>1,on:(n,f)=>events[n]=f});
 let code=adaptMinimapResources('src/game/minimap.js',adaptMinimapDirty('src/game/minimap.js',raw,once));code=code.replace("import { G, on } from '../core/ctx.js';",'').replace("import { SPECIALS, SUB } from '../config.js';","const SPECIALS={slam:{radius:3},storm:{radius:3.4}},SUB={bomb:{radius:3,fuse:1}};").replace('export class Minimap','class Minimap')+'\nglobalThis.M=Minimap;globalThis.fx=fxList;';vm.runInContext(code,ctx);
 class Paint{};installMinimapDirty({Minimap:ctx.M,PaintSystem:Paint});installUi?.({G,Minimap:ctx.M});const paint=new Paint();Object.assign(paint,{grid:new Uint8Array(16),dead:new Uint8Array(16),paintFaces:[],version:0,cell:1,inkDirty:_emptyInkDirty()});
 const face={origin:{x:0,y:0,z:0},n:{x:0,y:1,z:0},u:{x:1,y:0,z:0},v:{x:0,y:0,z:1},su:4,sv:4,nu:4,nv:4,cu:1,cv:1,grid:0,turf:true};paint.paintFaces=[face];const level={bounds:{minX:0,maxX:4,minZ:0,maxZ:4},blocks:[],spawnPads:[]};G.level=level;
 const m=new ctx.M(level,paint,1);let composes=0,rasters=0;const compose=m._compose,ink=m._drawInk;m._compose=function(dt){composes++;return compose.call(this,dt);};m._drawInk=function(...args){rasters++;return ink.apply(this,args);};
 const snapshot=()=>JSON.parse(JSON.stringify({time:m.time,timer:m.timer,flashT:m.flashT,acc:m._composeAcc,dirty:m._composeDirty,animated:m._animatedLast,band:m._band,version:m.version,inkGen:m._inkGen,ink:Array.from(m.inkImg.data),flash:Array.from(m.flashImg.data),owner:Array.from(m.owner),output:canvases[0].getContext().commands}));
 m.update(0,true);return{m,G,paint,face,events,fx:ctx.fx,snapshot,counts:()=>({composes,rasters})};
}
