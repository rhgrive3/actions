import assert from 'node:assert/strict';
export const VARIANT_IDS=Object.freeze(["Charger_Keeper_01", "Charger_Light_01", "Charger_LongScope_01", "Charger_Long_01", "Charger_NormalScope_01", "Charger_NormalScope_02", "Charger_Normal_01", "Charger_Normal_02", "Charger_Pencil_01", "Charger_Quick_01", "Maneuver_Short_02", "Roller_Heavy_01", "Saber_Heavy_01", "Saber_Lite_02", "Saber_Normal_01", "Saber_Normal_02", "Shelter_Focus_01", "Shelter_Normal_01", "Shelter_Wide_01", "Shelter_Wide_02", "Shooter_Blaze_01", "Shooter_Precision_01", "Shooter_QuickMiddle_01", "Shooter_Short_01", "Slosher_Bathtub_01", "Slosher_Diffusion_01", "Slosher_Launcher_01", "Slosher_Washtub_01", "Stringer_Explosion_01", "Stringer_Normal_01", "Stringer_Normal_02", "Stringer_Short_01", "Stringer_Short_02"]);
export function validateVariantPlan(plan){
 assert.match(plan.candidateHead,/^[a-f0-9]{40}$/);assert.match(plan.candidateTree,/^[a-f0-9]{40}$/);
 assert.match(plan.baseHead,/^[a-f0-9]{40}$/);assert.match(plan.baseTree,/^[a-f0-9]{40}$/);
 assert.deepEqual([...plan.variantIds].sort(),VARIANT_IDS,'Only the thirty-three approved variants');
 assert.equal(new Set(plan.variantIds).size,33);
 assert.equal(plan.baseModelCount,65,'Existing base catalog remains intact');
 assert.ok(Array.isArray(plan.payload)&&plan.payload.length>0);
 assert.equal(new Set(plan.payload.map(x=>x.path)).size,plan.payload.length,'No duplicate payload paths');
 for(const x of plan.payload){assert.ok(typeof x.path==='string'&&!x.path.startsWith('/')&&x.path.split('/').every(c=>c&&c!=='.'&&c!=='..'));assert.match(x.sha256,/^[a-f0-9]{64}$/);assert.match(x.blob,/^[a-f0-9]{40}$/);}
 assert.match(plan.registrySHA256,/^[a-f0-9]{64}$/,'Reviewed production emitted registry hash');
 for(const mode of ['source','emitted']){const gate=plan.testGates?.[mode];assert.ok(Array.isArray(gate?.files)&&gate.files.length>0);assert.equal(new Set(gate.files).size,gate.files.length);assert.ok(Number.isInteger(gate.pass)&&gate.pass>0);assert.equal(gate.skipped,0);for(const p of gate.files)assert.match(p,/^patches\/[a-z0-9-]+\/tests\/[a-z0-9-]+\.test\.mjs$/);}
 return plan;
}
