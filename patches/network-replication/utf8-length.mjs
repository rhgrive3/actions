// Exact TextEncoder UTF-8 length, including U+FFFD for isolated surrogates.
export function utf8ByteLength(text) {
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) { size++; continue; }
    if (unit < 0x800) { size += 2; continue; }
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { size += 4; i++; continue; }
    }
    size += 3;
  }
  return size;
}
