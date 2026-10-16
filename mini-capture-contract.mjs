import assert from 'node:assert/strict';
export const MINI_ROWS=[["s3-spinner-quick-01", "Spinner_Quick_01", "s3-spinner-quick", ["charge", "stream"], false], ["s3-spinner-quick-02", "Spinner_Quick_02", "s3-spinner-quick", ["charge", "stream"], false]];
const finite=(a,n,label)=>{assert.ok(Array.isArray(a)&&a.length===n,label);assert.ok(a.every(Number.isFinite),label);};
export function validateMiniFrames(frames,group,{states=false}={}){
 assert.equal(group,'C');const expected=[];for(const[kit,row,base,phases]of MINI_ROWS)for(const role of ['base','variant'])for(const team of [0,1])for(const state of phases)expected.push([kit,role,team,state].join(':'));
 assert.equal(frames.length,expected.length);const actual=[];
 for(const f of frames){const entry=MINI_ROWS.find(([kit,row,base])=>f.rowId===row);assert.ok(entry);const[kit,row,base,phases]=entry;assert.ok(phases.includes(f.state));actual.push([kit,f.role,f.team,f.state].join(':'));assert.equal(f.id,f.role==='base'?base:kit);assert.equal(f.baseId,base);assert.equal(f.variantId,f.role==='base'?null:row);assert.equal(f.restored,true);assert.equal(typeof f.grounded,'boolean');assert.ok(Number.isInteger(f.ticks)&&f.ticks>0);assert.ok(Number.isInteger(f.births)&&f.births>=0);assert.ok(Array.isArray(f.handMotion));assert.ok(Array.isArray(f.handAdmissions)&&f.handAdmissions.length===2&&f.handAdmissions.every(n=>Number.isInteger(n)&&n>=0));
 assert.ok(Number.isFinite(f.maxCharge)&&f.maxCharge>=1);assert.ok(Number.isFinite(f.charge));if(f.state==='charge'){assert.equal(f.births,0);assert.ok(f.charge>=1);}else{assert.ok(f.births>0,'actual stream birth');assert.equal(f.handMotion[0],true);}

 assert.ok(f.triangles>0&&Number.isFinite(f.triangles));assert.ok(f.drawCalls>0&&Number.isFinite(f.drawCalls));finite(f.camera.position,3,'camera');finite(f.camera.quaternion,4,'quaternion');assert.ok(Array.isArray(f.pose)&&f.pose.length>0);finite(f.pose,f.pose.length,'pose');assert.equal(f.hands.length,entry[4]?2:1);for(const h of f.hands){assert.equal(h.near,true);assert.equal(h.bodyVisible,true);assert.equal(h.bodyFarVisible,false);finite(h.muzzle,3,'muzzle');finite(h.pivotMatrix,16,'pivot');}if(!states)assert.ok(typeof f.png==='string'&&f.png.length>0);
 }assert.deepEqual(actual.sort(),expected.sort());return expected.length;
}
