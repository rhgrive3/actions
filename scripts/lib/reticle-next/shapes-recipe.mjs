// Actual native inputs and read-only production DOM observations, not a fixture.
import assert from 'node:assert/strict';
export const SHAPE_PHASES=Object.freeze(['idle','ground-fire','air-fire','landed-release']);
export const SHAPE_CASES=Object.freeze([
  Object.freeze({name:'slosher',id:'slosher',kind:'slosher',profile:null,next:true}),
  Object.freeze({name:'blaster',id:'blaster',kind:'blaster',profile:null,next:true}),
]);
export function readShapeSample(){
  const a=window.__G.local,h=window.__inkwave.hud,r=h.ret,runner=a.weaponRunner;
  const nodes=selector=>[...r.querySelectorAll(selector)].map(n=>({tag:n.tagName,r:n.getAttribute('r'),display:getComputedStyle(n).display,bounds:n.getBoundingClientRect().toJSON()}));
  return {weaponId:a.weaponId,hudWeapon:h._L.weapon,kind:h._L.kind,grounded:a.grounded===true,
    nativeTicks:window.__inkwave.s3Clock.ticks,position:a.pos.toArray(),cooldown:runner.cooldown,
    shots:window.__chargerRecipeObservation?.events.filter(s=>s.actorWeaponId===a.weaponId)||[],
    slosher:nodes('.iw-reticle-slosher-diagonal-proposal'),blaster:nodes('.iw-reticle-blaster-diagonal-proposal'),
    ticks:nodes(':scope > .iw-ret__tick'),rings:nodes('.iw-ret__ring'),
    lines:nodes('.iw-ret__line'),notches:nodes('.iw-ret__notch'),chargerShape:r.dataset.chargerShape||null};
}
export function assertShapeSample(s,scenario,phase,{before=false}={}){
  assert.equal(s.weaponId,scenario.id);assert.equal(s.hudWeapon,scenario.id);assert.equal(s.kind,scenario.kind);
  assert(SHAPE_PHASES.includes(phase));assert.equal(s.chargerShape,null,'charger decoration cleared');
  if(phase==='air-fire')assert.equal(s.grounded,false,'real airborne actor');else assert.equal(s.grounded,true,'real grounded actor');
  if(phase.endsWith('fire')){assert(s.shots.length>0,'native accepted fire event required');assert.equal(s.shots.at(-1).grounded,phase==='ground-fire','accepted shot owns native airborne/grounded classification');}
  const art=s[scenario.name];assert.equal(art.length,before?0:1);
  if(!before){assert.notEqual(art[0].display,'none');assert(art[0].bounds.width>0&&art[0].bounds.height>0);}
  if(scenario.name==='slosher'&&!before)assert(s.ticks.every(t=>t.display==='none'),'no duplicate legacy ticks');
  if(scenario.name==='blaster'){
    const circles=s.rings.filter(n=>n.tag.toLowerCase()==='circle');
    assert.equal(circles.length,2);if(before)assert.notEqual(circles[0].display,'none');else assert.equal(circles[0].display,'none');
    assert.equal(circles[1].r,before?'9':'13');
  }
}
export async function runShapesRecipe(page,{scenario,pace,capture,before=false,dt=1/30}){
  assert([1/30,1/60].includes(dt));
  const step=()=>pace(page,1,dt),sample=()=>page.evaluate(readShapeSample);
  const wait=async(predicate,label,max=240)=>{for(let i=0;i<max;i++){await step();const s=await sample();if(predicate(s))return s;}throw Error('Native shape deadline: '+label);};
  const take=async phase=>{const s=await sample();assertShapeSample(s,scenario,phase,{before});await capture(phase,s);};
  try{
    await take('idle');
    let old=(await sample()).shots.length;
    await page.mouse.down({button:'left'});
    await wait(s=>s.grounded&&s.shots.length>old,'accepted grounded shot');await take('ground-fire');
    await page.mouse.up({button:'left'});
    // Cool down naturally before a native jump; never write grounded/position.
    await wait(s=>s.grounded&&s.cooldown<=0,'ground cooldown');
    await page.keyboard.down('Space');await wait(s=>!s.grounded,'native jump',30);await page.keyboard.up('Space');
    old=(await sample()).shots.length;await page.mouse.down({button:'left'});
    await wait(s=>!s.grounded&&s.shots.length>old,'accepted airborne shot',90);await take('air-fire');
    await page.mouse.up({button:'left'});await wait(s=>s.grounded&&s.cooldown<=0,'native landing');
    await take('landed-release');
  }finally{await page.mouse.up({button:'left'});await page.keyboard.up('Space');}
}
