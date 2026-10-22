#!/usr/bin/env python3
"""
INKWAVE (ZEVANT) — Safe Transactional Patch Applier & Conflict Detector (v2.2)

Guarantees:
1. Unified Schema Compatibility ("action" & "status"):
   - Validates both `item["action"]` and `item["status"]` (`"added"`, `"modified"`, `"deleted"`).
   - Rejects malformed entries or entries where `action` and `status` disagree.
2. Zero Unconditional Overwrites (Strict Pre-Flight Verification):
   - For `"added"` entries: if the target path already exists on disk (file or symlink) and its
     content/mode/kind does not already match the upgraded target state, aborts immediately with
     `CONFLICT_ABORTED` (`files_written: 0`) unless `--force` is explicitly provided.
   - For `"modified"` entries: requires a non-empty baseline digest set (`old_sha256` / `alt_old_sha256`).
     If the target file is missing or its SHA-256 (or symlink target) does not match `old_sha256`
     (or `new_sha256` when already applied), aborts with `CONFLICT_ABORTED` (`files_written: 0`).
3. Full File Mode (755 / 644), Symlink (120000), SHA-256, Rollback & Idempotency Guarantees:
   - Preserves and enforces exact POSIX modes (`100755` -> `0o755`, `100644` -> `0o644`) and
     symbolic links (`120000` / `kind: "symlink"`). Never degrades `755 -> 644`.
   - Saves a complete transactional snapshot (`.aplus-backup/latest/backup_manifest.json` + payload)
     including original file mode, kind, symlink target, and SHA-256 before modifying any file.
   - Automatically rolls back on any write/verification failure, and supports explicit `--rollback`.
"""

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

BACKUP_DIR_NAME = ".aplus-backup"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file_or_symlink(path: Path) -> str:
    if path.is_symlink():
        raw = os.readlink(path).encode("utf-8", "surrogateescape")
        return sha256_bytes(raw)
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def detect_mode_str(path: Path) -> str:
    if path.is_symlink():
        return "120000"
    st = path.lstat()
    return "100755" if (st.st_mode & 0o111) else "100644"


def detect_kind(path: Path) -> str:
    return "symlink" if path.is_symlink() else "file"


def safe_repo_path(root: Path, rel_path: str) -> Path:
    if not rel_path or rel_path.startswith("/") or "\\" in rel_path:
        raise ValueError(f"Unsafe relative path: {rel_path}")
    parts = rel_path.split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise ValueError(f"Path traversal segment in: {rel_path}")
    resolved_root = root.resolve()
    candidate = resolved_root.joinpath(*parts)
    # Check parent resolution so symlinks at leaf are not dereferenced outside root
    if not candidate.parent.resolve(strict=False).is_relative_to(resolved_root):
        raise ValueError(f"Path escapes repository root: {rel_path}")
    return candidate


def resolve_entry_op(item: dict) -> str:
    action = item.get("action")
    status = item.get("status")
    if action and status and action != status:
        raise ValueError(f"Manifest entry for {item.get('path')} has mismatched action={action!r} vs status={status!r}")
    op = action or status
    if op not in ("added", "modified", "deleted"):
        raise ValueError(f"Manifest entry for {item.get('path')} has invalid action/status: {op!r}")
    return op


def resolve_target_mode(item: dict, src: Optional[Path], dst: Optional[Path]) -> str:
    kind = item.get("kind", "file")
    if kind == "symlink" or item.get("new_mode") == "120000":
        return "120000"
    for key in ("new_mode", "mode"):
        val = item.get(key)
        if val in ("100755", "100644"):
            return val
    # Check if existing destination or old_mode had executable bit
    if item.get("old_mode") == "100755":
        return "100755"
    if dst is not None and (dst.exists() or dst.is_symlink()) and not dst.is_symlink():
        if dst.lstat().st_mode & 0o111:
            return "100755"
    if src is not None and src.exists() and not src.is_symlink():
        if src.lstat().st_mode & 0o111:
            return "100755"
    return "100644"


