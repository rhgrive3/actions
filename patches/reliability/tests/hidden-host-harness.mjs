import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {fixture} from './controls-fixture.mjs';
import {RoomDurableObject} from '../../../server/src/index.js';
const {installPlatformGame} = await import(process.env.INKWAVE_CONTROLS_SITE
  ? pathToFileURL(path.resolve(process.env.INKWAVE_CONTROLS_SITE, 'patches/local-quality/platform-game.mjs')).href
  : '../../local-quality/platform-game.mjs');
let ms=1000000;
class Socket {
 constructor(){this.handlers=new Map();this.sent=[];this.live=true;}
 send(data){this.sent.push(data);this.deliver?.(data);}
 addEventListener(k,fn){this.handlers.set(k,fn);}
 receive(data){if(this.live)this.handlers.get('message')?.({data});}
 close(){if(!this.live)return;this.live=false;this.handlers.get('close')?.();this.closed?.();}
}
export async function pair(){
 const relay=new RoomDurableObject({},{}),participants=[];
 async function client(name){const socket=new Socket();relay.handleSession(socket,name);const welcome=JSON.parse(socket.sent.find(x=>x.startsWith('{')&&JSON.parse(x).t==='welcome'));
  const f=await fixture({match:true,network:true,session:true,clock:{now:()=>ms}}),s=new f.NetSession();s.myId=welcome.id;s.hostId=welcome.host;s.state='match';s.code='room';s._members=new Map(welcome.members.map(x=>[x.id,x.name]));s.lobby.players=welcome.members.map(x=>({...x,host:x.id===s.hostId,team:0,ready:true}));
  const m=new f.Match({duration:10,mode:'turf',roster:[],host:s.isHost});m.follower=!s.isHost;m.setState('playing');
  const nm=new f.NetMatch(s,{map:'reef'});s.match=nm;nm.bind(m);let sends=0,physics=0,aborted=0;
  s.tr={broadcast(data){sends++;socket.receive('b|'+JSON.stringify(data));},sendTo(id,data){socket.receive('s|'+id+'|'+JSON.stringify(data));},close(){socket.close();},rtt:0};
  socket.deliver=data=>{if(data.startsWith('m|')){const k=data.indexOf('|',2);s._message(data.slice(2,k),JSON.parse(data.slice(k+1)));}else if(data!=='pong')s._control(JSON.parse(data));};
  socket.closed=()=>s._closed('Connection closed');
  const env=new EventTarget();env.document=new EventTarget();env.document.hidden=false;env.document.hasFocus=()=>true;env.performance={now:()=>ms};env.Date={now:()=>ms};let timerId=0;const timers=new Map();env.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,at:ms+delay});return timerId;};env.clearTimeout=id=>timers.delete(id);env.screen={orientation:new EventTarget()};env.console=console;let rid=0;const raf=new Map();env.requestAnimationFrame=fn=>{raf.set(++rid,fn);return rid;};env.cancelAnimationFrame=id=>raf.delete(id);
  class Game {constructor(){this.match=m;this.settings={frameRate:'display'};this.timer={update(){},disconnect(){}};this.input={padPressed:new Set(),pollPad(){},endFrame(){}};this.showcase={};this.rig={mode:'follow'};this.fpsAcc=this.fpsN=0;this.menus={current:null,setPlatformDriven(){}};} _padMenus(){} _dynRes(){} _loop(){} _frame(dt){f.runSimulation(this,dt);} netMatchAborted(){aborted++;this.match=null;}}
  const game=new Game();Object.assign(f.G,{game,match:m,net:s,mode:'match'});f.G.paint.coverage=()=>[.5,.5];Object.assign(f.G.projectiles,{list:[],bombs:[],clouds:[],beams:[],sights:new Map(),update:()=>physics++});f.installClock(f);installPlatformGame(Game,f.G,env);game._loop();const owner=game.platform.owner;
  const p={f,s,m,nm,game,env,socket,frame(){const entry=raf.entries().next().value;if(entry){raf.delete(entry[0]);entry[1](ms);}},hide(value){env.document.hidden=value;env.document.dispatchEvent(new Event('visibilitychange'));},runTimers(){for(const [id,t] of [...timers])if(t.at<=ms){timers.delete(id);t.fn();}},timerCount(){return timers.size;},snapshot(){return {time:m.time,state:m.state,follower:m.follower,host:s.isHost,sends,physics,raf:raf.size,session:s.state,aborted};},close(){game.disposePlatform();owner.dispose();nm.dispose();}};participants.push(p);return p;
 }
 const host=await client('host'),guest=await client('guest');for(const p of participants){p.s._members=new Map([...relay.members].map(([id,m])=>[id,m.name]));p.s.lobby.players=[...relay.members].map(([id,m])=>({id,name:m.name,host:id===relay.hostId,team:0,ready:true}));}
 function frames(seconds,which=participants){for(let i=0;i<seconds*60;i++){ms+=1000/60;for(const p of participants)p.runTimers();for(const p of which)p.frame();}}
 for(const p of participants)p.frame();return {relay,host,guest,frames,close(){for(const p of participants)p.close();}};
}

export const advanceMillis = value => { ms += value; };
