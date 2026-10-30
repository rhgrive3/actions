import assert from 'node:assert/strict';

// Metrics only, for the centrally owned supported browser. No launch/capture.
export async function assertLandscapeWeaponHeader(page, viewport) {
  const m = await page.evaluate(() => {
    const root = document.querySelector('.iw-screen.iw-loadout:not(.is-leaving)');
    if (!root) return null;
    const rect = e => { const r = e.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
    const textRects = el => {
      const result = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim() || node.parentElement.closest('svg,.iw-head__blob')) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const r of range.getClientRects()) if (r.width && r.height) result.push({left:r.left,top:r.top,right:r.right,bottom:r.bottom});
      }
      return result;
    };
    const head = root.querySelector('.iw-head'), label = root.querySelector('.iw-loadout__body > .iw-seclabel');
    const count = label?.querySelector('.iw-seclabel__count'), back = head?.querySelector('.iw-backbtn');
    const grid = root.querySelector('.s3-wgrid'), focus = grid?.querySelector('.iw-wcard.is-focus');
    const gs = grid && getComputedStyle(grid), fs = focus && getComputedStyle(focus);
    const hit = back && document.elementFromPoint(back.getBoundingClientRect().left + back.getBoundingClientRect().width/2, back.getBoundingClientRect().top + back.getBoundingClientRect().height/2);
    return {
      section:label && rect(label), count:count && {text:count.textContent,rect:rect(count)},
      back:back && {rect:rect(back),hit:hit===back || back.contains(hit)},
      titleText:head && textRects(head.querySelector('.iw-head__title')),
      subtitleText:head && textRects(head.querySelector('.iw-head__sub')),
      grid:grid && {rect:rect(grid),gap:[parseFloat(gs.rowGap),parseFloat(gs.columnGap)],padding:[gs.paddingTop,gs.paddingRight,gs.paddingBottom,gs.paddingLeft].map(parseFloat)},
      focus:focus && {rect:rect(focus),transform:fs.transform,shadow:fs.boxShadow},
    };
  });
  assert(m?.grid && m.focus, 'missing active weapon grid/focus');
  const shadows = m.focus.shadow.split(/,(?![^()]*\))/).filter(s => !s.includes('inset'));
  const extents = shadows.map(s => {
    const px = s.replace(/rgba?\([^)]*\)/g, '').match(/-?(?:\d*\.)?\d+px/g)?.map(parseFloat) || [];
    assert.equal(px.length, 4, 'unexpected weapon focus shadow format: '+s);
    return Math.max(Math.abs(px[0]),Math.abs(px[1])) + px[2] + px[3];
  });
  const radius = Math.max(...extents);
  assert(Math.abs(radius-6) < .1, 'weapon focus ring is not the bounded 6px frame');
  assert.equal(m.focus.transform, 'none', 'focused weapon still scales into adjacent cards');
  assert(m.grid.gap.every(n => n >= radius*2+1), 'focus frames consume the card gutter');
  assert(m.grid.padding.every(n => n >= radius+1), 'focus frame clipped by grid padding');
  if (viewport.height <= 500) {
    const inside = r => r.left>=-1 && r.top>=-1 && r.right<=viewport.width+1 && r.bottom<=viewport.height+1;
    const overlaps = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
    assert(m.section && m.count && m.back && m.titleText.length && m.subtitleText.length, 'short weapon header lost content');
    assert(/^\s*\d+\s*\/\s*\d+\s*$/.test(m.count.text), 'active/total weapon count missing');
    assert(inside(m.section) && inside(m.count.rect), 'weapon section/count outside viewport');
    assert(inside(m.back.rect) && m.back.rect.width>=43 && m.back.rect.height>=43 && m.back.hit, 'back target obscured/small');
    assert(!overlaps(m.section,m.back.rect), 'weapon count overlaps Back');
    for (const r of [...m.titleText,...m.subtitleText]) {
      assert(inside(r), 'weapon header text outside viewport');
      assert(!overlaps(r,m.section), 'weapon count overlaps header text');
      assert(!overlaps(r,m.back.rect), 'weapon header text overlaps Back');
    }
  }
  return m;
}
