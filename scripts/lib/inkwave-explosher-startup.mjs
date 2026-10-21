// Diagnostic-only normal boot admission; no production object/color/clock rewrites.
export function readExplosherSceneClocks(){
        const G=window.__G,g=window.__inkwave;
        const finite=(value,label,required=false)=>{
          if(value===undefined||value===null){if(required)throw Error('Missing clock '+label);return null;}
          if(!Number.isFinite(value))throw Error('Non-finite clock '+label);return value;
        };
        const uniforms=[];
        G.scene.traverse(o=>{
          for(const [slot,m]of (Array.isArray(o.material)?o.material:[o.material]).entries()){
            if(!m)continue;
            for(const [kind,bank]of [['direct',m.uniforms],['userData',m.userData?.uniforms]]){
              for(const [key,u]of Object.entries(bank||{})){
                if(/time|clock/i.test(key)&&typeof u?.value==='number')
                  uniforms.push([o.name||'',m.name||'',slot,kind,key,finite(u.value,key)]);
              }
            }
          }
        });
        uniforms.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return {game:finite(G.time,'game',true),environment:finite(G.env?.time,'environment',true),
          environmentUniform:finite(G.env?.U?.uTime?.value,'environmentUniform',true),
          fx:finite(G.fx?._time,'fx',true),fxHooks:finite(g.fxHooks?.time,'fxHooks'),
          paint:finite(G.paint?.clock,'paint',true),decor:finite(g.decor?.time,'decor'),
          decorUniform:finite(g.decor?.uTime?.value,'decorUniform'),propsUniform:finite(g.props?.uTime?.value,'propsUniform'),
          levelUniform:finite(g.levelMat?.userData?.uniforms?.uTime?.value,'levelUniform'),
          grateUniform:finite(g.grateMat?.userData?.uniforms?.uTime?.value,'grateUniform'),uniforms};
      }

export function requireExplosherStyle(actual){
 const expected={hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3};
 if(!actual||Object.keys(actual).length!==6||Object.entries(expected).some(([k,v])=>!Object.hasOwn(actual,k)||actual[k]!==v))throw Error('Native diagnostic profile style mismatch');
 return {...actual};
}

export function installExplosherEarlyFreeze(){
 if(Object.hasOwn(window,'__inkwave'))throw Error('Game already published before diagnostic freeze');
 Object.defineProperty(window,'__inkwave',{configurable:true,set(game){
  Object.defineProperty(window,'__inkwave',{value:game,writable:true,configurable:true,enumerable:true});
  if(!game||typeof game!=='object')throw Error('Invalid native game publication');
  game.frozen=true;
  queueMicrotask(()=>{
   if(window.__G?.game!==game||!game.frozen||typeof game.debug?.freeze!=='function')throw Error('Incomplete native game publication');
   game.debug.freeze();window.explosherBootClocks=window.readExplosherSceneClocks();
  });
 }});
 const entry=e=>{
  if(!e.isTrusted||!e.target?.closest?.('.iw-ui [data-id="mode-range"]'))return;
  const g=window.__inkwave;if(g?.menus?.current!=='mode')return;
  g.debug.freeze();
  const clocks=window.readExplosherSceneClocks();
  if(!window.explosherBootClocks||JSON.stringify(clocks)!==JSON.stringify(window.explosherBootClocks))throw Error('Scene clocks advanced before trusted Range entry');
  window.explosherEntry={trusted:true,boundary:'native-publication-to-trusted-range',boot:window.explosherBootClocks,entry:clocks};
  document.removeEventListener('click',entry,true);
 };
 document.addEventListener('click',entry,true);
}

