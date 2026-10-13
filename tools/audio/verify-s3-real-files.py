#!/usr/bin/env python3
"""Verify installed *real* Splatoon 3 MP3 samples against the source-ID manifest.
No synthesized fallback is counted as verified. Does not download files.
"""
import argparse
import hashlib
import json
import subprocess
from collections import Counter
from pathlib import Path


def audit(root: Path, manifest_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    clips = manifest["clips"]
    sources: dict[str, dict] = {}
    for clip in clips:
        name = clip["sourceName"]
        if name != Path(clip["file"]).name or not name.endswith(".mp3"):
            raise ValueError("Invalid source mapping: " + repr(name))
        previous = sources.get(name)
        if previous and previous["driveId"] != clip["sourceFileId"]:
            raise ValueError("Source ID collision: " + name)
        sources[name] = {"name": name, "driveId": clip["sourceFileId"]}
    result = []
    for name, source in sorted(sources.items()):
        path = root / name
        rec = {**source, "status": "missing"}
        if path.is_file():
            data = path.read_bytes()
            rec["bytes"] = len(data)
            rec["sha256"] = hashlib.sha256(data).hexdigest()
            try:
                check = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=format_name,duration", "-of", "json", str(path)],
                    check=True, capture_output=True, text=True, timeout=20,
                )
                info = json.loads(check.stdout)["format"]
                if "mp3" not in info["format_name"] or float(info["duration"]) <= 0:
                    raise ValueError("Unexpected audio format or duration")
                rec["duration_seconds"] = float(info["duration"])
                rec["status"] = "verified"
            except (OSError, subprocess.CalledProcessError, ValueError, KeyError) as exc:
                rec["status"] = "invalid"
                rec["error"] = str(exc)
        result.append(rec)
    # A decodable MP3 is insufficient: every supplied cryptographic binding
    # must match the exact bytes before we label an event verified.
    hashes = {e['name']: e.get('sha256') for e in result if e['status'] == 'verified'}
    for clip in clips:
        expected = clip.get('sha256')
        if expected and hashes.get(clip['sourceName']) != expected.lower():
            entry = next((e for e in result if e['name'] == clip['sourceName']), None)
            if entry:
                entry['status'] = 'invalid'
                entry['error'] = 'Manifest SHA256 mismatch (or missing file)'
    verified = {e["name"] for e in result if e["status"] == "verified"}
    events = Counter(clip["id"] for clip in clips if clip["sourceName"] in verified)
    return {
        "reference": manifest.get("source"),
        "sourceVersion": manifest.get("targetVersion"),
        "requiredSourceClips": len(sources),
        "verifiedSourceClips": len(verified),
        "missingSourceClips": len(sources) - len(verified),
        "playableManifestEvents": sum(clip["sourceName"] in verified for clip in clips),
        "coveredEventKinds": len(events),
        "verifiedSources": [e for e in result if e["status"] == "verified"],
        "invalidSources": [e for e in result if e["status"] == "invalid"],
        "unavailableSourceNames": [e["name"] for e in result if e["status"] == "missing"],
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--root", type=Path, default=Path("patches/splatoon3/runtime/audio/s3-real"))
    p.add_argument("--manifest", type=Path, default=Path("patches/splatoon3/runtime/audio/real-s3-samples.json"))
    p.add_argument("--output", type=Path, default=Path("reports/s3-real-audio-verification.json"))
    args = p.parse_args()
    report = audit(args.root, args.manifest)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if isinstance(v, int)}, ensure_ascii=False))
    print("Report: " + str(args.output))
    if report["invalidSources"]:
        raise SystemExit(1)
