import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {fixture} from './source-fixture.mjs';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function bindBuild(){
 const root=fileURLToPath(new URL('../../../',import.meta.url)),sourceHashes={};
 for(const name of ['registry','kit','stringers','variants-milk-followup']){const rel='patches/splatoon3/runtime/weapon-models/'+name+'.mjs';sourceHashes[rel]=hash(fs.readFileSync(path.join(root,rel)));}
 if(process.env.INKWAVE_BUILT_SITE){
  const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
  for(const [rel,digest]of Object.entries(sourceHashes))assert.equal(manifest.files[rel.replace('patches/splatoon3/','patch/')],digest,'built input '+rel);
  for(const name of ['registry','kit']){const rel='patches/splatoon3/runtime/weapon-models/'+name+'.mjs';assert.ok(manifest.artifacts[rel]);assert.equal(hash(fs.readFileSync(path.join(site,rel))),manifest.artifacts[rel]);const versioned='_versions/'+manifest.build.revision+'/'+rel;assert.equal(manifest.artifacts[versioned],manifest.artifacts[rel]);assert.equal(hash(fs.readFileSync(path.join(site,versioned))),manifest.artifacts[versioned]);}
 }
 console.log('MIL-K attachment source binding',JSON.stringify(sourceHashes));
}
test('registered MIL-K arrow, nock and strings remain connected with fixed arrow tip across charge and release',async()=>{
 bindBuild();
 const f=await fixture({extraExports:`export {weaponModelSpec} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`}),T=f.THREE;
 const spec=f.weaponModelSpec('Stringer_Short_02'),base=f.weaponModelSpec('s3-stringer-short');assert.ok(spec&&base);
 const d=spec.build({kind:'charger',parts:{}}),b=base.build({kind:'charger',parts:{}}),owned=new Set(),models=[d,b];
 for(const v of models)for(const g of [v.body,v.ink,v.glow,...Object.values(v.parts).map(p=>p.src)])if(g?.attributes)owned.add(g);
 const makeRig=v=>({def:v,ps:{},parts:Object.fromEntries(Object.entries(v.parts).map(([n,p])=>{const o=new T.Object3D();o.geometry=p.src.clone().translate(-p.pivot.x,-p.pivot.y,-p.pivot.z);owned.add(o.geometry);o.position.copy(p.pivot);o.userData.rest=p.pivot.clone();return[n,o];}))});
 const w=makeRig(d),original=makeRig(b),tip=d.bowCfg.arrowFront,tolerance=1e-7;let states=0,maxGap=0,maxStringGap=0,maxTipDrift=0,disposed=0;
 for(const g of owned)g.addEventListener('dispose',()=>disposed++);
 const zExtent=(m,low)=>{let out=low?Infinity:-Infinity;const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);out=low?Math.min(out,v.z):Math.max(out,v.z);}return out;};
 const stringCenter=(name)=>{const part=d.parts[name],p=part.src.attributes.position,target=new T.Vector3(0,d.parts.nock.pivot.y,d.bowCfg.tipZ);let nearest=null,dist=Infinity;for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i),dd=v.distanceTo(target);if(dd<dist){dist=dd;nearest=v;}}assert.ok(dist<tolerance,'authored string has center endpoint');return nearest.sub(part.pivot);};
 try{
  assert.equal(d.bowCfg.arrowNockFit,true);assert.equal(b.bowCfg.arrowNockFit,undefined);assert.notEqual(spec.animate,base.animate,'MIL-K owns its saved shaft-fit compensation without changing the native base animator');assert.equal(spec.sourceRow,'Stringer_Short_02');
  assert.deepEqual(d.muzzle.toArray(),b.muzzle.toArray());for(const n of ['string','stringL','nock','arrow'])assert.deepEqual(d.parts[n].pivot.toArray(),b.parts[n].pivot.toArray());
  const centers={string:stringCenter('string'),stringL:stringCenter('stringL')};
  for(let i=0;i<=120;i++)for(const sinceRelease of [0,.01,.1,.39,1]){
   const state={charge:i/120,sinceRelease};spec.animate(w,state);base.animate(original,state);for(const m of Object.values(w.parts))m.updateMatrixWorld(true);
   assert.equal(w.ps.draw,original.ps.draw,'native draw unchanged');
   for(const n of ['string','stringL','nock'])for(const k of ['position','rotation','scale'])assert.deepEqual(w.parts[n][k].toArray(),original.parts[n][k].toArray(),'native '+n+' '+k);
   const gap=Math.abs(zExtent(w.parts.arrow,true)-zExtent(w.parts.nock,false)),tipDrift=Math.abs(zExtent(w.parts.arrow,false)-tip);maxGap=Math.max(maxGap,gap);maxTipDrift=Math.max(maxTipDrift,tipDrift);assert.ok(gap<tolerance,'arrow/nock gap '+gap);assert.ok(tipDrift<tolerance,'fixed tip drift '+tipDrift);
   for(const n of ['string','stringL']){const gap=centers[n].clone().applyMatrix4(w.parts[n].matrixWorld).distanceTo(w.parts.nock.position);maxStringGap=Math.max(maxStringGap,gap);assert.ok(gap<tolerance,'string/nock gap '+gap);}
   states++;
  }
 }finally{for(const g of owned)g.dispose();assert.equal(disposed,owned.size,'every unique owned geometry disposed exactly once');}
 console.log('MIL-K actual transformed attachment',JSON.stringify({states,maxGap,maxStringGap,maxTipDrift,disposed}));
});
