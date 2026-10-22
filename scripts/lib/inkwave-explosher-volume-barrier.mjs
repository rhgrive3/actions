// LOCAL QA-only controlled-initial-condition candidate. No production file is edited.
// This moves readiness earlier than natural boot; it is not natural-boot acceptance.
export async function awaitExistingExplosherVolumes(G, game, timeoutMs=20000, readRng=globalThis.readExplosherRandom) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)throw Error('Invalid readiness timeout');
  const fx=G.fx,scene=G.scene,root=fx?.root,ready=fx?.inkVolumeReady,existingEngine=fx?.inkVolumes,hooks=game.fxHooks;
  if(!fx||!root||root.parent!==scene||G.game!==game||!ready||typeof ready.then!=='function')throw Error('Missing native volume readiness/ownership');
  if(fx._inkVolumeDisposed||fx.inkVolumeError)throw Error('Native volume loader already failed/disposed');
  const nativeState=()=>({gameTime:G.time,hookTime:game.fxHooks?.time,hookStamp:game.fxHooks?.stamp,sprayT:game.fxHooks?.sprayT,featherT:game.fxHooks?.featherT});
  const rng=()=>{if(typeof readRng!=='function')throw Error('Missing QA RNG reader');const x=readRng();if(x.algorithm!=='xorshift32'||x.identityPreserved!==true||![x.seed,x.word,x.draws,x.resets].every(Number.isSafeInteger)||x.draws<0||x.resets<0)throw Error('Invalid QA RNG state');return {...x};};
  const before=nativeState(),rngBefore=rng();
  for(const v of Object.values(before))if(!Number.isFinite(v))throw Error('Non-finite pre-barrier state');
  let timer,result;
  try{result=await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native volume readiness timeout')),timeoutMs);})]);}
  finally{clearTimeout(timer);}
  if(result!==true)throw Error('Native volume loader did not resolve true');
  if(game.fxHooks!==hooks||G.fx!==fx||G.scene!==scene||G.game!==game||fx.root!==root||root.parent!==scene||fx.inkVolumeReady!==ready)throw Error('Native volume owner changed');
  const engine=fx.inkVolumes;
  if(fx._inkVolumeDisposed||fx.inkVolumeError||!engine||engine.isInkVolumes!==true||engine.disposed||engine.root!==root||(existingEngine&&existingEngine!==engine))throw Error('Native volume engine failed/disposed/replaced');
  if(!(engine.assets instanceof Map)||engine.assets.size!==2||!engine.assets.has('roller')||!engine.assets.has('shooter'))throw Error('Expected bundled volume assets absent/unexpected');
  const assets=['roller','shooter'].map(name=>{const a=engine.assets.get(name);if(!a||!Array.isArray(a.patterns)||a.patterns.length!==2||a.warmFrames!==2||a.showAll!==true)throw Error('Invalid native volume asset readiness');return{name,patterns:a.patterns.length,warmFrames:a.warmFrames,showAll:a.showAll};});
  const after=nativeState(),rngAfter=rng();for(const k of Object.keys(before))if(!Object.is(before[k],after[k]))throw Error('Native simulated state advanced during barrier');
  return {controlledInitialCondition:true,naturalBootAccepted:false,scope:'Await already-started bundled volume readiness before initial attract setup only; native pack warm lifecycle is consequently constrained.',ownerVerified:true,resolvedTrue:true,assets,before,after,rngBefore,rngAfter};
}

export function adaptExplosherControlledBoot(source) {
  const anchor='    this._bindEvents();\n    this._startAttract();';
  if(source.split(anchor).length!==2)throw Error('Unique initial boot anchor missing');
  const begin='class Game {\n  async boot() {';
  const ends=['\n  async _buildWorld(map) {','\n  async _buildWorld(map, flow = null) {'];
  const present=ends.filter(end=>source.includes(end));
  if(source.split(begin).length!==2||present.length!==1||source.split(present[0]).length!==2)throw Error('Native boot boundaries missing');
  const end=present[0];
  const at=source.indexOf(anchor);if(at<source.indexOf(begin)||at>source.indexOf(end))throw Error('Anchor is outside initial async boot');
  const replacement='    this._bindEvents();\n    globalThis.__inkwaveExplosherControlledStartup = await ('+awaitExistingExplosherVolumes.toString()+')(G, this);\n    this._startAttract();';
  return source.replace(anchor,replacement);
}

