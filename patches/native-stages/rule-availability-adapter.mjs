// Applied after ordinary native availability/world composition, so source- and
// placement-unavailable guards keep their independent responsibilities.
export function adaptNativeRuleAvailability(rel,code){
 const once=(a,b)=>{if(code.split(a).length!==2)throw Error('Native rule availability adapter conflict: '+rel);code=code.replace(a,b);};
 const guard=(id,mode)=>`const nativeRule = nativeStageEnabled ? nativeStageRuleStatus(${id}, ${mode}) : null;`;
 if(rel==='src/main.js'){
  code="import { nativeStageRuleStatus } from '../patches/native-stages/runtime/rule-availability.mjs';\n"+code;
  const offline=`\n    ${guard("o.mapId || this.mapDef?.id","o.mode || 'turf'")}\n    if (nativeRule?.supported === false) { this.menus?.toast?.(nativeRule.name + '：' + nativeRule.reason); return false; }`;
  once('  async _startMenuMatch(o = {}) {','  async _startMenuMatch(o = {}) {'+offline);
  const ordinary='  async startMatch(o = {}, flow = this._beginMatchFlow()) {';
  if(code.includes(ordinary))once(ordinary,'  async startMatch(o = {}, flow = null) {'+offline+'\n    flow ||= this._beginMatchFlow();');
  else once('  async startMatch(o = {}, flow = null) {','  async startMatch(o = {}, flow = null) {'+offline);
  once('  async startNetMatch(cfg, nm) {',`  async startNetMatch(cfg, nm) {\n    ${guard('cfg.map','cfg.mode')}\n    if (nativeRule?.supported === false) throw new RangeError(nativeRule.name + '：' + nativeRule.reason);`);
 }
 if(rel==='src/ui/menus.js'){
  code="import { nativeStageEnabled } from '../../patches/native-stages/runtime/registry.mjs';\nimport { nativeStageRuleStatus } from '../../patches/native-stages/runtime/rule-availability.mjs';\n"+code;
  once('  _startMatch() {',`  _startMatch() {\n    ${guard('this._setup?.mapId',"this._setup?.mode || 'turf'")}\n    if (nativeRule?.supported === false) { this.toast(nativeRule.name + '：' + nativeRule.reason); return; }`);
 }
 if(rel==='src/net/session.js'){
  code="import { nativeStageEnabled } from '../../patches/native-stages/runtime/registry.mjs';\nimport { nativeStageRuleStatus } from '../../patches/native-stages/runtime/rule-availability.mjs';\n"+code;
  once('  startBlock() {',`  startBlock() {\n    ${guard('this.lobby?.map','this.lobby?.mode')}\n    if (nativeRule?.supported === false) return nativeRule.name + '：' + nativeRule.reason;`);
  once('  async _begin(cfg) {',`  async _begin(cfg) {\n    ${guard('cfg.map','cfg.mode')}\n    if (nativeRule?.supported === false) {\n      this.error = nativeRule.name + '：' + nativeRule.reason;\n      this._emit('error', {message:this.error});return false;\n    }`);
 }
 return code;
}
