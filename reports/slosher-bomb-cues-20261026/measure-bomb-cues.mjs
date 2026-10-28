// Execute the immutable upstream _bombs method as the counterfactual inside
// the same current production graph. This is not original Nintendo footage.
import fs from 'node:fs';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../scripts/inkwave-source-composition.mjs';
const raw=fs.readFileSync('inkwave-public/src/fx/fxHooks.js','utf8');
const start='  _bombs(P, dt) {',end='  // Ink Tempest clouds:';
const oldMethod=raw.slice(raw.indexOf(start),raw.indexOf(end));
const result={kind:'Executed INKWAVE upstream FX counterfactual, not Nintendo reference',runs:{}};
for(const which of ['base','candidate']){
 const adapt=(rel,source)=>{
  const code=adaptBuildSource(rel,source);if(which!=='base'||rel!=='src/fx/fxHooks.js')return code;
  const a=code.indexOf(start),b=code.indexOf(end);if(a<0||b<=a)throw Error('Native bomb method boundary');
  return code.slice(0,a)+oldMethod+code.slice(b);
 };
 const f=await fixture({fullRuntime:true,realProjectiles:true,adapt,
  extraExports:"export {initFxHooks} from './src/fx/fxHooks.js';"});
 const {G,THREE}=f;G.camera={position:new THREE.Vector3(0,5,0)};
 const calls=[];G.fx=Object.fromEntries(['dangerRing','beepPulse','mark'].map(name=>[name,(...args)=>calls.push({name,position:args[0].toArray(),radius:args[3]})]));
 G.physics.raycast=(from,_dir,_len,h)=>{h.hit=true;h.point.set(from.x,0,from.z);h.normal.set(0,1,0);return h;};
 const hooks=f.initFxHooks(G),ps=G.projectiles,rows={};
 const draw=()=>{calls.length=0;hooks.stamp++;hooks._bombs(ps,1/60);return JSON.parse(JSON.stringify(calls));};
 for(const [weapon,id]of [['roller','curling'],['charger','bomb'],['blaster','autobomb']]){
  ps.clear();const a=f.make(weapon);ps.throwBomb(a);const b=ps.bombs.at(-1);b.pos.set(0,.21,0);b.vel.set(0,0,0);b.fuse=.8;
  if(id==='autobomb'){
   b.fuse=-1;G.physics.segment=(_from,to,h)=>{h.hit=true;h.point.copy(to).setY(0);h.normal.set(0,1,0);return h;};ps._updateBombs(1/60);
  }
  rows[id]={initial:draw()};b.pos.x=3;rows[id].moved=draw();
 }
 result.runs[which]=rows;
}
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(JSON.stringify(result));
