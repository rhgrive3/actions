// Synchronous roster snapshots. Each nested lease owns a distinct array;
// callers release in finally so exceptions and callbacks never retain actors.
export class SnapshotPool {
  constructor() { this.arrays = []; this.depth = 0; }
  take(source, second) {
    const depth = this.depth++, out = this.arrays[depth] ||= [];
    out.length = 0;
    try {
      for (const value of source) out.push(value);
      if (second) for (const value of second) out.push(value);
      return out;
    } catch (error) { this.release(out); throw error; }
  }
  release(out) { out.length = 0; this.depth--; }
}
