// QA-only. A captured FX alias must observe resets without changing Math.random identity.
export function installStableScenarioRandom(){
 const env=globalThis;
 const existing=env.__iwStableScenarioRandom;
 if(existing){if(env.Math.random!==existing.random)throw Error('QA Math.random identity replaced');return;}
 const validSeed=seed=>typeof seed==='number'&&Number.isFinite(seed)&&Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff;
 let current={seed:0x49574b33,state:0x49574b33,draws:0,callers:[],trace:false};
 function stableRandom(){
  const row=current;
  let state=row.state;state^=state<<13;state^=state>>>17;state^=state<<5;
  row.state=state>>>0;row.draws++;
  if(row.trace&&row.callers.length<12)row.callers.push({draw:row.draws,stack:(new Error('scenario Math.random').stack||'').split('\n').slice(2,8).map(s=>s.trim())});
  return row.state/4294967296;
 }
 const checkIdentity=()=>{if(env.Math.random!==stableRandom)throw Error('QA Math.random identity replaced');};
 env.Math.random=stableRandom;
 env.__iwStableScenarioRandom={random:stableRandom};
 env.__iwResetScenarioRandom=seed=>{
  checkIdentity();
  if(!validSeed(seed))throw TypeError('Scenario seed must be a finite uint32 integer');
  const row=current={seed:seed>>>0,state:seed>>>0,draws:0,callers:[],trace:true};
  return {
   snapshot(){checkIdentity();return {seed:row.seed,draws:row.draws,state:row.state};},
   diagnostics(){checkIdentity();return {callers:row.callers.map(c=>({draw:c.draw,stack:c.stack.slice()}))};}
  };
 };
}
