import assert from 'node:assert/strict';
export const FIFTH_ROWS=[["charger-01", "Charger_Normal_01", "charger"], ["s3-charger-normalscope-01", "Charger_NormalScope_01", "s3-charger-normalscope"], ["s3-charger-long-01", "Charger_Long_01", "s3-charger-long"], ["s3-charger-longscope-01", "Charger_LongScope_01", "s3-charger-longscope"], ["s3-charger-keeper-01", "Charger_Keeper_01", "s3-charger-keeper"], ["s3-charger-light-01", "Charger_Light_01", "s3-charger-light"], ["s3-charger-pencil-01", "Charger_Pencil_01", "s3-charger-pencil"], ["charger-02", "Charger_Normal_02", "charger"], ["s3-charger-normalscope-02", "Charger_NormalScope_02", "s3-charger-normalscope"]];
const finite=(a,n,label)=>{assert.ok(Array.isArray(a)&&a.length===n,label);assert.ok(a.every(Number.isFinite),label);};
export function validateFifthFrames(frames,group,{states=false}={}){
 assert.equal(group,'B');const rows=FIFTH_ROWS,phases=['charge','release'];
 const expected=[];for(const [kit,row,base]of rows)for(const role of ['base','variant'])for(const team of [0,1])for(const state of phases)expected.push([kit,role,team,state].join(':'));
 assert.equal(frames.length,expected.length);const actual=[];
 for(const f of frames){const entry=rows.find(([kit,row,base])=>group==='B'?f.kit===kit:f.baseId===base);assert.ok(entry,'exact capture model');const [kit,row,base]=entry;actual.push([kit,f.role,f.team,f.state].join(':'));assert.equal(f.id,f.role==='base'?base:kit);assert.equal(f.baseId,base);if(f.role==='variant')assert.equal(f.variantId,row);else assert.ok(f.variantId==null);assert.equal(f.restored,true);assert.equal(f.grounded,true);assert.ok(f.triangles>0&&Number.isFinite(f.triangles));assert.ok(f.drawCalls>0&&Number.isFinite(f.drawCalls));finite(f.camera.position,3,'camera position');finite(f.camera.quaternion,4,'camera quaternion');
 const hands=f.hands;assert.equal(hands.length,1);for(const h of hands){assert.equal(h.near,true);assert.equal(h.bodyVisible,true);assert.equal(h.bodyFarVisible,false);finite(h.muzzle,3,'muzzle');finite(h.pivotMatrix,16,'pivot');}
 if(!states)assert.ok(typeof f.png==='string'&&f.png.length>0,'nonempty PNG');
 }
 assert.deepEqual(actual.sort(),expected.sort());return expected.length;
}
