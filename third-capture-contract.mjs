import assert from 'node:assert/strict';
export const THIRD_ROWS=[["s3-shooter-blaze-01", "Shooter_Blaze_01", "s3-shooter-blaze"], ["s3-shooter-quickmiddle-01", "Shooter_QuickMiddle_01", "s3-shooter-quickmiddle"], ["s3-shooter-short-01", "Shooter_Short_01", "s3-shooter-short"], ["s3-shooter-precision-01", "Shooter_Precision_01", "s3-shooter-precision"], ["s3-saber-normal-01", "Saber_Normal_01", "s3-saber-normal"], ["s3-saber-normal-02", "Saber_Normal_02", "s3-saber-normal"], ["s3-saber-heavy-01", "Saber_Heavy_01", "s3-saber-heavy"], ["s3-saber-lite-02", "Saber_Lite_02", "s3-saber-lite"], ["s3-slosher-launcher-01", "Slosher_Launcher_01", "s3-slosher-launcher"], ["s3-slosher-bathtub-01", "Slosher_Bathtub_01", "s3-slosher-bathtub"]];
const finite=(a,n,label)=>{assert.ok(Array.isArray(a)&&a.length===n,label);assert.ok(a.every(Number.isFinite),label);};
export function validateThirdFrames(frames,group,{states=false}={}){
 const rows=group==='A'?THIRD_ROWS.slice(0,4):group==='B'?THIRD_ROWS.slice(4,8):THIRD_ROWS.slice(8),phases=group==='B'?['charge','release']:['rest'];
 const expected=[];for(const [kit,row,base]of rows)for(const role of ['base','variant'])for(const team of [0,1])for(const state of phases)expected.push([kit,role,team,state].join(':'));
 assert.equal(frames.length,expected.length);const actual=[];
 for(const f of frames){const entry=rows.find(([kit,row,base])=>group==='B'?f.kit===kit:f.baseId===base);assert.ok(entry,'exact capture model');const [kit,row,base]=entry;actual.push([kit,f.role,f.team,f.state].join(':'));assert.equal(f.id,f.role==='base'?base:kit);assert.equal(f.baseId,base);if(f.role==='variant')assert.equal(f.variantId,row);else assert.ok(f.variantId==null);assert.equal(f.restored,true);assert.equal(f.grounded,true);assert.ok(f.triangles>0&&Number.isFinite(f.triangles));assert.ok(f.drawCalls>0&&Number.isFinite(f.drawCalls));finite(f.camera.position,3,'camera position');finite(f.camera.quaternion,4,'camera quaternion');
 const hands=f.hands;assert.equal(hands.length,1);for(const h of hands){assert.equal(h.near,true);assert.equal(h.bodyVisible,true);assert.equal(h.bodyFarVisible,false);finite(h.muzzle,3,'muzzle');finite(h.pivotMatrix,16,'pivot');}
 if(!states)assert.ok(typeof f.png==='string'&&f.png.length>0,'nonempty PNG');
 }
 assert.deepEqual(actual.sort(),expected.sort());return expected.length;
}
