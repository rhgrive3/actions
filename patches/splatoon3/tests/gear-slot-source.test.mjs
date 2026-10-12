import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {abilityAllowed,ABILITIES} from '../runtime/gear.mjs';
// Pinned 11.3.0 primary table. ConsistsOfChip describes crafting ingredients,
// not active AP bonuses; only KindLimit is used by this slot-admission test.
// https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/spl__GearSkillTraitsParam.spl__GearSkillTraitsParam.json
const sourceRows={none:'None',haunt:'DeathMarking',thermalInk:'ThermalInk',respawnPunisher:'Exorcist',abilityDoubler:'ExSkillDouble',objectShredder:'ObjectEffect_Up',ninjaSquid:'SquidMoveSpatter_Reduction',tenacity:'MinorityUp',lastDitchEffort:'EndAllUp',comeback:'ComeBack',openingGambit:'StartAllUp',subResistance:'SubEffect_Reduction',runSpeed:'HumanMove_Up',swimSpeed:'SquidMove_Up',inkSaverMain:'MainInk_Save',inkSaverSub:'SubInk_Save',inkRecovery:'InkRecovery_Up',inkResistance:'OpInkEffect_Reduction',actionIntensify:'Action_Up',specialCharge:'SpecialIncrease_Up',specialPower:'SpecialSpec_Up',specialSaver:'RespawnSpecialGauge_Save',quickRespawn:'RespawnTime_Save',quickSuperJump:'JumpTime_Save',stealthJump:'SuperJumpSign_Hide',dropRoller:'SomersaultLanding',subPower:'SubSpec_Up'};
test('all 27 equipment IDs enforce the immutable 11.3.0 gear-kind limits',()=>{
 const raw=fs.readFileSync(new URL('../reference/gear-traits-1130.json',import.meta.url));
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'853f8eb25077ec5d7017a7ec1da3b9cddf4b0ddba5f7c361f2fd51f7a12d0a57');
 const traits=JSON.parse(raw).Traits;assert.deepEqual(new Set(Object.keys(sourceRows)),new Set(Object.keys(ABILITIES)));assert.deepEqual(new Set(Object.values(sourceRows)),new Set(Object.keys(traits)));
 for(const[id,row]of Object.entries(sourceRows))for(let piece=0;piece<3;piece++)for(let slot=0;slot<4;slot++){
  const kind=traits[row].KindLimit,expected=kind==='None'||slot===0&&piece===['Head','Clothes','Shoes'].indexOf(kind);
  assert.equal(abilityAllowed(id,piece,slot,'splatfestTee'),expected,`${id} ${kind} ${piece}/${slot}`);
 }
 assert.equal(abilityAllowed('abilityDoubler',1,0,undefined),false);
});
