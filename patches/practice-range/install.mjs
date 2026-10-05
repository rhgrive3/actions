// Practice Range runtime installation (called once from main.js, adapter.mjs: installPracticeRange(Game)).
// Everything here is scoped to a match created with opts.range (startMatch({ mapId: 'range' })): other matches pass
// straight through every wrapper untouched.
import { G, on } from '../../src/core/ctx.js';
import { Match } from '../../src/game/match.js';
import { Menus } from '../../src/ui/menus.js';
import { RangeSession } from './runtime/session.mjs';
import { installRangeMenus } from './runtime/menu.mjs';
import { RangeSignage } from './runtime/signage.mjs';
import { RANGE_ID } from './range-map.mjs';

let installed = false;
export const isRangeMatch = (m) => !!(m && !m.attract && m.opts && m.opts.range);

export function installPracticeRange(Game) {
  if (installed) throw new Error('INKWAVE practice range already installed');
  installed = true;

  // ---- match lifecycle: the session lives exactly as long as its range match
  const setup = Match.prototype.setup, start = Match.prototype.start, update = Match.prototype.update, dispose = Match.prototype.dispose;
  Match.prototype.setup = function (...args) {
    const r = setup.apply(this, args);
    if (isRangeMatch(this)) this.range = new RangeSession(this);
    return r;
  };
  // no intro flight, no countdown: the range is ready the moment it fades in
  Match.prototype.start = function (...args) {
    if (!isRangeMatch(this)) return start.apply(this, args);
    this.setState('playing');
  };
  Match.prototype.update = function (dt) {
    const r = update.call(this, dt);
    if (this.range && !this.paused) this.range.update(dt);
    return r;
  };
  Match.prototype.dispose = function (...args) {
    this.range?.dispose(); this.range = null;
    return dispose.apply(this, args);
  };

  // ---- world: the signage boards exist while the range stage is the loaded world
  const buildWorld = Game.prototype._buildWorld;
  Game.prototype._buildWorld = async function (map, ...rest) {
    const r = await buildWorld.call(this, map, ...rest);
    const want = this.layoutId === RANGE_ID;
    if (want && !this.rangeSignage) this.rangeSignage = new RangeSignage(G.scene, this.settings || G.settings || {}, this.mobile || G.mobile || {});
    else if (!want && this.rangeSignage) { this.rangeSignage.dispose(); this.rangeSignage = null; }
    return r;
  };

  // ---- HUD: the training panel rides on the normal HUD frame
  const updateHud = Game.prototype._updateHud;
  Game.prototype._updateHud = function (dt) {
    const r = updateHud.call(this, dt);
    if (this.match?.range) this.match.range.updateHud(dt);
    return r;
  };

  // ---- deep link: ?range boots straight into the range (testing, screenshots, bookmarks)
  const boot = Game.prototype.boot;
  Game.prototype.boot = async function (...args) {
    const r = await boot.apply(this, args);
    const p = new URLSearchParams(location.search);
    if (p.has('range') && !p.has('autostart')) this.api.startMatch({ mapId: RANGE_ID });
    return r;
  };
  // expose for menus / tests
  Game.prototype.startRange = function () { return this.api.startMatch({ mapId: RANGE_ID }); };

  // range read-outs listen first (registered before the HUD binds its own listeners at boot)
  on('damage', (e) => G.match?.range?.onDamage(e));
  on('splatted', (e) => G.match?.range?.onSplatted(e));
  installRangeMenus(Menus);
  on('match:state', ({ state, match }) => { if (state === 'playing' && isRangeMatch(match) && match === G.match) match.range?.presentStart(); });
}
