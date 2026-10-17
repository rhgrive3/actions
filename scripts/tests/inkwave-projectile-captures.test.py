"""Admission tests for terminal browser receipts and the delivered PNG bytes."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import sys

sys.dont_write_bytecode = True

helper = Path(__file__).resolve().parents[1] / 'compare-inkwave-projectile-captures.py'
spec = importlib.util.spec_from_file_location('projectile_capture_comparator', helper)
comparator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparator)


def native_roster():
    # Comparator unit data, not a browser/native-physics or Nintendo receipt.
    return {'schema': 1, 'method': 'unit fixture', 'actors': [dict(
        order=i, team=i // 4, slot=i % 4, isLocal=i == 0, isBot=i != 0, remote=False,
        nid=i, owner=None, weapon='shooter', pos=[i, 0, 0], vel=[0, 0, 0], rootPosition=[i, 0, 0], groundNormal=[0, 1, 0],
        aim=dict(yaw=0, aimYaw=0, aimPitch=0, direction=[0, 0, 1], point=[i, 1, 24]),
        gear=dict(loadout=[dict(main='none', subs=['none'] * 3) for _ in range(3)], abilityPoints={}, modifiers={'runSpeed': 1}),
        state=dict(alive=True, hp=100, ink=100, form='kid', grounded=True),
        intent={'fire': False}, previousIntent={'fire': False}, weaponClock={'cooldown': 0}, lifecycle={'squidSpawn': None},
        capsule=dict(radius=.35, height=1.65, start=[i, .35, 0], end=[i, 1.3, 0], active=True),
        motionStart=None, floorHit=dict(hit=True, point=[i, 0, 0], normal=[0, 1, 0]),
    ) for i in range(8)]}


def completed_receipt():
    rows = []
    for scenario in ['desktop-long-fire', 'mobile-emulated-long-fire']:
        rows.append(dict(scenario=scenario, nativeFrames=12, renderSamples=12, rafSamples=11,
                         durationMs=6000, fireCalls=5, nonemptyProjectileUpdates=12,
                         maxProjectiles=3, nonemptyVisualRenders=12, fps=2,
                         warmup={'admitted': True}, viewport=[844, 390]))
    captures = [dict(scenario=str(i % 6), phase='F0', frame=i, perspective='side', perspectiveMode='unit-fixture', seed=7,
                     camera={'pose': {'pos': [0, 0, 0]}}, captureConditions={},
                     runtime=dict(roster=native_roster(), projectiles=[dict(seed=.5, age=0, pos=[0, 1, 0], vel=[0, 0, 1], unit=0)],
                                  render=dict(glError=0, glErrors=[], staleGlErrors=[]))) for i in range(48)]
    return dict(status='passed', errors=[], provenance={'canonicalRoster': native_roster()}, screenshots=captures,
                visualScenarios=[{'name': str(i), 'seed': i, 'setup': {'roster': native_roster()}, 'births': [], 'impacts': [],
                                  'rng': {'afterNativeFire': dict(seed=i, draws=3, state=42)}}
                                 for i in range(6)], performance=rows)


def pair(before, after):
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        left, right = root / 'before.json', root / 'after.json'
        left.write_text(json.dumps(before)); right.write_text(json.dumps(after))
        return comparator.compare(left, right, root / 'out.json')


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
                   lambda d: d['visualScenarios'][0].update(rng={}),
                   lambda d: d['provenance'].pop('canonicalRoster'),
                   lambda d: d['screenshots'][0]['runtime'].pop('roster'),
                   lambda d: d['visualScenarios'][0]['setup']['roster']['actors'].pop(),
                   lambda d: d['provenance']['canonicalRoster']['actors'][1].pop('capsule'),
                   lambda d: d['screenshots'][1]['runtime']['roster']['actors'][1]['gear'].pop('modifiers'),
                   lambda d: d['provenance']['canonicalRoster']['actors'][1].update(remote=True),
                   lambda d: d['provenance']['canonicalRoster']['actors'][1].update(team=[])]
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

    def test_all_roster_locations_and_every_paint_area_receipt_remain_strict(self):
        control = completed_receipt()
        impact = control['visualScenarios'][0]
        impact['impacts'] = [{'surfaceHits': [{'paintReceipts': [{'result': 3.0625}]}]}]
        impact['impactState'] = {'paintCoverage': [1, 2], 'catalogSteps': [{'paintReceipts': [{'result': 3.0625}]}]}
        impact['impactEvidence'] = {'impactPaintContact': {'result': 3.0625}}
        self.assertEqual(pair(control, copy.deepcopy(control))['physicalVerification']['status'], 'pass')
        mutations = [
            ('rng.afterNativeFire', lambda d: d['visualScenarios'][0]['rng']['afterNativeFire'].update(state=43)),
            ('canonicalRoster', lambda d: d['provenance']['canonicalRoster']['actors'][1]['pos'].__setitem__(0, 9)),
            ('setup.roster', lambda d: d['visualScenarios'][0]['setup']['roster']['actors'][1]['gear']['abilityPoints'].update(runSpeed=3)),
            ('roster', lambda d: d['screenshots'][0]['runtime']['roster']['actors'][1]['capsule'].update(radius=.36)),
            ('paintReceipts', lambda d: d['visualScenarios'][0]['impacts'][0]['surfaceHits'][0]['paintReceipts'][0].update(result=3.125)),
            ('paintCoverage', lambda d: d['visualScenarios'][0]['impactState']['paintCoverage'].__setitem__(0, 1.0001)),
            ('catalogSteps', lambda d: d['visualScenarios'][0]['impactState']['catalogSteps'][0]['paintReceipts'][0].update(result=3.125)),
            ('impactPaintContact', lambda d: d['visualScenarios'][0]['impactEvidence']['impactPaintContact'].update(result=3.125)),
        ]
        for expected_path, mutate in mutations:
            with self.subTest(path=expected_path):
                subject = copy.deepcopy(control); mutate(subject)
                result = pair(control, subject)
                self.assertEqual(result['physicalVerification']['status'], 'fail')
                self.assertTrue(any(expected_path in row.get('path', '') for row in comparator.bounded_physical_mismatches(result)))

    def test_console_diagnostics_keep_paths_and_bound_large_values(self):
        result = {'canonicalPhysicalSetupVerification': {'mismatches': [dict(
            path=f'canonicalRoster.actors[{i}].capsule', reason='value differs',
            before=[{'long': 'x' * 10000}] * 1000, after={'long': 'y' * 10000}) for i in range(20)]}}
        rows = comparator.bounded_physical_mismatches(result)
        self.assertEqual(len(rows), 8)
        self.assertEqual(rows[0]['path'], 'canonicalRoster.actors[0].capsule')
        self.assertLess(len(json.dumps(rows)), 7000)


if __name__ == '__main__':
    unittest.main()
