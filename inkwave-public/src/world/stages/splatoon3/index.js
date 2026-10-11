import { STAGE25_CATALOG, STAGE25_BY_ID } from './catalog.js';
import { normalizeStageRule, makeRuleData, validateRuleData, STAGE_RULES } from './rules.js';
import { build as scorch } from './scorch.js';
import { build as eeltail } from './eeltail.js';
import { build as hagglefish } from './hagglefish.js';
import { build as undertow } from './undertow.js';
import { build as mincemeat } from './mincemeat.js';
import { build as hammerhead } from './hammerhead.js';
import { build as museum } from './museum.js';
import { build as mahi } from './mahi.js';
import { build as inkblot } from './inkblot.js';
import { build as sturgeon } from './sturgeon.js';
import { build as mako } from './mako.js';
import { build as wahoo } from './wahoo.js';
import { build as brinewater } from './brinewater.js';
import { build as flounder } from './flounder.js';
import { build as umami } from './umami.js';
import { build as manta } from './manta.js';
import { build as barnacle } from './barnacle.js';
import { build as humpback } from './humpback.js';
import { build as crableg } from './crableg.js';
import { build as shipshape } from './shipshape.js';
import { build as robo } from './robo.js';
import { build as bluefin } from './bluefin.js';
import { build as marlin } from './marlin.js';
import { build as lemuria } from './lemuria.js';
import { build as urchin } from './urchin.js';

const builders={scorch,eeltail,hagglefish,undertow,mincemeat,hammerhead,museum,mahi,inkblot,sturgeon,mako,wahoo,brinewater,flounder,umami,manta,barnacle,humpback,crableg,shipshape,robo,bluefin,marlin,lemuria,urchin};
const cache=new Map();
export { STAGE_RULES, STAGE25_CATALOG, normalizeStageRule };
export const isStage25=id=>STAGE25_BY_ID.has(id);
export function fingerprint(value) {
  // Compatibility checksum, not a cryptographic signature.
  let h=0x811c9dc5;for(const c of JSON.stringify(value)){h^=c.charCodeAt(0);h=Math.imul(h,0x01000193);}
  return (h>>>0).toString(16).padStart(8,'0');
}
export function getStageLayout(id,rule='turf') {
  if(!isStage25(id))throw new RangeError(`Unknown Splatoon 3 stage: ${id}`);
  rule=normalizeStageRule(rule);const key=`${id}:${rule}`;
  if(!cache.has(key)) {
    const layout=builders[id](STAGE25_BY_ID.get(id),rule);
    layout.ruleData=makeRuleData(layout,layout.objectiveSpec);
    layout.compatibilityHash=fingerprint({stage:id,rule,revision:layout.revision,bounds:layout.bounds,geometry:layout.single,ruleData:layout.ruleData,gimmicks:layout.gimmicks||[]});
    layout.validationErrors=validateRuleData(layout,layout.ruleData);
    cache.set(key,layout);
  }
  return cache.get(key);
}
export function getStageRuleData(id,rule='turf',{requireVerified=false}={}) {
  const d=getStageLayout(id,rule).ruleData;
  if(requireVerified&&!d.originalVerified)throw new Error(`${id}/${rule}: original rule placements are not verified`);
  return d;
}
export function stageDescriptor(id,rule='turf') {
  if(!isStage25(id))return null;
  const l=getStageLayout(id,rule);
  return {stageId:id,rule:l.layoutRule,schemaVersion:1,revision:l.revision,hash:l.compatibilityHash};
}
export function assertStageCompatibility(id,remote) {
  if(!isStage25(id))return true;
  if(!remote||remote.stageId!==id)throw new Error('Stage layout descriptor missing or mismatched. All peers must use the same stage25 build.');
  const local=stageDescriptor(id,remote.rule);
  if(local.hash!==remote.hash||local.revision!==remote.revision||remote.schemaVersion!==1)throw new Error(`Stage version mismatch: ${id}`);
  return true;
}
export const STAGE25_LAYOUTS=Object.fromEntries(STAGE25_CATALOG.map(s=>[s.id,getStageLayout(s.id)]));
