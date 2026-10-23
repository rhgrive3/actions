// Presentation-only caches. Rules, score and network state never read these.
const routes = new WeakMap(), overlays = new WeakMap();
const finitePoint = p => Array.isArray(p) && p.length >= 3 &&
  0 in p && 1 in p && 2 in p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);

// Keep mutable route coordinates in the key as well as their owning stage.
// Cache projected coordinates and replay the exact current-path commands.
export function strokeTowerRoute(minimap, stage, path, ctx) {
  if (!Array.isArray(path) || path.length < 2) return false;
  const b = minimap.level?.bounds;
  let c = routes.get(minimap);
  let same = c && c.stage === stage && c.path === path && c.level === minimap.level &&
    c.project === minimap.toCanvas && c.s === minimap.s && c.w === minimap.w && c.h === minimap.h && c.flip === minimap.flip &&
    c.minX === b?.minX && c.maxX === b?.maxX && c.minZ === b?.minZ && c.maxZ === b?.maxZ && c.input.length === path.length * 3;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (!finitePoint(p)) return false; // retain the original unusual-input path
    if (same && (!Object.is(c.input[i * 3], p[0]) || !Object.is(c.input[i * 3 + 1], p[1]) || !Object.is(c.input[i * 3 + 2], p[2]))) same = false;
  }
  if (!same) {
    c = { stage, path, level:minimap.level, project:minimap.toCanvas, s:minimap.s, w:minimap.w, h:minimap.h, flip:minimap.flip,
      minX:b?.minX, maxX:b?.maxX, minZ:b?.minZ, maxZ:b?.maxZ, input:[], xy:[] };
    const point = {x:0,y:0};
    for (let i = 0; i < path.length; i++) {
      const p = path[i], xy = minimap.toCanvas(p[0], p[2], point);
      c.input.push(p[0], p[1], p[2]); c.xy.push(xy.x, xy.y);
    }
    routes.set(minimap, c);
  }
  ctx.beginPath();
  for (let i = 0; i < c.xy.length; i += 2) { if (i) ctx.lineTo(c.xy[i],c.xy[i+1]); else ctx.moveTo(c.xy[i],c.xy[i+1]); }
  ctx.strokeStyle = '#fff'; ctx.globalAlpha = .58; ctx.lineWidth = Math.max(2, minimap.s * .32);
  ctx.stroke();
  return true;
}

const point = (out,p) => {
  if (Array.isArray(p)) out.push(p[0],p[1],p[2]);
  else out.push(p?.x,p?.y,p?.z);
};
function snapshot(out,minimap,engine,G) {
  out.length=0;
  const stage=engine?.stage,state=engine?.rule?.state;
  out.push(engine,stage,engine?.mode,minimap.level,minimap.toCanvas,minimap.s,minimap.w,minimap.h,minimap.flip,
    minimap.level?.bounds?.minX,minimap.level?.bounds?.maxX,minimap.level?.bounds?.minZ,minimap.level?.bounds?.maxZ,
    G.teamHex?.[0],G.teamHex?.[1]);
  if(!stage||!state)return;
  if(engine.mode==='zones'){const zones=stage.zones||[],length=zones.length;out.push(length);for(let i=0;i<length;i++){
    if(!(i in zones))continue; // Match drawObjectives' forEach, including inherited entries.
    const z=zones[i];out.push(i);point(out,z.center);out.push(z.size?.[0],z.size?.[1],state.zones?.[i]?.team);
  }}
  else if(engine.mode==='tower'){
    const path=stage.tower?.path||[];
    out.push(path.length,stage.tower?.centerIndex,state.controllingTeam);point(out,state.position);
    for(const p of path)point(out,p);
    const teams=stage.tower?.checkpoints||[],teamLength=teams.length;out.push(teamLength);
    for(let t=0;t<teamLength;t++){
      if(!(t in teams))continue;
      const team=teams[t]||[],length=team.length;out.push(t,length);
      for(let i=0;i<length;i++){if(i in team)out.push(i,team[i].progress);}
    }
  }
  else if(engine.mode==='rainmaker'){
    point(out,state.pos||stage.rainmaker?.center);out.push(state.carrier!=null,state.carrierTeam);
    for(let team=0;team<2;team++){
      out.push(state.checkpoint?.passed?.[team],state.checkpoint?.choice?.[team],state.checkpoint?.goalOpen?.[team]);
      out.push(stage.rainmaker?.checkpoints?.[team]?.length);
      for(const p of stage.rainmaker?.checkpoints?.[team]||[])point(out,p);
    }
    out.push(stage.rainmaker?.goals?.length);for(const p of stage.rainmaker?.goals||[])point(out,p);
  }
  else if(engine.mode==='clams'){
    const clams=state.clams||[],length=clams.length;out.push(length);
    for(let i=0;i<length;i++){if(!(i in clams))continue;const c=clams[i];out.push(i);point(out,c.pos);out.push(c.kind);}
    out.push('goals',stage.clams?.goals?.length);for(const p of stage.clams?.goals||[])point(out,p);
    const inventories=state.inventories||{};
    for(const id in inventories)if(Object.hasOwn(inventories,id)&&inventories[id]?.power){
      const a=(G.match?.actors||[]).find(a=>String(a.nid??`${a.team}:${a.slot}`)===id);
      out.push(id,a?.team);point(out,a?.pos);
    }
  }
}

// Queue only the final composite. The native update still owns its 30Hz budget,
// ink dirty rectangles, animations, hidden-map behavior and forced refreshes.
export function objectiveOverlayChanged(minimap,engine,G) {
  if (engine?.mode !== 'tower') routes.delete(minimap);
  let c=overlays.get(minimap);
  if(!c){c={previous:[],next:[],initialized:false};overlays.set(minimap,c);}
  snapshot(c.next,minimap,engine,G);
  let changed=!c.initialized||c.next.length!==c.previous.length;
  if(!changed)for(let i=0;i<c.next.length;i++)if(!Object.is(c.next[i],c.previous[i])){changed=true;break;}
  const old=c.previous;c.previous=c.next;c.next=old;c.initialized=true;
  // Initial unranked maps follow their original idle path; removal must still
  // erase a previously visible ranked overlay once.
  return changed && (!!engine || c.hadRanked) ? (c.hadRanked=!!engine,true) : (c.hadRanked=!!engine,false);
}
