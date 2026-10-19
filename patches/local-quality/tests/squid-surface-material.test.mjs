import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adaptS3SquidLook} from '../s3-squid-look-adapter.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
const raw=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
test('squid eye material addition preserves entire human eye factory and owns disposal',()=>{
 const s=raw('src/game/character-mats.js'),o=adaptS3SquidLook('src/game/character-mats.js',s);
 const start=s.indexOf('export function makeEyeMaterial('),end=s.indexOf('export function makeSquidMaterial(');
 assert(o.includes(s.slice(start,end)),'human eye shader bytes unchanged');
 assert.throws(()=>adaptS3SquidLook('src/game/character-mats.js',o),/conflict/);
 const c=adaptS3SquidLook('src/game/character.js',raw('src/game/character.js'));
 assert(c.includes('new THREE.Mesh(sh.eyes, this.mats.squidEye)'));
 assert(c.includes("'eye', 'squidEye', 'fill'"));
 const geo=adaptS3SquidLook('src/game/character-geo.js',raw('src/game/character-geo.js'));assert(geo.includes('(g.attributes.position.getY(i)-0.112)/0.068'),'pupils use common authored height, not per-column stretched v');assert(o.includes('vec2(0.25,0.46)'));assert(o.includes('vec2(-0.34,0.35)')); 
});
test('actual source-loaded actor isolates squid eyes at all LODs and disposes once',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4});const a=await f.make(),c=a.character;
 assert.equal(c.mats.squid.roughness,.22);assert.equal(c.mats.squid.sheen,0);assert.equal(c.mats.squid.metalness,0);assert.equal(c.mats.squid.clearcoat,1);
 assert(c.mats.eye!==c.mats.squidEye);assert.equal(c.squid.eyes.material,c.mats.squidEye);
 for(const lod of ['hero','game','far']){c.setLod(lod);assert.equal(c.squid.eyes.material,c.mats.squidEye);
  const eye=c.squid.eyes.geometry;assert.equal(eye.userData.squidConnectedEye,true);const ep=eye.attributes.position,en=eye.attributes.normal;const euv=eye.attributes.uv;const columns=(lod==='far'?16:32)+1;for(let j=0;j<ep.count;j++){const mirror=Math.floor(j/columns)*columns+columns-1-j%columns;assert(Math.hypot(ep.getX(j)+ep.getX(mirror),ep.getY(j)-ep.getY(mirror),ep.getZ(j)-ep.getZ(mirror))<.00005,'neutral eye field mirrors within sampling tolerance');assert(Math.hypot(euv.getX(j)+euv.getX(mirror),euv.getY(j)-euv.getY(mirror))<.00005,'neutral pupil UVs mirror');}let center=0,front=0;for(let j=0;j<ep.count;j++){if(Math.abs(ep.getX(j))<.005)center++;front+=en.getZ(j);}assert(center>0,'white field crosses center');assert(front/en.count>.4,'eye normals point outward');const adj=Array.from({length:ep.count},()=>[]);for(let j=0;j<eye.index.count;j+=3){const tri=[0,1,2].map(k=>eye.index.getX(j+k));for(const a of tri)for(const b of tri)adj[a].push(b);}const seen=new Set([0]),todo=[0];while(todo.length){for(const n of adj[todo.pop()])if(!seen.has(n)){seen.add(n);todo.push(n);}}assert.equal(seen.size,ep.count,'one connected white eye surface');
  const g=c.squid.body.geometry,p=g.attributes.position,e=g.attributes.aEx,col=g.attributes.color,uv=g.attributes.uv;
  let mantleMinY=Infinity,mantleMaxY=-Infinity,mantleMaxX=0;let maxDepth=0,shortMin=Infinity,shortMax=-Infinity,shortN=0;const ids=new Set(),roots=new Map();
  for(let i=0;i<p.count;i++){
   assert(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)));
   if(e.getX(i)===0){maxDepth=Math.max(maxDepth,Math.abs(p.getZ(i)));mantleMinY=Math.min(mantleMinY,p.getY(i));mantleMaxY=Math.max(mantleMaxY,p.getY(i));mantleMaxX=Math.max(mantleMaxX,Math.abs(p.getX(i)));}
   const k=Math.round(col.getZ(i)*10)%10;if(e.getX(i)>.5&&e.getX(i)!==2){ids.add(k);if(uv.getX(i)<.001){const v=roots.get(k)||[0,0];v[0]+=p.getX(i);v[1]++;roots.set(k,v);}}
   if(e.getX(i)!==0&&e.getX(i)!==2&&k!==0&&k!==9&&uv.getX(i)>.65){shortMin=Math.min(shortMin,p.getX(i));shortMax=Math.max(shortMax,p.getX(i));shortN++;}
  }
  assert.deepEqual([...ids].sort((a,b)=>a-b),[0,2,4,6,8,9],'six semantic arm IDs');
  const rootX=k=>{const r=roots.get(k);assert(r&&r[1]>0);return r[0]/r[1];};assert(rootX(0)>.085&&rootX(9)<-.085,'long roots attach outside');for(const k of [2,4,6,8])assert(Math.abs(rootX(k))<.07,'four short supports sit inside long roots');
  assert(mantleMaxY>.414&&mantleMaxY<.416,'measured shoulder-relative cap height');assert(mantleMaxX>.225&&mantleMaxX<.245,'measured wider cap');assert(g.userData.squidCompactSupports);let wingY=0,wingN=0;for(let i=0;i<p.count;i++)if(e.getX(i)===0&&Math.abs(p.getX(i))>mantleMaxX-.001){wingY+=p.getY(i);wingN++;}const shoulderRatio=(wingY/wingN-.111)/(mantleMaxX*2);assert(shoulderRatio>.025&&shoulderRatio<.105,'frontal shoulder/eye vertical relationship');
  assert(mantleMinY>.005&&mantleMinY<.007,'lower mantle closure shortened beneath eye field');
  assert(maxDepth<.074&&maxDepth>.065,'flattened mantle preserves nonzero thickness');
  assert(shortN>0&&shortMax-shortMin<.17,'short tips form a compact group');
  assert(g.index.count/3<18000,'bounded triangle cost');
 }
 const g=c.squid.body.geometry,co=g.attributes.color,ex=g.attributes.aEx;let marked=0,cups=0;for(let i=0;i<co.count;i++)if(ex.getX(i)>.5&&co.getX(i)<-.05){const arm=Math.round(co.getZ(i)*10)%10;assert(arm===0||arm===9,'only two long feelers carry dark coating');marked++;if(ex.getX(i)===2)cups++;}assert(marked>0);for(let i=0;i<co.count;i++)if(ex.getX(i)===2){const k=Math.round(co.getZ(i)*10)%10;assert(k===0||k===9,'short lobes omit microcup geometry');}
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>'};
 c.mats.squidEye.onBeforeCompile(shader);assert(shader.fragmentShader.includes('float pupil='));assert(!shader.fragmentShader.includes('uIris'));assert(!shader.fragmentShader.includes('sin(ang'));
 // Human gaze can be stale on entry to squid form; it must not move painted pupils.
 const compiled=[];for(const look of [[0,0],[-.22,.157254],[.22,-.157254]]){
  c.u.uLook.value.set(...look);const before=c.u.uLook.value.toArray();
  const probe={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>'};
  c.mats.squidEye.onBeforeCompile(probe);assert(!probe.fragmentShader.includes('uLook'));assert(!('uLook' in probe.uniforms));assert.deepEqual(c.u.uLook.value.toArray(),before,'human gaze unchanged');compiled.push(probe.fragmentShader);
 }assert.equal(compiled[0],compiled[1]);assert.equal(compiled[1],compiled[2]);
 // The authored paired ellipse signed distances mirror exactly, independent of pose.
 const pupilDistance=(x,y)=>Math.min(Math.hypot((x+.34)/.25,(y-.35)/.46),Math.hypot((x-.34)/.25,(y-.35)/.46))-1;
 for(let y=-1;y<=1;y+=.025)for(let x=0;x<=1;x+=.025)assert(Math.abs(pupilDistance(x,y)-pupilDistance(-x,y))<1e-12);
 const bodyShader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>'};c.mats.squid.onBeforeCompile(bodyShader);assert(bodyShader.fragmentShader.includes('smoothstep(0.05,0.25,cs)'));assert(bodyShader.fragmentShader.includes('fwidth(d),0.03'));assert(!bodyShader.fragmentShader.includes('material.specularColor *= iwST'),'squid dielectric highlight is not team-tinted');
 let disposed=0;c.mats.squidEye.addEventListener('dispose',()=>disposed++);f.reset();assert.equal(disposed,1);
});