def perform_rollback(repo: Path) -> int:
    bdir = repo / BACKUP_DIR_NAME / "latest"
    bman_path = bdir / "backup_manifest.json"
    if not bman_path.exists():
        print(f"ERROR: No rollback snapshot found at {bman_path}", file=sys.stderr)
        return 2
    bman = json.loads(bman_path.read_text(encoding="utf-8"))
    restored = 0
    removed = 0
    for entry in bman.get("entries", []):
        rel = entry["path"]
        target = safe_repo_path(repo, rel)
        if entry.get("existed"):
            kind = entry.get("kind", "file")
            mode_str = entry.get("mode", "100644")
            target.parent.mkdir(parents=True, exist_ok=True)
            if kind == "symlink" or mode_str == "120000":
                link_target = entry["symlink_target"]
                if target.exists() or target.is_symlink():
                    target.unlink()
                target.symlink_to(link_target)
            else:
                bfile = safe_repo_path(bdir / "files", rel)
                tmp_dst = target.parent / f".{target.name}.rollback-tmp-{os.getpid()}"
                shutil.copy2(bfile, tmp_dst)
                os.chmod(tmp_dst, 0o755 if mode_str == "100755" else 0o644)
                if target.is_symlink():
                    target.unlink()
                os.replace(tmp_dst, target)
            actual_sha = sha256_file_or_symlink(target)
            if actual_sha != entry["sha256"]:
                raise RuntimeError(f"Rollback SHA-256 mismatch on {rel}")
            if detect_mode_str(target) != mode_str:
                raise RuntimeError(f"Rollback mode mismatch on {rel}: expected {mode_str}, got {detect_mode_str(target)}")
            restored += 1
        else:
            if target.exists() or target.is_symlink():
                target.unlink()
                removed += 1
    print(f"ROLLBACK SUCCESS: restored {restored} modified file(s) and removed {removed} added file(s).")
    return 0


