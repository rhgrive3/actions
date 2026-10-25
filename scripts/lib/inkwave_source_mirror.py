"""Bounded, same-origin mirror of public source candidates; never publishes them."""
from collections import deque
from dataclasses import asdict, dataclass
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


@dataclass(frozen=True)
class Limits:
    # The checked-in historical mirror is 67 files / 4,817,370 bytes, largest
    # 1,458,113 bytes. These are generous configurable guardrails, not a claim
    # about today's upstream (whose hostname differs from that old manifest).
    resource_bytes: int = 16 * 1024 * 1024
    total_bytes: int = 128 * 1024 * 1024
    resources: int = 2048
    seconds: float = 600
    socket_seconds: float = 30
    redirects: int = 8

    def __post_init__(self):
        if any(not isinstance(v, (int, float)) or not 0 < v < float('inf') for v in asdict(self).values()):
            raise ValueError('All mirror limits must be positive and finite')
        if any(not isinstance(getattr(self, key), int) for key in ('resource_bytes', 'total_bytes', 'resources', 'redirects')):
            raise ValueError('Byte, resource and redirect limits must be integers')


class MirrorFailure(Exception):
    def __init__(self, reason, **details):
        super().__init__(reason)
        self.reason, self.details = reason, details


def origin(url):
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
        raise MirrorFailure('unsupported-origin')
    try:
        return p.scheme, p.hostname.lower(), p.port or (443 if p.scheme == 'https' else 80)
    except ValueError as error:
        raise MirrorFailure('invalid-port') from error


def normalize_url(url, allowed):
    if len(url.encode('utf-8')) > 2048 or re.search(r'[\x00-\x20\\]', url):
        raise MirrorFailure('invalid-url')
    if origin(url) != allowed:
        raise MirrorFailure('outside-allowed-origin')
    p = urllib.parse.urlsplit(url)
    decoded = urllib.parse.unquote(p.path)
    if '\\' in decoded or re.search(r'[\x00-\x1f]', decoded) or any(s in ('.', '..') for s in decoded.split('/')):
        raise MirrorFailure('unsafe-path')
    return urllib.parse.urlunsplit((p.scheme, p.netloc, p.path or '/', p.query, ''))


def relative_path(url):
    p = urllib.parse.urlsplit(url)
    name = p.path or '/index.html'
    if name.endswith('/'):
        name += 'index.html'
    if p.query:
        stem, suffix = os.path.splitext(name)
        name = stem + '.q-' + hashlib.sha1(p.query.encode()).hexdigest()[:10] + suffix
    rel = Path(name.lstrip('/'))
    if str(rel) in ('FETCH_MANIFEST.json', 'README_FETCH.txt', 'MIRROR_POLICY.json') or str(rel).startswith('.mirror-download-'):
        raise MirrorFailure('reserved-path')
    return rel


class SameOriginRedirects(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed, limit, check_deadline):
        self.allowed, self.limit, self.check_deadline, self.chain = allowed, limit, check_deadline, []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.check_deadline()
        self.chain.append({'from': req.full_url, 'to': newurl, 'status': code})
        if len(self.chain) > self.limit:
            raise MirrorFailure('redirect-limit')
        # Called before urllib issues the redirected request, including 307/308.
        normalized = normalize_url(newurl, self.allowed)
        return super().redirect_request(req, fp, code, msg, headers, normalized)

    def http_error_302(self, req, fp, code, msg, headers):
        location = headers.get('location') or headers.get('uri')
        if location is None:
            return None
        try:
            redirected = self.redirect_request(req, fp, code, msg, headers, urllib.parse.urljoin(req.full_url, location))
        finally:
            # The standard redirect handler drains fp.read() before following.
            # Close instead: redirect bodies must never bypass body budgets.
            fp.close()
        return self.parent.open(redirected, timeout=self.check_deadline())

    http_error_301 = http_error_303 = http_error_307 = http_error_308 = http_error_302


