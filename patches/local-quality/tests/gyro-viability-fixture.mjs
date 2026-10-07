import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {adaptSource} from '../../splatoon3/adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {adaptQualitySource} from '../adapter.mjs';
const ROOT=new URL('../../../',import.meta.url).pathname,BUILT=process.env.INKWAVE_GYRO_VIABILITY_SITE,SRC=BUILT?path.resolve(BUILT):path.join(ROOT,'inkwave-public');
export async function viabilityFixture({orientation=true,motion=true,permission=null}={}) {
 let now=1000,id=0;const timers=new Map(),listeners=new Map(),docListeners=new Map(),prompts=[],answers=[];
 const add=(map,n,f)=>{if(!map.has(n))map.set(n,new Set());map.get(n).add(f);};
 const cls=()=>({set:new Set(),add(k){this.set.add(k);},remove(k){this.set.delete(k);},toggle(k,v){v?this.set.add(k):this.set.delete(k);},contains(k){return this.set.has(k);}});
 const node=()=>({classList:cls(),dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(){},removeEventListener(){},querySelectorAll:()=>[],remove(){},style:{}});
 class Orientation{} class Motion{}
 if(permission!==null)Orientation.requestPermission=()=>{prompts.push('orientation');return permission==='deferred'?new Promise(resolve=>answers.push(resolve)):Promise.resolve(permission);};
 const env={console,AbortController,URL,performance:{now:()=>now},Date:{now:()=>now},isSecureContext:true,
  navigator:{userAgent:'Android test',maxTouchPoints:0},screen:{orientation:{angle:0,addEventListener(){},removeEventListener(){}}},innerWidth:1000,innerHeight:700,
  localStorage:{getItem:()=>null,setItem(){}},document:{hidden:false,documentElement:{lang:'en',classList:cls()},addEventListener:(n,f)=>add(docListeners,n,f),removeEventListener:(n,f)=>docListeners.get(n)?.delete(f)},
  addEventListener:(n,f)=>add(listeners,n,f),removeEventListener:(n,f)=>listeners.get(n)?.delete(f),matchMedia:()=>({matches:false}),
  setTimeout(fn,ms=0){const key=++id;timers.set(key,{fn,due:now+ms});return key;},clearTimeout(key){timers.delete(key);},requestAnimationFrame(){return ++id;},cancelAnimationFrame(){}};
 if(orientation)env.DeviceOrientationEvent=Orientation;if(motion)env.DeviceMotionEvent=Motion;env.window=env;
 const context=vm.createContext(env),modules=new Map();
 const synthetic=(file,values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context,identifier:file});
 function load(requested){
  let file=requested;if(!BUILT&&file.startsWith(path.join(SRC,'patches')+path.sep))file=path.join(ROOT,path.relative(SRC,file));
  if(modules.has(file))return modules.get(file);let mod;
  if(file.endsWith('/src/core/device.js'))mod=synthetic(file,{touchPrimary:false,touchCapable:false,screenAngle:()=>Number(env.screen.orientation.angle)||0});
  else if(file.endsWith('/src/i18n.js'))mod=synthetic(file,{t:x=>x});
  else if(file.endsWith('/src/ui/ui-icons.js'))mod=synthetic(file,{WEAPON_ICONS:{},SUB_ICONS:{},SQUID:'',specialIcon:()=>''});
  else {const rel=path.relative(SRC,file),raw=fs.readFileSync(file,'utf8');const code=BUILT||!file.startsWith(SRC+path.sep)?raw:adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw))));mod=new vm.SourceTextModule(code,{context,identifier:file});}
  modules.set(file,mod);return mod;
 }
 const entry=load(path.join(SRC,'src/core/mobile.js'));await entry.link((spec,from)=>load(path.resolve(path.dirname(from.identifier),spec)));await entry.evaluate();
 const startup=load(path.join(BUILT?SRC:ROOT,'patches/local-quality/gyro-startup.mjs'));await startup.link((spec,from)=>load(path.resolve(path.dirname(from.identifier),spec)));await startup.evaluate();
 const m=new entry.namespace.MobileInput({},{});m.active=true;m.visible=true;m.root=node();m.els={gyro:node()};m.toastEl=node();const notices=[];m.toast=(message)=>notices.push(message);
 const fire=(name,event)=>{for(const cb of [...(listeners.get(name)||[])])cb(event);};
 async function advance(ms){now+=ms;for(let n=0;n<100;n++){const ready=[...timers].filter(([,t])=>t.due<=now);if(!ready.length)break;for(const[key,t]of ready){if(!timers.delete(key))continue;t.fn();}await Promise.resolve();}}
 return {m,env,prompts,answers,notices,advance,timers,fire,prepare:startup.namespace.prepareGyroStartup,start:startup.namespace.startGyroStartup,listenerCount:name=>listeners.get(name)?.size||0,
  orientation(event={}){now+=17;fire('deviceorientation',{alpha:0,beta:0,gamma:0,timeStamp:now,...event});},
  motion(event={}){now+=17;fire('devicemotion',{rotationRate:{alpha:5,beta:3,gamma:2},timeStamp:now,...event});},
  hide(hidden){env.document.hidden=hidden;for(const fn of docListeners.get('visibilitychange')||[])fn();},
  close(){m.destroy();}};
}
