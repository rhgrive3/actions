import assert from 'node:assert/strict';
export const SECOND_ROWS=[['s3-shelter-wide-01','Shelter_Wide_01','s3-shelter-wide'],['s3-shelter-wide-02','Shelter_Wide_02','s3-shelter-wide'],['s3-shelter-focus-01','Shelter_Focus_01','s3-shelter-focus'],['s3-stringer-short-01','Stringer_Short_01','s3-stringer-short'],['s3-stringer-normal-01','Stringer_Normal_01','s3-stringer-normal'],['s3-stringer-explosion-01','Stringer_Explosion_01','s3-stringer-explosion'],['s3-roller-heavy-01','Roller_Heavy_01','s3-roller-heavy'],['s3-slosher-diffusion-01','Slosher_Diffusion_01','s3-slosher-diffusion']];
const finite=(a,n,label)=>{assert.ok(Array.isArray(a)&&a.length===n,label);assert.ok(a.every(Number.isFinite),label);};
export function validateSecondFrames(frames,group,{states=false}={}){
 const rows=group==='A'?SECOND_ROWS.slice(0,3):group==='B'?SECOND_ROWS.slice(3,6):SECOND_ROWS.slice(6),phases=group==='A'?(states?['initial','open','closed','launched','broken']:['initial','open']):group==='B'?['charge','release']:['rest'];
 const expected=[];for(const [kit,row,base]of rows)for(const role of ['base','variant'])for(const team of [0,1])for(const state of phases)expected.push([kit,role,team,state].join(':'));
 assert.equal(frames.length,expected.length);const actual=[];
 for(const f of frames){const entry=rows.find(([kit,row,base])=>group==='C'?f.baseId===base:f.kit===kit);assert.ok(entry,'exact capture model');const [kit,row,base]=entry;actual.push([kit,f.role,f.team,f.state].join(':'));assert.equal(f.id,f.role==='base'?base:kit);assert.equal(f.baseId,base);if(f.role==='variant')assert.equal(f.variantId,row);else assert.ok(f.variantId==null);assert.equal(f.restored,true);assert.equal(f.grounded,true);assert.ok(f.triangles>0&&Number.isFinite(f.triangles));assert.ok(f.drawCalls>0&&Number.isFinite(f.drawCalls));finite(f.camera.position,3,'camera position');finite(f.camera.quaternion,4,'camera quaternion');
 const hands=group==='A'?[f]:f.hands;assert.equal(hands.length,1);for(const h of hands){assert.equal(h.near,true);assert.equal(h.bodyVisible,true);assert.equal(h.bodyFarVisible,false);finite(h.muzzle,3,'muzzle');finite(h.pivotMatrix,16,'pivot');}
 if(!states)assert.ok(typeof f.png==='string'&&f.png.length>0,'nonempty PNG');
 }
 assert.deepEqual(actual.sort(),expected.sort());return expected.length;
}
