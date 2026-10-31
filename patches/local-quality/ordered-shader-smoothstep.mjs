// GLSL ES defines smoothstep only for increasing edges. Preserve the intended
// descending Hermite curve by complementing an increasing one at build time.
// This transform is used only by explicit non-stage material/FX adapters.
const NUMBER = '-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';

export function orderedShaderSmoothsteps(source) {
  const re = new RegExp('\\bsmoothstep\\(\\s*(' + NUMBER + ')\\s*,\\s*(' + NUMBER + ')\\s*,', 'g');
  let result = '', cursor = 0, match;
  while ((match = re.exec(source))) {
    const a = Number(match[1]), b = Number(match[2]);
    if (a < b) continue;
    if (a === b) throw new Error('Shader has a zero-width smoothstep');
    let end = re.lastIndex, depth = 1;
    for (; end < source.length && depth; end++) {
      if (source[end] === '(') depth++;
      else if (source[end] === ')') depth--;
    }
    if (depth) throw new Error('Shader smoothstep is unbalanced');
    const value = orderedShaderSmoothsteps(source.slice(re.lastIndex, end - 1).trim());
    result += source.slice(cursor, match.index) + `(1.0 - smoothstep(${match[2]}, ${match[1]}, ${value}))`;
    cursor = end;
    re.lastIndex = end;
  }
  return result + source.slice(cursor);
}

// Variable edges cannot be ordered by a generic rewrite. Callers provide only
// reviewed pairs whose positive width is established by their shader formula.
export function orderedVariableSmoothstep(source, high, low) {
  const before = `smoothstep(${high}, ${low},`;
  const start = source.indexOf(before);
  if (start < 0 || source.indexOf(before, start + before.length) >= 0)
    throw new Error('Shader descending-ramp anchor changed: ' + before);
  let end = start + before.length, depth = 1;
  for (; end < source.length && depth; end++) {
    if (source[end] === '(') depth++;
    else if (source[end] === ')') depth--;
  }
  if (depth) throw new Error('Shader variable smoothstep is unbalanced');
  const value = source.slice(start + before.length, end - 1).trim();
  return source.slice(0, start) + `(1.0 - smoothstep(${low}, ${high}, ${value}))` + source.slice(end);
}