def references(text, final):
    patterns = [
        r'''(?:src|href)=["']([^"']+)["']''',
        r'''url\((?:["']?)([^)"']+)(?:["']?)\)''',
        r'''["'](/(?:assets|_next|static|fonts|images|img|audio|models|textures)/[^"']+)["']''',
        r'''(?:from\s*|import\s*\()\s*["']([^"']+)["']''',
        r'''import\s*["']([^"']+)["']''',
        r'''["']((?:\./|\.\./)[^"']+\.(?:js|mjs|css|json|svg|png|jpg|jpeg|webp|glb|gltf|bin|wasm|wav|mp3|ogg|woff2?))["']''',
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.I):
            ref = match[1].strip()
            if not ref or ref.startswith(('data:', 'blob:', 'javascript:', '#', 'mailto:', 'tel:')):
                continue
            if ref == 'three':
                ref = '/vendor/three/build/three.module.js'
            elif ref.startswith('three/addons/'):
                ref = '/vendor/three/jsm/' + ref[len('three/addons/'):]
            elif not ref.startswith(('./', '../', '/', 'http://', 'https://')):
                continue
            yield urllib.parse.urljoin(final, ref), False
    for match in re.finditer(r'//# sourceMappingURL=([^\s]+)|/\*# sourceMappingURL=([^*]+)\*/', text):
        yield urllib.parse.urljoin(final, (match[1] or match[2]).strip()), True


