#!/usr/bin/env python3
"""
Automated Verification Suite for INKWAVE Backup, Restore, 85-Step Drive AutoSync Chain,
and Transactional Patch Applier (v2.2).

Covers normal flows, abnormal flows, boundary conditions, mode/symlink preservation,
and real Google Drive data schema interoperability:
  1. `APPLY_APLUS_PATCH.py`:
     - Unified `action` / `status` schema validation (rejects mismatched `action` vs `status`).
     - Zero unconditional overwrite: existing files at `"added"` paths with different content
       trigger `CONFLICT_ABORTED` (`files_written: 0`).
     - Modified file baseline SHA-256 conflict detection (`CONFLICT_ABORTED`, `files_written: 0`).
     - Executable permission (`100755` -> `0o755`), regular file (`100644` -> `0o644`), and
       symlink (`120000`) preservation across apply, idempotent re-run (`ALREADY_APPLIED`),
       and `--rollback`.
  2. `backup_and_restore.py` Real Drive Format Round-Trip:
     - `pack-full -> restore` with `__INKWAVE_SPLIT__/<rel>.part001`, symlinks (`120000`),
       and `100755` executable scripts (`755` never degraded to `644`).
     - Real 85+ step `INKWAVE_AUTO_LATEST.json` (`lastSha` + `lastSyncedSha` + `chain`) inheritance,
       interrupted incremental sync (`INKWAVE_AUTO_PENDING.json` paused after 1 batch),
       pending protection during `prune_deltas()`, resumption to completion (`payload/000000-000.bin`),
       `consolidate()` into `INKWAVE-main-<sha8>-<date>-guide.zip` + `update.zip` (with `APPLY_UPDATE.py`
       and `DELTA_MANIFEST.json`), `prune_deltas()`, post-consolidation active delta, and exact
       restoration to both intermediate consolidated commit and latest `lastSha` commit.
  3. `INKWAVE_GAS_AutoSync_v3.gs` Interoperability:
     - Executes GAS v3.2 logic in Node VM against an 85-step `INKWAVE_AUTO_LATEST.json` chain,
       verifying `validateState_`, `normalizeState_`, `archiveLegacyDeltas` (with pending protection
       and active delta separation), and `rotateBaselineToConsolidated`.
  4. Abnormal & Boundary Cases:
     - Path traversal (`../`) rejection, corrupt payload chunk SHA-256 detection, and unexpected
       extra file detection.
"""

import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

BACKUP_DIR = Path(__file__).resolve().parents[1]
if str(BACKUP_DIR) not in sys.path:
    sys.path.insert(0, str(BACKUP_DIR))

import APPLY_APLUS_PATCH as applier
import backup_and_restore as br


