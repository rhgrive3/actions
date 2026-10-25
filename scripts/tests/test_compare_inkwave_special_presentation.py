import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

module_path = Path(__file__).resolve().parents[1] / 'compare-inkwave-special-presentation.py'
spec = importlib.util.spec_from_file_location('special_comparison', module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SpecialComparisonTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.before = Path(self.temp.name) / 'before'
        self.after = Path(self.temp.name) / 'after'
        self.result = dict(status='passed', errors=[], seed=17, browser='test-browser',
                           driverSHA256='same-driver', contentHash='fixture-build')
        for key in ['rows', 'nativeExtra', 'cloudDrawCalls', 'nativeCloudRetirements',
                    'baseline', 'after', 'vfxResources', 'fixture']:
            self.result[key] = []
        for directory in [self.before, self.after]:
            directory.mkdir()
            self.write_result(directory, self.result)
            Image.new('RGBA', (2, 2), (10, 20, 30, 255)).save(directory / 'frame.png')

    @staticmethod
    def write_result(directory, result):
        (directory / 'special-presentation-result.json').write_text(json.dumps(result))

    def test_equal_decoded_pixels_pass(self):
        result = module.compare(self.before, self.after)
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(len(result['images']), 1)

    def test_rgb_change_with_unchanged_alpha_is_rejected(self):
        Image.new('RGBA', (2, 2), (11, 20, 30, 255)).save(self.after / 'frame.png')
        with self.assertRaisesRegex(ValueError, 'RGBA pixel mismatch'):
            module.compare(self.before, self.after)

    def test_missing_capture_is_rejected(self):
        (self.after / 'frame.png').unlink()
        with self.assertRaisesRegex(ValueError, 'inventories'):
            module.compare(self.before, self.after)

    def test_resource_and_identity_mismatches_are_rejected(self):
        for key, value in [('vfxResources', [1]), ('seed', 18),
                           ('browser', 'other-browser'), ('driverSHA256', 'other-driver')]:
            with self.subTest(key=key):
                self.write_result(self.after, {**self.result, key: value})
                with self.assertRaises(ValueError):
                    module.compare(self.before, self.after)


if __name__ == '__main__':
    unittest.main()
