// Test-only candidates. None of these numeric/visibility shortcuts is wired
// into production without its separate adoption decision.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {INK_PROFILES,INK_LENGTH_SCALE,paintShape} from '../../../inkwave-public/src/game/inkFlight.js';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const cut=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+1);assert(i>=0&&j>i);return s.slice(i,j).trim();};
const median=a=>[...a].sort((x,y)=>x-y)[a.length>>1];
const results={scope:'Node 24; actual source methods with real Three.js vectors; fixture world and effects; no device frame-time claim',comparisons:[]};
function bench(label,a,b,runs=16000){
 for(let i=0;i<1500;i++){a();b();}const A=[],B=[];
 for(let round=0;round<7;round++)for(const [f,list]of round%2?[[b,B],[a,A]]:[[a,A],[b,B]]){const start=performance.now();for(let i=0;i<runs;i++)f();list.push(performance.now()-start);}
 const row={label,runs,baselineMs:A,candidateMs:B,baselineMedianMs:median(A),candidateMedianMs:median(B)};row.changePercent=(row.candidateMedianMs/row.baselineMedianMs-1)*100;results.comparisons.push(row);return row;
}

const weapons=read('../../../inkwave-public/src/game/weapons.js');
const slosh=cut(weapons,'  _sloshSplash(p, at, direct) {','  fireBlaster(');
const blast=cut(weapons,'  _blastBurst(p, at, direct) {','  _updateBombs(');
function axisCandidate(source,slosher){
 const vec=slosher?'_v3':'_v',point=slosher?'at':'c';
 const needle=slosher?'      if (_v3.distanceTo(at) > w.splashRadius + 0.3) continue;':'      const d = _v.distanceTo(c);';
 const guard=`      const rawRadius=Object.getOwnPropertyDescriptor(w,'splashRadius')?.value,range=rawRadius${slosher?'+0.3':''};
      if(typeof rawRadius==='number'&&range>1e-6&&range<1e6&&Number.isFinite(${vec}.x)&&Number.isFinite(${vec}.y)&&Number.isFinite(${vec}.z)&&Number.isFinite(${point}.x)&&Number.isFinite(${point}.y)&&Number.isFinite(${point}.z)&&
       (Math.abs(${vec}.x-${point}.x)>range+1e-8||Math.abs(${vec}.y-${point}.y)>range+1e-8||Math.abs(${vec}.z-${point}.z)>range+1e-8))continue;
`;
 assert(source.includes(needle));return source.replace(needle,guard+needle);
}
function splashWorld(source,kind,far){
 const actors=Array.from({length:8},(_,i)=>({id:i,team:1,alive:true,pos:new T.Vector3((far?70:1)*Math.cos(i),-.6,(far?70:1)*Math.sin(i))}));
 const events=[],G={actors,physics:{los:()=>true,raycast:()=>({hit:false})},camera:{position:new T.Vector3(100,0,100)}};
 const WEAPONS={slosher:{splashRadius:1.1,splashDamage:50},blaster:{splashRadius:2.6,splashDamageMax:60,splashDamageMin:20,burstRadius:3}},p={team:0,owner:{isLocal:false,color:0xff0000},wid:kind};
 const fn=new Function('G','WEAPONS','THREE','UP','DOWN','_v','_v2','_v3','_hit2','emit','lerp','return ({'+source+'}).'+(kind==='slosher'?'_sloshSplash':'_blastBurst'))
  (G,WEAPONS,T,new T.Vector3(0,1,0),new T.Vector3(0,-1,0),new T.Vector3(),new T.Vector3(),new T.Vector3(),{},()=>{},(a,b,t)=>a+(b-a)*t);
 const self={applyHit:(_o,e,d)=>events.push([e.id,d])},at=new T.Vector3();
 return{run(){events.length=0;fn.call(self,p,at,null);},events,actors,WEAPONS};
}
let splashCases=0;
for(const [kind,source]of [['slosher',slosh],['blaster',blast]]){
 const candidate=axisCandidate(source,kind==='slosher');
 for(const far of [false,true]){const a=splashWorld(source,kind,far),b=splashWorld(candidate,kind,far);a.run();b.run();assert.deepEqual(b.events,a.events);bench(`${kind}/${far?'distant':'near'}-8-actors`,()=>a.run(),()=>b.run());}
 const a=splashWorld(source,kind,false),b=splashWorld(candidate,kind,false);
 for(const radius of [0,-1,1.1,2.6,1e-300,Number.MIN_VALUE,Infinity,NaN])for(let i=0;i<120;i++){
  a.WEAPONS[kind].splashRadius=b.WEAPONS[kind].splashRadius=radius;
  for(let j=0;j<8;j++){const x=(i%3===0?1:-1)*(radius+(i%5-2)*Number.EPSILON),y=i%7===0?NaN:j*.01,z=i%11===0?Infinity:0;a.actors[j].pos.set(x,y,z);b.actors[j].pos.set(x,y,z);}
  a.run();b.run();assert.deepEqual(b.events,a.events);splashCases++;
 }
}
results.splashParityCases=splashCases;

