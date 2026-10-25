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
    scenarios = [{'name': str(i), 'seed': i, 'setup': {'roster': native_roster()}, 'births': [], 'impacts': [],
                  'rng': {'afterNativeFire': dict(seed=i, draws=3, state=42)}} for i in range(6)]
    contact = dict(route='MainWeaponCatalog.P._step:washtub', retired=True, nativeStageContact=True, face=7, seed=.5, normal=[0,1,0],
                   washtubContact=dict(valid=True,sourceActor='WeaponSlosherWashtub',seed=.5,weapon='s3-slosher-washtub',catalogUnit=0,life=1.2,damage=55,point=[0,0,4],retiredPosition=[0,0,4],normal=[0,1,0],face=7,block=0,
                                       paintReceipt={'face':7,'center':[0,0,4]},matchingNativeRaycast={'face':7,'point':[0,0,4],'normal':[0,1,0]}))
    scenarios.append(dict(name='floor-washtub', seed=13, setup={'weapon':'s3-slosher-washtub','roster':native_roster()},
        births=[dict(sourceActor='WeaponSlosherWashtub',route='MainWeaponCatalog.P._step',weapon='s3-slosher-washtub',
                     controllerInput='Actor.update intent.fire=true',catalogUnit=0,life=1.2,damage=55,seed=.5,pos=[0,1,0],velocity=[0,8,84])],
        controllerProbe=dict(source='normal Actor.update intent.fire path after native Actor.spawnAt reset',weapon='s3-slosher-washtub',
                             sourceActor='WeaponSlosherWashtub',unit=0,lifecycleAtBirth=None,heldFrames=18),
        impactFrame=36,captureFrame=44,impactState={},impactEvidence=contact,impacts=[],rng={'afterNativeFire':dict(seed=13,draws=3,state=42)}))
    for phase, perspective in [('F0','shoulder'),('F5','side'),('F15','side'),('floor-contact-F36-capture-F44','shoulder')]:
        live = 0 if phase.startswith('floor-contact') else 1
        resource=dict(protocol=1,liveRounds=live,sparkles=live*28,positionCount=160,sizeCount=160,arrayLengths=[480,160],
                      totalBufferBytes=2560,textureOwners=0,repeatedDraws=2,stableOwners=True,stableArrays=True,rngUnchanged=True,shapeCountsUnchanged=True)
        captures.append(dict(scenario='floor-washtub',phase=phase,frame=None,perspective=perspective,perspectiveMode='unit-fixture',seed=13,
                             camera={},captureConditions={},runtime=dict(roster=native_roster(),washtubResources=resource,projectiles=[] if not live else [dict(seed=.5,weapon='s3-slosher-washtub',sourceActor='WeaponSlosherWashtub',catalogUnit=0,life=1.2,damage=55,unit=None,shape='explosher',pos=[0,1,1],vel=[0,8,84],age=.1,delay=0)],render=dict(glError=0,glErrors=[],staleGlErrors=[]))))
    return dict(status='passed', visualProtocol=2, errors=[], provenance={'canonicalRoster': native_roster()}, screenshots=captures,
                visualScenarios=scenarios, performance=rows)


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

    def test_washtub_required_catalog_birth_contact_and_fixed_resources(self):
        control = completed_receipt()
        self.assertEqual(comparator.verify_washtub(control)['status'], 'pass')
        changes = [lambda d: d.pop('visualProtocol'), lambda d: d.update(visualProtocol=1),
                   lambda d: d['visualScenarios'].pop(), lambda d: d['screenshots'].pop(),
                   lambda d: d['visualScenarios'][-1]['setup'].update(weapon='slosher'),
                   lambda d: d['visualScenarios'][-1]['births'][0].update(route='legacy-projectile-step'),
                   lambda d: d['visualScenarios'][-1]['births'][0].update(life=0),
                   lambda d: d['visualScenarios'][-1]['controllerProbe'].update(heldFrames=61),
                   lambda d: d['visualScenarios'][-1]['impactEvidence']['washtubContact'].update(retiredPosition=[0,1,4]),
                   lambda d: d['visualScenarios'][-1]['impactEvidence']['washtubContact']['matchingNativeRaycast'].update(face=8)]
        for key, value in [('sparkles',29),('positionCount',161),('arrayLengths',[483,160]),('totalBufferBytes',2564),
                           ('textureOwners',1),('repeatedDraws',0),('stableOwners',False),('stableArrays',False),('rngUnchanged',False),('shapeCountsUnchanged',False)]:
            changes.append(lambda d, k=key, v=value: d['screenshots'][-4]['runtime']['washtubResources'].update({k:v}))
        def remove_all_faces(d):
            contact=d['visualScenarios'][-1]['impactEvidence'];proof=contact['washtubContact']
            for obj in [contact,proof,proof['paintReceipt'],proof['matchingNativeRaycast']]: obj.pop('face')
        def remove_all_points(d):
            proof=d['visualScenarios'][-1]['impactEvidence']['washtubContact']
            proof.pop('point');proof.pop('retiredPosition')
        changes += [remove_all_faces,remove_all_points,
                    lambda d: d['screenshots'][-4]['runtime'].update(projectiles=[]),
                    lambda d: d['screenshots'][-3]['runtime']['projectiles'][0].update(seed=.6),
                    lambda d: d['screenshots'][-2]['runtime']['projectiles'][0].update(life=1.3),
                    lambda d: d['visualScenarios'][-1]['impactEvidence']['washtubContact'].update(seed=.6),
                    lambda d: d['visualScenarios'][-1]['impactEvidence']['washtubContact'].update(face=-1),
                    lambda d: d['visualScenarios'][-1]['impactEvidence']['washtubContact'].update(point=[float('nan'),0,4]),
                    lambda d: d['visualScenarios'][-1]['births'][0].pop('seed'),
                    lambda d: d['visualScenarios'][-1]['impactEvidence'].pop('normal')]
        changes.append(lambda d: d['screenshots'][-4]['runtime'].pop('washtubResources'))
        for mutate in changes:
            subject = copy.deepcopy(control); mutate(subject)
            self.assertEqual(comparator.verify_washtub(subject)['status'], 'fail')
            self.assertEqual(comparator.verify_complete(subject)['status'], 'fail')

    def test_washtub_life_position_and_face_drift_remain_physical_failures(self):
        control = completed_receipt()
        for mutate in [lambda d: d['visualScenarios'][-1]['births'][0].update(life=1.3),
                       lambda d: d['visualScenarios'][-1]['impactEvidence']['washtubContact'].update(point=[0,0,5]),
                       lambda d: d['visualScenarios'][-1]['controllerProbe'].update(sourceActor='WeaponSlosher')]:
            subject = copy.deepcopy(control); mutate(subject)
            self.assertEqual(pair(control,subject)['physicalVerification']['status'],'fail')
        legacy = copy.deepcopy(control); legacy.pop('visualProtocol')
        self.assertEqual(pair(legacy,legacy)['physicalVerification']['status'],'fail')
        self.assertEqual(pair(control,legacy)['physicalVerification']['status'],'fail')

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


