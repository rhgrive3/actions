// Charger-family charge circle at 60 % of its former radius (owner request
// 2026-11-05: "チャージ系武器のチャージ円の半径を約60%に"). Applies to every
// weapon that uses the Charger reticle (Chargers, Stringers, Splatanas).
//
// Not a uniform scale of the whole cluster:
//  - centre: unchanged (the circle stays on the reticle origin / shot guide);
//  - radius: 15 -> 9 px (CSS px at reticle scale 1);
//  - stroke widths: unchanged (track 1.4, charge arc 2.9, notches 1.5), so the
//    ring does not get thinner when it gets smaller;
//  - notches and the three cross lines keep their gap and length relative to
//    the ring (positions x 0.6), so the cluster keeps its shape;
//  - charge progress, full-charge colour/flash, the idle / delay hiding, the
//    scope dimming and the reach marks are the existing owners, unchanged.
// No Splatoon 3 pixel measurement exists for this ring; 60 % is the owner's
// instruction, not a retail value.
export const CHARGER_RING = Object.freeze({
  previousRadius: 15, radius: 9, ratio: 0.6,
  notchInner: 11.4, notchOuter: 13.2,
  // cross lines: start 6 px outside the old ring (21) and 10 px long -> x0.6
  lineStart: 12.6, lineLength: 6, lineDrawIn: 3.6, downStart: 12, downLength: 4.2,
});
const R = CHARGER_RING;
const n = v => String(+v.toFixed(2));

const OLD_MARKUP = `      const C = 2 * Math.PI * 15;
      r.innerHTML = \`<i class="iw-ret__dot"></i><i class="iw-ret__line l"></i><i class="iw-ret__line r"></i><i class="iw-ret__line d"></i>
        <svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="15" class="iw-ret__track"/><circle r="15" class="iw-ret__charge" style="stroke-dasharray:\${C.toFixed(2)};stroke-dashoffset:\${C.toFixed(2)}"/>
        <g class="iw-ret__notch"><path d="M0 -19 L0 -22"/><path d="M19 0 L22 0"/><path d="M0 19 L0 22"/><path d="M-19 0 L-22 0"/></g></svg>\`;`;
const a = n(R.notchInner), b = n(R.notchOuter);
const NEW_MARKUP = `      const C = 2 * Math.PI * ${R.radius};
      r.innerHTML = \`<i class="iw-ret__dot"></i><i class="iw-ret__line l"></i><i class="iw-ret__line r"></i><i class="iw-ret__line d"></i>
        <svg class="iw-ret__svg" viewBox="-40 -40 80 80" aria-hidden="true"><circle r="${R.radius}" class="iw-ret__track"/><circle r="${R.radius}" class="iw-ret__charge" style="stroke-dasharray:\${C.toFixed(2)};stroke-dashoffset:\${C.toFixed(2)}"/>
        <g class="iw-ret__notch"><path d="M0 -${a} L0 -${b}"/><path d="M${a} 0 L${b} 0"/><path d="M0 ${a} L0 ${b}"/><path d="M-${a} 0 L-${b} 0"/></g></svg>\`;`;

// Charger-scoped so the shared .iw-ret__line rules of other reticles keep
// their geometry.
export const CHARGER_RING_CSS = `
/* 2026-11-05: Charger-family charge circle at 60 % radius; strokes unchanged. */
.iw-ret--charger .iw-ret__line { width: ${n(R.lineLength)}px; }
.iw-ret--charger .iw-ret__line.l { left: -${n(R.lineStart + R.lineLength)}px; }
.iw-ret--charger .iw-ret__line.r { left: ${n(R.lineStart)}px; }
.iw-ret--charger .iw-ret__line.d { top: ${n(R.downStart)}px; width: 1.75px; height: ${n(R.downLength)}px; }
.iw-ret--charger.is-charging .iw-ret__line.l { translate: calc(var(--ch, 0) * ${n(R.lineDrawIn)}px) 0; }
.iw-ret--charger.is-charging .iw-ret__line.r { translate: calc(var(--ch, 0) * -${n(R.lineDrawIn)}px) 0; }
`;

export function adaptChargerReticleSize(rel, code, replaceOnce) {
  if (rel === 'src/ui/hud.js') return replaceOnce(code, OLD_MARKUP, NEW_MARKUP, 'charger charge circle at 60% radius');
  if (rel === 'styles/hud.css') return code + CHARGER_RING_CSS;
  return code;
}