const flight=read('../../../inkwave-public/src/game/inkFlightRuntime.js');
const impact=cut(flight,'  impact(p, hit) {','  draw(');
const originalShape=cut(impact,'const speed =','    this.paint(');
const nativeLength=T.Vector3.prototype.length,nativeDot=T.Vector3.prototype.dot;
const ordinary=v=>Object.getPrototypeOf(v)===T.Vector3.prototype&&typeof Object.getOwnPropertyDescriptor(v,'x')?.value==='number'&&typeof Object.getOwnPropertyDescriptor(v,'y')?.value==='number'&&typeof Object.getOwnPropertyDescriptor(v,'z')?.value==='number'&&!Object.hasOwn(v,'length')&&!Object.hasOwn(v,'dot')&&v.length===nativeLength&&v.dot===nativeDot;
const impactCandidate=impact.replace(originalShape,`const velData=Object.getOwnPropertyDescriptor(p,'vel'),normalData=Object.getOwnPropertyDescriptor(hit,'normal');
    let shape;
    if(velData?.value&&normalData?.value&&ordinary(velData.value)&&ordinary(normalData.value)&&Math.abs(normalData.value.y)<.5)
      shape={radius:p.inkProfile.paint.wallRadius*INK_LENGTH_SCALE,stretch:0};
    else {${originalShape.replace('const shape =','shape =')}}`);
function impactWorld(source,wall){
 const shapes=[],G={};const fn=new Function('G','emit','paintShape','INK_LENGTH_SCALE','EPS','T','ordinary','return ({'+source+'}).impact')
  (G,()=>{},paintShape,INK_LENGTH_SCALE,1e-9,T,ordinary);
 const p={vel:new T.Vector3(20,-1,6),start:new T.Vector3(),inkProfile:INK_PROFILES.shooter,inkPhase:1,inkPeak:4,owner:{color:0xffffff},team:0};
 const hit={point:new T.Vector3(3,1,2),normal:new T.Vector3(wall?1:0,wall?0:1,0)},self={paint:(_p,_h,s)=>shapes.push([s.radius,s.stretch])};
 return{run(){shapes.length=0;fn.call(self,p,hit);},shapes,p,hit};
}
for(const wall of [false,true]){const a=impactWorld(impact,wall),b=impactWorld(impactCandidate,wall);a.run();b.run();assert.deepEqual(b.shapes,a.shapes);bench(`InkFlight/${wall?'wall':'floor'}-guarded-trig-skip`,()=>a.run(),()=>b.run());}
let impactCases=0;const ia=impactWorld(impact,true),ib=impactWorld(impactCandidate,true);
for(const y of [-1,-.5-Number.EPSILON,-.5,-.5+Number.EPSILON,-0,0,.5-Number.EPSILON,.5,.5+Number.EPSILON,1,NaN])for(let i=0;i<300;i++){
 for(const w of [ia,ib]){w.hit.normal.y=y;w.p.vel.set(Math.sin(i)*50,i%4?Math.cos(i)*10:0,i*.01);w.p.inkProfile=INK_PROFILES[['shooter','dualies','splatling'][i%3]];w.run();}
 assert.deepEqual(ib.shapes,ia.shapes);impactCases++;
}
results.impactParityCases=impactCases;

