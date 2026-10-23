// Strict compatibility bridge for the still-pinned character geometry Builder.
export function adaptShoeReadTransform(rel, code, once) {
  if (rel !== 'src/game/character-geo.js') return code;
  code = once(code, "    const base = this.pos.length / 3; const p = new V3();", "    const base = this.pos.length / 3; const p = new V3();\n    const transformedNormal = o.readTransform ? new V3() : null;", 'shoe read transform: 1');
  code = once(code, "      p.fromBufferAttribute(P, i);\n      this.pos.push(p.x, p.y, p.z);\n      this.nrm.push(N.getX(i), N.getY(i), N.getZ(i));", "      p.fromBufferAttribute(P, i);\n      if (transformedNormal) {\n        transformedNormal.fromBufferAttribute(N, i);\n        o.readTransform(p, transformedNormal, i);\n      }\n      this.pos.push(p.x, p.y, p.z);\n      if (transformedNormal) this.nrm.push(transformedNormal.x, transformedNormal.y, transformedNormal.z);\n      else this.nrm.push(N.getX(i), N.getY(i), N.getZ(i));", 'shoe read transform: 2');
  code = once(code, "    if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) this.idx.push(ix[i] + base); }\n    else for (let i = 0; i < P.count; i++) this.idx.push(i + base);", "    if (geo.index) {\n      const ix = geo.index.array;\n      if (o.flipWinding) for (let i = 0; i < ix.length; i += 3) this.idx.push(ix[i] + base, ix[i + 2] + base, ix[i + 1] + base);\n      else for (let i = 0; i < ix.length; i++) this.idx.push(ix[i] + base);\n    } else for (let i = 0; i < P.count; i++) this.idx.push(i + base);", 'shoe read transform: 3');
  return code;
}
