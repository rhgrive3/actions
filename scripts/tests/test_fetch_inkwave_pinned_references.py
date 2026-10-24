import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import copy
import json
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('references', Path(__file__).parents[1] / 'fetch-inkwave-pinned-references.py')
refs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refs)


class PinnedReferences(unittest.TestCase):
    def test_current_plan_keeps_all_88_paths_with_74_unique_urls(self):
        plan = refs.reference_plan()
        self.assertEqual(len(plan), 74)
        self.assertEqual(sum(len(x['targets']) for x in plan.values()), 88)
        self.assertTrue(any(len(x['targets']) == 3 for x in plan.values()))

    def test_wrong_commit_conflicting_hash_and_basename_collision_fail_before_fetch(self):
        manifests = {name: json.loads((refs.ROOT / 'patches/splatoon3/reference' / (name + '.json')).read_text())
                     for name in ['curated-numbers', 'weapons-fidelity-reference', 'object-shredder-1130']}
        catalog = refs.subprocess.check_output(['node', '--input-type=module', '-e',
            "import {MAIN_WEAPON_CATALOG as c} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs'; console.log(JSON.stringify(c))"], cwd=refs.ROOT)
        for failure in ['commit', 'hash', 'collision', 'escape']:
            data = copy.deepcopy(manifests)
            if failure == 'commit':
                data['weapons-fidelity-reference']['sourceCommit'] = '0' * 40
            elif failure == 'hash':
                data['weapons-fidelity-reference']['sources'][0]['expectedFileSha256'] = '0' * 64
            elif failure == 'escape':
                data['curated-numbers']['sources'][0]['id'] = '../escape'
            else:
                source = copy.deepcopy(data['weapons-fidelity-reference']['sources'][0])
                source['url'] = source['url'].replace('/weapon/', '/other-directory/')
                data['weapons-fidelity-reference']['sources'].append(source)
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                reference = root / 'patches/splatoon3/reference'
                reference.mkdir(parents=True)
                for name, value in data.items():
                    (reference / (name + '.json')).write_text(json.dumps(value))
                with patch.object(refs.subprocess, 'check_output', return_value=catalog):
                    with self.assertRaises(ValueError, msg=failure):
                        refs.reference_plan(root)

    def test_duplicate_destinations_receive_identical_verified_bytes(self):
        data = b'fixed immutable reference bytes'
        plan = {'pinned-url': {'targets': {'one/a.json', 'two/a.json', 'three/a.json'}, 'hashes': {hashlib.sha256(data).hexdigest()}}}
        calls = []
        def opener(url, timeout):
            calls.append((url, timeout))
            return io.BytesIO(data)
        with tempfile.TemporaryDirectory() as temporary:
            self.assertEqual(refs.fetch_references(plan, temporary, opener), 1)
            for target in plan['pinned-url']['targets']:
                self.assertEqual((Path(temporary) / target).read_bytes(), data)
        self.assertEqual(calls, [('pinned-url', 30)])

    def test_hash_and_network_failures_publish_no_verifier_inputs(self):
        for opener in [lambda *a, **k: io.BytesIO(b'corrupt'), lambda *a, **k: (_ for _ in ()).throw(TimeoutError('stalled'))]:
            plan = {'pinned-url': {'targets': {'reference.json'}, 'hashes': {'0' * 64}}}
            with tempfile.TemporaryDirectory() as temporary:
                with self.assertRaises((ValueError, TimeoutError)):
                    refs.fetch_references(plan, temporary, opener)
                self.assertEqual(list(Path(temporary).iterdir()), [])


if __name__ == '__main__':
    unittest.main()
