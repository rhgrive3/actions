import contextlib
import hashlib
import http.server
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
from inkwave_source_mirror import Limits, MirrorFailure, SameOriginRedirects, mirror, origin


@contextlib.contextmanager
def server(routes):
    hits = []
    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'
        def log_message(self, *_):
            pass
        def do_GET(self):
            hits.append(self.path)
            route = routes.get(self.path)
            if callable(route):
                try:
                    route(self)
                except (BrokenPipeError, ConnectionResetError):
                    pass
                return
            status, headers, body = route or (404, {}, b'missing')
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    httpd.daemon_threads = True
    thread = threading.Thread(target=httpd.serve_forever, kwargs={'poll_interval': .01}, daemon=True)
    thread.start()
    try:
        yield 'http://127.0.0.1:' + str(httpd.server_port) + '/', hits
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join()


def run(base, limits=None):
    directory = tempfile.TemporaryDirectory()
    path = Path(directory.name) / 'candidate'
    result = mirror(base, path, limits or Limits(resource_bytes=4096, total_bytes=32768, resources=32, seconds=3, socket_seconds=.5))
    rows = json.loads((path / 'FETCH_MANIFEST.json').read_text())
    return directory, path, result, rows


class MirrorTests(unittest.TestCase):
    def test_success_keeps_source_bytes_paths_queries_redirects_and_optional_maps(self):
        routes = {'/': (200, {'Content-Type': 'text/html'}, b'<script src="/module.js"></script><a href="/redirect">asset</a><img src="/image%20one.png?x=1#fragment">'),
                  '/module.js': (200, {'Content-Type': 'text/javascript'}, b"import './a.mjs';"), '/a.mjs': (200, {}, b'export const a=1;'),
                  '/redirect': (302, {'Location': '/actual.bin'}, b''), '/actual.bin': (200, {}, b'actual'), '/image%20one.png?x=1': (200, {}, b'image')}
        with server(routes) as (base, hits):
            d, path, result, rows = run(base)
            try:
                self.assertFalse(result['failed'])
                self.assertEqual((path / 'actual.bin').read_bytes(), b'actual')
                self.assertEqual((path / ('image%20one.q-' + hashlib.sha1(b'x=1').hexdigest()[:10] + '.png')).read_bytes(), b'image')
                self.assertEqual(sum(r.get('bytes', 0) for r in rows), result['bytes_saved'])
                for row in rows:
                    if 'path' in row:
                        self.assertEqual(hashlib.sha256((path / row['path']).read_bytes()).hexdigest(), row['sha256'])
                self.assertTrue(any(r.get('optional') and r['url'].endswith('.map') for r in rows))
                self.assertTrue(any(r.get('redirect_chain') for r in rows))
                self.assertEqual(hits.count('/module.js'), 1)
                self.assertFalse(list(path.glob('.mirror-download-*')))
            finally:
                d.cleanup()

    def test_cross_origin_302_307_308_is_rejected_before_any_foreign_contact(self):
        with server({'/foreign': (200, {}, b'must not read')}) as (foreign, hits):
            for status in (302, 307, 308):
                with self.subTest(status=status), server({'/': (status, {'Location': foreign + 'foreign'}, b'')}) as (base, _):
                    d, path, result, rows = run(base)
                    try:
                        self.assertTrue(result['failed'])
                        self.assertEqual(rows[-1]['reason'], 'outside-allowed-origin')
                        self.assertEqual(result['bytes_saved'], 0)
                        self.assertEqual(hits, [])
                    finally:
                        d.cleanup()

    def test_https_downgrade_and_redirect_loop_are_rejected(self):
        guard = SameOriginRedirects(origin('https://example.invalid/'), 2, lambda: 1)
        with self.assertRaisesRegex(MirrorFailure, 'outside-allowed-origin'):
            guard.redirect_request(urllib.request.Request('https://example.invalid/'), None, 302, '', {}, 'http://example.invalid/')
        with server({'/': (302, {'Location': '/loop'}, b''), '/loop': (302, {'Location': '/'}, b'')}) as (base, _):
            d, _, result, rows = run(base, Limits(1024, 4096, 16, 2, .5, 2))
            try:
                self.assertTrue(result['failed'])
                self.assertEqual(rows[-1]['reason'], 'redirect-limit')
            finally:
                d.cleanup()

    def test_redirect_body_is_closed_without_unbounded_drain(self):
        def redirect(handler):
            handler.send_response(302)
            handler.send_header('Location', '/final.bin')
            handler.send_header('Content-Length', str(1000000000))
            handler.end_headers()
            handler.wfile.flush()
            time.sleep(.25)  # No body arrives before the complete crawl deadline.
        with server({'/': redirect, '/final.bin': (200, {}, b'final')}) as (base, hits):
            d, _, result, rows = run(base, Limits(1024, 4096, 16, .15, .1))
            try:
                self.assertFalse(result['failed'])
                self.assertEqual(result['bytes_read'], 5)
                self.assertIn('/final.bin', hits)
                self.assertTrue(rows[0]['redirect_chain'])
            finally:
                d.cleanup()

    def test_path_alias_collision_cannot_overwrite_an_earlier_candidate(self):
        page = b'<img src="/a//b.bin"><img src="/a/b.bin">'
        with server({'/': (200, {'Content-Type': 'text/html'}, page), '/a//b.bin': (200, {}, b'first'), '/a/b.bin': (200, {}, b'second')}) as (base, _):
            d, path, result, rows = run(base)
            try:
                self.assertTrue(result['failed'])
                self.assertEqual(rows[-1]['reason'], 'path-collision')
                self.assertEqual((path / 'a/b.bin').read_bytes(), b'first')
            finally:
                d.cleanup()

    def test_declared_and_chunked_oversize_never_publish_partial_files(self):
        def chunked(handler):
            handler.send_response(200)
            handler.send_header('Transfer-Encoding', 'chunked')
            handler.end_headers()
            for _ in range(20):
                handler.wfile.write(b'80\r\n' + b'x' * 128 + b'\r\n')
                handler.wfile.flush()
            handler.wfile.write(b'0\r\n\r\n')
        for response in [(200, {}, b'x' * 2048), chunked]:
            with server({'/': response}) as (base, _):
                d, path, result, rows = run(base, Limits(1024, 4096, 16, 2, .5))
                try:
                    self.assertTrue(result['failed'])
                    self.assertEqual(rows[-1]['reason'], 'resource-byte-limit')
                    self.assertLessEqual(result['bytes_read'], 1025)
                    self.assertFalse((path / 'index.html').exists())
                    self.assertFalse(list(path.glob('.mirror-download-*')))
                finally:
                    d.cleanup()

    def test_total_and_resource_count_budgets_stop_admission(self):
        page = b'<img src="/a.bin"><img src="/b.bin">'
        routes = {'/': (200, {'Content-Type': 'text/html'}, page), '/a.bin': (200, {}, b'a' * 80), '/b.bin': (200, {}, b'b' * 80)}
        for limits, reason in [(Limits(4096, 150, 16, 2, .5), 'total-byte-limit'), (Limits(4096, 4096, 2, 2, .5), 'resource-count-limit')]:
            with server(routes) as (base, _):
                d, _, result, rows = run(base, limits)
                try:
                    self.assertTrue(result['failed'])
                    self.assertEqual(rows[-1]['reason'], reason)
                    self.assertLessEqual(result['bytes_saved'], limits.total_bytes)
                    self.assertLessEqual(result['queued_resources'], limits.resources)
                finally:
                    d.cleanup()

    def test_slow_stream_has_global_deadline_and_interrupted_body_is_not_valid(self):
        def slow(handler):
            handler.send_response(200)
            handler.send_header('Content-Length', '100')
            handler.end_headers()
            for _ in range(100):
                handler.wfile.write(b'x')
                handler.wfile.flush()
                time.sleep(.04)
        def interrupted(handler):
            handler.send_response(200)
            handler.send_header('Content-Length', '100')
            handler.end_headers()
            handler.wfile.write(b'short')
            handler.wfile.flush()
            handler.connection.shutdown(socket.SHUT_WR)
        for response, limit, reason in [(slow, .13, 'crawl-deadline'), (interrupted, 2, 'truncated-response')]:
            with server({'/': response}) as (base, _):
                started = time.monotonic()
                d, path, result, rows = run(base, Limits(1024, 4096, 16, limit, .5))
                try:
                    self.assertTrue(result['failed'])
                    self.assertEqual(rows[-1]['reason'], reason)
                    self.assertLess(time.monotonic() - started, .8)
                    self.assertFalse((path / 'index.html').exists())
                finally:
                    d.cleanup()

    def test_external_source_map_is_ignored_and_encoded_traversal_cannot_write(self):
        with server({'/outside': (200, {}, b'outside')}) as (foreign, hits):
            text = ('//# sourceMappingURL=' + foreign + 'outside').encode()
            with server({'/': (200, {'Content-Type': 'text/javascript'}, text)}) as (base, _):
                d, _, result, _ = run(base)
                try:
                    self.assertFalse(result['failed'])
                    self.assertEqual(hits, [])
                    self.assertEqual(result['skipped_external_references'], 1)
                finally:
                    d.cleanup()
        with server({'/': (200, {'Content-Type': 'text/html'}, b'<img src="/%2e%2e/escape.bin">')}) as (base, _):
            d, path, result, rows = run(base)
            try:
                self.assertTrue(result['failed'])
                self.assertEqual(rows[-1]['reason'], 'unsafe-path')
                self.assertFalse((path.parent / 'escape.bin').exists())
            finally:
                d.cleanup()

    def test_cli_keeps_failure_manifest_and_nonzero_status(self):
        with server({'/': (200, {}, b'x' * 2048)}) as (base, _), tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'candidate'
            process = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / 'fetch-inkwave-source.py'), str(target), '--base', base, '--max-resource-bytes', '1024'], capture_output=True, text=True)
            self.assertEqual(process.returncode, 1, process.stderr)
            self.assertTrue(json.loads((target / 'MIRROR_POLICY.json').read_text())['failed'])
            self.assertEqual(json.loads((target / 'FETCH_MANIFEST.json').read_text())[-1]['reason'], 'resource-byte-limit')


if __name__ == '__main__':
    unittest.main()