def apply_bundle(
    bundle_dir: Path,
    repo: Path,
    check_only: bool = False,
    force: bool = False,
) -> Tuple[int, Dict]:
    manifest_path = bundle_dir / "APLUS_MANIFEST.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"APLUS_MANIFEST.json not found in {bundle_dir}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files_dir = bundle_dir / "files"
    entries = manifest.get("files", [])

    # Phase 1: Verify bundle payload integrity & target repository baseline
    conflicts: List[Dict] = []
    already_applied_count = 0

    for item in entries:
        rel = item["path"]
        op = resolve_entry_op(item)
        kind = item.get("kind", "file")
        dst = safe_repo_path(repo, rel)

        if op != "deleted":
            src = safe_repo_path(files_dir, rel)
            if not (src.exists() or src.is_symlink()):
                return 2, {"status": "BUNDLE_MISSING_FILE", "path": rel}
            src_sha = sha256_file_or_symlink(src)
            expected_new = item.get("new_sha256") or item.get("sha256")
            if src_sha != expected_new:
                return 2, {
                    "status": "BUNDLE_HASH_MISMATCH",
                    "path": rel,
                    "expected": expected_new,
                    "actual": src_sha,
                }
        else:
            src = None
            expected_new = None

        target_mode = resolve_target_mode(item, src, dst)
        valid_old = set()
        if item.get("old_sha256"):
            valid_old.add(item["old_sha256"])
        for alt in item.get("alt_old_sha256", []):
            if alt:
                valid_old.add(alt)

        dst_exists = dst.exists() or dst.is_symlink()
        if dst_exists:
            dst_sha = sha256_file_or_symlink(dst)
            dst_mode = detect_mode_str(dst)
            dst_kind = detect_kind(dst)
            if op != "deleted" and dst_sha == expected_new and dst_kind == kind and dst_mode == target_mode:
                already_applied_count += 1
                continue

            if op == "added":
                # Even if dst_sha == expected_new with wrong mode, only allow without conflict if content matches expected_new
                if dst_sha != expected_new or dst_kind != kind:
                    conflicts.append({
                        "path": rel,
                        "action": op,
                        "reason": "Target file already exists for 'added' entry with different content",
                        "expected_old": None,
                        "actual": dst_sha,
                    })
            elif op == "modified":
                if not valid_old:
                    conflicts.append({
                        "path": rel,
                        "action": op,
                        "reason": "Manifest entry for 'modified' file is missing old_sha256 baseline",
                        "expected_old": [],
                        "actual": dst_sha,
                    })
                elif dst_sha not in valid_old and dst_sha != expected_new:
                    conflicts.append({
                        "path": rel,
                        "action": op,
                        "reason": "Target file has local modifications or diverged baseline SHA-256",
                        "expected_old": sorted(valid_old),
                        "actual": dst_sha,
                    })
            elif op == "deleted":
                if not valid_old or dst_sha not in valid_old:
                    conflicts.append({
                        "path": rel,
                        "action": op,
                        "reason": "Target file to delete has local modifications",
                        "expected_old": sorted(valid_old),
                        "actual": dst_sha,
                    })
        else:
            if op == "deleted":
                already_applied_count += 1
                continue
            if op == "modified":
                conflicts.append({
                    "path": rel,
                    "action": op,
                    "reason": "Target file required by 'modified' entry is missing",
                    "expected_old": sorted(valid_old),
                    "actual": None,
                })

    if already_applied_count == len(entries) and not conflicts:
        summary = {"status": "ALREADY_APPLIED", "files_verified": len(entries)}
        print(json.dumps(summary, indent=2))
        return 0, summary

    if conflicts and not force:
        summary = {
            "status": "CONFLICT_ABORTED",
            "conflicts_count": len(conflicts),
            "conflicts": conflicts,
            "files_written": 0,
        }
        print(json.dumps(summary, indent=2), file=sys.stderr)
        return 1, summary

    if check_only:
        summary = {
            "status": "CHECK_OK",
            "files_ready": len(entries),
            "already_applied": already_applied_count,
            "conflicts_overridden": len(conflicts) if force else 0,
        }
        print(json.dumps(summary, indent=2))
        return 0, summary

    # Phase 2: Save transactional backup (preserving original pre-patch baseline if already backed up)
    bdir = repo / BACKUP_DIR_NAME / "latest"
    existing_backup_map = {}
    if (bdir / "backup_manifest.json").is_file():
        try:
            prev_bman = json.loads((bdir / "backup_manifest.json").read_text(encoding="utf-8"))
            for be in prev_bman.get("entries", []):
                existing_backup_map[be["path"]] = be
        except Exception:
            existing_backup_map = {}
    (bdir / "files").mkdir(parents=True, exist_ok=True)
    backup_entries = []
    for item in entries:
        rel = item["path"]
        expected_new = item.get("new_sha256") or item.get("sha256")
        dst = safe_repo_path(repo, rel)
        # If target already has the patched content and we already have a pre-patch backup entry, preserve it!
        if rel in existing_backup_map and (dst.exists() or dst.is_symlink()) and sha256_file_or_symlink(dst) == expected_new:
            backup_entries.append(existing_backup_map[rel])
            continue
        if dst.exists() or dst.is_symlink():
            dst_kind = detect_kind(dst)
            dst_mode = detect_mode_str(dst)
            dst_sha = sha256_file_or_symlink(dst)
            if dst_kind == "symlink":
                backup_entries.append({
                    "path": rel,
                    "existed": True,
                    "kind": "symlink",
                    "mode": "120000",
                    "symlink_target": os.readlink(dst),
                    "sha256": dst_sha,
                })
            else:
                bfile = safe_repo_path(bdir / "files", rel)
                bfile.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(dst, bfile)
                os.chmod(bfile, 0o755 if dst_mode == "100755" else 0o644)
                backup_entries.append({
                    "path": rel,
                    "existed": True,
                    "kind": "file",
                    "mode": dst_mode,
                    "symlink_target": None,
                    "sha256": dst_sha,
                })
        else:
            backup_entries.append({
                "path": rel,
                "existed": False,
                "kind": None,
                "mode": None,
                "symlink_target": None,
                "sha256": None,
            })
    (bdir / "backup_manifest.json").write_text(
        json.dumps({"entries": backup_entries}, indent=2) + "\n", encoding="utf-8"
    )

    # Phase 3: Atomic staging, exact mode/symlink application & post-write verification
    written = 0
    try:
        for item in entries:
            rel = item["path"]
            op = resolve_entry_op(item)
            kind = item.get("kind", "file")
            dst = safe_repo_path(repo, rel)
            if op == "deleted":
                if dst.exists() or dst.is_symlink():
                    dst.unlink()
                written += 1
                continue

            src = safe_repo_path(files_dir, rel)
            target_mode = resolve_target_mode(item, src, dst)
            expected_new = item.get("new_sha256") or item.get("sha256")
            dst.parent.mkdir(parents=True, exist_ok=True)

            if kind == "symlink" or target_mode == "120000":
                link_target = os.readlink(src) if src.is_symlink() else src.read_bytes().decode("utf-8", "surrogateescape")
                tmp_link = dst.parent / f".{dst.name}.aplus-tmp-{os.getpid()}"
                if tmp_link.exists() or tmp_link.is_symlink():
                    tmp_link.unlink()
                tmp_link.symlink_to(link_target)
                os.replace(tmp_link, dst)
            else:
                tmp_dst = dst.parent / f".{dst.name}.aplus-tmp-{os.getpid()}"
                shutil.copy2(src, tmp_dst)
                os.chmod(tmp_dst, 0o755 if target_mode == "100755" else 0o644)
                if dst.is_symlink():
                    dst.unlink()
                os.replace(tmp_dst, dst)

            if sha256_file_or_symlink(dst) != expected_new:
                raise RuntimeError(f"Post-write SHA-256 verification failed for {rel}")
            if detect_mode_str(dst) != target_mode:
                raise RuntimeError(f"Post-write mode verification failed for {rel}: expected {target_mode}, got {detect_mode_str(dst)}")
            written += 1
    except Exception as exc:
        print(f"ERROR during apply ({exc}); rolling back automatically...", file=sys.stderr)
        perform_rollback(repo)
        return 3, {"status": "ROLLED_BACK_ON_ERROR", "error": str(exc)}

    summary = {
        "status": "APPLIED_OK",
        "files_applied": written,
        "backup_dir": str(bdir.relative_to(repo)),
    }
    print(json.dumps(summary, indent=2))
    return 0, summary


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Safe transactional applier for INKWAVE A+ Upgrade Bundle (v2.2)")
    ap.add_argument("repo_pos", nargs="?", default=None, help="Optional positional path to target repository root")
    ap.add_argument("--repo", default=None, help="Target INKWAVE repository root (default: current directory)")
    ap.add_argument("--bundle", default=None, help="Bundle directory containing APLUS_MANIFEST.json and files/")
    ap.add_argument("--check", action="store_true", help="Pre-flight dry-run verification without modifying files")
    ap.add_argument("--force", action="store_true", help="Override baseline SHA-256 conflicts (still saves backup)")
    ap.add_argument("--rollback", action="store_true", help="Restore pre-apply snapshot from .aplus-backup/latest")
    args = ap.parse_args(argv)

    repo_arg = args.repo or args.repo_pos or "."
    repo = Path(repo_arg).resolve()
    if args.rollback:
        return perform_rollback(repo)

    if args.bundle:
        bundle_dir = Path(args.bundle).resolve()
    else:
        script_dir = Path(__file__).resolve().parent
        if (script_dir / "APLUS_MANIFEST.json").exists():
            bundle_dir = script_dir
        elif (script_dir.parent.parent / "APLUS_MANIFEST.json").exists():
            bundle_dir = script_dir.parent.parent
        else:
            bundle_dir = script_dir

    code, _ = apply_bundle(bundle_dir, repo, check_only=args.check, force=args.force)
    return code


if __name__ == "__main__":
    sys.exit(main())