class ReviewedCameraEpochTests(unittest.TestCase):
    """Real projection mathematics remains strict; no global FOV tolerance."""

    def fixture(self):
        import math
        a = {"camera": {"fov": 55.0}, "captureConditions": {"fov": 55.0},
             "runtime": {"drawingBuffer": [1280, 720],
                         "projectileScreen": [{"x": 780.0, "y": 395.0, "z": .9}]}}
        r = math.tan(math.radians(55 / 2)) / math.tan(math.radians(60 / 2))
        b = copy.deepcopy(a)
        b["camera"]["fov"] = b["captureConditions"]["fov"] = 60.0
        b["runtime"]["projectileScreen"][0]["x"] = 640 + (780 - 640) * r
        b["runtime"]["projectileScreen"][0]["y"] = 360 + (395 - 360) * r
        for row in (a, b):
            row["runtime"]["projectileCrop"] = comparator.projected_crop(
                row["runtime"]["projectileScreen"], 1280, 720)
        return a, b

    def test_epoch_proves_each_projected_point_and_both_independent_crops(self):
        a, b = self.fixture()
        proof = comparator.verify_camera_epoch_pair(a, b)
        self.assertEqual(proof["status"], "verified")
        self.assertEqual(proof["headCount"], 1)
        self.assertLess(proof["maxReprojectionErrorPx"], 1e-8)

    def test_other_fov_pixel_shift_crop_corruption_and_depth_change_reject(self):
        for kind in ("fov", "point", "crop", "depth", "condition", "missing"):
            with self.subTest(kind=kind):
                a, b = self.fixture()
                if kind == "fov": b["camera"]["fov"] = 62.0
                if kind == "point": b["runtime"]["projectileScreen"][0]["x"] += 1.0
                if kind == "crop": b["runtime"]["projectileCrop"]["width"] += 1
                if kind == "depth": b["runtime"]["projectileScreen"][0]["z"] += .01
                if kind == "condition": b["captureConditions"]["fov"] = 55.0
                if kind == "missing": del b["runtime"]["projectileScreen"]
                with self.assertRaises(ValueError):
                    comparator.verify_camera_epoch_pair(a, b)


if __name__ == '__main__':
    unittest.main()
