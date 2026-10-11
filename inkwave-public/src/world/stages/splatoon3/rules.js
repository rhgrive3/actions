// Rule coordinates below belong to the reconstruction, not to a Nintendo placement dump.
// An exact-layout consumer must pass requireVerified:true and handle the explicit error.
import { mirrorPoint, topAt } from './authoring.js';

export const STAGE_RULES = Object.freeze(['turf', 'zones', 'tower', 'rainmaker', 'clams']);
const aliases = Object.freeze({nawabari:'turf',regular:'turf',splatzones:'zones',area:'zones',sz:'zones',towercontrol:'tower',yagura:'tower',tc:'tower',hoko:'rainmaker',rm:'rainmaker',clamblitz:'clams',asari:'clams',cb:'clams'});
export function normalizeStageRule(input='turf') {
  const k=String(input).toLowerCase().replace(/[ _-]/g,'');
  const rule=aliases[k]||k;
  if(!STAGE_RULES.includes(rule)) throw new RangeError(`Unknown stage rule: ${input}`);
  return rule;
}
const copy = value => JSON.parse(JSON.stringify(value));
export function makeRuleData(layout, spec) {
  const mirror = p => mirrorPoint(p,layout.symmetry);
  const zones=(spec.zones||[]).map((z,i)=>({id:`zone-${i}`,center:[...z.center],size:[...z.size],polygon:[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sz])=>[z.center[0]+sx*z.size[0]/2,z.center[1],z.center[2]+sz*z.size[1]/2])}));
  const path=spec.tower.pathToA.map(p=>[...p]);
  const pathsByAttackingTeam=[path.map(mirror),path];
  const checkpointsByAttackingTeam=pathsByAttackingTeam.map(points=>spec.tower.checkpointIndices.map((index,i)=>({id:`checkpoint-${i}`,pathIndex:index,position:[...points[index]],holdSeconds:spec.tower.holdSeconds?.[i]??null,timingVerified:!!spec.tower.timingVerified})));
  const rainmaker={center:[...spec.rainmaker.center],goalsByDefendingTeam:[[...spec.rainmaker.goalA],mirror(spec.rainmaker.goalA)],checkpointsByDefendingTeam:[spec.rainmaker.checkpointsA.map(p=>[...p]),spec.rainmaker.checkpointsA.map(mirror)]};
  const basketsByDefendingTeam=[{team:0,position:[...spec.clams.basketA]},{team:1,position:mirror(spec.clams.basketA)}];
  // Explicit stage-authored sample locations; no pseudo-random native spawn claims.
  const clamSpawns=(spec.clams.spawnsA||[]).flatMap((p,i)=>[{id:`clam-A-${i}`,position:[...p]},{id:`clam-B-${i}`,position:mirror(p)}]);
  return {
    schemaVersion:1,stageId:layout.stageId,internalId:layout.internalId,gameVersion:layout.gameVersion,rule:layout.layoutRule,
    originalVerified:false,coordinatesStatus:'authored-unmeasured',source:layout.fidelity.sources,
    note:'Geometry and object coordinates are playable reconstruction data, not verified original placements. Ranked scoring is owned by the game-mode implementation.',
    spawnPads:layout.spawnPads.map(p=>[...p]),spawnYaw:[...layout.spawnYaw],
    objectives:layout.layoutRule==='zones'?{zones}:layout.layoutRule==='tower'?{tower:{pathsByAttackingTeam,checkpointsByAttackingTeam}}:layout.layoutRule==='rainmaker'?{rainmaker}:layout.layoutRule==='clams'?{clams:{basketsByDefendingTeam,spawns:clamSpawns}}:{},
    // Full blueprint lets the game-mode owner inspect the other modes without inventing defaults.
    blueprint:copy(spec),
  };
}
export function validateRuleData(layout, data) {
  const errors=[];
  const point=(p,label)=>{
    if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)){errors.push(`${label}: not a finite point`);return;}
    const b=layout.bounds;
    if(p[0]<b.minX||p[0]>b.maxX||p[2]<b.minZ||p[2]>b.maxZ)errors.push(`${label}: outside stage bounds`);
    // Aerial tower waypoints and baskets may legitimately be above the supporting floor.
    if(!Number.isFinite(topAt(layout,p[0],p[2],p[1]+0.6)))errors.push(`${label}: no supporting terrain`);
  };
  data.spawnPads.forEach((p,i)=>point(p,`spawn-${i}`));
  for(const z of data.objectives.zones||[]) {point(z.center,z.id);if(z.size.some(n=>!Number.isFinite(n)||n<=0))errors.push(`${z.id}: invalid size`);}
  data.objectives.tower?.pathsByAttackingTeam.forEach((path,t)=>{if(path.length<2)errors.push(`tower-${t}: path too short`);path.forEach((p,i)=>point(p,`tower-${t}-${i}`));});
  const r=data.objectives.rainmaker;if(r){point(r.center,'rainmaker-center');r.goalsByDefendingTeam.forEach((p,i)=>point(p,`goal-${i}`));r.checkpointsByDefendingTeam.flat().forEach((p,i)=>point(p,`rain-checkpoint-${i}`));}
  const c=data.objectives.clams;if(c){c.basketsByDefendingTeam.forEach(b=>point(b.position,`basket-${b.team}`));c.spawns.forEach(s=>point(s.position,s.id));}
  return errors;
}