test('long-arm widening preserves roots, peak and distal profile with smooth bounded transition',()=>{
 const geo=adaptS3SquidLook('src/game/character-geo.js',raw('src/game/character-geo.js'));
 const line=geo.split('\n').find(l=>l.includes('const radius = (t) => lerp(feeler ? 0.0255'));
 assert(line);const expr=line.slice(line.indexOf('=>')+2).trim().replace(/;$/,'');
 const lerp=(a,b,t)=>a+(b-a)*t,gauss=(x,s)=>Math.exp(-((x/s)**2)),sstep=(a,b,t)=>{t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t);};
 const radius=new Function('t','feeler','lerp','gauss','sstep','return '+expr);
 const old=t=>lerp(.0255,.0062,t**.78)*(1+.08*gauss(t-.2,.1)+4.5*gauss(t-.74,.24))*lerp(1,.6,sstep(.9,1,t));
 let oldPeak=0,newPeak=0;for(let i=0;i<=10000;i++){const t=i/10000,r=radius(t,true,lerp,gauss,sstep),delta=r-old(t);assert(delta>=-1e-12&&delta<=.006000001);if(t<=.10||t>=.65)assert(Math.abs(delta)<1e-12);oldPeak=Math.max(oldPeak,old(t));newPeak=Math.max(newPeak,r);}
 assert(Math.abs(oldPeak-newPeak)<1e-12);assert(radius(.4,true,lerp,gauss,sstep)>old(.4)*1.2);
 for(const t of [.1,.65]){const h=1e-5,d=x=>radius(x,true,lerp,gauss,sstep)-old(x);assert(Math.abs((d(t+h)-d(t-h))/(2*h))<1e-6);}
});
