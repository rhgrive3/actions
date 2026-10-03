// Visual-only coupling. Authoritative projectile AND secondary-droplet physics,
// random draws, collision budgets, paint and pool capacity stay with the game.
const INSTALLED=Symbol.for('inkwave.local-quality.projectile.v1');
export function installRollerVisualQuality({Projectiles}) {
  const P=Projectiles.prototype;if(Object.hasOwn(P,INSTALLED))return;
  Object.defineProperty(P,INSTALLED,{value:true});
  const fresh=P._new, push=P._push, step=P._step,clear=P.clear;
  P._new=function(...args){const p=fresh.apply(this,args);p._qualityGeneration=((p._qualityGeneration||0)+1)>>>0;p._qualityDead=false;return p;};
  P._push=function(p){
    if(p.type==='drop'&&p.owner?.weapon?.kind==='roller'&&p.owner.weaponRunner?.s3FlickVertical){
      // Existing visual channels are already replicated by recProj().
      // A longer, less wobbly ligament makes the real central volley readable.
      p.tail0=.65;p.tailK=1.7;p.wob=.055;p.nose=.55;
    }
    return push.call(this,p);
  };
  P._step=function(p,dt){const dead=step.call(this,p,dt);if(dead)p._qualityDead=true;return dead;};
  P.clear=function(...args){for(const p of this.list)p._qualityDead=true;return clear.apply(this,args);};
}
export function rollerCurtainSources(G,actor,fx){
  const out=fx._qualityCurtainSources||(fx._qualityCurtainSources=[]);out.length=0;
  for(const p of G.projectiles?.list||[]){
    if(p.owner!==actor||p.type!=='drop'||p.age>1/60||p._qualityDead)continue;
    const vertical=p.ghost?p.nose===.55&&p.tailK===1.7:!!actor.weaponRunner?.s3FlickVertical;
    if(vertical)out.push(p);
  }
  return out.length?out:null; // no guessed airborne mode for incomplete network events
}
export function bindRollerDrop(fx,index,source){
  if(!source||fx.dA[index*8+7]&1)return false; // preserve ALL visible scoring droplets
  fx._qualityDropSource ||= new Array(fx.dCap).fill(null);
  fx._qualityDropGeneration ||= new Uint32Array(fx.dCap);
  fx._qualityDropSource[index]=source;fx._qualityDropGeneration[index]=source._qualityGeneration;
  return true;
}
