// Local browser verification uses the same source composition as production.
// No generated native payloads or publishable build manifest are fabricated.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2', '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.wav':'audio/wav' };

export function createMap3SourceServer() {
  const cache = new Map(), failures = [];
  const server = http.createServer((request, response) => {
    let rel = '';
    try {
      rel = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
      if (rel.split('/').includes('..') || rel.includes('\0')) throw Error('invalid path');
      const repoPath = rel.startsWith('patches/') ? rel : 'inkwave-public/' + rel;
      const file = path.resolve(ROOT, repoPath);
      if (!file.startsWith(ROOT)) throw Error('invalid path');
      let contents;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const stat = fs.statSync(file), cached = cache.get(repoPath);
        if (cached?.mtime === stat.mtimeMs) contents = cached.contents;
        else {
          contents = fs.readFileSync(file);
          if (!rel.startsWith('patches/') && /\.(?:js|css|html)$/.test(rel)) contents = Buffer.from(adaptBuildSource(rel, contents.toString()));
          cache.set(repoPath, { mtime: stat.mtimeMs, contents });
        }
      } else {
        // Sparse review checkouts may omit unchanged binary assets. Read their
        // exact pinned Git blobs without materializing a duplicate game tree.
        contents = cache.get(repoPath)?.contents;
        if (!contents) {
          contents = execFileSync('git', ['show', 'HEAD:' + repoPath], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
          cache.set(repoPath, { contents });
        }
      }
      response.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream', 'cache-control':'no-store' });
      response.end(contents);
    } catch (error) {
      failures.push({ path: rel, message: String(error.message).slice(0, 220) });
      response.writeHead(404, { 'content-type':'text/plain' }); response.end('Asset unavailable: ' + rel);
    }
  });
  return { server, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createMap3SourceServer();
  server.listen(Number(process.env.PORT || 4185), '127.0.0.1', () => console.log('MAP3 composed source at http://127.0.0.1:' + server.address().port));
}
