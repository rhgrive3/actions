import assert from 'node:assert/strict';
export function validateCarrierCapture(result){
 assert.equal(result?.frames?.length,4,'Four carrier frames');const seen=new Set();
 for(const f of result.frames){assert.ok([0,1].includes(f.team)&&['small7','power'].includes(f.state),'Carrier tuple');const k=f.team+'/'+f.state;assert.ok(!seen.has(k),'Duplicate carrier tuple');seen.add(k);
  assert.ok(Number.isInteger(f.pixelSignature)&&Number.isInteger(f.blankSignature)&&f.pixelSignature!==f.blankSignature,'Visible inventory pixels');assert.ok(Number.isFinite(f.maxProjected)&&f.maxProjected>=0&&f.maxProjected<.96,'Inventory clipping');for(const k of ['min','max'])assert.ok(f.bounds?.[k]?.length===3&&f.bounds[k].every(Number.isFinite),'Inventory bounds');for(let i=0;i<3;i++)assert.ok(f.bounds.max[i]>f.bounds.min[i],'Empty inventory bounds');
  assert.equal(f.objectiveTriangles,f.state==='power'?288:896,'Carrier objective triangles');assert.equal(f.objectiveDraws,1,'Carrier objective draws');
  assert.equal(f.poseFinite,true,'Finite native pose');assert.ok(Math.abs(f.clockDelta-.5)<1e-6&&Math.abs(f.kidDelta-.5)<1e-6,'Native carrier clocks');
  for(const k of ['inventoryPosition','actorPosition'])assert.ok(Array.isArray(f[k])&&f[k].length===3&&f[k].every(Number.isFinite),'Carrier position');
  assert.ok(Math.abs(f.inventoryPosition[0]-f.actorPosition[0])<1e-6&&Math.abs(f.inventoryPosition[2]-f.actorPosition[2]+.72)<1e-6,'Rear carrier position');assert.ok(Math.abs(f.inventoryPosition[1]-f.actorPosition[1]-(f.state==='power'?.34:.16))<1e-6,'Carrier height');
  assert.ok(Number.isInteger(f.triangles)&&f.triangles>0&&Number.isInteger(f.draws)&&f.draws>0,'Visible carrier work');
  assert.ok(f.camera?.position?.length===3&&f.camera?.quaternion?.length===4&&[...f.camera.position,...f.camera.quaternion].every(Number.isFinite),'Carrier camera');assert.ok(Math.abs(f.camera.quaternion.reduce((v,n)=>v+n*n,0)-1)<1e-6,'Carrier quaternion');
  assert.ok(typeof f.png==='string'&&f.png.startsWith('data:image/png;base64,'),'Carrier image');
 }
 for(const state of ['small7','power'])assert.deepEqual(result.frames.find(f=>f.team===0&&f.state===state).camera,result.frames.find(f=>f.team===1&&f.state===state).camera,'Same carrier camera');
 return true;
}
