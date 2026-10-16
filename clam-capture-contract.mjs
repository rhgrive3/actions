import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const states=new Map([['small-field',128],['small-held-1',128],['small-held-7',896],['power-created',288],['power-thrown',288],['power-field',288]]);
const finiteArray=(x,n)=>Array.isArray(x)&&x.length===n&&x.every(Number.isFinite);
const uint32=x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff;
export function validateClamCapture(result) {
 assert.ok(result&&Array.isArray(result.frames),'Missing clam frames');assert.equal(result.frames.length,24,'Expected 24 clam frames');
 const rows=new Map(), receipts=[];
 for(const f of result.frames){
  assert.ok(f&&[0,1].includes(f.team)&&states.has(f.state)&&['near','far'].includes(f.distance),'Unknown clam tuple');
  const key=`${f.team}/${f.state}/${f.distance}`;assert.ok(!rows.has(key),'Duplicate clam tuple');rows.set(key,f);
  assert.equal(f.triangles,states.get(f.state),'Clam triangle budget');assert.equal(f.draws,1,'Clam draw budget');
  assert.ok(f.bounds&&finiteArray(f.bounds.min,3)&&finiteArray(f.bounds.max,3),'Invalid clam bounds');for(let i=0;i<3;i++)assert.ok(f.bounds.max[i]>f.bounds.min[i],'Empty clam bounds');assert.ok(f.bounds.min[1]>=-.012,'Buried clam');
  assert.ok(f.camera&&finiteArray(f.camera.position,3)&&finiteArray(f.camera.quaternion,4),'Invalid clam camera');assert.ok(Math.abs(f.camera.quaternion.reduce((s,x)=>s+x*x,0)-1)<1e-6,'Invalid camera quaternion');
  assert.ok(uint32(f.pixelSignature)&&uint32(f.blankSignature)&&f.pixelSignature!==f.blankSignature,'Blank clam pixels');
  assert.ok(typeof f.png==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(f.png),'Missing clam PNG');
  const png=Buffer.from(f.png.slice('data:image/png;base64,'.length),'base64');assert.ok(png.length>32&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Invalid clam PNG');
  const o=f.observed;assert.ok(o&&o.rootVisible===true,'Clam root not visible');assert.ok(Number.isInteger(o.inventorySmall)&&o.inventorySmall>=0&&o.inventorySmall<=7&&typeof o.inventoryPower==='boolean','Invalid inventory observation');
  const field=f.state.endsWith('-field')||f.state==='power-thrown';
  if(field){assert.equal(o.fieldKind,f.state==='small-field'?'small':'power','Wrong field resource');assert.equal(o.fieldTeam,f.state==='small-field'?null:f.team,'Wrong clam team ownership');assert.equal(o.grounded,f.state!=='power-thrown','Wrong field motion');assert.equal(o.instances,null,'Field is not inventory');assert.equal(o.inventorySmall,0);assert.equal(o.inventoryPower,false);}
  else{assert.equal(o.fieldKind,null);assert.equal(o.fieldTeam,null);assert.equal(o.grounded,null);const n=f.state==='small-held-1'?1:f.state==='small-held-7'?7:0;assert.equal(o.instances,n,'Wrong carried instances');assert.equal(o.inventorySmall,n);assert.equal(o.inventoryPower,f.state==='power-created','Wrong conversion state');}
  receipts.push({...f,png:undefined,pngSHA256:crypto.createHash('sha256').update(png).digest('hex')});
 }
 for(const state of states.keys())for(const distance of ['near','far']){
  const a=rows.get(`0/${state}/${distance}`),b=rows.get(`1/${state}/${distance}`);assert.ok(a&&b,'Missing clam tuple');assert.deepEqual(a.camera,b.camera,'Team comparison camera mismatch');assert.deepEqual(a.bounds,b.bounds,'Team comparison bounds mismatch');
 }
 for(const team of [0,1])for(const state of states.keys())assert.notDeepEqual(rows.get(`${team}/${state}/near`).camera.position,rows.get(`${team}/${state}/far`).camera.position,'Near/far camera did not change');
 return receipts;
}
