"""Blob byte equality does not imply the same filesystem entry kind."""

import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import backup_and_restore as br


class AutoDeltaKindTests(unittest.TestCase):
    def apply_delta(self, archives, before, after):
        complete, delta = br.create_or_resume_auto_delta(archives, before, after, "a" * 40, "b" * 40)
        self.assertTrue(complete)
        step = json.loads((archives / "INKWAVE_AUTO_LATEST.json").read_text())["chain"][0]
        br.apply_auto_delta_step(before, archives, step)
        br.verify_tree_against_manifest(before, {"files": br.scan_tree(after)[0]})
        return delta

    def check_kind_transition(self, starts_as_link):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            before = root / "before"
            before.mkdir()
            (before / "target").mkdir()
            (before / "target/preserve").write_bytes(b"target must remain untouched")
            if starts_as_link:
                (before / "entry").symlink_to("target", target_is_directory=True)
            else:
                (before / "entry").write_bytes(b"target")
            after = root / "after"
            shutil.copytree(before, after, symlinks=True)
            (after / "entry").unlink()
            if starts_as_link:
                (after / "entry").write_bytes(b"target")
            else:
                (after / "entry").symlink_to("target", target_is_directory=True)

            delta = self.apply_delta(root / "archives", before, after)
            change, = delta["changes"]
            self.assertEqual(change["before"]["sha"], change["after"]["sha"])
            self.assertEqual(len(change["chunks"]), 1)
            self.assertEqual(change["bytes"], len(b"target"))
            self.assertEqual((before / "entry").is_symlink(), not starts_as_link)
            self.assertEqual((before / "target/preserve").read_bytes(), b"target must remain untouched")

    def test_same_bytes_regular_file_becomes_directory_link(self):
        self.check_kind_transition(False)

    def test_same_bytes_directory_link_becomes_regular_file(self):
        self.check_kind_transition(True)

    def test_executable_mode_only_changes_still_need_no_payload(self):
        for old_mode, new_mode in [(0o644, 0o755), (0o755, 0o644)]:
            with self.subTest(old_mode=old_mode, new_mode=new_mode), tempfile.TemporaryDirectory() as td:
                root = Path(td)
                before = root / "before"
                before.mkdir()
                (before / "entry").write_bytes(b"unchanged script")
                os.chmod(before / "entry", old_mode)
                after = root / "after"
                shutil.copytree(before, after)
                os.chmod(after / "entry", new_mode)
                delta = self.apply_delta(root / "archives", before, after)
                change, = delta["changes"]
                self.assertEqual(change["chunks"], [])
                self.assertEqual(change["bytes"], 0)
                self.assertEqual(delta["parts"], [])
                self.assertFalse((before / "entry").is_symlink())

    def test_unchanged_symlinks_still_need_no_payload(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            before = root / "before"
            before.mkdir()
            (before / "target").mkdir()
            (before / "link").symlink_to("target", target_is_directory=True)
            (before / "broken").symlink_to("absent")
            after = root / "after"
            shutil.copytree(before, after, symlinks=True)
            delta = self.apply_delta(root / "archives", before, after)
            self.assertEqual(delta["changes"], [])
            self.assertEqual(delta["parts"], [])


if __name__ == "__main__":
    unittest.main()
