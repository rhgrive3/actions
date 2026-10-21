// Bots frozen (idle); local player driven by a fixed input script. node parity2.mjs <site> <out> [frames] [dt list]
import fs from 'node:fs';import {openGame} from './probe-lib.mjs';
const [site,out,framesS='900',dts='0.016666666666666666']=process.argv.slice(2);
const g=await openGame(site,{warm:0,freeze:true});if(process.env.NORENDER==='1')await g.page.evaluate(()=>{window.__norender=true;});
const r=await g.page.evaluate(({frames,dts})=>{
 const game=probeG.game,D=game.debug;const buf=new Float64Array(1<<16);const u=new Uint32Array(buf.buffer);
 const H=n=>{let h=2166136261>>>0;for(let i=0;i<n*2;i++){h^=u[i];h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');};
 const snap=()=>{let k=0;const put=v=>{buf[k++]=v;};const cats={};
  for(const a of game.match.actors){put(a.pos.x);put(a.pos.y);put(a.pos.z);put(a.hp);put(a.ink);put(a.form==='squid'?1:0);}cats.actors=H(k);k=0;
  cats.per=game.match.actors.map(a=>{let kk=0;const c=a.character;for(const b of c.boneList){buf[kk++]=b.position.x;buf[kk++]=b.position.y;buf[kk++]=b.position.z;buf[kk++]=b.quaternion.x;buf[kk++]=b.quaternion.y;buf[kk++]=b.quaternion.z;buf[kk++]=b.quaternion.w;buf[kk++]=b.scale.x;}c.root.updateWorldMatrix(true,true);c.root.traverse(o=>{for(const e of o.matrixWorld.elements)buf[kk++]=e;});return H(kk)+':'+(c.sourceMotion?.state||'-')+':'+a.form;});
  cats.pose=cats.per.map(x=>x.split(':')[0]).join('');const cam=probeG.camera;cam.updateMatrixWorld();for(const e of cam.matrixWorld.elements)put(e);cats.cam=H(k);return cats;};
 // input script: phases of ~0.75 s
 const keys=['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft'];const set=on=>{for(const k of keys)D.key(k,on.includes(k));};
 const script=[[['KeyW'],0],[['KeyW'],1],[['KeyW','KeyD'],1],[['KeyD'],0],[['KeyS'],1],[[],1],[['KeyA','KeyW','Space'],0],[['ShiftLeft','KeyW'],0],[['ShiftLeft','KeyA'],0],[[],0],[['KeyW'],1],[['KeyS','KeyA'],0]];
 const hashes=[];const dtl=dts;game._skipRender=window.__norender===true;
 for(let i=0;i<frames;i++){const [ks,fire]=script[Math.floor(i/45)%script.length];set(ks);D.fire(!!fire);
  if(i%45===20)game.input.mouse.dx=(i%90===20?120:-90);
  const d=dtl[i%dtl.length];window.__vc.t+=d*1000;game._frame(d);if(i%5===4){const h=snap();h.f=i+1;hashes.push(h);}}
 set([]);D.fire(false);
 const states={};for(const h of hashes)for(const p of h.per){const s=p.split(':')[1]+':'+p.split(':')[2];states[s]=(states[s]||0)+1;}
 return {hashes,states,local:game.match.local.pos.toArray()};
},{frames:+framesS,dts:dts.split(',').map(Number)});
r.errors=g.errors;fs.writeFileSync(out,JSON.stringify(r));console.log('states',JSON.stringify(r.states),'local',r.local,'errors',g.errors.length);await g.close();
