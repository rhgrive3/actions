// Terminal connection of source-owned sliced builders to detached stage setup.
export function adaptQueueWorld20261024(rel,code){
 const patch=(before,after)=>{const at=code.indexOf(before);if(at<0||code.indexOf(before,at+before.length)>=0)throw Error('World queue connection changed: '+before.slice(0,90));code=code.slice(0,at)+after+code.slice(at+before.length);};
 if(rel==='src/world/paint.js'){
  patch('        at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true;',`        const range=at._paintRange||(at._paintRange={start:0,count:0});
        range.count=n*at.itemSize;
        at.clearUpdateRanges(); at.updateRanges.push(range); at.needsUpdate = true;`);
  return code;
 }
 if(rel!=='src/main.js')return code;
 patch(`        for (const it of dressingFor(layoutId)) {
          const r = props.add(it.type, it);
          if (r && r.colliders) colliders.push(...r.colliders);
        }
        props.build();`, `        if (props.addAll) colliders.push(...await props.addAll(dressingFor(layoutId), { current: worldCurrent }));
        else for (const it of dressingFor(layoutId)) {
          const r = props.add(it.type, it);
          if (r && r.colliders) colliders.push(...r.colliders);
        }
        if (props.buildAsync) await props.buildAsync({ current: worldCurrent }); else props.build();`);
 patch('    let level, lightmap;','    if (!worldCurrent()) { props?.dispose?.(); return; }\n    let level, lightmap, physics, nav;');
 patch('      level = new Level(MAP_LAYOUTS[layoutId], colliders);',`      level = new Level(MAP_LAYOUTS[layoutId], colliders);
      physics = new Physics(level);
      nav = NavGraph.createLegacy ? await NavGraph.createLegacy(level, physics, { current: worldCurrent }) : new NavGraph(level, physics);`);
 patch('    } catch (e) { props?.dispose?.(); throw e; }','    } catch (e) { props?.dispose?.(); if (!worldCurrent()) return; throw e; }');
 patch('    G.physics = new Physics(level);','    G.physics = physics;');
 patch('    G.nav = new NavGraph(level, G.physics);','    G.nav = nav;');
 // Resolve the final fallback map before deciding whether the outgoing atlas
 // can be discarded. Reused worlds and native rollback keep the old clear.
 for(const [start,end] of [['  async startMatch(', '  async startNetMatch('],['  async startNetMatch(', '  netMatchGo(']]){
  const at=code.indexOf(start),stop=code.indexOf(end,at+start.length);if(at<0||stop<0)throw Error('World queue match lifecycle changed');let body=code.slice(at,stop);
  const clear='G.projectiles.clear(); G.fx.clear?.(); G.paint.clear();';if(body.split(clear).length!==2)throw Error('World queue paint clear changed');
  body=body.replace(clear,'G.projectiles.clear(); G.fx.clear?.();');
  const before='    const bossModule = ';if(body.split(before).length!==2)throw Error('World queue resolved map changed');
  body=body.replace(before,`    if ((map.layout || map.id) === this.layoutId || (nativeStageEnabled && NATIVE_IDS.includes(map.layout || map.id))) G.paint.clear();\n${before}`);
  code=code.slice(0,at)+body+code.slice(stop);
 }
 return code;
}
