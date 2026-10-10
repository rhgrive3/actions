import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const mime = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2',
};
const baselineOverrides = new Set(['styles/mobile.css', 'src/ui/menus.js', 'src/ui/news.js']);

const isInside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

function sendNotFound(response) {
  if (response.headersSent || response.writableEnded || response.destroyed) return;
  response.writeHead(404);
  response.end('Missing');
}

export function createResponsiveAssetServer({ source, html, baseline }) {
  const sourceRoot = path.resolve(source);
  const baselineRoot = baseline ? path.join(path.resolve(baseline), 'inkwave-public') : null;

  return http.createServer((request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/__menus') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(html);
        return;
      }

      const relative = decodeURIComponent(url.pathname).slice(1);
      let file = path.resolve(sourceRoot, relative);
      if (!isInside(sourceRoot, file)) {
        sendNotFound(response);
        return;
      }
      if (baselineRoot && baselineOverrides.has(relative)) file = path.join(baselineRoot, relative);

      // Read the asset before committing a success status. Missing or invalid files
      // then take the single-response 404 path without a second writeHead call.
      const contents = fs.readFileSync(file);
      response.writeHead(200, {
        'content-type': mime[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(contents);
    } catch {
      sendNotFound(response);
    }
  });
}
