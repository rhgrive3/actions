import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.INKWAVE_NATIVE_GROUNDED_BODY_ASSETS;
const ready=!!root&&fs.existsSync(path.join(root,'shipshape','manifest.json'));
const submitted=[-13.550661417211382,-.08040773048033192,-21.33920497028435];
const previousY=.07275893618633475;
const incoming=[.1518038659605213,-8.690000000000001,.6666783814383702];
const array=value=>Array.from(value.toArray());
const fingerprint=d=>Object.fromEntries(Object.entries(d).filter(([,v])=>ArrayBuffer.isView(v)).map(([k,v])=>[k,crypto.createHash('sha256').update(Buffer.from(v.buffer,v.byteOffset,v.byteLength)).digest('hex')]));
function textures(d){
 const receipt=d.manifest.textureIntegrity;
 for(const[file,expected]of Object.entries(receipt)){
  const bytes=fs.readFileSync(path.join(root,'shipshape',file));
  assert.equal(bytes.length,expected.bytes,file);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected.sha256,file);
 }
 return{count:Object.keys(receipt).length,manifestSha256:crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex')};
}
async function world(){
 const f=await nativeFixture({includeCharacter:true}),d=readStage(root,'shipshape');
 f.G.level=new f.NativeLevel(d);f.G.physics=new f.NativePhysics(f.G.level);f.G.camera=new f.THREE.PerspectiveCamera();
 return{f,d,P:f.G.physics,L:f.G.level};
}
function actor(f){
 const a=new f.Actor({team:0,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 f.G.actors=[a];return a;
}
function contact(f){return{wall:false,ground:false,ceiling:false,wallNormal:new f.THREE.Vector3(),groundNormal:new f.THREE.Vector3(0,1,0),wallBlock:-1,groundBlock:-1,ceilingBlock:-1};}

test('authentic Shipshape captured landing couples the existing source body solver and footprint without changing the source',{skip:!ready},async()=>{
 const{f,d,P}=await world(),before=fingerprint(d),textureBefore=textures(d),reconcile=P.reconcileSourceFootBody;
 const results=[];
 for(const enabled of [false,true]){
  P.reconcileSourceFootBody=enabled?reconcile:undefined;
  const a=actor(f);a.pos.fromArray(submitted);a.vel.fromArray(incoming);a.grounded=false;
  let lands=0;const onLand=a._onLand;a._onLand=function(...args){lands++;return onLand.apply(this,args);};
  const collider=P.collideBody,calls=[];P.collideBody=function(p,r,l,h,...args){const start=array(p),result=collider.call(this,p,r,l,h,...args);calls.push({start,end:array(p),radius:r,lift:l,height:h});return result;};
  try{a._resolve(false,previousY,false,1/60);}finally{P.collideBody=collider;}
  assert(a.grounded&&a.ground.hit);assert.equal(a.ground.block,28955);assert.equal(a.ground.face,28955);
  assert.equal(lands,1,'the real production landing owner runs once');assert.equal(a.vel.y,0);assert.equal(a.landSpeed,incoming[1]*-1);
  assert.deepEqual(calls[0]&&[calls[0].radius,calls[0].lift,calls[0].height],[.35,.35,1.45]);
  assert(P.bodyFits(a.pos,.35,.35,1.45,false),'the historical public .01 fit contract is unchanged');
  assert.equal(P.bodyFits(a.pos,.35,.35,1.45,false,.0001),enabled,'only the post-foot source contact differs');
  if(enabled){assert.equal(calls.length,2);assert(a.contacts.wall);assert.equal(a.contacts.wallBlock,13396);assert(Math.abs(a.pos.y-.009999999776482582)<1e-12);const n=a.contacts.wallNormal;assert(a.vel.x*n.x+a.vel.z*n.z>=-1e-12,'ordinary installed inward wall velocity clipping is retained');}
  results.push({enabled,position:array(a.pos),velocity:array(a.vel),groundBlock:a.ground.block,bodyFitsResolver:P.bodyFits(a.pos,.35,.35,1.45,false,.0001),lands,calls});
 }
 P.reconcileSourceFootBody=reconcile;
 assert.deepEqual(fingerprint(d),before);assert.equal(Object.keys(before).length,10);assert.deepEqual(textures(d),textureBefore);
 console.log('native-source-foot-body '+JSON.stringify({scope:'initial captured source contact and real Actor/Character _resolve component; no full Game or internal correction-path assertion',sourceSha256:d.manifest.sourceSha256,sourceBuffers:before,textures:textureBefore,results}));
});

test('repeated authentic source solves retain prior contact fields and refresh source footprint metadata',{skip:!ready},async()=>{
 const{f,P}=await world(),V=f.THREE.Vector3;
 for(let i=0;i<3;i++){
  const p=new V(-13.550256052754355,.009999999776482582,-21.346448012436802),g=new f.GroundHit();
  P.groundProbe(p.x,p.y,p.z,.35,.3,.24,g,false);assert(g.hit&&g.block===28955);
  const c=contact(f);c.ceiling=true;c.ceilingBlock=123;c.ground=true;c.groundBlock=456;c.groundNormal.set(.1,.9,.2);
  assert(P.reconcileSourceFootBody(p,.35,.35,1.45,c,g,.24,.35,.3,false));
  assert(c.wall&&c.wallBlock===13396);assert(c.ceiling&&c.ceilingBlock===123);assert(c.ground&&c.groundBlock===456);assert.deepEqual(array(c.groundNormal),[.1,.9,.2]);
  assert(P.bodyFits(p,.35,.35,1.45,false,.0001));
  const actual=new f.GroundHit();P.groundProbe(p.x,p.y,p.z,.35,.3,.24,actual,false);
  for(const key of ['hit','y','block','face','u','v','center','grate'])assert.equal(g[key],actual[key],key);
  assert.deepEqual(array(g.normal),array(actual.normal));
  // The base dynamic solver resets contact fields; the cached reconciliation
  // result must not contaminate a later clear source-body solve.
  const clear=p.clone(),fresh=P._sourceFootContacts;
  P.collideBody(clear,.35,.35,1.45,fresh,true,false);
  assert.equal(fresh.wall,false);assert.equal(fresh.ceiling,false);assert.equal(fresh.wallBlock,-1);
 }
});

test('authentic slope, NoPaint collision and dynamic rider support keep their installed owners',{skip:!ready},async()=>{
 const{f,d,P,L}=await world(),before=fingerprint(d),V=f.THREE.Vector3;
 const a=actor(f);a.spawnAt(new V(-18.5,5.1798441621614515,63),0);
 for(let i=0;i<36;i++){f.G.time+=1/60;a.update(1/60);assert(P.bodyFits(a.pos,.35,.35,1.45,false,.0001));}
 assert(a.grounded);assert(Math.abs(a.pos.y-5.34019276666)<1e-6);assert(f.nativeSourceFootSupported(f.G,a,{x:-18.5,y:5.1798441621614515,z:63}));
 let solidNoPaint=-1;for(let i=0;i<d.flags.length;i++)if((d.flags[i]&1)&&!(d.flags[i]&2)&&Math.abs(L.triangleWorld.normals[i*3+1])<.2){solidNoPaint=i;break;}
 assert(solidNoPaint>=0);const t=L.triangleWorld.triangle(solidNoPaint),p=t.a.clone().add(t.b).add(t.c).multiplyScalar(1/3).add(new V(0,-.8,0));
 assert.equal(P.bodyFits(p,.35,.35,1.45,false,.0001),false,'original NoPaint walls remain solid');
 L._addBlock({kind:'box',min:[-14.5,0,-22.5],max:[-12.5,.3,-20.5],paint:false,hidden:true});
 const supported=new V(-13.55,.3,-21.8),g=new f.GroundHit();P.groundProbe(supported.x,supported.y,supported.z,.35,.3,.24,g,false);assert.equal(g.block,L.staticBlockCount);
 const c=contact(f),position=array(supported),state=JSON.stringify({wall:c.wall,ground:c.ground,ceiling:c.ceiling});
 assert(P.reconcileSourceFootBody(supported,.35,.35,1.45,c,g,.24,.35,.3,false));assert.deepEqual(array(supported),position);assert.equal(JSON.stringify({wall:c.wall,ground:c.ground,ceiling:c.ceiling}),state,'dynamic deck remains with the existing dynamic owner');
 assert.deepEqual(fingerprint(d),before);
});

test('a real refreshed source footprint cannot recommit a body beneath a dynamic ceiling',{skip:!ready},async()=>{
 const{f,d,P,L}=await world(),before=fingerprint(d),V=f.THREE.Vector3;
 // This explicit negative box is a dynamic collision fixture, not source
 // geometry or a stage placement. Original source wall/floor remain intact.
 L._addBlock({kind:'box',min:[-14.5,1.4,-22.5],max:[-12.5,2.4,-20.5],paint:false,hidden:true});
 const p=new V(-13.550256052754355,.009999999776482582,-21.346448012436802),g=new f.GroundHit(),c=contact(f);
 P.groundProbe(p.x,p.y,p.z,.35,.3,.24,g,false);assert(g.hit&&g.block===28955);
 assert.equal(P.reconcileSourceFootBody(p,.35,.35,1.45,c,g,.24,.35,.3,false),false);
 assert(c.ceiling,'the real installed dynamic collision reports the ceiling');
 assert.equal(c.ceilingBlock,-1,'the inherited dynamic solver does not publish a ceiling block ID');
 assert(g.hit&&g.block===28955,'the refreshed source footprint remains a real observation');
 assert(p.y<g.y,'a blocked raised pose is not committed as grounded support');
 assert(P.bodyFits(p,.35,.35,1.45,false,.0001));
 assert.deepEqual(fingerprint(d),before);
});
