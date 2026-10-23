#!/usr/bin/env python3
"""
INKWAVE Unified Backup, Consolidation, Auto-Delta, Prune, and Restore Utility (v2.2)

Fully compatible with the production Google Drive backup ecosystem:
  1. Base 47-part archive (`INKWAVE-b1f571da-part-001.zip`..`047.zip` + `SOURCE_MANIFEST.json`
     with `__INKWAVE_SPLIT__/<path>.part001`, `symlinks`, and `files`).
  2. Consolidated snapshots (`INKWAVE-main-<sha8>-<date>-guide.zip` +
     `INKWAVE-main-<sha8>-<date>-update.zip` or `*-update-part-001.zip`.. with `APPLY_UPDATE.py`
     and `DELTA_MANIFEST.json`).
  3. 5-Minute GAS AutoSync 85+ step chain (`INKWAVE_AUTO_LATEST.json` with `schema: 1`,
     `baseline`, `lastSha` AND synchronized `lastSyncedSha`, `chain` array of
     `INKWAVE-auto-<from8>-to-<to8>-manifest.json` + `payload/000000-000.bin` in
     `INKWAVE-auto-<from8>-to-<to8>-part-001.zip`, and interrupted checkpoint recovery via
     `INKWAVE_AUTO_PENDING.json`).
  4. Standalone Full Packs (`pack-full` -> `INKWAVE-<sha8>-guide.zip` + `INKWAVE-<sha8>-part-001.zip`..
     with full `restore` round-trip, split reassembly, symlink restoration, and `100755`/`100644`
     mode preservation).
"""

import argparse
import contextlib
import datetime
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from typing import Dict, List, Optional, Tuple

SLIM_EXCLUDE_GLOBS = (
    "tools/inkwave-modeler/blender/*.blend",
    "tools/inkwave-modeler/blender/*.glb",
    "tools/inkwave-modeler/blender/references/*",
    "tools/inkwave-modeler/docs/**/img/*",
    "tools/inkwave-modeler/docs/**/*.jpg",
    "tools/inkwave-modeler/docs/**/*.png",
    "reports/**/*.png",
    "reports/**/*.jpg",
    "reports/**/*.webp",
    "reports/**/*.gz",
    "triggers/*",
)


