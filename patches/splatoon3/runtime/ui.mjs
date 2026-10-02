// Some public mirrors call the menu fitter without defining it. Restore its
// advertised shrink-to-fit behavior while keeping the original UI intact.
export function installUi({ Menus }) {
  if (typeof Menus.prototype._fitAll === 'function') return;
  Menus.prototype._fitAll = function (root) {
    for (const el of root.querySelectorAll('[data-fit]')) {
      el.style.fontSize = '';
      const base = parseFloat(getComputedStyle(el).fontSize), width = el.clientWidth;
      if (!width || !base || el.scrollWidth <= width) continue;
      let low = base * .6, high = base;
      for (let i = 0; i < 6; i++) {
        const size = (low + high) / 2; el.style.fontSize = size + 'px';
        if (el.scrollWidth > width) high = size; else low = size;
      }
      el.style.fontSize = low + 'px';
    }
  };
}
