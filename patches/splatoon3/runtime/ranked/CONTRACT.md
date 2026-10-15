# Ranked rule module contract

Build overlays only; keep `inkwave-public/` frozen. Runtime pure modules have no browser/THREE imports.

Exports: `ZonesRule`, `TowerRule`, `RainmakerRule`, `ClamsRule` respectively in `zones.mjs`, `tower.mjs`, `rainmaker.mjs`, `clams.mjs`.

Constructor `(engine, stage)` initializes JSON-compatible `this.state`. Methods `update(dt, frame)`, `beginOvertime()` returns boolean, `updateOvertime(dt, frame)`, `snapshot()` returns a structuredClone, `restore(state)`, `removeActor(id)` drop inventory/object, `botGoal(actor, frame)` returns `{pos:[x,y,z], action:'paint'|'ride'|'barrier'|'carry'|'collect'|'throw'|'defend', aim?:[x,y,z]}` or null. All timers in seconds; 60Hz engine step. State is authoritative, followers only restore.

Engine: `.mode`, `.counts=[100,100]`, `.penalties=[0,0]`, `.time=300`, `.elapsed`, `.overtime` boolean, `.overtimeElapsed`, `.overtimeTeam` (losing team selected at deadline), `.winner=null`, `.leader` (-1 initially, first team to reach tied count retains lead), `.frame`. Methods `.setCount(team, value)` (lower-only best count; 0 knockout; in OT strictly beating other count wins), `.score(team, amount)` (penalty paid first, overflow lowers count), `.finish(team,reason)`, `.event(kind,data)` stores finite bounded presentation/gameplay events, `.special(team,points)` event. Rules never mutate match UI.

Frame: `{actors:[{id,team,pos:[x,y,z],alive,grounded,remote,weight,swimming}], inputs:{[id]:{fire,throw,aim:[x,y,z]}}, zoneCoverage:[[ratioTeam0,ratioTeam1],...], barrierHits:[{id,team,damage,kind}], floorAt:(x,z)=>number|null, blocked:(a,b)=>boolean}`. Missing optional callbacks must be tolerated by tests. Engine frame actors are identity-checked by runtime. `throw` is an edge; `fire` is held. `aim` normalized world direction. Rule state owns carrier/inventory, never actor reference.

Stage: `{id,zones:[{center:[x,y,z],size:[width,depth]}], tower:{path:[[x,y,z],...],centerIndex, checkpoints:[[{progress:0..1,count:seconds},...],[...]],speed:worldUnitsPerSecond,halfSize:1.4}, rainmaker:{center:[x,y,z],checkpoints:[[[x,y,z],...],[[x,y,z],...]],goals:[[x,y,z],[x,y,z]],retreatZ:[z,z]},clams:{spawns:[[x,y,z],...],goals:[[x,y,z],[x,y,z]]}}`.

Source-calibrated zones may specify `heightTolerance` in local world units. `RankedWorld` then indexes and capture-paints only cells within that distance of `center[1]`; overlapping box tops or other storeys are excluded. Omitted tolerance preserves existing authored blockout indexing. This is a local floor-band calibration, not recovered retail rule geometry.

Important orientation: `goals[team]` and `checkpoints[team]` are that team's ATTACK objectives in ENEMY territory. Team 0 starts negative Z. Tower full path starts negative Z to positive Z; increasing coordinate/progress attacks for team 0. `botGoal` returns current reachable objective; world data determines routes.

Events consumed by runtime: `zone-capture {zone,team}` fills entire zone ink; `rainmaker-pop {pos,team,radius,damage}` paint/explosion; `rainmaker-timeout {id,pos,team}` explosion/death; `rainmaker-shot {id,team,pos,aim,charge,damage,radius,speed}` dedicated projectile; other kinds are announcements (`tower-capture`, `checkpoint`, `clam-score`, `overtime`, `finish`). Rule `state` should expose required objects and timers directly with clear names.

Pure modules must test real transitions, varied dt, OT, reset/snapshot. Cite sources and label unknown primary parameters. No invented source-confirmed claims. Do not edit others' assigned files.
