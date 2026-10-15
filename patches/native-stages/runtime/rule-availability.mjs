import {SOURCE_STAGES} from './source-catalog.mjs';
/** Local build capability only. This does not classify retail rule availability
 * or prove that compound human jump/climb routes are physically impossible. */
export function nativeStageRuleStatus(id,mode,stages=SOURCE_STAGES){
 const stage=stages.find(s=>s.id===id);if(!stage)return null;
 const status=stage.ruleAvailability?.[mode];
 return {id,mode,name:stage.name,supported:status?.supported!==false,...status};
}