const specials=read('../runtime/all-specials.mjs');
const contactSource=cut(specials,'function screenPlayerContact(', 'function lockWailPair(');
const depth=Number(/SCREEN_HALF_DEPTH\s*=\s*([\d.]+)/.exec(specials)?.[1]);assert(Number.isFinite(depth));
const contact=new Function('clamp','SCREEN_HALF_DEPTH',contactSource+';return screenPlayerContact;')((n,a,b)=>Math.max(a,Math.min(b,n)),depth);
function envelope(screen,radius){const n=screen.normal,t=screen.tangent,det=n.x*t.z-n.z*t.x,W=screen.width/2+radius,D=depth+radius;
 if(n.y!==0||t.y!==0||![n.x,n.z,t.x,t.z,W,D,det].every(Number.isFinite)||Math.abs(det)<1e-8||W<0||D<0)return null;
 return{x:(Math.abs(t.z)*D+Math.abs(n.z)*W)/Math.abs(det)+1e-7,z:(Math.abs(t.x)*D+Math.abs(n.x)*W)/Math.abs(det)+1e-7};}
function outside(s,p,v,b){if(!b)return false;const old=p?.pos||v.pos,sheet=p?.screen||s.pos,x0=old.x-sheet.x,x1=v.pos.x-s.pos.x,z0=old.z-sheet.z,z1=v.pos.z-s.pos.z;
 return x0>b.x&&x1>b.x||x0< -b.x&&x1< -b.x||z0>b.z&&z1>b.z||z0< -b.z&&z1< -b.z;}
const rt=()=>({api:{PLAYER:{radius:.35,height:1.7}},v1:new T.Vector3(),v2:new T.Vector3(),v3:new T.Vector3(),v4:new T.Vector3(),v5:new T.Vector3()});
const trace=value=>value?[value.sheet.toArray(),value.player.toArray()]:null;let screenCases=0,skipped=0;
for(let i=0;i<60000;i++){
 const angle=i*.173,n=new T.Vector3(Math.sin(angle),0,Math.cos(angle)),t=new T.Vector3(n.z,0,-n.x),s={normal:n,tangent:t,width:9+i%9,height:4,pos:new T.Vector3(Math.sin(i),0,Math.cos(i))};
 if(i%37===0)n.set(0,0,0);if(i%53===0)t.y=.1;if(i%71===0)n.x=NaN;
 const far=i%4?80:3,v={pos:new T.Vector3(Math.sin(i*.31)*far,i%7-2,Math.cos(i*.23)*far)},p={pos:new T.Vector3(Math.sin(i*.29)*far,i%5-2,Math.cos(i*.25)*far),screen:new T.Vector3()};
 const A=contact(rt(),s,p,v),bound=envelope(s,.35),skip=outside(s,p,v,bound),B=skip?null:contact(rt(),s,p,v);assert.deepEqual(trace(B),trace(A));screenCases++;if(skip)skipped++;
}
results.screenParity={cases:screenCases,skipped};
for(const far of [false,true]){const s={normal:new T.Vector3(0,0,1),tangent:new T.Vector3(1,0,0),width:12,height:4,pos:new T.Vector3()},a=rt(),b=rt();
 const actors=Array.from({length:8},(_,i)=>({pos:new T.Vector3(far?50+i:i-4,0,.01),previous:{pos:new T.Vector3(far?48+i:i-4,0,-.1),screen:new T.Vector3()}}));
 let countA=0,countB=0;
 bench(`Screen/${far?'distant':'near'}-8-actors`,()=>{for(const v of actors)if(contact(a,s,v.previous,v))countA++;},()=>{const bound=envelope(s,.35);for(const v of actors)if(!outside(s,v.previous,v,bound)&&contact(b,s,v.previous,v))countB++;});assert.equal(countB,countA);
}
fs.writeFileSync(new URL('../../../reports/queue-weapons-render-20261030/numeric-adoption-gates.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({parity:{splashCases,impactCases,screenCases,skipped},timing:results.comparisons.map(({label,baselineMedianMs,candidateMedianMs,changePercent})=>({label,baselineMedianMs,candidateMedianMs,changePercent}))},null,2));
