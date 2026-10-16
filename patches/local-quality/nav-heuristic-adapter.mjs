// Build-only A* optimization: each node's heuristic is constant during a search.
// Keep Float64 precision and the original queue priorities/tie order.
export function adaptNavHeuristic(rel, code, once) {
  if (rel !== 'src/game/nav.js') return code;
  code = once(code, 'this._g = new Float32Array(N);',
    'this._h = new Float64Array(N); this._g = new Float32Array(N);', 'A* heuristic storage');
  code = once(code, '    const g = this._g, from = this._from, seen = this._seen, closed = this._closed;',
    '    const heuristic = this._h;\n    const g = this._g, from = this._from, seen = this._seen, closed = this._closed;', 'A* heuristic scratch');
  code = once(code, '    heap.push(a, h(nodes[a]));',
    '    heap.push(a, heuristic[a] = h(nodes[a]));', 'A* start heuristic');
  code = once(code, '          seen[e.to] = st; g[e.to] = ng; from[e.to] = cur;',
    '          if (seen[e.to] !== st) heuristic[e.to] = h(m);\n          seen[e.to] = st; g[e.to] = ng; from[e.to] = cur;', 'A* first-visit heuristic');
  return once(code, '          heap.push(e.to, ng + h(m));',
    '          heap.push(e.to, ng + heuristic[e.to]);', 'A* reuse heuristic on relaxation');
}
