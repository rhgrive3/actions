"""Synthetic transport/integrity contracts. No original model downloads."""
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import subprocess
import tempfile
import threading
import unittest
import urllib.error
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('terrain_fetch', ROOT / 'scripts/fetch-inkwave-terrain-sources.py')
FETCH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FETCH)
ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
ABC_GIT_SHA1 = 'f2ba8f84ab5c1bce84a7b441cb1959cfc7093b7f'


class Response(io.BytesIO):
    def __init__(self, body, length=None, code=200):
        super().__init__(body)
        self.headers = {'Content-Length': str(len(body) if length is None else length)}
        self.code = code

    def getcode(self):
        return self.code


class FetchTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = pathlib.Path(self.scratch.name)
        self.target = self.root / 'synthetic.obj'
        self.receipt = {}

    def fetch(self, body, **kwargs):
        with mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=lambda *a, **k: Response(body, **kwargs)) as request, \
             mock.patch.object(FETCH.time, 'sleep'):
            FETCH.fetch('https://example.invalid/synthetic', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        return request

    def assert_numeric(self, value):
        if isinstance(value, dict):
            for child in value.values():
                self.assert_numeric(child)
        elif isinstance(value, list):
            for child in value:
                self.assert_numeric(child)
        else:
            self.assertIs(type(value), int)

    def test_exact_digest_success(self):
        self.fetch(b'abc')
        self.assertEqual(self.target.read_bytes(), b'abc')
        self.assertEqual(self.receipt['status'], 1)
        self.assertEqual(bytes(self.receipt['actualDigest']).hex(), ABC_SHA256)
        self.assertEqual(self.receipt['bytes'], 3)
        self.assertFalse(self.target.with_suffix('.obj.download').exists())
        self.assert_numeric(self.receipt)

    def test_same_length_wrong_digest_is_fatal(self):
        with self.assertRaisesRegex(ValueError, 'Source integrity mismatch'):
            self.fetch(b'abd')
        self.assertEqual(self.receipt['status'], 2)
        self.assertEqual(self.receipt['bytes'], self.receipt['contentLength'])
        self.assertNotEqual(self.receipt['actualDigest'], self.receipt['expectedDigest'])
        self.assertFalse(self.target.exists())

    def test_truncation_is_rejected_and_counted(self):
        with self.assertRaises(ValueError):
            self.fetch(b'ab', length=3)
        self.assertEqual(self.receipt['bytes'], 2)
        self.assertEqual(self.receipt['contentLength'], 3)
        self.assertEqual(bytes(self.receipt['actualDigest']).hex(), hashlib.sha256(b'ab').hexdigest())
        self.assertFalse(self.target.with_suffix('.obj.download').exists())

    def test_short_transfer_retries_same_source_and_verifies_digest(self):
        with mock.patch.object(FETCH.urllib.request, 'urlopen',
                               side_effect=[Response(b'ab', length=3), Response(b'abc')]) as request, \
             mock.patch.object(FETCH.time, 'sleep') as sleep:
            FETCH.fetch('https://example.invalid/synthetic', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(request.call_args_list[0], request.call_args_list[1])
        sleep.assert_called_once_with(1)
        self.assertEqual(self.target.read_bytes(), b'abc')
        self.assertEqual(self.receipt['attemptCount'], 2)
        self.assertEqual(bytes(self.receipt['actualDigest']).hex(), ABC_SHA256)
        self.assert_numeric(self.receipt)

    def test_repeated_short_transfers_stop_after_three_attempts(self):
        with mock.patch.object(FETCH.urllib.request, 'urlopen',
                               side_effect=lambda *a, **k: Response(b'ab', length=3)) as request, \
             mock.patch.object(FETCH.time, 'sleep') as sleep, self.assertRaises(ValueError):
            FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        self.assertEqual(request.call_count, 3)
        self.assertEqual(sleep.call_count, 2)
        self.assertEqual(self.receipt['attemptCount'], 3)
        self.assertFalse(self.target.exists())
        self.assertFalse(self.target.with_suffix('.obj.download').exists())

    def test_retry_does_not_accept_complete_corrupt_body(self):
        with mock.patch.object(FETCH.urllib.request, 'urlopen',
                               side_effect=[Response(b'ab', length=3), Response(b'abd')]) as request, \
             mock.patch.object(FETCH.time, 'sleep'), self.assertRaises(ValueError):
            FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(self.receipt['status'], 2)
        self.assertFalse(self.target.exists())

    def test_error_payloads_never_become_models_or_receipts(self):
        for body in (b'<html>private service error</html>',
                     b'version https://git-lfs.github.com/spec/v1\noid sha256:' + ABC_SHA256.encode() + b'\nsize 3\n'):
            with self.subTest(body=body[:10]), self.assertRaises(ValueError):
                self.fetch(body)
            self.assertEqual(self.receipt['status'], 2)
            self.assertFalse(self.target.exists())
            self.assert_numeric(self.receipt)
            self.assertNotIn('private service error', json.dumps(self.receipt))

    def test_verified_original_is_reused_without_network(self):
        self.target.write_bytes(b'abc')
        with mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=AssertionError('network')) as request:
            FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        request.assert_not_called()
        self.assertEqual(self.receipt['cacheHit'], 1)
        self.assertEqual(self.target.read_bytes(), b'abc')

    def test_existing_file_is_not_replaced_on_failure(self):
        original = b'protected pre-existing file'
        self.target.write_bytes(original)
        with self.assertRaises(ValueError):
            self.fetch(b'abd')
        self.assertEqual(self.target.read_bytes(), original)
        self.assertFalse(self.target.with_suffix('.obj.download').exists())

    def test_git_blob_digest_includes_header(self):
        with mock.patch.object(FETCH.urllib.request, 'urlopen', return_value=Response(b'abc')):
            FETCH.fetch('unused', self.target, 'sha1', ABC_GIT_SHA1, git_blob=True, receipt=self.receipt)
        self.assertEqual(self.receipt['status'], 1)
        self.assertEqual(bytes(self.receipt['actualDigest']).hex(), ABC_GIT_SHA1)
        self.assertEqual(self.receipt['gitBlob'], 1)

    def test_plain_sha1_cannot_pass_git_blob_check(self):
        with mock.patch.object(FETCH.urllib.request, 'urlopen', return_value=Response(b'abc')), self.assertRaises(ValueError):
            FETCH.fetch('unused', self.target, 'sha1', hashlib.sha1(b'abc').hexdigest(), git_blob=True, receipt=self.receipt)
        self.assertFalse(self.target.exists())

    def test_chunked_reads_hash_all_bytes(self):
        body = b'x' * ((1 << 20) + 7)
        expected = hashlib.sha256(body).hexdigest()
        with mock.patch.object(FETCH.urllib.request, 'urlopen', return_value=Response(body, length='')):
            FETCH.fetch('unused', self.target, 'sha256', expected, receipt=self.receipt)
        self.assertEqual(self.receipt['bytes'], len(body))
        self.assertEqual(self.receipt['contentLength'], -1)
        self.assertEqual(self.target.read_bytes(), body)

    def test_midstream_failure_cleans_partial_and_propagates(self):
        response = Response(b'ab', length=3)
        response.read = mock.Mock(side_effect=[b'ab', OSError('private transfer failure')])
        with mock.patch.object(FETCH.urllib.request, 'urlopen', return_value=response), self.assertRaises(OSError):
            FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        self.assertEqual(self.receipt['status'], 3)
        self.assertEqual(self.receipt['bytes'], 2)
        self.assertFalse(self.target.exists())
        self.assertFalse(self.target.with_suffix('.obj.download').exists())
        self.assert_numeric(self.receipt)

    def test_http_error_has_only_numeric_status(self):
        error = urllib.error.HTTPError('https://example.invalid/private', 403, 'private message', {}, None)
        with mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=error), self.assertRaises(urllib.error.HTTPError):
            FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        self.assertEqual(self.receipt['httpStatus'], 403)
        self.assertEqual(self.receipt['status'], 3)
        self.assertEqual(self.receipt['bytes'], 0)
        self.assert_numeric(self.receipt)

    def synthetic_stage(self, name='synthetic', truncated=False):
        stage = {'id': name, 'internal': 'Vss_Test', 'tree': 'a' * 40, 'sourceSha256': ABC_SHA256}
        directory = self.root / name
        directory.mkdir()
        (directory / 'tree.json').write_text(json.dumps({
            'sha': stage['tree'], 'truncated': truncated,
            'tree': [{'type': 'blob', 'path': 'Vss_Test.mtl', 'sha': ABC_GIT_SHA1}],
        }))
        return stage

    def test_unpinned_tree_rejected_before_any_source_fetch(self):
        stage = self.synthetic_stage(truncated=True)
        with mock.patch.object(FETCH.urllib.request, 'urlopen') as request, self.assertRaisesRegex(ValueError, 'Unpinned'):
            FETCH.stage(stage, self.root, self.receipt)
        request.assert_not_called()
        self.assertEqual(self.receipt['status'], 2)
        self.assertEqual(self.receipt['phase'], 1)

    def test_stage_requires_both_exact_obj_and_mtl(self):
        stage = self.synthetic_stage()
        with mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=[Response(b'abc'), Response(b'abd')]), self.assertRaises(ValueError):
            FETCH.stage(stage, self.root, self.receipt)
        self.assertEqual(self.receipt['phase'], 3)
        self.assertEqual(self.receipt['status'], 2)
        self.assertEqual([f['status'] for f in self.receipt['files']], [1, 2])
        self.assertFalse((self.root / 'synthetic/Vss_Test.mtl').exists())

    def test_failure_receipt_survives_and_waits_for_other_workers(self):
        stages = [self.synthetic_stage('first'), self.synthetic_stage('second')]
        report = self.root / 'evidence/fetch.json'
        started = threading.Barrier(2)
        def response(url, timeout):
            if url.endswith('.obj'):
                started.wait(timeout=2)
            return Response(b'abd' if '/first/' in url else b'abc')
        # Select failure by internal source path while retaining synthetic tree names.
        stages[0]['internal'] = 'first'
        with mock.patch.object(FETCH.subprocess, 'check_output', return_value=json.dumps({'stages': stages})), \
             mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=response), \
             contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
            FETCH.main([str(self.root), str(report)])
        receipt = json.loads(report.read_text())
        self.assertEqual(receipt['exitCode'], 1)
        self.assertEqual(receipt['stageCount'], 2)
        self.assertEqual(receipt['verifiedStages'], 1)
        self.assertEqual([s['status'] for s in receipt['stages']], [2, 1])
        self.assertEqual(receipt['stages'][0]['files'][0]['status'], 2)
        self.assert_numeric(receipt)

    def test_success_receipt_does_not_claim_a_terrain_audit(self):
        stages = [self.synthetic_stage()]
        report = self.root / 'evidence/fetch.json'
        with mock.patch.object(FETCH.subprocess, 'check_output', return_value=json.dumps({'stages': stages})), \
             mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=lambda *a, **k: Response(b'abc')), \
             contextlib.redirect_stdout(io.StringIO()):
            FETCH.main([str(self.root), str(report)])
        receipt = json.loads(report.read_text())
        self.assertEqual(receipt['exitCode'], 0)
        self.assertEqual(receipt['verifiedStages'], 1)
        self.assertFalse(report.with_name('audit.json').exists())
        self.assert_numeric(receipt)

    def test_catalog_failure_also_writes_failure_receipt(self):
        report = self.root / 'evidence/fetch.json'
        with mock.patch.object(FETCH.subprocess, 'check_output', side_effect=subprocess.CalledProcessError(1, 'node')), self.assertRaises(subprocess.CalledProcessError):
            FETCH.main([str(self.root), str(report)])
        receipt = json.loads(report.read_text())
        self.assertEqual(receipt['exitCode'], 1)
        self.assertEqual(receipt['verifiedStages'], 0)
        self.assert_numeric(receipt)

    def test_transient_open_retries_same_url_and_pin(self):
        errors = [ConnectionResetError(104, 'reset'), TimeoutError('timeout'),
                  urllib.error.URLError(ConnectionResetError(104, 'reset')),
                  urllib.error.URLError(TimeoutError('timeout'))]
        for error in errors:
            with self.subTest(error=type(error).__name__):
                self.target.unlink(missing_ok=True)
                with mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=[error, Response(b'abc')]) as request, \
                     mock.patch.object(FETCH.time, 'sleep') as sleep:
                    FETCH.fetch('https://example.invalid/pinned', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
                self.assertEqual(request.call_count, 2)
                self.assertEqual(request.call_args_list, [mock.call('https://example.invalid/pinned', timeout=180)] * 2)
                sleep.assert_called_once_with(1)
                self.assertEqual(self.receipt['attemptCount'], 2)
                self.assertEqual(self.receipt['status'], 1)
                self.assertEqual(self.target.read_bytes(), b'abc')
                self.assert_numeric(self.receipt)

    def test_reset_midstream_restarts_clean_and_preserves_git_blob_pin(self):
        first = Response(b'ab', length=3)
        first.read = mock.Mock(side_effect=[b'ab', ConnectionResetError(104, 'reset')])
        responses = iter([first, Response(b'abc')])
        def open_next(*args, **kwargs):
            self.assertFalse(self.target.with_suffix('.obj.download').exists())
            return next(responses)
        with mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=open_next) as request, \
             mock.patch.object(FETCH.time, 'sleep'):
            FETCH.fetch('unused', self.target, 'sha1', ABC_GIT_SHA1, git_blob=True, receipt=self.receipt)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(self.target.read_bytes(), b'abc')
        self.assertEqual(self.receipt['bytes'], 3)
        self.assertEqual(bytes(self.receipt['actualDigest']).hex(), ABC_GIT_SHA1)

    def test_reset_exhaustion_preserves_original_error_and_existing_file(self):
        original = b'keep old bytes'
        self.target.write_bytes(original)
        error = urllib.error.URLError(ConnectionResetError(104, 'private reset detail'))
        with mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=error) as request, \
             mock.patch.object(FETCH.time, 'sleep') as sleep, self.assertRaises(urllib.error.URLError) as caught:
            FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        self.assertIs(caught.exception, error)
        self.assertEqual(request.call_count, 3)
        self.assertEqual(sleep.call_args_list, [mock.call(1), mock.call(2)])
        self.assertEqual(self.receipt['attemptCount'], 3)
        self.assertEqual(self.receipt['status'], 3)
        self.assertEqual(self.target.read_bytes(), original)
        self.assertFalse(self.target.with_suffix('.obj.download').exists())
        self.assert_numeric(self.receipt)
        self.assertNotIn('private reset detail', json.dumps(self.receipt))

    def test_retry_budget_is_shared_with_short_transfer(self):
        with mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=[
                ConnectionResetError(104, 'reset'), Response(b'ab', length=3), TimeoutError('timeout')]) as request, \
             mock.patch.object(FETCH.time, 'sleep') as sleep, self.assertRaises(TimeoutError):
            FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        self.assertEqual(request.call_count, 3)
        self.assertEqual(sleep.call_count, 2)
        self.assertFalse(self.target.exists())

    def test_access_tls_unknown_and_filesystem_errors_are_not_retried(self):
        import ssl
        errors = [urllib.error.HTTPError('unused', code, 'private', {}, None) for code in [401, 403, 404, 429, 500, 503]]
        errors += [ssl.SSLCertVerificationError(1, 'certificate failure'), ssl.SSLError(1, 'TLS failure'),
                   urllib.error.URLError(ssl.SSLCertVerificationError(1, 'certificate failure')),
                   urllib.error.URLError('unknown'), OSError('unknown I/O')]
        for error in errors:
            with self.subTest(error=repr(error)), \
                 mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=error) as request, \
                 mock.patch.object(FETCH.time, 'sleep') as sleep, self.assertRaises(type(error)) as caught:
                FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
            self.assertIs(caught.exception, error)
            request.assert_called_once()
            sleep.assert_not_called()
            self.assert_numeric(self.receipt)
        # Even a reset-like filesystem exception is not a network retry request.
        error = ConnectionResetError(104, 'local filesystem failure')
        with mock.patch.object(FETCH.urllib.request, 'urlopen', return_value=Response(b'abc')) as request, \
             mock.patch.object(pathlib.Path, 'open', side_effect=error), \
             mock.patch.object(FETCH.time, 'sleep') as sleep, self.assertRaises(ConnectionResetError):
            FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        request.assert_called_once()
        sleep.assert_not_called()

    def test_transport_retry_still_rejects_complete_wrong_body(self):
        with mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=[ConnectionResetError(104, 'reset'), Response(b'abd')]) as request, \
             mock.patch.object(FETCH.time, 'sleep'), self.assertRaises(ValueError):
            FETCH.fetch('unused', self.target, 'sha256', ABC_SHA256, receipt=self.receipt)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(self.receipt['status'], 2)
        self.assertFalse(self.target.exists())

    def test_transport_exhaustion_writes_failure_receipt(self):
        stages = [self.synthetic_stage()]
        report = self.root / 'evidence/fetch.json'
        error = urllib.error.URLError(ConnectionResetError(104, 'reset'))
        with mock.patch.object(FETCH.subprocess, 'check_output', return_value=json.dumps({'stages': stages})), \
             mock.patch.object(FETCH.urllib.request, 'urlopen', side_effect=error), \
             mock.patch.object(FETCH.time, 'sleep'), self.assertRaises(urllib.error.URLError):
            FETCH.main([str(self.root), str(report)])
        receipt = json.loads(report.read_text())
        self.assertEqual(receipt['exitCode'], 1)
        self.assertEqual(receipt['verifiedStages'], 0)
        self.assertEqual(receipt['stages'][0]['status'], 2)
        self.assertEqual(receipt['stages'][0]['files'][0]['attemptCount'], 3)
        self.assertEqual(receipt['stages'][0]['files'][0]['status'], 3)
        self.assert_numeric(receipt)

    def test_workflow_uploads_receipt_and_runs_contracts(self):
        workflow = (ROOT / '.github/workflows/validate-inkwave-native-stage5.yml').read_text()
        self.assertIn("python3 -m unittest discover -s scripts/tests -p 'test_fetch_inkwave_terrain_sources.py' -v", workflow)
        self.assertIn('            work/terrain-source-evidence/fetch.json\n', workflow)
        self.assertIn('          if-no-files-found: error', workflow)


if __name__ == '__main__':
    unittest.main()
