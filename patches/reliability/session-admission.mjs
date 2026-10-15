// Admission for INKWAVE's relay/lobby wire format, before any session mutation.
// Limits come from the relay's eight-member rooms and sixteen-character names.
const record = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const id = s => typeof s === 'string' && s.length > 0;
const name = s => typeof s === 'string' && s.length <= 16;
const member = o => record(o) && id(o.id) && name(o.name);
const own = (o,k) => typeof k === 'string' && Object.hasOwn(o,k);
const team = t => t === 0 || t === 1 || t === 'auto';
const optional = (o,k,valid) => o[k] === undefined || valid(o[k]);

export function validRelayControl(o, now) {
  if (!record(o)) return false;
  switch (o.t) {
    case 'welcome': {
      if (!id(o.id) || !id(o.host) || !Array.isArray(o.members) ||
          o.members.length < 1 || o.members.length > 8 || !o.members.every(member)) return false;
      const ids = new Set(o.members.map(m=>m.id));
      return ids.size === o.members.length && ids.has(o.id) && ids.has(o.host);
    }
    case 'join': return member(o.m);
    case 'leave': return id(o.id) && (o.host === null || id(o.host));
    case 'err': return optional(o,'e',s=>typeof s === 'string');
    case 'pong': return Number.isFinite(o.c) && o.c >= 0 && o.c <= now;
    default: return false;
  }
}

export function validMeUpdate(o, weapons) {
  return record(o) && optional(o,'name',name) && optional(o,'weapon',w=>own(weapons,w)) &&
    optional(o,'style',s=>s === null || record(s)) && optional(o,'ready',r=>typeof r === 'boolean') &&
    optional(o,'ping',p=>Number.isFinite(p) && p >= 0) && optional(o,'team',team);
}

export function validLobbySnapshot(l, maps, weapons, paletteCount) {
  if (!record(l) || !maps.some(m=>m.id === l.map) || !['day','dusk'].includes(l.time) ||
      !Number.isFinite(l.duration) || l.duration <= 0 || l.duration > 86400 ||
      typeof l.bots !== 'boolean' || !['easy','normal','hard'].includes(l.difficulty) ||
      !optional(l,'palette',p=>Number.isInteger(p) && p >= 0 && p < paletteCount) ||
      !optional(l,'mode',m=>['turf','boss','zones','tower','rainmaker','clams'].includes(m)) ||
      !optional(l,'teamsConfirmed',b=>typeof b === 'boolean') ||
      !Array.isArray(l.players) || l.players.length < 1 || l.players.length > 8) return false;
  const ids = new Set();
  for (const p of l.players) {
    if (!validMeUpdate(p,weapons) || !id(p.id) || ids.has(p.id) || !name(p.name) ||
        !team(p.team) || !own(weapons,p.weapon)) return false;
    ids.add(p.id);
  }
  return true;
}
