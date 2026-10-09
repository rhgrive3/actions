"""Local harness infrastructure tests; not native browser execution."""
import gzip
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('startup_bench',ROOT/'scripts/benchmark-inkwave-startup.py')
bench=importlib.util.module_from_spec(spec);spec.loader.exec_module(bench)

class HarnessTests(unittest.TestCase):
    def test_server_immutable_and_mutable_cache_policies(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();(root/'_versions/rev').mkdir(parents=True)
            (root/'index.html').write_text('<h1>root</h1>');(root/'_versions/rev/app.mjs').write_text('export const n=1;')
            host=bench.Host(root,600)
            status,headers,body=host.payload('/actions/_versions/rev/app.mjs',True)
            self.assertEqual(status,200);self.assertEqual(headers['Content-Type'],'text/javascript')
            self.assertEqual(headers['Cache-Control'],'public,max-age=600');self.assertEqual(gzip.decompress(body),b'export const n=1;')
            self.assertEqual(host.payload('/actions/',False)[1]['Cache-Control'],'no-cache')
    def test_traversal_unknown_route_and_out_of_scope_observer(self):
        with tempfile.TemporaryDirectory() as tmp:
            host=bench.Host(Path(tmp).resolve(),600)
            self.assertEqual(host.payload('/actions/../../etc/passwd',False)[0],404)
            self.assertEqual(host.payload('/actions/missing',False)[0],404)
            self.assertEqual(host.payload('/__benchmark__/blank.html',False)[0],200)
    def test_atomic_json_and_profiles(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'result.json';bench.atomic_json(p,{'timing':None,'status':'blocked'})
            self.assertIsNone(json.loads(p.read_text())['timing']);self.assertFalse(p.with_suffix('.json.writing').exists())
        self.assertEqual(bench.PROFILES['4g']['cpu'],4)
    @unittest.skipUnless(os.environ.get('INKWAVE_BASELINE_SITE'),'exact acquired baseline supplied separately')
    def test_exact_artifact_manifest(self):
        identity=bench.verify_site(Path(os.environ['INKWAVE_BASELINE_SITE']).resolve())
        self.assertEqual(identity['build']['revision'],'ff4ef2a893d73bdf9e4a0f9c1120cc69a4727ccf14d2e98ee612c9a46fa9cb41')

if __name__=='__main__':unittest.main(verbosity=2)
