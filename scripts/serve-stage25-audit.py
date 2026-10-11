"""Serve a local diagnostic game build for audit-stage25-browser.py.

This binds to loopback only. CORS is required by the audit's about:blank HTML
fixture; it is not a production server or a multiplayer server.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('build_root', type=Path)
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    root = args.build_root.resolve()
    if not (root / 'index.html').is_file():
        parser.error(f'Missing built index.html: {root}')

    class Handler(SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            super().end_headers()

    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(root)))
    print(f'Audit assets: http://127.0.0.1:{args.port}/ ({root})', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
