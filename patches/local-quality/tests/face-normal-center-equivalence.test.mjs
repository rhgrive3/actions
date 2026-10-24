import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Exact CPU numerical and geometry equivalence, not browser or visual approval.
test('approved face normal center reuse preserves exact geometry and surface results', async()=>{
const root=fileURLToPath(new URL('../../../',import.meta.url)),up=path.join(root,'inkwave-public');
const sha=b=>createHash('sha256').update(b).digest('hex');
const adapterRel='patches/local-quality/s3-face-look-adapter.mjs',faceRel='src/game/character-face.js';
const adapter=fs.readFileSync(path.join(root,adapterRel),'utf8'),raw=fs.readFileSync(path.join(up,faceRel),'utf8');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'unique inverse target '+a);return s.replace(a,b);};
let oldAdapter=once(adapter,'(out2, reuseCenter = false)','(out2)');
oldAdapter=once(oldAdapter,'    if (reuseCenter && e === el) { _qa.copy(_q0); _noseDn = sDn; }\\n    else { dirAE(az, e, _d); headShape(_d.x, _d.y, _d.z, _qa); }','    dirAE(az, e, _d); headShape(_d.x, _d.y, _d.z, _qa);');
oldAdapter=once(oldAdapter,'fdN(_qn, true);','fdN(_qn);');
assert.equal(sha(oldAdapter),'173dea3ad8f7d9a88accf891654218526bd91502199db7274646f48ed373322e','exact authenticated historical adapter reconstruction');
const currentAdapt=(await import(pathToFileURL(path.join(root,adapterRel)))).adaptS3FaceLook;
const oldAdapt=(await import('data:text/javascript;base64,'+Buffer.from(oldAdapter).toString('base64'))).adaptS3FaceLook;
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
function oldNormal(code){
 code=once(code,'(out2, reuseCenter = false)','(out2)');
 code=once(code,'    if (reuseCenter && e === el) { _qa.copy(_q0); _noseDn = sDn; }\n    else { dirAE(az, e, _d); headShape(_d.x, _d.y, _d.z, _qa); }','    dirAE(az, e, _d); headShape(_d.x, _d.y, _d.z, _qa);');
 return once(code,'fdN(_qn, true);','fdN(_qn);');
}
const sources={direct:currentAdapt(faceRel,raw),production:adaptBuildSource(faceRel,raw)};
assert.equal(oldNormal(sources.direct),oldAdapt(faceRel,raw),'direct inverse equals entire exact old adapter output');
async function realm(source,production){
 const context=vm.createContext({console,performance,URL}),modules=new Map(),loaded=[];
 function load(file){
  if(modules.has(file))return modules.get(file);
  const rel=path.relative(up,file).split(path.sep).join('/');
  let code=file===path.join(up,faceRel)?source:fs.readFileSync(file,'utf8');
  if(file!==path.join(up,faceRel)&&production&&rel.startsWith('src/'))code=adaptBuildSource(rel,code);
  loaded.push({path:file,sourceSha256:sha(code),diskSha256:sha(fs.readFileSync(file))});
  const m=new vm.SourceTextModule(code,{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});modules.set(file,m);return m;
 }
 const f=load(path.join(up,faceRel));await f.link((spec,from)=>load(spec==='three'?path.join(up,'vendor/three/build/three.module.js'):path.resolve(path.dirname(from.identifier),spec)));await f.evaluate();return{f:f.namespace,loaded};
}
const json=x=>JSON.stringify(x),vector=v=>Array.from(v.toArray());
function sample(f,az,el,off,wantNormal){
 const V=f.HEAD_C.constructor,p=new V(),n=wantNormal?new V():undefined;f.headSurfFace(az,el,off,p,n);
 return [...vector(p),...(n?vector(n):[])];
}
const elevations=new Set(Array.from({length:73},(_,i)=>-Math.PI/2+i*Math.PI/72));
for(const a of [-Math.PI/2,-1.555,-1.55,-.312,-.225,-.222,-.138,-.03,0,1.55,1.555,Math.PI/2])for(const d of [-1e-9,0,1e-9])elevations.add(a+d);
const azimuths=new Set(Array.from({length:73},(_,i)=>-Math.PI+i*2*Math.PI/72));
for(const a of [-.2,-.146,-.05,0,.05,.146,.2])for(const d of [-1e-9,0,1e-9])azimuths.add(a+d);
const results=[];
for(const [mode,source]of Object.entries(sources)){
 const current=await realm(source,mode==='production'),old=await realm(oldNormal(source),mode==='production');let samples=0;
 const constants=Object.keys(current.f).filter(k=>typeof current.f[k]!=='function');
 for(const k of constants)assert.equal(json(current.f[k]),json(old.f[k]),mode+' export '+k);
 for(const az of azimuths)for(const el of elevations)for(const off of [0,.003,-.002])for(const n of [false,true]){
  const a=sample(current.f,az,el,off,n),b=sample(old.f,az,el,off,n);assert(a.every(Number.isFinite));assert.deepEqual(a,b,mode+' sample '+[az,el,off,n]);samples++;
 }
 const geometries=[];
 for(let lv=0;lv<=4;lv++){
  const a=current.f.buildFaceSkin(lv),b=old.f.buildFaceSkin(lv),attrs=Object.keys(a.geo.attributes).sort();assert.deepEqual(attrs,Object.keys(b.geo.attributes).sort());let bytes=0;
  const hashes={};
  for(const k of ['index',...attrs]){
   const aa=k==='index'?a.geo.index:a.geo.attributes[k],bb=k==='index'?b.geo.index:b.geo.attributes[k];
   assert.equal(aa.itemSize,bb.itemSize);assert.equal(aa.normalized,bb.normalized);assert.equal(aa.count,bb.count);assert.equal(aa.array.constructor.name,bb.array.constructor.name);
   const av=Buffer.from(aa.array.buffer,aa.array.byteOffset,aa.array.byteLength),bv=Buffer.from(bb.array.buffer,bb.array.byteOffset,bb.array.byteLength);
   assert(av.equals(bv),mode+' lv'+lv+' '+k+' exact bytes');bytes+=av.length;hashes[k]=sha(av);
  }
  assert.equal(json(a.acc),json(b.acc),mode+' full accumulator lv'+lv);
  geometries.push({level:lv,vertices:a.geo.attributes.position.count,indices:a.geo.index.count,attributes:attrs,bytes,hashes,accumulatorSha256:sha(json(a.acc)),accumulatorBytes:Buffer.byteLength(json(a.acc))});a.geo.dispose();b.geo.dispose();
 }
 const row={mode,samples,exportedConstants:constants,geometries,sourceSha256:sha(source),oldSourceSha256:sha(oldNormal(source)),loaded:current.loaded};results.push(row);console.log(JSON.stringify({mode,samples,geometryLevels:geometries.length,exactGeometryBytes:geometries.reduce((n,r)=>n+r.bytes,0),pass:true}));
}
const negatives=[];
for(const [name,from,to]of [['nose-free-reuses-nosed-center','fdN(_qb);','fdN(_qb, true);'],['center-replaced-by-offset','_qa.copy(_q0);','_qa.copy(_q1);']]){
 const ref=await realm(sources.production,true),bad=await realm(once(sources.production,from,to),true);let mismatch=null;
 outer:for(let ai=0;ai<=60;ai++)for(let ei=0;ei<=80;ei++){
  const az=-.3+ai*.01,el=-.32+ei*.004,a=sample(ref.f,az,el,.003,true),b=sample(bad.f,az,el,.003,true);
  if(json(a)!==json(b)){mismatch={az,el,reference:a,mutant:b};break outer;}
 }
 assert(mismatch,name+' must be rejected by exact numerical oracle');negatives.push({name,rejected:true,firstMismatch:mismatch});console.log(JSON.stringify(negatives.at(-1)));
}
const report={frozenHead:'7f863ea2d65671abd1453fdae1b61de00f1d10e2',scope:'CPU exact numerical and geometry equivalence only, no browser/GPU/visual approval',node:process.version,root,adapterSha256:sha(adapter),oldAdapterSha256:sha(oldAdapter),inputSha256:sha(raw),results,negatives};
assert.equal(sha(fs.readFileSync(path.join(root,adapterRel))),report.adapterSha256);assert.equal(sha(fs.readFileSync(path.join(up,faceRel))),report.inputSha256);
console.log('FACE_EQUIVALENCE_PRIVATE_PASS');
});
