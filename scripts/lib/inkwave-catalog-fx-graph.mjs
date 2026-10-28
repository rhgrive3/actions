// Serialized into the isolated browser after its motion cases. Main owns one
// lazy FxHooks instance; this fixture likewise creates only one, then disables
// its event listeners until the enclosing page is closed (there is no dispose).
export async function catalogBombFxGraph(prefix,G,projectiles,actor,snapshot) {
  const entryPath=prefix+'src/fx/fxHooks.js';
  const {initFxHooks}=await import(entryPath);
  if(typeof initFxHooks!=='function')throw Error('Catalog native FX entry export missing');
  const services=['fx','audio','netm'].map(key=>({key,own:Object.hasOwn(G,key),value:G[key]}));
  const speck=()=>{},ripple=()=>{};
  let hooks,proof,birth,birthTrails=0;
  const fx={onSpeck:speck,onRipple:ripple,bombTrail(pos,vel){if(pos===birth?.pos&&vel===birth?.vel)birthTrails++;}};
  try{
    G.fx=fx;G.audio=null;G.netm=null;
    const previous=new Set(projectiles.bombs),count=projectiles.bombs.length;
    projectiles.throwBomb(actor);
    const births=projectiles.bombs.filter(b=>!previous.has(b));
    if(births.length!==1||projectiles.bombs.length!==count+1||births[0].owner!==actor||
      births[0].mesh?.parent!==projectiles.scene)throw Error('Catalog native throwBomb did not create one owned bomb');
    birth=births[0];
    const before=snapshot();
    hooks=initFxHooks(G);
    if(!hooks||typeof hooks._bombs!=='function')throw Error('Catalog native FX bomb method missing');
    hooks._bombs(projectiles,1/60);
    const cue=hooks.bombs.get(birth)?.cue;
    if(!cue||typeof cue.id!=='string'||birthTrails!==1)throw Error('Catalog native FX bomb cue was not invoked');
    if(snapshot()!==before)throw Error('Catalog native FX changed bomb/gameplay state');
    proof={entryPath,cuePath:prefix+'patches/splatoon3/runtime/bomb-cues.mjs',source:'native-throwBomb-record',
      nativeBirths:births.length,bombVisits:1,birthTrails,cueId:cue.id,gameplayUnchanged:true,
      ownerDisabled:false,callbacksRestored:false,servicesRestored:false};
  }finally{
    if(hooks)hooks.enabled=false;
    fx.onSpeck=speck;fx.onRipple=ripple;
    for(const {key,own,value}of services){if(own)G[key]=value;else delete G[key];}
    if(proof){proof.ownerDisabled=hooks.enabled===false;
      proof.callbacksRestored=fx.onSpeck===speck&&fx.onRipple===ripple;
      proof.servicesRestored=services.every(({key,own,value})=>Object.hasOwn(G,key)===own&&G[key]===value);}
  }
  return proof;
}
