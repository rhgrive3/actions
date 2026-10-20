// Test-only broad phase. Inclusive bounds match THREE.Box3.intersectsBox.
// Return original face order so narrow-phase results and examples stay unchanged.
export function createTriangleAabbIndex(boxes) {
  const records = boxes.map((b, id) => {
    const min = [b.min.x, b.min.y, b.min.z], max = [b.max.x, b.max.y, b.max.z];
    if (!min.every(Number.isFinite) || !max.every(Number.isFinite) || min.some((n, i) => n > max[i])) throw new Error('Invalid triangle AABB');
    return { id, min, max };
  });
  function build(items) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const b of items) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
    if (items.length <= 8) return { min, max, items };
    let axis = 0;
    for (let i = 1; i < 3; i++) if (max[i] - min[i] > max[axis] - min[axis]) axis = i;
    const sorted = items.slice().sort((a, b) => (a.min[axis] + a.max[axis]) - (b.min[axis] + b.max[axis]) || a.id - b.id);
    const middle = sorted.length >> 1;
    return { min, max, left: build(sorted.slice(0, middle)), right: build(sorted.slice(middle)) };
  }
  const root = records.length ? build(records) : null;
  return box => {
    const out = [];
    if (!root) return out;
    const { min, max } = box;
    const intersects = b => !(b.max[0] < min.x || b.min[0] > max.x || b.max[1] < min.y || b.min[1] > max.y || b.max[2] < min.z || b.min[2] > max.z);
    function visit(node) {
      if (!intersects(node)) return;
      if (node.items) { for (const b of node.items) if (intersects(b)) out.push(b.id); }
      else { visit(node.left); visit(node.right); }
    }
    visit(root);
    return out.sort((a, b) => a - b);
  };
}
