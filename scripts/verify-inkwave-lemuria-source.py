#!/usr/bin/env python3
"""Audit Lemuria's pinned public source without downloading asset bytes.

The optional online history audit uses Python's inherited proxy and TLS trust.
It records complete Git trees, not geometry or textures. Any discovered AutoWalk
path fails this unavailable-source check and requires a reviewed source import.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
COMMIT = "0611f51b35c9736ee986fb2218461e2585b7875e"
API = "https://api.github.com/repos/kirakira-dev/KiTrix/"


def request(path):
    req = urllib.request.Request(API + path, headers={
        "User-Agent": "inkwave-lemuria-source-audit",
        "Accept": "application/vnd.github+json",
    })
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def audit(args):
    definition = json.loads((ROOT / "patches/native-stages/definitions/lemuria.json").read_text())
    assert definition["internal"] == "Vss_AutoWalk00"
    assert definition["availability"] == "source-unavailable"
    assert definition["source"]["commit"] == COMMIT
    assert definition["version1130Verified"] is False
    for field in ("sourceSha256", "tree", "bounds", "spawnPads", "spawnBarrier"):
        assert field not in definition, "Unavailable stage contains invented source/placement data: " + field
    source = pathlib.Path(args.source).resolve()
    paths = subprocess.check_output([
        "git", "-C", str(source), "ls-tree", "-r", "--name-only", COMMIT,
    ], text=True).splitlines()
    matches = [path for path in paths if "autowalk" in path.lower()]
    assert not matches, "AutoWalk source now exists and needs review: " + repr(matches)
    report = {"schema": 1, "id": "lemuria", "internal": definition["internal"],
              "availability": definition["availability"], "sourceCommit": COMMIT,
              "pinnedTreeFileCount": len(paths), "pinnedAutoWalkPathCount": len(matches),
              "version1130Verified": False, "geometryVerified": False,
              "rulesPlacementVerified": False, "metadata": []}
    for filename, expected_hash, expected_fields in [
        (args.scene, "37b9cce349998238b86c353c151f618827220a718a0613a44ef2c64295c87d3e", {"Label": definition["name"]}),
        (args.versus, "205532c39ebe91f5c704b5a3e674652ed644361b656f7d42e8580c89290a8c62", {"Id": 24, "DisplayOrder": 24, "IsDisplayInStageList": True}),
    ]:
        payload = pathlib.Path(filename).read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        assert digest == expected_hash, "11.3.0 metadata identity changed"
        rows = [row for row in json.loads(payload) if row.get("__RowId") == definition["internal"]]
        assert len(rows) == 1
        for key, value in expected_fields.items():
            assert rows[0][key] == value
        report["metadata"].append({"file": pathlib.Path(filename).name, "sha256": digest, "matchingRowCount": len(rows)})
    if args.online:
        commits = request("commits?per_page=100")
        assert len(commits) < 100, "History pagination required"
        assert commits[0]["sha"] == COMMIT, "Public HEAD changed; review new source before claiming unavailable"
        branches = request("branches?per_page=100")
        assert len(branches) < 100, "Branch pagination required"
        assert len(branches) == 1 and branches[0]["name"] == "main" and branches[0]["commit"]["sha"] == COMMIT, "New branch history requires an additional source review"
        history = []
        trees = {commit["sha"] for commit in commits} | {branch["commit"]["sha"] for branch in branches}
        for sha in sorted(trees):
            tree = request("git/trees/" + sha + "?recursive=1")
            assert tree.get("truncated") is False, "Incomplete Git tree cannot prove absence"
            found = [entry["path"] for entry in tree["tree"] if "autowalk" in entry["path"].lower()]
            assert not found, "AutoWalk source found in public history"
            history.append({"commit": sha, "entryCount": len(tree["tree"]), "truncated": False, "autoWalkPathCount": 0})
        forks, releases = request("forks?per_page=100"), request("releases?per_page=100")
        assert not forks and not releases, "New forks/releases require an additional source review"
        report["publicHistory"] = {"api": API, "commitCount": len(commits), "branches": [branch["name"] for branch in branches],
                                   "forkCount": len(forks), "releaseCount": len(releases), "completeTrees": history}
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--scene", required=True)
    parser.add_argument("--versus", required=True)
    parser.add_argument("--online", action="store_true")
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    result = audit(args)
    target = pathlib.Path(args.report)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"id": result["id"], "availability": result["availability"], "autoWalkPathCount": 0,
                      "publicCommitCount": result.get("publicHistory", {}).get("commitCount")}))