// Pair gate for this controlled boundary only, not a replacement for later native gates.
export function requireControlledStartupPair(before,after) {
  for(const r of [before,after]){
    if(!r||r.controlledInitialCondition!==true||r.naturalBootAccepted!==false||r.ownerVerified!==true||r.resolvedTrue!==true)throw Error('Missing controlled startup evidence');
    for(const state of [r.before,r.after])for(const key of ['gameTime','hookTime','hookStamp','sprayT','featherT'])if(!Number.isFinite(state?.[key]))throw Error('Invalid retained startup state');
    for(const key of ['gameTime','hookTime','hookStamp','sprayT','featherT'])if(!Object.is(r.before[key],r.after[key]))throw Error('Retained startup state advanced within lane');
    for(const state of [r.rngBefore,r.rngAfter])if(state?.algorithm!=='xorshift32'||state.identityPreserved!==true||!['seed','word','draws','resets'].every(k=>Number.isSafeInteger(state[k])&&state[k]>=0))throw Error('Invalid startup RNG evidence');
    if(!Array.isArray(r.assets)||r.assets.length!==2||r.assets.some((a,i)=>a.name!==['roller','shooter'][i]||a.patterns!==2||a.warmFrames!==2||a.showAll!==true))throw Error('Invalid startup asset evidence');
  }
  for(const key of ['before','after','rngAfter','assets'])if(!before[key]||!after[key]||JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Error('Controlled startup mismatch: '+key);
  return {matched:true,scope:'Controlled readiness boundary only',preBarrierRngCompared:false,preBarrierRngBefore:before.rngBefore,preBarrierRngAfter:after.rngBefore};
}

// Insert only AFTER the native post-minification loading adapter. Its fixed boot
// phase topology must remain untouched; the controlled wait is not a new native phase.
export function adaptExplosherControlledCompiledBoot(source,parse){
  if(typeof parse!=='function'||!source.includes('__iwStartupMeasure')||source.includes('__inkwaveExplosherControlledStartup'))throw Error('Expected once-adapted native main');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const imports=ast.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value==='./core/ctx.js').flatMap(n=>n.specifiers.filter(s=>s.type==='ImportSpecifier'&&s.imported.name==='G'));
  if(imports.length!==1)throw Error('Unique native G import missing');
  const boots=ast.body.filter(n=>n.type==='ClassDeclaration').flatMap(n=>n.body.body.filter(m=>m.type==='MethodDefinition'&&m.key?.name==='boot'));
  if(boots.length!==1||boots[0].value.async!==true)throw Error('Unique async boot missing');
  const calls=[];
  const visit=n=>{if(!n||typeof n!=='object')return;if(['FunctionExpression','ArrowFunctionExpression','FunctionDeclaration','ClassDeclaration'].includes(n.type))return;
    if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed&&n.callee.object.type==='ThisExpression'&&['_bindEvents','_startAttract'].includes(n.callee.property.name))calls.push(n);
    for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);
  };visit(boots[0].value.body);
  const starts=calls.filter(n=>n.callee.property.name==='_startAttract'),binds=calls.filter(n=>n.callee.property.name==='_bindEvents');
  if(starts.length!==1||binds.length!==1||binds[0].end>starts[0].start||starts[0].arguments.length||binds[0].arguments.length)throw Error('Initial attract/bind topology changed');
  const call=starts[0],original=source.slice(call.start,call.end);
  const replacement='(globalThis.__inkwaveExplosherControlledStartup = await ('+awaitExistingExplosherVolumes.toString()+')('+imports[0].local.name+', this), '+original+')';
  const output=source.slice(0,call.start)+replacement+source.slice(call.end);parse(output,{ecmaVersion:'latest',sourceType:'module'});return output;
}
