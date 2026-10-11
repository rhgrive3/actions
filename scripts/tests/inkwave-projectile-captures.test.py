"""Admission tests for terminal browser receipts and the delivered PNG bytes."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys

sys.dont_write_bytecode = True

helper = Path(__file__).resolve().parents[1] / 'compare-inkwave-projectile-captures.py'
spec = importlib.util.spec_from_file_location('projectile_capture_comparator', helper)
comparator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparator)


def completed_receipt():
    rows = []
    for scenario in ['desktop-long-fire', 'mobile-emulated-long-fire']:
        rows.append(dict(scenario=scenario, nativeFrames=12, renderSamples=12, rafSamples=11,
                         durationMs=6000, fireCalls=5, nonemptyProjectileUpdates=12,
                         maxProjectiles=3, nonemptyVisualRenders=12, fps=2,
                         warmup={'admitted': True}, viewport=[844, 390]))
    return dict(status='passed', errors=[], screenshots=[{'runtime': {'render': {'glErrors': []}}}] * 48,
                visualScenarios=[{'name': str(i), 'rng': {'afterNativeFire': dict(seed=i, draws=3, state=42)}}
                                 for i in range(6)], performance=rows)


class AdmissionTests(unittest.TestCase):
    def test_complete_control_and_gpu_unavailability(self):
        doc = completed_receipt()
        doc['performance'][0]['gpuTimer'] = 'unavailable'
        self.assertEqual(comparator.verify_complete(doc)['status'], 'pass')

    def test_failed_missing_or_idle_windows_are_rejected(self):
        changes = [lambda d: d.update(status='failed'), lambda d: d.update(performance=[]),
                   lambda d: d['performance'][0].update(fireCalls=0),
                   lambda d: d['performance'][0].update(nonemptyVisualRenders=0),
                   lambda d: d['performance'][0].update(nativeFrames=1),
                   lambda d: d['performance'][0].update(durationMs=5999),
                   lambda d: d['performance'][0].update(warmup={'admitted': False}),
                   lambda d: d['performance'][1].update(scenario='desktop-long-fire'),
                   lambda d: d['performance'][1].update(viewport=[390, 844]),
                   lambda d: d['visualScenarios'][0].update(rng={})]
        for mutate in changes:
            with self.subTest(mutation=mutate):
                doc = copy.deepcopy(completed_receipt())
                mutate(doc)
                self.assertEqual(comparator.verify_complete(doc)['status'], 'fail')

    def test_image_bytes_and_capture_directory_are_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw = b'unchanged original screenshot bytes'
            (root / 'shot.png').write_bytes(raw)
            doc = {'screenshots': [{'file': 'shot.png', 'sha256': hashlib.sha256(raw).hexdigest()}]}
            self.assertEqual(comparator.verify_media(doc, root)['status'], 'pass')
            (root / 'shot.png').write_bytes(b'corrupt')
            self.assertEqual(comparator.verify_media(doc, root)['status'], 'fail')
            doc['screenshots'][0]['file'] = '../outside.png'
            self.assertEqual(comparator.verify_media(doc, root)['status'], 'fail')
            doc['screenshots'][0]['file'] = 'missing.png'
            self.assertEqual(comparator.verify_media(doc, root)['status'], 'fail')


if __name__ == '__main__':
    unittest.main()
