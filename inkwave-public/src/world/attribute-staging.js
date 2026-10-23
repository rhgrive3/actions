// Grow only the independent Float32 attributes. Position/normal arrays used by
// CPU topology decisions retain JavaScript double precision until finalization.
export class Float32Staging {
  constructor(itemSize, vertices = 64) {
    this.itemSize = itemSize;
    this.array = new Float32Array(vertices * itemSize);
    this.length = 0;
  }
  push(a, b, c, d) {
    const count = arguments.length, end = this.length + count;
    if (end > this.array.length) {
      const next = new Float32Array(Math.max(end, this.array.length * 2));
      next.set(this.array); this.array = next;
    }
    this.array[this.length++] = a;
    if (count > 1) this.array[this.length++] = b;
    if (count > 2) this.array[this.length++] = c;
    if (count > 3) this.array[this.length++] = d;
  }
  attribute(THREE) {
    // Exact view length prevents unused capacity from becoming extra vertices.
    return new THREE.BufferAttribute(this.array.subarray(0, this.length), this.itemSize);
  }
}
