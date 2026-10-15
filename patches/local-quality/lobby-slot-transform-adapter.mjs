const before = "if (a) O.el.style.transform = `translate3d(${Math.round(a.x)}px,${Math.round(a.y)}px,0) scale(${clamp(a.s || 1, 0.6, 1.25).toFixed(3)})`;";
const after = "if (a) { const transform = `translate3d(${Math.round(a.x)}px,${Math.round(a.y)}px,0) scale(${clamp(a.s || 1, 0.6, 1.25).toFixed(3)})`; if (transform !== O._slotTransform || O.el.style.transform !== O._slotAppliedTransform) { O.el.style.transform = transform; O._slotTransform = transform; O._slotAppliedTransform = O.el.style.transform; } }";
export function adaptLobbySlotTransform(rel, code) {
  if (rel !== 'src/ui/menus.js') return code;
  const first = code.indexOf(before);
  if (first < 0 || code.indexOf(before, first + before.length) >= 0) throw new Error('lobby slot transform: expected exactly one anchor');
  return code.slice(0, first) + after + code.slice(first + before.length);
}
