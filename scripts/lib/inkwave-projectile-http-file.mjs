import fs from 'node:fs';
import path from 'node:path';

// Serve the immutable local capture asset with browser-compatible media ranges.
// The caller owns URL resolution and its existing build-root boundary check.
export function serveProjectileCaptureFile(req, res, file, mime) {
  const size = fs.statSync(file).size;
  const headers = {
    'content-type': path.extname(file) === '.mp3' ? 'audio/mp3' : mime[path.extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
    'accept-ranges': 'bytes',
    'content-length': size,
  };
  // HTTP Range applies to GET, not HEAD. HEAD reports the full representation.
  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  let start = 0, end = size - 1, status = 200;
  if (req.method === 'GET' && req.headers.range !== undefined) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    let valid = Boolean(match && (match[1] || match[2]) && size > 0);
    if (valid) {
      const first = match[1] === '' ? null : Number(match[1]);
      const last = match[2] === '' ? null : Number(match[2]);
      valid = (first === null || Number.isSafeInteger(first)) && (last === null || Number.isSafeInteger(last));
      if (first === null) {
        valid = valid && last > 0;
        start = Math.max(0, size - last);
      } else {
        start = first;
        end = last === null ? size - 1 : Math.min(last, size - 1);
        valid = valid && start < size && start <= end;
      }
    }
    if (!valid) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}`, 'content-length': 0 });
      res.end();
      return;
    }
    status = 206;
    headers['content-range'] = `bytes ${start}-${end}/${size}`;
    headers['content-length'] = end - start + 1;
  }
  res.writeHead(status, headers);
  if (size === 0) res.end();
  else {
    const source = fs.createReadStream(file, { start, end });
    source.on('error', error => res.destroy(error));
    res.once('close', () => source.destroy());
    source.pipe(res);
  }
}