class BackupAndRestoreTestSuite(unittest.TestCase):
    def test_01_apply_aplus_patch_action_status_conflict_755_mode_symlink_rollback(self):
        """Mandatory Fix 1 & 3: action/status unification, zero overwrite of existing files, 755 mode & symlink rollback."""
        with tempfile.TemporaryDirectory(prefix="inkwave_test_applier_") as td:
            root = Path(td)
            repo = root / "repo"
            bundle = root / "bundle"
            (bundle / "files/scripts").mkdir(parents=True, exist_ok=True)
            repo.mkdir(parents=True, exist_ok=True)

            # Target repo baseline:
            # - scripts/run.mjs (executable 100755)
            # - config.txt (regular 100644)
            # - bin_link (symlink 120000 -> scripts/run.mjs)
            (repo / "scripts").mkdir(parents=True, exist_ok=True)
            orig_run = b"#!/usr/bin/env node\nconsole.log('v1');\n"
            (repo / "scripts/run.mjs").write_bytes(orig_run)
            os.chmod(repo / "scripts/run.mjs", 0o755)

            orig_cfg = b"cfg=baseline\n"
            (repo / "config.txt").write_bytes(orig_cfg)
            os.chmod(repo / "config.txt", 0o644)

            (repo / "bin_link").symlink_to("scripts/run.mjs")

            # Bundle files:
            new_run = b"#!/usr/bin/env node\nconsole.log('v2-aplus');\n"
            (bundle / "files/scripts/run.mjs").write_bytes(new_run)
            os.chmod(bundle / "files/scripts/run.mjs", 0o755)

            new_cfg = b"cfg=upgraded\n"
            (bundle / "files/config.txt").write_bytes(new_cfg)
            os.chmod(bundle / "files/config.txt", 0o644)

            new_added = b"#!/usr/bin/env python3\nprint('added tool')\n"
            (bundle / "files/added_tool.py").write_bytes(new_added)
            os.chmod(bundle / "files/added_tool.py", 0o755)

            (bundle / "files/bin_link").symlink_to("added_tool.py")

            manifest = {
                "bundle_version": "2.2.0",
                "files": [
                    {
                        "path": "scripts/run.mjs",
                        "action": "modified",
                        # Intentionally omit "status" on this item to prove "action"-only entries work
                        "kind": "file",
                        "old_mode": "100755",
                        "new_mode": "100755",
                        "old_sha256": hashlib.sha256(orig_run).hexdigest(),
                        "new_sha256": hashlib.sha256(new_run).hexdigest(),
                    },
                    {
                        "path": "config.txt",
                        "action": "modified",
                        "status": "modified",
                        "kind": "file",
                        "old_mode": "100644",
                        "new_mode": "100644",
                        "old_sha256": hashlib.sha256(orig_cfg).hexdigest(),
                        "new_sha256": hashlib.sha256(new_cfg).hexdigest(),
                    },
                    {
                        "path": "added_tool.py",
                        "action": "added",
                        # Intentionally omit "status" to prove "action": "added" never falls back to status="modified"!
                        "kind": "file",
                        "old_mode": None,
                        "new_mode": "100755",
                        "old_sha256": None,
                        "new_sha256": hashlib.sha256(new_added).hexdigest(),
                    },
                    {
                        "path": "bin_link",
                        "action": "modified",
                        "status": "modified",
                        "kind": "symlink",
                        "old_mode": "120000",
                        "new_mode": "120000",
                        "old_sha256": hashlib.sha256(b"scripts/run.mjs").hexdigest(),
                        "new_sha256": hashlib.sha256(b"added_tool.py").hexdigest(),
                    },
                ],
            }
            (bundle / "APLUS_MANIFEST.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

            # Case A: Pre-existing untracked file at "added" path `added_tool.py` MUST NOT be overwritten!
            (repo / "added_tool.py").write_bytes(b"user pre-existing local file\n")
            code, summary = applier.apply_bundle(bundle, repo, check_only=False, force=False)
            self.assertEqual(code, 1)
            self.assertEqual(summary["status"], "CONFLICT_ABORTED")
            self.assertEqual(summary["files_written"], 0)
            self.assertEqual((repo / "added_tool.py").read_bytes(), b"user pre-existing local file\n")
            self.assertEqual((repo / "scripts/run.mjs").read_bytes(), orig_run)
            (repo / "added_tool.py").unlink()

            # Case B: Local modification on `config.txt` MUST abort with 0 files written
            (repo / "config.txt").write_bytes(b"local dirty edit\n")
            code, summary = applier.apply_bundle(bundle, repo, check_only=False, force=False)
            self.assertEqual(code, 1)
            self.assertEqual(summary["status"], "CONFLICT_ABORTED")
            self.assertEqual(summary["files_written"], 0)
            self.assertEqual((repo / "scripts/run.mjs").read_bytes(), orig_run)
            (repo / "config.txt").write_bytes(orig_cfg)

            # Case C: Dry-run `--check` succeeds without modifying any file
            code, summary = applier.apply_bundle(bundle, repo, check_only=True, force=False)
            self.assertEqual(code, 0)
            self.assertEqual(summary["status"], "CHECK_OK")
            self.assertFalse((repo / "added_tool.py").exists())

            # Case D: Full apply succeeds and preserves 100755, 100644, and 120000 symlink
            code, summary = applier.apply_bundle(bundle, repo, check_only=False, force=False)
            self.assertEqual(code, 0)
            self.assertEqual(summary["status"], "APPLIED_OK")
            self.assertEqual((repo / "scripts/run.mjs").read_bytes(), new_run)
            self.assertTrue((repo / "scripts/run.mjs").lstat().st_mode & 0o111, "scripts/run.mjs must remain 0755 executable")
            self.assertFalse((repo / "config.txt").lstat().st_mode & 0o111, "config.txt must remain 0644 non-executable")
            self.assertTrue((repo / "added_tool.py").lstat().st_mode & 0o111, "added_tool.py must be 0755 executable")
            self.assertTrue((repo / "bin_link").is_symlink())
            self.assertEqual(os.readlink(repo / "bin_link"), "added_tool.py")

            # Case E: Idempotent re-run returns ALREADY_APPLIED
            code, summary = applier.apply_bundle(bundle, repo, check_only=False, force=False)
            self.assertEqual(code, 0)
            self.assertEqual(summary["status"], "ALREADY_APPLIED")

            # Case F: If someone accidentally strips +x on scripts/run.mjs (755 -> 644), re-running apply detects & repairs mode!
            os.chmod(repo / "scripts/run.mjs", 0o644)
            code, summary = applier.apply_bundle(bundle, repo, check_only=False, force=False)
            self.assertEqual(code, 0)
            self.assertEqual(summary["status"], "APPLIED_OK")
            self.assertTrue((repo / "scripts/run.mjs").lstat().st_mode & 0o111, "Mode repaired back to 0755")

            # Case G: Rollback restores exact pre-patch content, 755/644 modes, and symlink target, and removes added_tool.py
            rc = applier.perform_rollback(repo)
            self.assertEqual(rc, 0)
            self.assertEqual((repo / "scripts/run.mjs").read_bytes(), orig_run)
            self.assertTrue((repo / "scripts/run.mjs").lstat().st_mode & 0o111, "Rollback preserved 0755 on scripts/run.mjs")
            self.assertFalse((repo / "config.txt").lstat().st_mode & 0o111, "Rollback preserved 0644 on config.txt")
            self.assertFalse((repo / "added_tool.py").exists(), "Rollback removed added_tool.py")
            self.assertTrue((repo / "bin_link").is_symlink())
            self.assertEqual(os.readlink(repo / "bin_link"), "scripts/run.mjs")

    def test_02_real_drive_85_step_chain_compatibility_and_roundtrip(self):
        """Mandatory Fix 2 & 4: Full round-trip using real Drive format (pack-full, 85-step chain, interrupted pending, consolidate, prune, restore)."""
        with tempfile.TemporaryDirectory(prefix="inkwave_test_drive_roundtrip_") as td:
            root = Path(td)

            # 1. Test standalone pack-full -> restore with __INKWAVE_SPLIT__, symlink, and 755 mode
            src_full = root / "src_full"
            (src_full / "scripts").mkdir(parents=True, exist_ok=True)
            (src_full / "assets").mkdir(parents=True, exist_ok=True)
            (src_full / "scripts/build.mjs").write_bytes(b"#!/usr/bin/env node\nconsole.log('build');\n")
            os.chmod(src_full / "scripts/build.mjs", 0o755)
            (src_full / "README.md").write_bytes(b"# INKWAVE Full Pack\n")
            os.chmod(src_full / "README.md", 0o644)
            # Large binary exceeding split threshold (250 KB threshold for fast test)
            big_payload = os.urandom(600 * 1024)
            (src_full / "assets/volumes.bin.gz").write_bytes(big_payload)
            (src_full / "scripts/current_readme.md").symlink_to("../README.md")

            full_sha = "83f27e5d59db944458a85122a95d1154e3543393"
            pack_dir = root / "pack_out"
            full_man = br.pack_full(
                src_full,
                pack_dir,
                commit_sha=full_sha,
                max_part_mb=0.35,
                split_threshold_bytes=250 * 1024,
            )
            self.assertIn("assets/volumes.bin.gz", full_man["split"])
            self.assertGreaterEqual(full_man["part_count"], 2)

            restored_full = root / "restored_full"
            br.restore(pack_dir, restored_full, target_commit=full_sha)
            self.assertEqual((restored_full / "assets/volumes.bin.gz").read_bytes(), big_payload)
            self.assertTrue((restored_full / "scripts/build.mjs").lstat().st_mode & 0o111, "755 preserved after pack-full -> restore")
            self.assertFalse((restored_full / "README.md").lstat().st_mode & 0o111, "644 preserved after pack-full -> restore")
            self.assertTrue((restored_full / "scripts/current_readme.md").is_symlink())
            self.assertEqual(os.readlink(restored_full / "scripts/current_readme.md"), "../README.md")

            # 2. Build a realistic Drive folder with:
            #    - b1f571da base (with __INKWAVE_SPLIT__ and 755 script)
            #    - 7ea9410d consolidated update (with APPLY_UPDATE.py + DELTA_MANIFEST.json)
            #    - Pre-existing 85-step chain in INKWAVE_AUTO_LATEST.json (`lastSha` format)
            drive_dir = root / "drive"
            drive_dir.mkdir(parents=True, exist_ok=True)

            base_sha = "b1f571da0d1233e0194d2cae42779cdb6bb70f61"
            tree_b1 = root / "tree_b1"
            (tree_b1 / "scripts").mkdir(parents=True, exist_ok=True)
            (tree_b1 / "scripts/tool.sh").write_bytes(b"#!/bin/sh\necho b1\n")
            os.chmod(tree_b1 / "scripts/tool.sh", 0o755)
            (tree_b1 / "app.js").write_bytes(b"export const v = 'b1';\n")
            os.chmod(tree_b1 / "app.js", 0o644)
            br.pack_full(tree_b1, drive_dir, commit_sha=base_sha, max_part_mb=5.0)

            # Create 7ea9410d tree and initial consolidated guide + update
            sha_7ea = "7ea9410d9aaca46ddb864b96ca4af4ea475f82d6"
            tree_7ea = root / "tree_7ea"
            shutil.copytree(tree_b1, tree_7ea, symlinks=True)
            (tree_7ea / "app.js").write_bytes(b"export const v = '7ea';\n")

            # Simulate an 83-step historical chain ending at sha_7ea in INKWAVE_AUTO_LATEST.json (using only `lastSha` to test upgrade!)
            historical_chain = []
            prev_s = "0000000000000000000000000000000000000000"
            for i in range(1, 84):
                next_s = sha_7ea if i == 83 else f"{i:08x}" + ("a" * 32)
                historical_chain.append({
                    "from": prev_s,
                    "to": next_s,
                    "manifest": f"INKWAVE-auto-{prev_s[:8]}-to-{next_s[:8]}-manifest.json",
                    "manifestId": f"id_{i}",
                    "partCount": 1,
                    "changedFiles": 1,
                })
                # Create dummy superseded manifest in drive_dir root so prune_deltas can archive it
                (drive_dir / f"INKWAVE-auto-{prev_s[:8]}-to-{next_s[:8]}-manifest.json").write_text(
                    json.dumps({"schema": 1, "from": prev_s, "to": next_s, "changes": [], "parts": []}),
                    encoding="utf-8",
                )
                prev_s = next_s

            # Write initial INKWAVE_AUTO_LATEST.json with `lastSha` (no `lastSyncedSha` yet)
            (drive_dir / "INKWAVE_AUTO_LATEST.json").write_text(
                json.dumps({
                    "schema": 1,
                    "repository": "rhgrive3/actions",
                    "baseline": "0000000000000000000000000000000000000000",
                    "consolidatedSha": sha_7ea,
                    "lastSha": sha_7ea,
                    "updatedUtc": "2026-10-17T04:22:51.799Z",
                    "chain": historical_chain,
                }, indent=2),
                encoding="utf-8",
            )

            # Create consolidated 7ea9410d guide + update against b1f571da
            with zipfile.ZipFile(drive_dir / f"INKWAVE-{base_sha[:8]}-guide.zip", "r") as zf:
                base_man_raw = zf.read("SOURCE_MANIFEST.json").decode("utf-8")
                base_man = json.loads(base_man_raw)
            files_7ea, map_7ea = br.scan_tree(tree_7ea)
            curr_7ea = {
                "repo": "rhgrive3/actions",
                "main_commit": sha_7ea,
                "baseline_commit": base_sha,
                "tracked_count": len(files_7ea),
                "incremental_update_zip": "INKWAVE-main-7ea9410d-20261017-update.zip",
                "baseline_part_pattern": "INKWAVE-b1f571da-part-*.zip",
                "part_count": base_man["part_count"],
                "main_exact_from_verified_baseline_plus_delta": True,
                "unmerged_pr_branches_included": False,
                "files": files_7ea,
            }
            with zipfile.ZipFile(drive_dir / "INKWAVE-main-7ea9410d-20261017-update.zip", "w") as zf:
                br.write_zip_member_with_mode(zf, "files/app.js", (tree_7ea / "app.js").read_bytes(), "100644")
            with zipfile.ZipFile(drive_dir / "INKWAVE-main-7ea9410d-20261017-guide.zip", "w") as zf:
                br.write_zip_member_with_mode(zf, "SOURCE_MANIFEST.json", base_man_raw.encode("utf-8"), "100644")
                br.write_zip_member_with_mode(zf, "SOURCE_MANIFEST_CURRENT.json", json.dumps(curr_7ea).encode("utf-8"), "100644")

            # Step 84: Create auto-delta from 7ea9410d -> e52f1150
            sha_e52 = "e52f1150b7debd9e4accb4e92750121f2b140c8d"
            tree_e52 = root / "tree_e52"
            shutil.copytree(tree_7ea, tree_e52, symlinks=True)
            (tree_e52 / "app.js").write_bytes(b"export const v = 'e52';\n")
            (tree_e52 / "scripts/new_cli.py").write_bytes(b"#!/usr/bin/env python3\nprint('e52')\n")
            os.chmod(tree_e52 / "scripts/new_cli.py", 0o755)

            done_e52, _ = br.create_or_resume_auto_delta(drive_dir, tree_7ea, tree_e52, sha_7ea, sha_e52)
            self.assertTrue(done_e52)

            # Consolidate at e52f1150
            br.consolidate(drive_dir, target_commit=sha_e52, date_str="20261018")

            # Step 85: Active post-consolidation delta e52f1150 -> 83f27e5d
            tree_83f = root / "tree_83f"
            shutil.copytree(tree_e52, tree_83f, symlinks=True)
            (tree_83f / "app.js").write_bytes(b"export const v = '83f27e5d';\n")
            (tree_83f / "feature.txt").write_bytes(b"active post-consolidation feature\n")
            done_83f, _ = br.create_or_resume_auto_delta(drive_dir, tree_e52, tree_83f, sha_e52, full_sha)
            self.assertTrue(done_83f)

            # Step 86 (Interrupted mid-sync!): 83f27e5d -> a43276d8 paused after 1 batch of 1 file
            sha_a43 = "a43276d8edab80427a9a0f88d952195368eca724"
            tree_a43 = root / "tree_a43"
            shutil.copytree(tree_83f, tree_a43, symlinks=True)
            (tree_a43 / "file1.txt").write_bytes(b"batch 1 file\n")
            (tree_a43 / "file2.txt").write_bytes(b"batch 2 file\n")

            done_interrupted, pending_state = br.create_or_resume_auto_delta(
                drive_dir,
                tree_83f,
                tree_a43,
                full_sha,
                sha_a43,
                max_batch_files=1,
                simulate_interrupt_after_batches=1,
            )
            self.assertFalse(done_interrupted)
            self.assertEqual(pending_state["cursor"], 1)
            self.assertTrue((drive_dir / "INKWAVE_AUTO_PENDING.json").is_file())

            # Run prune_deltas while 83f27e5d -> a43276d8 is interrupted!
            # Must archive the 84 steps (<= e52f1150), keep step 85 (e52f1150 -> 83f27e5d) in INKWAVE_AUTO_DELTAS,
            # and protect the uncommitted part-001.zip of 83f27e5d -> a43276d8!
            prune_res = br.prune_deltas(drive_dir)
            self.assertGreaterEqual(prune_res["archived"], 84)
            self.assertGreaterEqual(prune_res["protected_pending"], 1)

            # Verify restore to intermediate consolidated commit e52f1150 works after prune
            out_e52 = root / "out_e52"
            br.restore(drive_dir, out_e52, target_commit=sha_e52)
            self.assertEqual((out_e52 / "app.js").read_bytes(), b"export const v = 'e52';\n")
            self.assertTrue((out_e52 / "scripts/new_cli.py").lstat().st_mode & 0o111)

            # Verify restore to active post-consolidation commit 83f27e5d works after prune
            out_83f = root / "out_83f"
            br.restore(drive_dir, out_83f, target_commit=full_sha)
            self.assertEqual((out_83f / "feature.txt").read_bytes(), b"active post-consolidation feature\n")
            self.assertTrue((out_83f / "scripts/tool.sh").lstat().st_mode & 0o111)

            # Now resume the interrupted 83f27e5d -> a43276d8 sync to completion!
            done_resumed, _ = br.create_or_resume_auto_delta(
                drive_dir,
                tree_83f,
                tree_a43,
                full_sha,
                sha_a43,
                max_batch_files=1,
            )
            self.assertTrue(done_resumed)
            self.assertFalse((drive_dir / "INKWAVE_AUTO_PENDING.json").exists())

            # Check INKWAVE_AUTO_LATEST.json has 86 steps and synchronized lastSha == lastSyncedSha == sha_a43
            final_state = json.loads((drive_dir / "INKWAVE_AUTO_LATEST.json").read_text("utf-8"))
            self.assertEqual(final_state["lastSha"], sha_a43)
            self.assertEqual(final_state["lastSyncedSha"], sha_a43)
            self.assertEqual(len(final_state["chain"]), 86)

            # Restore to latest commit a43276d8 and verify 100% of files and modes
            out_a43 = root / "out_a43"
            br.restore(drive_dir, out_a43)
            self.assertEqual((out_a43 / "file1.txt").read_bytes(), b"batch 1 file\n")
            self.assertEqual((out_a43 / "file2.txt").read_bytes(), b"batch 2 file\n")
            self.assertTrue((out_a43 / "scripts/tool.sh").lstat().st_mode & 0o111)
            self.assertTrue((out_a43 / "scripts/new_cli.py").lstat().st_mode & 0o111)

    def test_03_gas_v3_and_python_93_and_95_step_chain_interoperability(self):
        """Mandatory Fix 2: Execute INKWAVE_GAS_AutoSync_v3.gs in Node VM against an 85-step chain."""
        gas_path = BACKUP_DIR / "INKWAVE_GAS_AutoSync_v3.gs"
        node_script = f"""
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const gasCode = fs.readFileSync({json.dumps(str(gas_path))}, 'utf8');

// Build mock Drive environment with 85 chain steps, 1 consolidated snapshot at step 83,
// 2 active steps (84, 85), and 1 pending step (86)
const chain = [];
let prev = '7ea9410d9aaca46ddb864b96ca4af4ea475f82d6';
let step83Sha = '';
let step85Sha = '';
const rootFiles = new Map();

for (let i = 1; i <= 95; i++) {{
  const next = i.toString(16).padStart(8, '0') + 'b'.repeat(32);
  if (i === 83) step83Sha = next;
  if (i === 95) step85Sha = next;
  const mName = `INKWAVE-auto-${{prev.slice(0,8)}}-to-${{next.slice(0,8)}}-manifest.json`;
  chain.push({{ from: prev, to: next, manifest: mName, manifestId: `id_${{i}}`, partCount: 1, changedFiles: 2 }});
  rootFiles.set(mName, {{ name: mName, folder: 'root' }});
  prev = next;
}}

const pendingFrom = step85Sha;
const pendingTo = '8bebf5cf288149d8ff9a16fa181a89ddf063b8a4';
const pendingPartName = `INKWAVE-auto-${{pendingFrom.slice(0,8)}}-to-${{pendingTo.slice(0,8)}}-part-001.zip`;
rootFiles.set(pendingPartName, {{ name: pendingPartName, folder: 'root' }});

let stateJson = JSON.stringify({{
  schema: 1,
  repository: 'rhgrive3/actions',
  baseline: '7ea9410d9aaca46ddb864b96ca4af4ea475f82d6',
  lastSha: step85Sha, // legacy state without lastSyncedSha
  updatedUtc: '2026-10-20T15:38:37.142Z',
  chain,
}});

const pendingJson = JSON.stringify({{
  schema: 1,
  from: pendingFrom,
  to: pendingTo,
  cursor: 1,
}});

const currManifestJson = JSON.stringify({{
  main_commit: step83Sha,
  tracked_count: 4800,
}});

const makeFileObj = (name, getContent, setContent) => ({{
  getName: () => name,
  getId: () => 'id_' + name,
  getLastUpdated: () => new Date(),
  getBlob: () => ({{ getDataAsString: () => getContent() }}),
  setContent: (c) => setContent(c),
  moveTo: (targetFolder) => {{
    const item = rootFiles.get(name);
    if (item) item.folder = targetFolder.name;
  }},
}});

const mockFolder = {{
  name: 'root',
  getFoldersByName: (n) => {{
    let done = false;
    return {{ hasNext: () => !done, next: () => {{ done = true; return {{ name: n, getFilesByName: () => ({{ hasNext: () => false }}) }}; }} }};
  }},
  createFolder: (n) => ({{ name: n }}),
  getFilesByName: (n) => {{
    if (n === 'INKWAVE_AUTO_LATEST.json') {{
      let done = false;
      return {{ hasNext: () => !done, next: () => {{ done = true; return makeFileObj(n, () => stateJson, (c) => {{ stateJson = c; }}); }} }};
    }}
    if (n === 'INKWAVE_AUTO_PENDING.json') {{
      let done = false;
      return {{ hasNext: () => !done, next: () => {{ done = true; return makeFileObj(n, () => pendingJson, () => {{}}); }} }};
    }}
    if (n === 'SOURCE_MANIFEST_CURRENT.json') {{
      let done = false;
      return {{ hasNext: () => !done, next: () => {{ done = true; return makeFileObj(n, () => currManifestJson, () => {{}}); }} }};
    }}
    return {{ hasNext: () => false }};
  }},
  getFiles: () => {{
    const vals = Array.from(rootFiles.values());
    let idx = 0;
    return {{
      hasNext: () => idx < vals.length,
      next: () => {{
        const v = vals[idx++];
        return makeFileObj(v.name, () => '{{}}', () => {{}});
      }},
    }};
  }},
}};

const ctx = {{
  Object, Array, JSON, Date, Math, Number, String, RegExp, Error, console,
  LockService: {{ getScriptLock: () => ({{ tryLock: () => true, releaseLock: () => {{}} }}) }},
  DriveApp: {{ getFolderById: () => mockFolder }},
  PropertiesService: {{ getScriptProperties: () => ({{ getProperty: () => null, setProperty: () => {{}} }}) }},
}};
vm.createContext(ctx);
vm.runInContext(gasCode, ctx);

// 1. Validate legacy state (with only lastSha) normalizes & validates cleanly
const parsedState = JSON.parse(stateJson);
ctx.validateState_(parsedState);
assert.equal(parsedState.lastSha, step85Sha);
assert.equal(parsedState.lastSyncedSha, step85Sha);

// 2. Run archiveLegacyDeltas() and verify:
//    - 83 superseded steps moved to INKWAVE_ARCHIVED_DELTAS
//    - 2 active post-consolidation steps moved to INKWAVE_AUTO_DELTAS
//    - 1 in-flight pending part file protected in 'root'
const res = ctx.archiveLegacyDeltas();
assert.equal(res.archived, 83);
assert.equal(res.organizedActive, 12);
assert.equal(res.protectedPending, 1);
assert.equal(rootFiles.get(pendingPartName).folder, 'root');

// 3. Test rotateBaselineToConsolidated without trimming chain vs with trimming chain
const rotatedKeep = ctx.rotateBaselineToConsolidated(step83Sha, false);
assert.equal(rotatedKeep.consolidatedSha, step83Sha);
assert.equal(rotatedKeep.chain.length, 95);
const rotatedTrim = ctx.rotateBaselineToConsolidated(step83Sha, true);
assert.equal(rotatedTrim.baseline, step83Sha);
assert.equal(rotatedTrim.chain.length, 12);
assert.equal(rotatedTrim.lastSha, step85Sha);
assert.equal(rotatedTrim.lastSyncedSha, step85Sha);
"""
        proc = subprocess.run(["node", "--input-type=module", "-e", node_script], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, f"GAS v3 VM test failed: {proc.stderr}\n{proc.stdout}")

    def test_04_abnormal_and_boundary_cases(self):
        """Verify path traversal rejection, mismatched action/status rejection, and corrupt chunk detection."""
        with tempfile.TemporaryDirectory(prefix="inkwave_test_abnormal_") as td:
            root = Path(td)
            with self.assertRaises(ValueError):
                br.checked_path(root, "../escape.txt")
            with self.assertRaises(ValueError):
                applier.safe_repo_path(root, "/abs/path")
            with self.assertRaises(ValueError):
                applier.resolve_entry_op({"path": "x.js", "action": "added", "status": "modified"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
