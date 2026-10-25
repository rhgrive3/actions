import { readWeaponReticlePresentation } from './weapon-reticle-presentation.mjs';
import { weaponReticleGeometryState } from './weapon-reticle-geometry.mjs';

const INSTALLED = Symbol.for('inkwave.weaponReticlePresentation.installed');
const PRESENTATION = Symbol('weaponReticlePresentation');
const TICK_STYLES = Object.freeze({ left: '0px', top: '0px', width: '0px', height: '0px', background: 'none', border: 'none' });
const LEGACY_VISUAL_CLASSES = ['iw-ret__dot', 'iw-ret__svg', 'iw-ret__line', 'iw-ret__tick'];

function cache(hud) {
  return hud[PRESENTATION] ||= {
    presentation: {}, ret: null, overlay: null, stateKey: null,
    hidden: [], decorated: [], removedChargerClass: false, buildKind: null, hasBuildKind: false,
  };
}

function release(state, rebuilt = false) {
  state.overlay?.remove();
  for (const saved of state.hidden) {
    if (saved.value) saved.element.style.setProperty('display', saved.value, saved.priority);
    else saved.element.style.removeProperty('display');
  }
  for (const saved of state.decorated) {
    saved.glyph?.remove();
    for (const style of saved.styles) {
      if (style.value) saved.element.style.setProperty(style.name, style.value, style.priority);
      else saved.element.style.removeProperty(style.name);
    }
  }
  state.decorated.length = 0;
  // A native build has already assigned its new className: never restore a
  // previous weapon's charger selector onto that newly built reticle.
  if (!rebuilt && state.removedChargerClass && state.ret)
    state.ret.classList.add('iw-ret--charger');
  state.ret = null;
  state.overlay = null;
  state.stateKey = null;
  state.hidden.length = 0;
  state.removedChargerClass = false;
}

function knownWeapon(hud, weapons) {
  const id = hud._L?.weapon;
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(weapons, id)
    ? weapons[id] : null;
}

function update(hud, weapons, builtKind, rebuilt = false) {
  const state = cache(hud);
  if (rebuilt) {
    release(state, true);
    state.buildKind = builtKind;
    state.hasBuildKind = true;
  }
  const weapon = knownWeapon(hud, weapons);
  // Identity comes from the registered actual weapon, never the legacy kind
  // or a frame's unregistered fallback. Unknown/direct native builds stay native.
  if (!weapon) {
    release(state);
    return;
  }
  const presentation = readWeaponReticlePresentation(
    weapon, hud._local?.()?.weaponRunner, state.presentation,
  );
  const geometry = weaponReticleGeometryState(presentation);
  const nativeKind = state.hasBuildKind ? state.buildKind : hud._L?.kind;
  const ret = hud.ret;
  if (!geometry || !ret || nativeKind !== presentation.legacyKind) {
    release(state);
    return;
  }
  if (state.ret !== ret) {
    release(state);
    state.ret = ret;
    // Hide only known native direct artwork. In particular the native charger
    // SVG/charge handle remains attached for its stale-DOM recovery guard.
    // Brella reuses its original spread tick ELEMENTS and transforms: their
    // final composed shooter CSS reads authoritative --sp horizontally, with
    // fixed vertical spacing. Keep its variables, transform and child order;
    // cached quadrant SVGs cancel only the old rectangle's local rotation.
    let spreadTickIndex = 0;
    for (const element of ret.children) {
      if (!LEGACY_VISUAL_CLASSES.some(name => element.classList.contains(name))) continue;
      if (presentation.family === 'brella' && element.classList.contains('iw-ret__tick')) {
        const spreadTickSvg = geometry.spreadTickSvgs?.[spreadTickIndex++];
        if (spreadTickSvg) {
          const saved = { element, styles: [], glyph: null };
          for (const [name, value] of Object.entries(TICK_STYLES)) {
            saved.styles.push({ name, value: element.style.getPropertyValue(name),
              priority: element.style.getPropertyPriority(name) });
            element.style.setProperty(name, value);
          }
          element.insertAdjacentHTML('beforeend', spreadTickSvg);
          saved.glyph = element.lastElementChild;
          state.decorated.push(saved);
        }
        continue;
      }
      state.hidden.push({ element, value: element.style.getPropertyValue('display'),
        priority: element.style.getPropertyPriority('display') });
      element.style.setProperty('display', 'none');
    }
  }
  if (presentation.family === 'splatana') {
    // Only the inherited charger visual selector is removed. L.kind, attached
    // charge handles and every original charge/gameplay update keep their owner.
    if (ret.classList.contains('iw-ret--charger')) {
      ret.classList.remove('iw-ret--charger');
      state.removedChargerClass = true;
    }
    // Exact full-charge flash/colour is unverified for Wiper/Stamper. Do not
    // inherit the charger's global flash, nor create a replacement animation.
    if (ret.classList.contains('is-flash')) ret.classList.remove('is-flash');
  }
  if (state.stateKey === geometry.id && state.overlay?.parentNode === ret) return;
  state.overlay?.remove();
  ret.insertAdjacentHTML('beforeend', geometry.svg);
  state.overlay = ret.lastElementChild;
  state.stateKey = geometry.id;
}

/**
 * Install presentation-only HUD wrappers once per prototype. No listeners,
 * timers, gameplay/RNG writes, hit/kill feedback ownership or root translation.
 * Unverified weapon families retain the original visual unchanged.
 */
export function installWeaponReticlePresentation(HUD, WEAPONS) {
  const proto = HUD?.prototype;
  if (!proto || !WEAPONS || Object.prototype.hasOwnProperty.call(proto, INSTALLED)) return;
  if (typeof proto._buildReticle !== 'function' || typeof proto._updCrosshair !== 'function')
    throw new TypeError('Weapon reticle presentation requires native HUD reticle methods');
  const buildReticle = proto._buildReticle;
  const updateCrosshair = proto._updCrosshair;
  Object.defineProperty(proto, INSTALLED, { value: true });
  proto._buildReticle = function (...args) {
    const result = buildReticle.apply(this, args);
    update(this, WEAPONS, args[0], true);
    return result;
  };
  proto._updCrosshair = function (...args) {
    const result = updateCrosshair.apply(this, args);
    update(this, WEAPONS);
    return result;
  };
}
