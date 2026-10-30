// QA-only function serialized by Playwright; all gameplay methods remain native.
export async function assertOpeningSpawnAtRate(hz) {
  const {G,on} = globalThis.openingContext, g = G.game;
    const introFrames = globalThis.openingIntroFrames;
    if(!Number.isSafeInteger(introFrames)||introFrames<=0)throw Error('Invalid emitted intro frame budget');
  g.debug.freeze(); g.menus.wipe.cancel(); g._skipRender = true;
  await g.startMatch({ mapId: 'tidewater', mode: 'turf', duration: 180, difficulty: 'normal' });
  g.debug.freezeBots();
  const snapshot = () => G.actors.map(a => ({ team: a.team, slot: a.slot, bot: a.isBot,
    phase: a.s3?.squidSpawn?.phase || null, position: a.pos.toArray(), grounded: a.grounded,
    supported: !!a.ground.hit, target: a.s3?.squidSpawn?.target || null }));
  const match=G.match;
    if(match.turfIntroFrames!==introFrames)throw Error('Match intro budget differs from emitted camera owner');
    const startTick=g.s3Clock?.ticks;
    if(!Number.isSafeInteger(startTick)||Math.abs(match.stateT)>1e-9)throw Error('Intro clock did not start at its native boundary');
    const transitions=[];
    const off=on('match:state',e=>{if(e.match===match&&e.state==='playing')transitions.push(g.s3Clock.ticks-startTick+1);});
  try {
    const initial = snapshot(), step = () => g._frame(1 / hz);
  const waiting = rows => {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].phase !== 'aim' || rows[i].position.some((v, k) => Math.abs(v - initial[i].position[k]) > 1e-8))
        throw Error('Opening actor left spawner before match start: ' + JSON.stringify(rows[i]));
    }
  };
  waiting(initial);
  for (let i = 0; i < hz * 4; i++) step();
  const intro = snapshot(); waiting(intro);
  if (G.match.state !== 'intro') throw Error('Missing ordinary introduction');
  let introAdvanceFrames=hz*4;
    const budget=Math.ceil(introFrames*hz/60)+1;
    while(G.match.state==='intro'&&introAdvanceFrames<budget){waiting(snapshot());step();introAdvanceFrames++;}
    if(G.match!==match||G.match.state!=='playing')throw Error('Ordinary intro did not finish at emitted frame budget');
    if(transitions.length!==1||transitions[0]!==introFrames)throw Error('Ordinary intro GO tick mismatch: '+JSON.stringify({expected:introFrames,actual:transitions}));
    // The filmed Turf intro already includes aim time: native initialDelay=0
    // launches every local opening actor in the same fixed tick as GO.
    const playing=snapshot(),flight=playing;
    if(flight.some(a=>a.phase!=='flight'))throw Error('All actors must launch on the native GO tick');
    const frames=0;
  for (let i = 0; i < hz * 1.5; i++) step();
  const landed = snapshot();
  if (landed.some(a => a.phase || !a.grounded || !a.supported)) throw Error('Opening actor failed real supported touchdown: ' + JSON.stringify(landed));
  return { hz, introFrames, introAdvanceFrames, goTick:transitions[0], initial, intro, playing, flight, launchWaitFrames: frames, landed };
  } finally {off();}
}