def mirror(base, destination, limits=Limits()):
    allowed = origin(base)
    base = normalize_url(base, allowed)
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError('Mirror destination must be empty')
    started = time.monotonic()
    rows, queue, queued, owners = [], deque(), set(), {}
    state = {'bytes_read': 0, 'bytes_saved': 0, 'requests': 0, 'skipped_external_references': 0, 'failed': False}

    def remaining():
        seconds = limits.seconds - (time.monotonic() - started)
        if seconds <= 0:
            raise MirrorFailure('crawl-deadline')
        return min(limits.socket_seconds, seconds)

    def enqueue(url, optional=False):
        remaining()
        try:
            normalized = normalize_url(url, allowed)
        except MirrorFailure as error:
            if error.reason == 'outside-allowed-origin':
                state['skipped_external_references'] += 1
                return
            raise
        if normalized in queued:
            return
        if len(queued) >= limits.resources:
            raise MirrorFailure('resource-count-limit', limit=limits.resources)
        queued.add(normalized)
        queue.append((normalized, optional))

    redirects = SameOriginRedirects(allowed, limits.redirects, remaining)
    opener = urllib.request.build_opener(redirects)
    try:
        enqueue(base)
        while queue:
            url, optional = queue.popleft()
            temporary = None
            redirects.chain = []
            try:
                timeout = remaining()
                state['requests'] += 1
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 source-mirror/2.0', 'Accept-Encoding': 'identity'})
                with opener.open(req, timeout=timeout) as response:
                    final = normalize_url(response.geturl(), allowed)
                    rel = relative_path(final)
                    target = (destination / rel).resolve()
                    if not target.is_relative_to(destination):
                        raise MirrorFailure('path-escape')
                    if str(rel) in owners:
                        if owners[str(rel)] == final:
                            rows.append({'url': url, 'final_url': final, 'duplicate_of': str(rel), 'redirect_chain': redirects.chain})
                            continue
                        raise MirrorFailure('path-collision', path=str(rel))
                    headers, header_bytes, omitted_headers = {}, 0, 0
                    for key, value in response.headers.items():
                        size = len(key.encode()) + len(value.encode())
                        if header_bytes + size <= 16384:
                            headers[key] = value
                            header_bytes += size
                        else:
                            omitted_headers += 1
                    ctype = response.headers.get('content-type', '')[:1024]
                    expected = response.headers.get('content-length')
                    try:
                        expected = int(expected) if expected is not None else None
                    except ValueError:
                        raise MirrorFailure('invalid-content-length')
                    available = min(limits.resource_bytes, limits.total_bytes - state['bytes_read'])
                    if available < 0 or expected is not None and (expected < 0 or expected > available):
                        raise MirrorFailure('resource-byte-limit' if expected is not None and expected > limits.resource_bytes else 'total-byte-limit', expected_bytes=expected, available_bytes=available)
                    fd, temporary = tempfile.mkstemp(prefix='.mirror-download-', dir=destination)
                    count, sha = 0, hashlib.sha256()
                    with os.fdopen(fd, 'wb') as out:
                        while True:
                            timeout = remaining()
                            if response.isclosed():
                                break
                            # CPython's HTTPResponse uses a buffered SocketIO. A
                            # shrinking socket timeout plus read1 prevents a
                            # drip-fed body from extending the global deadline.
                            sock = getattr(getattr(response.fp, 'raw', None), '_sock', None)
                            if sock is None:
                                raise MirrorFailure('response-socket-unavailable')
                            sock.settimeout(timeout)
                            chunk = response.read1(min(65536, available - count + 1))
                            if not chunk:
                                break
                            count += len(chunk)
                            state['bytes_read'] += len(chunk)
                            if count > available:
                                reason = 'resource-byte-limit' if count > limits.resource_bytes else 'total-byte-limit'
                                raise MirrorFailure(reason, observed_bytes=count, available_bytes=available)
                            out.write(chunk)
                            sha.update(chunk)
                    if expected is not None and count != expected:
                        raise MirrorFailure('truncated-response', expected_bytes=expected, observed_bytes=count)
                    remaining()
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if target.exists():
                        raise MirrorFailure('path-collision', path=str(rel))
                    os.replace(temporary, target)
                    temporary = None
                    owners[str(rel)] = final
                    state['bytes_saved'] += count
                    rows.append({'url': url, 'final_url': final, 'path': str(rel), 'content_type': ctype, 'bytes': count, 'sha256': sha.hexdigest(), 'headers': headers, 'headers_omitted': omitted_headers, 'redirect_chain': redirects.chain})
                if any(x in ctype for x in ('text/', 'javascript', 'json', 'xml')) or rel.suffix in ('.html', '.js', '.mjs', '.css', '.json', '.xml', '.txt'):
                    text = target.read_text(encoding='utf-8', errors='replace')
                    for ref, ref_optional in references(text, final):
                        enqueue(ref, ref_optional)
                    if rel.suffix in ('.js', '.css'):
                        p = urllib.parse.urlsplit(final)
                        enqueue(urllib.parse.urlunsplit((p.scheme, p.netloc, p.path + '.map', p.query, '')), True)
            except MirrorFailure as error:
                rows.append({'url': url, 'error': str(error), 'reason': error.reason, 'policy_failure': True, 'redirect_chain': redirects.chain, **error.details})
                state['failed'] = True
                break
            except (OSError, urllib.error.URLError, http.client.HTTPException, ValueError) as error:
                reason = 'crawl-deadline' if time.monotonic() - started >= limits.seconds else 'fetch-error'
                rows.append({'url': url, 'error': (type(error).__name__ + ': ' + str(error))[:512], 'reason': reason, 'optional': optional, 'redirect_chain': redirects.chain})
                if not optional or reason == 'crawl-deadline':
                    state['failed'] = True
                if reason == 'crawl-deadline':
                    break
            finally:
                if temporary:
                    Path(temporary).unlink(missing_ok=True)
    except MirrorFailure as error:
        rows.append({'url': base, 'error': str(error), 'reason': error.reason, 'policy_failure': True, **error.details})
        state['failed'] = True
    finally:
        policy = {'schema': 1, 'base': base, 'allowed_origin': list(allowed), 'limits': asdict(limits), **state, 'queued_resources': len(queued), 'elapsed_seconds': time.monotonic() - started}
        (destination / 'FETCH_MANIFEST.json').write_text(json.dumps(rows, indent=2, ensure_ascii=False) + '\n')
        (destination / 'MIRROR_POLICY.json').write_text(json.dumps(policy, indent=2) + '\n')
        (destination / 'README_FETCH.txt').write_text('Publicly served assets mirrored from ' + base + '\nThis is not guaranteed to be the original repository source.\nPublic source maps are included when discoverable.\nPolicy failures and resource limits are recorded in MIRROR_POLICY.json.\n')
    return policy
