"""Directory links are Git blobs, not directories to follow or omit."""

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import backup_and_restore as br


class DirectorySymlinkTests(unittest.TestCase):
    def make_tree(self, root):
        root.mkdir()
        (root / "assets").mkdir()
        (root / "assets/data.bin").write_bytes(b"original asset\x00")
        (root / "alias").symlink_to("assets", target_is_directory=True)
        (root / "cycle").symlink_to(".", target_is_directory=True)
        (root / "missing").symlink_to("absent/dir", target_is_directory=True)

    def test_scan_and_full_restore_preserve_links_without_following_targets(self):
        with tempfile.TemporaryDirectory() as td:
            folder = Path(td)
            source = folder / "source"
            self.make_tree(source)
            outside = folder / "outside"
            outside.mkdir()
            (outside / "private.txt").write_bytes(b"not part of this backup")
            (source / "external").symlink_to("../outside", target_is_directory=True)
            expected = {"alias": "assets", "cycle": ".", "missing": "absent/dir", "external": "../outside"}

            files, scanned = br.scan_tree(source)
            self.assertEqual(set(scanned), {"assets/data.bin", *expected})
            for name, target in expected.items():
                self.assertEqual(scanned[name]["mode"], "120000")
                self.assertEqual(scanned[name]["git_blob_sha"], br.git_blob_sha(os.fsencode(target)))

            archives = folder / "archives"
            manifest = br.pack_full(source, archives, "a" * 40)
            self.assertEqual(manifest["symlinks"], expected)
            self.assertEqual(manifest["tracked_count"], len(scanned))
            restored = folder / "restored"
            br.restore(archives, restored, target_commit="a" * 40)
            self.assertEqual((restored / "assets/data.bin").read_bytes(), b"original asset\x00")
            for name, target in expected.items():
                self.assertTrue((restored / name).is_symlink(), name)
                self.assertEqual(os.readlink(restored / name), target)
            br.verify_tree_against_manifest(restored, {"files": files})

    def test_auto_delta_add_retarget_and_delete_directory_links(self):
        with tempfile.TemporaryDirectory() as td:
            folder = Path(td)
            source = folder / "source"
            self.make_tree(source)
            archives = folder / "archives"
            destination = folder / "destination"
            br.pack_full(source, archives, "a" * 40)
            br.restore(archives, destination, target_commit="a" * 40)
            (source / "alias").unlink()
            (source / "alias").symlink_to(".", target_is_directory=True)
            (source / "cycle").unlink()
            (source / "new-alias").symlink_to("assets", target_is_directory=True)

            complete, delta = br.create_or_resume_auto_delta(archives, destination, source, "a" * 40, "b" * 40)
            self.assertTrue(complete)
            self.assertEqual({change["path"] for change in delta["changes"]}, {"alias", "cycle", "new-alias"})
            state = json.loads((archives / "INKWAVE_AUTO_LATEST.json").read_text())
            br.apply_auto_delta_step(destination, archives, state["chain"][0])
            self.assertEqual(os.readlink(destination / "alias"), ".")
            self.assertEqual(os.readlink(destination / "new-alias"), "assets")
            self.assertFalse((destination / "cycle").is_symlink())
            br.verify_tree_against_manifest(destination, {"files": br.scan_tree(source)[0]})

    def test_verification_rejects_unexpected_directory_symlink(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "data").mkdir()
            (root / "data/file").write_bytes(b"keep")
            manifest = {"files": br.scan_tree(root)[0]}
            (root / "extra").symlink_to("data", target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, "extra: unexpected extra file"):
                br.verify_tree_against_manifest(root, manifest)

    def test_auto_delta_replaces_directory_link_with_file_and_back(self):
        with tempfile.TemporaryDirectory() as td:
            folder = Path(td)
            source = folder / "source"
            self.make_tree(source)
            archives = folder / "archives"
            destination = folder / "destination"
            br.pack_full(source, archives, "a" * 40)
            br.restore(archives, destination, target_commit="a" * 40)
            for old_sha, new_sha, as_link in [("a", "b", False), ("b", "c", True)]:
                with self.subTest(as_link=as_link):
                    (source / "alias").unlink()
                    if as_link:
                        (source / "alias").symlink_to("assets", target_is_directory=True)
                    else:
                        (source / "alias").write_bytes(b"replacement file")
                    br.create_or_resume_auto_delta(archives, destination, source, old_sha * 40, new_sha * 40)
                    state = json.loads((archives / "INKWAVE_AUTO_LATEST.json").read_text())
                    br.apply_auto_delta_step(destination, archives, state["chain"][-1])
                    self.assertEqual((destination / "alias").is_symlink(), as_link)
                    self.assertEqual((destination / "assets/data.bin").read_bytes(), b"original asset\x00")
                    br.verify_tree_against_manifest(destination, {"files": br.scan_tree(source)[0]})

    def test_direct_overlay_removes_deleted_directory_symlink(self):
        with tempfile.TemporaryDirectory() as td:
            folder = Path(td)
            root = folder / "root"
            self.make_tree(root)
            baseline = {"files": br.scan_tree(root)[0]}
            current = {"main_commit": "b" * 40, "files": [row for row in baseline["files"] if row["path"] != "alias"]}
            archive = folder / "empty-update.zip"
            with zipfile.ZipFile(archive, "w"):
                pass
            br.apply_update_archives(root, [archive], baseline, current)
            self.assertFalse((root / "alias").is_symlink())
            self.assertEqual((root / "assets/data.bin").read_bytes(), b"original asset\x00")


if __name__ == "__main__":
    unittest.main()
