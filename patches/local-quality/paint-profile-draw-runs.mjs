// Preserve primitive order and exact effective scissors. Only consecutive
// quads with the SAME effective rectangle share a draw; never union rectangles
// or reorder paint. A clipped-out quad breaks the run so its geometry cannot
// accidentally be included in a later range.
export function buildProfileDrawRuns(rectangles, count, clip, out) {
  if (!Number.isInteger(count) || count < 0 || count * 4 > rectangles.length || count * 6 > out.length)
    throw new RangeError('Invalid profile draw-run capacity');
  let runs = 0;
  for (let q = 0; q < count; q++) {
    const i = q * 4;
    let x = rectangles[i], y = rectangles[i + 1];
    let right = x + rectangles[i + 2], top = y + rectangles[i + 3];
    if (clip) {
      x = Math.max(x, clip.x); y = Math.max(y, clip.y);
      right = Math.min(right, clip.x + clip.z); top = Math.min(top, clip.y + clip.w);
    }
    const w = Math.max(0, right - x), h = Math.max(0, top - y);
    if (!w || !h) continue;
    const previous = (runs - 1) * 6;
    if (runs && out[previous] + out[previous + 1] === q &&
        out[previous + 2] === x && out[previous + 3] === y &&
        out[previous + 4] === w && out[previous + 5] === h) {
      out[previous + 1]++;
    } else {
      const at = runs++ * 6;
      out[at] = q; out[at + 1] = 1;
      out[at + 2] = x; out[at + 3] = y; out[at + 4] = w; out[at + 5] = h;
    }
  }
  return runs;
}