def is_slim_excluded(rel_path: str) -> bool:
    return any(fnmatch.fnmatch(rel_path, pat) for pat in SLIM_EXCLUDE_GLOBS)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def git_blob_sha(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("utf-8")
    return hashlib.sha1(header + data).hexdigest()


def checked_path(root: Path, rel: str) -> Path:
    if not rel or rel.startswith("/") or "\\" in rel or any(p in ("", ".", "..") for p in rel.split("/")):
        raise ValueError(f"Unsafe relative path: {rel!r}")
    resolved_root = root.resolve()
    target = resolved_root.joinpath(*rel.split("/"))
    if not target.parent.resolve(strict=False).is_relative_to(resolved_root):
        raise ValueError(f"Path escapes root: {rel!r}")
    return target


def read_blob(path: Path, mode: str) -> bytes:
    if mode == "120000" or path.is_symlink():
        if not path.is_symlink():
            raise RuntimeError(f"Expected symlink: {path}")
        return os.readlink(path).encode("utf-8", "surrogateescape")
    if not path.is_file():
        raise RuntimeError(f"Expected regular file: {path}")
    return path.read_bytes()


def detect_mode_str(path: Path) -> str:
    if path.is_symlink():
        return "120000"
    return "100755" if (path.lstat().st_mode & 0o111) else "100644"


def normalize_auto_latest_state(state: dict) -> dict:
    """Ensure `lastSha` and `lastSyncedSha` are 100% synchronized without losing any chain fields."""
    last_sha = state.get("lastSha") or state.get("lastSyncedSha")
    if not last_sha:
        chain = state.get("chain") or []
        if chain:
            last_sha = chain[-1]["to"]
        else:
            last_sha = state.get("baseline")
    state["lastSha"] = last_sha
    state["lastSyncedSha"] = last_sha
    if "schema" not in state:
        state["schema"] = 1
    if "repository" not in state:
        state["repository"] = "rhgrive3/actions"
    if "chain" not in state:
        state["chain"] = []
    return state


def validate_auto_latest_state(state: dict) -> dict:
    state = normalize_auto_latest_state(dict(state))
    if state.get("schema") != 1 or not isinstance(state.get("chain"), list):
        raise ValueError("Invalid INKWAVE_AUTO_LATEST.json schema")
    cursor = state.get("baseline")
    for idx, item in enumerate(state["chain"]):
        if cursor and item.get("from") != cursor:
            raise ValueError(f"Broken chain link at index {idx}: expected from={cursor}, got {item.get('from')}")
        cursor = item.get("to")
    if cursor and state["lastSha"] != cursor:
        raise ValueError(f"Chain tail {cursor} disagrees with lastSha {state['lastSha']}")
    return state


def find_archive_file(folder: Path, filename: str) -> Path:
    """Locate an archive or manifest in root, INKWAVE_AUTO_DELTAS, or INKWAVE_ARCHIVED_DELTAS."""
    for sub in (
        folder,
        folder / "INKWAVE_AUTO_DELTAS",
        folder / "INKWAVE_ARCHIVED_DELTAS",
        folder / "archive_deltas",
    ):
        candidate = sub / filename
        if candidate.is_file():
            return candidate
    return folder / filename


def resolve_update_archives(archives_dir: Path, update_name: str, explicit_parts: Optional[List[str]] = None) -> List[Path]:
    """Resolve either a single *-update.zip or multi-part *-update-part-NNN.zip archives."""
    single = find_archive_file(archives_dir, update_name)
    if single.is_file():
        return [single]
    if explicit_parts:
        resolved = [find_archive_file(archives_dir, p) for p in explicit_parts]
        if all(p.is_file() for p in resolved):
            return resolved
    stem = update_name[:-4] if update_name.endswith(".zip") else update_name
    parts = sorted(archives_dir.glob(f"{stem}-part-*.zip"))
    if not parts:
        parts = sorted(archives_dir.glob(f"{stem}-part*.zip"))
    if parts:
        return parts
    raise FileNotFoundError(
        f"Missing required update archive: expected {update_name} or {stem}-part-001.zip in {archives_dir}"
    )


def walk_tree_files(root: Path):
    """Yield file entries and symlink blobs without following directory links."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in sorted(dirnames) if d not in (".git", "__INKWAVE_SPLIT__", ".aplus-backup")]
        # os.walk classifies links to existing directories as directories even
        # with followlinks=False. Backups must retain the link itself as a blob.
        links = [d for d in dirnames if (Path(dirpath) / d).is_symlink()]
        dirnames[:] = [d for d in dirnames if d not in links]
        for name in sorted(filenames + links):
            yield Path(dirpath) / name


def scan_tree(root: Path, slim_assets: bool = False) -> Tuple[List[dict], Dict[str, dict]]:
    manifest_files = []
    full_map = {}
    for p in walk_tree_files(root):
        rel = p.relative_to(root).as_posix()
        if slim_assets and is_slim_excluded(rel):
            continue
        if p.is_symlink():
            raw = os.readlink(p).encode("utf-8", "surrogateescape")
            h = sha256_bytes(raw)
            g = git_blob_sha(raw)
            entry = {
                "path": rel,
                "kind": "symlink",
                "mode": "120000",
                "bytes": len(raw),
                "sha256": h,
                "git_blob_sha": g,
            }
            full_map[rel] = entry
            manifest_files.append({
                "path": rel,
                "kind": "symlink",
                "mode": "120000",
                "bytes": len(raw),
                "sha256": h,
            })
        else:
            raw = p.read_bytes()
            h = sha256_bytes(raw)
            g = git_blob_sha(raw)
            mode = "100755" if (p.lstat().st_mode & 0o111) else "100644"
            entry = {
                "path": rel,
                "kind": "file",
                "mode": mode,
                "bytes": len(raw),
                "sha256": h,
                "git_blob_sha": g,
            }
            full_map[rel] = entry
            manifest_files.append({
                "path": rel,
                "kind": "file",
                "mode": mode,
                "bytes": len(raw),
                "sha256": h,
            })
    return manifest_files, full_map


def write_zip_member_with_mode(zf: zipfile.ZipFile, arc_name: str, data: bytes, mode_str: str = "100644") -> None:
    zi = zipfile.ZipInfo(arc_name, date_time=(2026, 10, 20, 0, 0, 0))
    zi.compress_type = zipfile.ZIP_DEFLATED
    if mode_str == "120000":
        perm = 0o120777
    elif mode_str == "100755":
        perm = 0o100755
    else:
        perm = 0o100644
    zi.external_attr = (perm & 0xFFFF) << 16
    zf.writestr(zi, data)


def extract_zip_safely(zip_path: Path, dest_dir: Path) -> None:
    dest_dir = dest_dir.resolve()
    with zipfile.ZipFile(zip_path, "r") as z:
        for entry in z.infolist():
            if entry.is_dir():
                continue
            dst = checked_path(dest_dir, entry.filename)
            dst.parent.mkdir(parents=True, exist_ok=True)
            if dst.exists() or dst.is_symlink():
                dst.unlink()
            with z.open(entry) as src, dst.open("wb") as target:
                shutil.copyfileobj(src, target)
            hi = (entry.external_attr >> 16) & 0xFFFF
            if hi and (hi & 0o111):
                os.chmod(dst, 0o755)


def verify_tree_against_manifest(output_dir: Path, manifest: dict, check_unexpected: bool = True) -> None:
    output_dir = output_dir.resolve()
    expected_paths = set()
    bad = []
    for f in manifest.get("files", []):
        rel = f["path"]
        expected_paths.add(rel)
        p = checked_path(output_dir, rel)
        kind = f.get("kind", "file")
        expected_mode = f.get("mode")
        if kind == "symlink" or expected_mode == "120000":
            if not p.is_symlink():
                bad.append(f"{rel}: expected symlink")
                continue
            raw = os.readlink(p).encode("utf-8", "surrogateescape")
            if ("bytes" in f and len(raw) != f["bytes"]) or ("sha256" in f and sha256_bytes(raw) != f["sha256"]):
                bad.append(f"{rel}: symlink target hash mismatch")
        else:
            if p.is_symlink() or not p.is_file():
                bad.append(f"{rel}: missing regular file")
                continue
            if "bytes" in f and p.stat().st_size != f["bytes"]:
                bad.append(f"{rel}: size mismatch ({p.stat().st_size} != {f['bytes']})")
                continue
            if "sha256" in f and sha256_file(p) != f["sha256"]:
                bad.append(f"{rel}: SHA-256 mismatch")
                continue
            if expected_mode in ("100755", "100644"):
                actual_mode = detect_mode_str(p)
                if actual_mode != expected_mode:
                    bad.append(f"{rel}: mode mismatch ({actual_mode} != {expected_mode})")

    if check_unexpected:
        for p in walk_tree_files(output_dir):
            rel = p.relative_to(output_dir).as_posix()
            if rel not in expected_paths:
                bad.append(f"{rel}: unexpected extra file in restored tree")

    if bad:
        raise RuntimeError(f"Tree verification failed ({len(bad)} errors): {bad[:10]}")


def restore_base_snapshot(archives_dir: Path, output_dir: Path, base_manifest: dict) -> None:
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    part_count = base_manifest.get("part_count", 1)
    commit_sha = base_manifest.get("main_commit") or base_manifest.get("commit", "b1f571da")
    short_sha = commit_sha[:8]

    # Resolve part files: support INKWAVE-<sha8>-part-001.zip, INKWAVE-main-<sha8>-*-part1.zip, or b1f571da
    parts = []
    if "parts" in base_manifest and base_manifest["parts"] and isinstance(base_manifest["parts"][0], dict) and "name" in base_manifest["parts"][0]:
        parts = [find_archive_file(archives_dir, p["name"]) for p in base_manifest["parts"]]
    else:
        for idx in range(1, part_count + 1):
            candidates = [
                find_archive_file(archives_dir, f"INKWAVE-{short_sha}-part-{idx:03d}.zip"),
                find_archive_file(archives_dir, f"INKWAVE-b1f571da-part-{idx:03d}.zip"),
            ] + sorted(archives_dir.glob(f"INKWAVE-main-{short_sha}-*-part{idx}.zip"))
            found = next((c for c in candidates if c.is_file()), None)
            if not found:
                raise FileNotFoundError(f"Missing base archive part {idx}/{part_count} for {short_sha} in {archives_dir}")
            parts.append(found)

    for arc in parts:
        extract_zip_safely(arc, output_dir)

    # Reassemble split files from manifest['split'] (`__INKWAVE_SPLIT__/<rel>.part001`)
    for original, pieces in base_manifest.get("split", {}).items():
        dst = checked_path(output_dir, original)
        dst.parent.mkdir(parents=True, exist_ok=True)
        with dst.open("wb") as out:
            for part_rel in pieces:
                part_path = checked_path(output_dir, part_rel)
                with part_path.open("rb") as src:
                    shutil.copyfileobj(src, out)
                part_path.unlink(missing_ok=True)
    shutil.rmtree(output_dir / "__INKWAVE_SPLIT__", ignore_errors=True)

    # Also reassemble any inline `<rel>.part01` / `<rel>.part001` split chunks
    for part1 in sorted(output_dir.rglob("*.part01")) + sorted(output_dir.rglob("*.part001")):
        if not part1.exists():
            continue
        suffix_len = 7 if part1.name.endswith(".part01") else 8
        base_target = part1.with_name(part1.name[:-suffix_len])
        prefix = part1.name[:-(suffix_len - 5)]
        chunks = sorted(part1.parent.glob(prefix + "*"))
        with base_target.open("wb") as out:
            for c in chunks:
                out.write(c.read_bytes())
                c.unlink()

    # Restore symlinks from manifest['symlinks'] or file entries with kind == 'symlink'
    for original, link in base_manifest.get("symlinks", {}).items():
        dst = checked_path(output_dir, original)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists() or dst.is_symlink():
            dst.unlink()
        dst.symlink_to(link)

    for f in base_manifest.get("files", []):
        rel = f["path"]
        dst = checked_path(output_dir, rel)
        kind = f.get("kind", "file")
        mode_str = f.get("mode", "100644")
        if kind == "symlink" or mode_str == "120000":
            if "target" in f and not dst.is_symlink():
                if dst.exists():
                    dst.unlink()
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.symlink_to(f["target"])
        elif dst.is_file() and not dst.is_symlink():
            os.chmod(dst, 0o755 if mode_str == "100755" else 0o644)

    verify_tree_against_manifest(output_dir, base_manifest, check_unexpected=False)


def apply_update_archives(
    output_dir: Path,
    update_archives: List[Path],
    base_manifest: dict,
    curr_manifest: dict,
) -> str:
    output_dir = output_dir.resolve()
    with tempfile.TemporaryDirectory(prefix="inkwave_upd_") as tmp:
        pkg = Path(tmp)
        for arc in update_archives:
            extract_zip_safely(arc, pkg)

        if (pkg / "APPLY_UPDATE.py").is_file() and (pkg / "DELTA_MANIFEST.json").is_file():
            base_man_path = pkg / "_baseline_manifest.json"
            base_man_path.write_text(json.dumps(base_manifest), encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    str(pkg / "APPLY_UPDATE.py"),
                    "--source",
                    str(output_dir),
                    "--baseline-manifest",
                    str(base_man_path),
                    "--package",
                    str(pkg),
                ],
                check=True,
            )
            delta_doc = json.loads((pkg / "DELTA_MANIFEST.json").read_text(encoding="utf-8"))
            for c in delta_doc.get("changes", []):
                new_info = c.get("new")
                if new_info and new_info.get("kind") != "symlink":
                    p = checked_path(output_dir, c["path"])
                    if p.is_file():
                        os.chmod(p, 0o755 if new_info.get("mode") == "100755" else 0o644)
        else:
            # Direct overlay update archive (`files/<rel>` or root `<rel>`)
            src_root = (pkg / "files") if (pkg / "files").is_dir() else pkg
            for f in curr_manifest.get("files", []):
                rel = f["path"]
                cand = src_root / rel
                dst = checked_path(output_dir, rel)
                if cand.exists() or cand.is_symlink():
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    if dst.exists() or dst.is_symlink():
                        dst.unlink()
                    if f.get("kind") == "symlink" or f.get("mode") == "120000":
                        link_target = os.readlink(cand) if cand.is_symlink() else cand.read_bytes().decode("utf-8", "surrogateescape")
                        dst.symlink_to(link_target)
                    else:
                        shutil.copy2(cand, dst)
                        os.chmod(dst, 0o755 if f.get("mode") == "100755" else 0o644)

            expected_set = {f["path"] for f in curr_manifest.get("files", [])}
            for p in walk_tree_files(output_dir):
                rel = p.relative_to(output_dir).as_posix()
                if rel not in expected_set:
                    p.unlink()

    # Ensure modes from curr_manifest are applied
    for f in curr_manifest.get("files", []):
        if f.get("kind") != "symlink" and f.get("mode") in ("100755", "100644"):
            p = checked_path(output_dir, f["path"])
            if p.is_file():
                os.chmod(p, 0o755 if f["mode"] == "100755" else 0o644)

    verify_tree_against_manifest(output_dir, curr_manifest, check_unexpected=True)
    return curr_manifest.get("main_commit") or curr_manifest.get("commit")


def reusable_delta_blob(before: Optional[dict], after: Optional[dict]) -> bool:
    """Permission-only changes can reuse bytes; file/symlink conversions cannot."""
    return (
        before is not None and after is not None
        and before["sha"] == after["sha"]
        and (before["mode"] == "120000") == (after["mode"] == "120000")
    )


def apply_auto_delta_step(root: Path, folder: Path, step_info: dict) -> None:
    manifest_path = find_archive_file(folder, step_info["manifest"])
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Missing auto-delta manifest: {step_info['manifest']}")
    doc = json.loads(manifest_path.read_text("utf-8"))
    if doc.get("schema") != 1 or doc.get("from") != step_info["from"] or doc.get("to") != step_info["to"]:
        raise RuntimeError(f"Manifest header mismatch in {manifest_path.name}")

    with contextlib.ExitStack() as stack:
        zipped = []
        for part in doc.get("parts", []):
            p = find_archive_file(folder, part["name"])
            if not p.is_file() or p.stat().st_size != part["bytes"] or sha256_file(p) != part["sha256"]:
                raise RuntimeError(f"Auto-delta ZIP SHA-256 or size mismatch: {part['name']}")
            zipped.append(stack.enter_context(zipfile.ZipFile(p, "r")))

        materialized = []
        for ch in doc.get("changes", []):
            before = ch.get("before")
            target = checked_path(root, ch["path"])
            if before is None:
                if target.exists() or target.is_symlink():
                    raise RuntimeError(f"New path unexpectedly exists before delta: {ch['path']}")
            else:
                old_bytes = read_blob(target, before["mode"])
                if len(old_bytes) != before["size"] or git_blob_sha(old_bytes) != before["sha"]:
                    raise RuntimeError(f"Local file diverged before applying delta: {ch['path']}")
            after = ch.get("after")
            new_bytes = None
            if after is not None and not reusable_delta_blob(before, after):
                chunks = sorted(ch.get("chunks") or [], key=lambda c: c["offset"])
                buf = []
                for c in chunks:
                    data = zipped[c["part"]].read(c["member"])
                    if len(data) != c["size"] or sha256_bytes(data) != c["sha256"]:
                        raise RuntimeError(f"Corrupt chunk payload for {ch['path']} ({c['member']})")
                    buf.append(data)
                new_bytes = b"".join(buf)
                if (
                    len(new_bytes) != after["size"]
                    or sha256_bytes(new_bytes) != ch["sha256"]
                    or git_blob_sha(new_bytes) != after["sha"]
                ):
                    raise RuntimeError(f"Post-assembly hash mismatch for {ch['path']}")
            materialized.append((ch, new_bytes))

    for ch, new_bytes in materialized:
        target = checked_path(root, ch["path"])
        after = ch.get("after")
        if after is None:
            if target.exists() or target.is_symlink():
                target.unlink()
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if after["mode"] == "120000":
            if new_bytes is not None:
                if target.exists() or target.is_symlink():
                    target.unlink()
                target.symlink_to(new_bytes.decode("utf-8", "surrogateescape"))
        else:
            if new_bytes is not None:
                if target.is_symlink():
                    target.unlink()
                target.write_bytes(new_bytes)
            os.chmod(target, 0o755 if after["mode"] == "100755" else 0o644)


def create_or_resume_auto_delta(
    archives_dir: Path,
    from_tree: Path,
    to_tree: Path,
    from_sha: str,
    to_sha: str,
    max_batch_files: int = 12,
    max_zip_input: int = 6000000,
    simulate_interrupt_after_batches: Optional[int] = None,
) -> Tuple[bool, dict]:
    """
    Create or resume an incremental GAS-compatible `INKWAVE-auto-<from8>-to-<to8>` delta
    using `INKWAVE_AUTO_PENDING.json` and `INKWAVE_AUTO_LATEST.json` (`lastSha` + `chain`).
    Returns `(completed, pending_or_manifest_dict)`.
    """
    archives_dir = archives_dir.resolve()
    delta_dir = archives_dir / "INKWAVE_AUTO_DELTAS"
    delta_dir.mkdir(parents=True, exist_ok=True)

    latest_path = archives_dir / "INKWAVE_AUTO_LATEST.json"
    if latest_path.is_file():
        state = validate_auto_latest_state(json.loads(latest_path.read_text("utf-8")))
    else:
        state = normalize_auto_latest_state({
            "schema": 1,
            "repository": "rhgrive3/actions",
            "baseline": from_sha,
            "lastSha": from_sha,
            "updatedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "chain": [],
        })
        latest_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    if state["lastSha"] != from_sha:
        raise RuntimeError(f"State lastSha ({state['lastSha']}) does not match from_sha ({from_sha})")

    pending_path = archives_dir / "INKWAVE_AUTO_PENDING.json"
    if pending_path.is_file():
        pending = json.loads(pending_path.read_text("utf-8"))
        if pending["from"] != from_sha or pending["to"] != to_sha:
            raise RuntimeError("Existing INKWAVE_AUTO_PENDING.json belongs to a different transition")
    else:
        _, old_map = scan_tree(from_tree)
        _, new_map = scan_tree(to_tree)
        all_paths = sorted(set(old_map.keys()) | set(new_map.keys()))
        changes = []
        for path in all_paths:
            b = old_map.get(path)
            a = new_map.get(path)
            if b and a and b["git_blob_sha"] == a["git_blob_sha"] and b["mode"] == a["mode"]:
                continue
            before_obj = {"sha": b["git_blob_sha"], "mode": b["mode"], "size": b["bytes"], "type": "blob"} if b else None
            after_obj = {"sha": a["git_blob_sha"], "mode": a["mode"], "size": a["bytes"], "type": "blob"} if a else None
            changes.append({"path": path, "before": before_obj, "after": after_obj})
        pending = {
            "schema": 1,
            "from": from_sha,
            "to": to_sha,
            "startedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "changes": changes,
            "cursor": 0,
            "completed": [],
            "parts": [],
        }
        pending_path.write_text(json.dumps(pending, indent=2), encoding="utf-8")

    batches_run = 0
    while pending["cursor"] < len(pending["changes"]):
        if simulate_interrupt_after_batches is not None and batches_run >= simulate_interrupt_after_batches:
            return False, pending

        done = []
        entry_blobs = []  # (member_name, bytes)
        batch_bytes = 0
        while (
            pending["cursor"] + len(done) < len(pending["changes"])
            and len(done) < max_batch_files
        ):
            idx_global = pending["cursor"] + len(done)
            item = pending["changes"][idx_global]
            before = item["before"]
            after = item["after"]
            if not after or reusable_delta_blob(before, after):
                done.append({
                    "path": item["path"],
                    "before": before,
                    "after": after,
                    "bytes": 0,
                    "sha256": None,
                    "chunks": [],
                })
                continue
            p_new = checked_path(to_tree, item["path"])
            content = read_blob(p_new, after["mode"])
            if len(content) != after["size"] or git_blob_sha(content) != after["sha"]:
                raise RuntimeError(f"Source tree blob mismatch on {item['path']}")
            checksum = sha256_bytes(content)
            chunks = []
            offset = 0
            chunk_idx = 0
            while offset < len(content) or chunk_idx == 0:
                end = min(len(content), offset + max_zip_input)
                slice_bytes = content[offset:end]
                member = f"payload/{idx_global:06d}-{chunk_idx:03d}.bin"
                chunks.append({
                    "member": member,
                    "size": len(slice_bytes),
                    "sha256": sha256_bytes(slice_bytes),
                    "offset": offset,
                })
                entry_blobs.append((member, slice_bytes))
                offset = end
                chunk_idx += 1
                if len(content) == 0:
                    break
            done.append({
                "path": item["path"],
                "before": before,
                "after": after,
                "bytes": len(content),
                "sha256": checksum,
                "chunks": chunks,
            })
            batch_bytes += len(content)
            if batch_bytes >= max_zip_input:
                break

        if entry_blobs:
            part_no = len(pending["parts"]) + 1
            part_name = f"INKWAVE-auto-{from_sha[:8]}-to-{to_sha[:8]}-part-{part_no:03d}.zip"
            part_path = delta_dir / part_name
            # If an uncommitted orphan part file exists from an interrupted run, quarantine it
            if part_path.exists():
                quarantine = delta_dir / f"QUARANTINED_ORPHAN_{part_name}"
                shutil.move(str(part_path), str(quarantine))
            with zipfile.ZipFile(part_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                for member_name, bdata in entry_blobs:
                    write_zip_member_with_mode(zf, member_name, bdata, "100644")
            part_bytes = part_path.stat().st_size
            part_sha = sha256_file(part_path)
            members_list = [m for m, _ in entry_blobs]
            pending["parts"].append({
                "name": part_name,
                "subfolder": "INKWAVE_AUTO_DELTAS",
                "bytes": part_bytes,
                "sha256": part_sha,
                "members": members_list,
            })
            for row in done:
                for ch_item in row["chunks"]:
                    if ch_item["member"] in members_list:
                        ch_item["part"] = part_no - 1

        pending["completed"].extend(done)
        pending["cursor"] += len(done)
        pending_path.write_text(json.dumps(pending, indent=2), encoding="utf-8")
        batches_run += 1

    # Finalize manifest and commit to INKWAVE_AUTO_LATEST.json
    manifest_name = f"INKWAVE-auto-{from_sha[:8]}-to-{to_sha[:8]}-manifest.json"
    manifest_doc = {
        "schema": 1,
        "repo": state["repository"],
        "from": from_sha,
        "to": to_sha,
        "createdUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "subfolder": "INKWAVE_AUTO_DELTAS",
        "changes": pending["completed"],
        "parts": [
            {
                "name": x["name"],
                "bytes": x["bytes"],
                "sha256": x["sha256"],
                "members": x["members"],
            }
            for x in pending["parts"]
        ],
    }
    manifest_path = delta_dir / manifest_name
    manifest_path.write_text(json.dumps(manifest_doc, indent=2), encoding="utf-8")

    state["chain"].append({
        "from": from_sha,
        "to": to_sha,
        "manifest": manifest_name,
        "subfolder": "INKWAVE_AUTO_DELTAS",
        "partCount": len(pending["parts"]),
        "changedFiles": len(pending["completed"]),
    })
    state["lastSha"] = to_sha
    state["lastSyncedSha"] = to_sha
    state["updatedUtc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    latest_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    pending_path.unlink(missing_ok=True)
    return True, manifest_doc


def find_latest_guide_zip(archives_dir: Path, explicit_guide: Optional[Path] = None, target_commit: Optional[str] = None) -> Path:
    if explicit_guide:
        return explicit_guide.resolve()
    if target_commit:
        short = target_commit[:8]
        for pattern in (f"INKWAVE-{short}-guide.zip", f"INKWAVE-main-{short}-*-guide.zip"):
            matches = sorted(archives_dir.glob(pattern))
            if matches:
                return matches[-1]
    guides = sorted(
        list(archives_dir.glob("INKWAVE-main-*-guide.zip")) + list(archives_dir.glob("INKWAVE-*-guide.zip")),
        key=lambda p: (p.stat().st_mtime, p.name),
    )
    if guides:
        return guides[-1]
    raise FileNotFoundError(f"Could not find any *-guide.zip in {archives_dir}")


def restore(
    archives_dir: Path,
    output_dir: Path,
    target_commit: Optional[str] = None,
    guide_zip: Optional[Path] = None,
    apply_auto: bool = True,
) -> dict:
    archives_dir = archives_dir.resolve()
    output_dir = output_dir.resolve()
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Check if there is a standalone pack-full guide matching target_commit
    chosen_guide = find_latest_guide_zip(archives_dir, guide_zip, target_commit)
    with zipfile.ZipFile(chosen_guide, "r") as zf:
        names = set(zf.namelist())
        base_manifest = json.loads(zf.read("SOURCE_MANIFEST.json").decode("utf-8"))
        curr_manifest = json.loads(zf.read("SOURCE_MANIFEST_CURRENT.json").decode("utf-8")) if "SOURCE_MANIFEST_CURRENT.json" in names else None

    # Case 1: Standalone full pack (`SOURCE_MANIFEST.json` only, or `curr_manifest` has no `incremental_update_zip`)
    if curr_manifest is None or not curr_manifest.get("incremental_update_zip"):
        restore_base_snapshot(archives_dir, output_dir, base_manifest)
        verify_tree_against_manifest(output_dir, base_manifest, check_unexpected=True)
        return base_manifest

    # Case 2: Base (`b1f571da`) + Consolidated Update (`-update.zip` or `-update-part-*.zip`) + Optional `INKWAVE-auto-*` chain
    # If target_commit matches an older consolidated guide on disk, select that guide
    if target_commit and not curr_manifest["main_commit"].startswith(target_commit[:8]):
        for cand in sorted(archives_dir.glob("INKWAVE-main-*-guide.zip")):
            with zipfile.ZipFile(cand, "r") as zf:
                if "SOURCE_MANIFEST_CURRENT.json" in zf.namelist():
                    cm = json.loads(zf.read("SOURCE_MANIFEST_CURRENT.json").decode("utf-8"))
                    if cm["main_commit"].startswith(target_commit[:8]):
                        chosen_guide = cand
                        base_manifest = json.loads(zf.read("SOURCE_MANIFEST.json").decode("utf-8"))
                        curr_manifest = cm
                        break

    update_archives = resolve_update_archives(
        archives_dir,
        curr_manifest["incremental_update_zip"],
        curr_manifest.get("incremental_update_parts"),
    )
    restore_base_snapshot(archives_dir, output_dir, base_manifest)
    current_sha = apply_update_archives(output_dir, update_archives, base_manifest, curr_manifest)

    if target_commit and current_sha.startswith(target_commit[:8]):
        return curr_manifest

    latest_file = archives_dir / "INKWAVE_AUTO_LATEST.json"
    if apply_auto and latest_file.is_file():
        state = validate_auto_latest_state(json.loads(latest_file.read_text("utf-8")))
        chain = state.get("chain", [])
        start_idx = None
        if state.get("baseline") == current_sha:
            start_idx = 0
        else:
            for idx, step in enumerate(chain):
                if step["to"] == current_sha:
                    start_idx = idx + 1
                    break
                if step["from"] == current_sha:
                    start_idx = idx
                    break
        if start_idx is not None and start_idx < len(chain):
            for step in chain[start_idx:]:
                apply_auto_delta_step(output_dir, archives_dir, step)
                current_sha = step["to"]
                if target_commit and current_sha.startswith(target_commit[:8]):
                    break

    if target_commit and not current_sha.startswith(target_commit[:8]):
        raise RuntimeError(f"Could not reach target_commit {target_commit}; stopped at {current_sha}")

    _, final_map = scan_tree(output_dir)
    return {
        "repo": "rhgrive3/actions",
        "main_commit": current_sha,
        "tracked_count": len(final_map),
        "files": list(final_map.values()),
    }


def pack_full(
    source_dir: Path,
    out_dir: Path,
    commit_sha: str,
    date_str: str = "20261020",
    max_part_mb: float = 7.0,
    split_threshold_bytes: int = 6 * 1024 * 1024,
    slim_assets: bool = False,
) -> dict:
    source_dir = source_dir.resolve()
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    short_sha = commit_sha[:8]
    max_part_bytes = int(max_part_mb * 1024 * 1024)

    manifest_files, _ = scan_tree(source_dir, slim_assets=slim_assets)
    symlinks = {}
    splits = {}
    stage_items = []  # (arc_name, bytes, mode_str)

    for f in manifest_files:
        rel = f["path"]
        p = source_dir / rel
        if f["kind"] == "symlink":
            symlinks[rel] = os.readlink(p)
            continue
        data = p.read_bytes()
        mode_str = f.get("mode", "100644")
        if len(data) > split_threshold_bytes:
            pieces = []
            for idx, offset in enumerate(range(0, len(data), split_threshold_bytes), 1):
                piece_rel = f"__INKWAVE_SPLIT__/{rel}.part{idx:03d}"
                pieces.append(piece_rel)
                stage_items.append((piece_rel, data[offset : offset + split_threshold_bytes], "100644"))
            splits[rel] = pieces
        else:
            stage_items.append((rel, data, mode_str))

    part_idx = 1
    current_batch = []
    current_bytes = 0
    parts_meta = []

    def flush_batch(batch, idx):
        part_name = f"INKWAVE-{short_sha}-part-{idx:03d}.zip"
        part_path = out_dir / part_name
        with zipfile.ZipFile(part_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for arc_name, payload, m_str in batch:
                write_zip_member_with_mode(z, arc_name, payload, m_str)
        parts_meta.append({
            "number": idx,
            "name": part_name,
            "bytes": part_path.stat().st_size,
            "sha256": sha256_file(part_path),
            "items": len(batch),
        })

    for arc_name, payload, m_str in stage_items:
        if current_batch and (current_bytes + len(payload) > max_part_bytes):
            flush_batch(current_batch, part_idx)
            part_idx += 1
            current_batch = []
            current_bytes = 0
        current_batch.append((arc_name, payload, m_str))
        current_bytes += len(payload)

    if current_batch or not parts_meta:
        flush_batch(current_batch, part_idx)
    else:
        part_idx -= 1

    full_manifest = {
        "repo": "rhgrive3/actions",
        "main_commit": commit_sha,
        "commit": commit_sha,
        "base_commit": commit_sha,
        "captured_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "tracked_count": len(manifest_files),
        "part_count": len(parts_meta),
        "all_main_tracked_files_included": not slim_assets,
        "slim_assets": bool(slim_assets),
        "unmerged_pr_branches_included": False,
        "parts": parts_meta,
        "split": splits,
        "symlinks": symlinks,
        "files": manifest_files,
    }
    guide_path = out_dir / f"INKWAVE-{short_sha}-guide.zip"
    with zipfile.ZipFile(guide_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        write_zip_member_with_mode(
            z,
            "SOURCE_MANIFEST.json",
            json.dumps(full_manifest, indent=2, ensure_ascii=False).encode("utf-8"),
            "100644",
        )
    return full_manifest


def consolidate(
    archives_dir: Path,
    target_commit: Optional[str] = None,
    date_str: Optional[str] = None,
    out_dir: Optional[Path] = None,
    guide_zip: Optional[Path] = None,
    max_part_mb: float = 8.0,
    slim_assets: bool = False,
) -> dict:
    archives_dir = archives_dir.resolve()
    out_dir = (out_dir or archives_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    max_part_bytes = int(max_part_mb * 1024 * 1024)

    latest_path = archives_dir / "INKWAVE_AUTO_LATEST.json"
    latest_state = validate_auto_latest_state(json.loads(latest_path.read_text("utf-8"))) if latest_path.is_file() else None
    if not target_commit:
        if latest_state:
            target_commit = latest_state["lastSha"]
        else:
            raise ValueError("target_commit is required when INKWAVE_AUTO_LATEST.json is absent")

    with tempfile.TemporaryDirectory(prefix="inkwave_consolidate_") as tmp:
        work_tree = Path(tmp) / "tree"
        restored_info = restore(archives_dir, work_tree, target_commit=target_commit, guide_zip=guide_zip, apply_auto=True)
        full_commit = restored_info.get("main_commit", target_commit)
        short_sha = full_commit[:8]
        date_str = date_str or datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
        guide_name = f"INKWAVE-main-{short_sha}-{date_str}-guide.zip"
        update_name = f"INKWAVE-main-{short_sha}-{date_str}-update.zip"

        orig_guide = find_latest_guide_zip(archives_dir, guide_zip)
        with zipfile.ZipFile(orig_guide, "r") as z:
            names = set(z.namelist())
            base_manifest_raw = z.read("SOURCE_MANIFEST.json").decode("utf-8")
            base_manifest = json.loads(base_manifest_raw)
            restore_py = z.read("RESTORE.py").decode("utf-8") if "RESTORE.py" in names else "#!/usr/bin/env python3\n"
            restore_curr_py = z.read("RESTORE_CURRENT.py").decode("utf-8") if "RESTORE_CURRENT.py" in names else "#!/usr/bin/env python3\n"
            apply_update_py = None
            if "SOURCE_MANIFEST_CURRENT.json" in names:
                orig_cm = json.loads(z.read("SOURCE_MANIFEST_CURRENT.json").decode("utf-8"))
                orig_upd = resolve_update_archives(
                    archives_dir,
                    orig_cm["incremental_update_zip"],
                    orig_cm.get("incremental_update_parts"),
                )
                with zipfile.ZipFile(orig_upd[0], "r") as uz:
                    if "APPLY_UPDATE.py" in uz.namelist():
                        apply_update_py = uz.read("APPLY_UPDATE.py").decode("utf-8")

        manifest_files, full_map = scan_tree(work_tree, slim_assets=slim_assets)
        base_files = {
            f["path"]: f
            for f in base_manifest["files"]
            if not (slim_assets and is_slim_excluded(f["path"]))
        }
        all_paths = sorted(set(base_files.keys()) | set(full_map.keys()))
        changes = []
        for path in all_paths:
            b = base_files.get(path)
            c = full_map.get(path)
            b_mode = b.get("mode", "120000" if b and b.get("kind") == "symlink" else "100644") if b else None
            if b and c and b["kind"] == c["kind"] and b["bytes"] == c["bytes"] and b["sha256"] == c["sha256"] and b_mode == c["mode"]:
                continue
            old_obj = {"kind": b["kind"], "mode": b_mode, "bytes": b["bytes"], "sha256": b["sha256"]} if b else None
            new_obj = (
                {
                    "kind": c["kind"],
                    "mode": c["mode"],
                    "bytes": c["bytes"],
                    "sha256": c["sha256"],
                    "git_blob_sha": c["git_blob_sha"],
                }
                if c
                else None
            )
            status = "added" if not b else ("deleted" if not c else "modified")
            changes.append({"path": path, "status": status, "action": status, "old": old_obj, "new": new_obj})

        captured_utc = latest_state["updatedUtc"] if latest_state else datetime.datetime.now(datetime.timezone.utc).isoformat()
        delta_manifest = {
            "repo": "rhgrive3/actions",
            "base_commit": base_manifest["main_commit"],
            "target_commit": full_commit,
            "changed_count": len(changes),
            "old_tracked_count": len(base_files),
            "new_tracked_count": len(manifest_files),
            "new_bytes_sum": sum(c["new"]["bytes"] for c in changes if c["new"]),
            "captured_utc": captured_utc,
            "slim_assets": bool(slim_assets),
            "changes": changes,
            "unmerged_pr_branches_included": False,
        }

        entries = []
        if apply_update_py:
            entries.append(("APPLY_UPDATE.py", apply_update_py.encode("utf-8"), "100755"))
        entries.append(("DELTA_MANIFEST.json", json.dumps(delta_manifest, indent=2, ensure_ascii=False).encode("utf-8"), "100644"))
        for c in changes:
            if c["new"]:
                rel = c["path"]
                p = work_tree / rel
                data = os.readlink(p).encode("utf-8", "surrogateescape") if c["new"]["kind"] == "symlink" else p.read_bytes()
                entries.append((f"files/{rel}", data, c["new"]["mode"]))

        total_payload = sum(len(d) for _, d, _ in entries)
        update_parts_names = []
        if total_payload <= max_part_bytes:
            update_path = out_dir / update_name
            with zipfile.ZipFile(update_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                for arc_name, payload, m_str in entries:
                    write_zip_member_with_mode(z, arc_name, payload, m_str)
            update_parts_names.append(update_name)
        else:
            stem = update_name[:-4]
            part_idx = 1
            batch = []
            batch_bytes = 0
            for arc_name, payload, m_str in entries:
                if batch and (batch_bytes + len(payload) > max_part_bytes):
                    p_name = f"{stem}-part-{part_idx:03d}.zip"
                    p_path = out_dir / p_name
                    with zipfile.ZipFile(p_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                        for n, b, ms in batch:
                            write_zip_member_with_mode(z, n, b, ms)
                    update_parts_names.append(p_name)
                    part_idx += 1
                    batch = []
                    batch_bytes = 0
                batch.append((arc_name, payload, m_str))
                batch_bytes += len(payload)
            if batch:
                p_name = f"{stem}-part-{part_idx:03d}.zip"
                p_path = out_dir / p_name
                with zipfile.ZipFile(p_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                    for n, b, ms in batch:
                        write_zip_member_with_mode(z, n, b, ms)
                update_parts_names.append(p_name)

        curr_manifest = {
            "repo": "rhgrive3/actions",
            "main_commit": full_commit,
            "baseline_commit": base_manifest["main_commit"],
            "tracked_count": len(manifest_files),
            "incremental_update_zip": update_name,
            "incremental_update_parts": update_parts_names,
            "baseline_part_pattern": "INKWAVE-b1f571da-part-*.zip",
            "part_count": base_manifest["part_count"],
            "main_exact_from_verified_baseline_plus_delta": not slim_assets,
            "slim_assets": bool(slim_assets),
            "unmerged_pr_branches_included": False,
            "files": manifest_files,
        }

        guide_path = out_dir / guide_name
        with zipfile.ZipFile(guide_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            write_zip_member_with_mode(z, "RESTORE.py", restore_py.encode("utf-8"), "100755")
            write_zip_member_with_mode(z, "RESTORE_CURRENT.py", restore_curr_py.encode("utf-8"), "100755")
            write_zip_member_with_mode(z, "backup_and_restore.py", Path(__file__).read_bytes(), "100755")
            write_zip_member_with_mode(z, "SOURCE_MANIFEST.json", base_manifest_raw.encode("utf-8"), "100644")
            write_zip_member_with_mode(
                z,
                "SOURCE_MANIFEST_CURRENT.json",
                json.dumps(curr_manifest, indent=2, ensure_ascii=False).encode("utf-8"),
                "100644",
            )

        if latest_state is not None:
            latest_state["consolidatedSha"] = full_commit
            latest_state["consolidatedGuide"] = guide_name
            latest_state = normalize_auto_latest_state(latest_state)
            (out_dir / "INKWAVE_AUTO_LATEST.json").write_text(json.dumps(latest_state, indent=2), encoding="utf-8")

        return curr_manifest


def prune_deltas(archives_dir: Path, consolidated_sha: Optional[str] = None) -> dict:
    """
    Safely organize and archive `INKWAVE-auto-*` delta files without breaking the restore chain:
      - Protects any in-flight files referenced by `INKWAVE_AUTO_PENDING.json` or `*.pending`.
      - Determines the latest verified consolidated commit (`consolidated_sha`) from
        `INKWAVE_AUTO_LATEST.json` (`consolidatedSha`) or the newest `INKWAVE-main-*-guide.zip`.
      - Moves `INKWAVE-auto-*` steps up to `consolidated_sha` into `INKWAVE_ARCHIVED_DELTAS/`.
      - Organizes active post-consolidation `INKWAVE-auto-*` steps into `INKWAVE_AUTO_DELTAS/`.
      - Updates `subfolder` metadata in `INKWAVE_AUTO_LATEST.json` while keeping `lastSha`,
        `lastSyncedSha`, and `chain` 100% intact.
    """
    archives_dir = archives_dir.resolve()
    archived_dir = archives_dir / "INKWAVE_ARCHIVED_DELTAS"
    active_dir = archives_dir / "INKWAVE_AUTO_DELTAS"
    archived_dir.mkdir(parents=True, exist_ok=True)
    active_dir.mkdir(parents=True, exist_ok=True)

    # Identify protected pending prefixes
    protected_prefixes = set()
    pending_file = archives_dir / "INKWAVE_AUTO_PENDING.json"
    if pending_file.is_file():
        p_doc = json.loads(pending_file.read_text("utf-8"))
        if p_doc.get("from") and p_doc.get("to"):
            protected_prefixes.add(f"INKWAVE-auto-{p_doc['from'][:8]}-to-{p_doc['to'][:8]}")
    for pf in archives_dir.glob("*.pending"):
        protected_prefixes.add(pf.stem)

    latest_path = archives_dir / "INKWAVE_AUTO_LATEST.json"
    state = validate_auto_latest_state(json.loads(latest_path.read_text("utf-8"))) if latest_path.is_file() else None

    if not consolidated_sha:
        if state and state.get("consolidatedSha"):
            consolidated_sha = state["consolidatedSha"]
        else:
            guides = sorted(
                archives_dir.glob("INKWAVE-main-*-guide.zip"),
                key=lambda p: (p.stat().st_mtime, p.name),
            )
            if guides:
                with zipfile.ZipFile(guides[-1], "r") as zf:
                    if "SOURCE_MANIFEST_CURRENT.json" in zf.namelist():
                        cm = json.loads(zf.read("SOURCE_MANIFEST_CURRENT.json").decode("utf-8"))
                        consolidated_sha = cm.get("main_commit")

    superseded_prefixes = set()
    active_prefixes = set()
    if state and state.get("chain"):
        chain = state["chain"]
        cutoff_idx = -1
        if consolidated_sha:
            for idx, step in enumerate(chain):
                if step["to"].startswith(consolidated_sha[:8]):
                    cutoff_idx = idx
                    break
        for idx, step in enumerate(chain):
            prefix = f"INKWAVE-auto-{step['from'][:8]}-to-{step['to'][:8]}"
            if idx <= cutoff_idx:
                superseded_prefixes.add(prefix)
                step["subfolder"] = "INKWAVE_ARCHIVED_DELTAS"
            else:
                active_prefixes.add(prefix)
                step["subfolder"] = "INKWAVE_AUTO_DELTAS"

    archived_count = 0
    organized_active_count = 0
    protected_count = 0

    for search_dir in (archives_dir, active_dir):
        for fpath in sorted(search_dir.glob("INKWAVE-auto-*")):
            if not fpath.is_file():
                continue
            fname = fpath.name
            if any(fname.startswith(pref) or pref in fname for pref in protected_prefixes):
                protected_count += 1
                continue
            if any(fname.startswith(pref) for pref in superseded_prefixes):
                dst = archived_dir / fname
                if fpath.resolve() != dst.resolve():
                    shutil.move(str(fpath), str(dst))
                    archived_count += 1
            elif any(fname.startswith(pref) for pref in active_prefixes):
                dst = active_dir / fname
                if fpath.resolve() != dst.resolve():
                    shutil.move(str(fpath), str(dst))
                    organized_active_count += 1

    if state is not None:
        state = normalize_auto_latest_state(state)
        latest_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    return {
        "consolidated_sha": consolidated_sha,
        "archived": archived_count,
        "organized_active": organized_active_count,
        "protected_pending": protected_count,
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_res = sub.add_parser("restore", help="Restore INKWAVE source tree from archives and verify SHA-256")
    p_res.add_argument("--archives", type=Path, default=Path("."), help="Folder containing base ZIPs and guide/update ZIPs")
    p_res.add_argument("--output", type=Path, default=Path("inkwave-main"), help="Target directory for restored tree")
    p_res.add_argument("--target-commit", type=str, default=None, help="Optional target commit SHA prefix")
    p_res.add_argument("--guide", type=Path, default=None, help="Specific guide ZIP to use")
    p_res.add_argument("--apply-auto", action="store_true", default=True, help="Apply newer INKWAVE-auto-* deltas")
    p_res.add_argument("--no-apply-auto", action="store_false", dest="apply_auto", help="Skip INKWAVE-auto-* deltas")

    p_con = sub.add_parser("consolidate", help="Consolidate INKWAVE-auto-* delta chain into guide + update ZIPs")
    p_con.add_argument("--archives", type=Path, default=Path("."), help="Folder containing base ZIPs and auto deltas")
    p_con.add_argument("--output-dir", type=Path, default=None, help="Directory to write consolidated archives")
    p_con.add_argument("--target-commit", type=str, default=None, help="Target commit SHA to consolidate up to")
    p_con.add_argument("--guide", type=Path, default=None, help="Baseline guide ZIP")
    p_con.add_argument("--date", type=str, default=None, help="Date stamp YYYYMMDD")
    p_con.add_argument("--max-part-mb", type=float, default=8.0, help="Max uncompressed MB per update ZIP part")
    p_con.add_argument("--slim-assets", action="store_true", default=False, help="Exclude heavy .blend/report intermediates")

    p_full = sub.add_parser("pack-full", help="Create a standalone multi-part full backup from a source tree")
    p_full.add_argument("--source", type=Path, required=True, help="Restored source directory to package")
    p_full.add_argument("--output-dir", type=Path, required=True, help="Output directory for part ZIPs and guide ZIP")
    p_full.add_argument("--commit", type=str, required=True, help="Full 40-char Git commit SHA of the source tree")
    p_full.add_argument("--date", type=str, default="20261020", help="Date stamp YYYYMMDD")
    p_full.add_argument("--max-part-mb", type=float, default=7.0, help="Approximate max uncompressed MB per ZIP part")
    p_full.add_argument("--slim-assets", action="store_true", default=False, help="Exclude heavy .blend/report intermediates")

    p_prune = sub.add_parser("prune-deltas", help="Safely archive superseded INKWAVE-auto-* deltas and organize active ones")
    p_prune.add_argument("--archives", type=Path, default=Path("."), help="Drive sync folder")
    p_prune.add_argument("--consolidated-sha", type=str, default=None, help="Override consolidated commit SHA")

    args = parser.parse_args(argv)
    if args.cmd == "restore":
        restore(args.archives, args.output, target_commit=args.target_commit, guide_zip=args.guide, apply_auto=args.apply_auto)
    elif args.cmd == "consolidate":
        consolidate(
            args.archives,
            target_commit=args.target_commit,
            date_str=args.date,
            out_dir=args.output_dir,
            guide_zip=args.guide,
            max_part_mb=args.max_part_mb,
            slim_assets=args.slim_assets,
        )
    elif args.cmd == "pack-full":
        pack_full(
            args.source,
            args.output_dir,
            commit_sha=args.commit,
            date_str=args.date,
            max_part_mb=args.max_part_mb,
            slim_assets=args.slim_assets,
        )
    elif args.cmd == "prune-deltas":
        res = prune_deltas(args.archives, consolidated_sha=args.consolidated_sha)
        print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
