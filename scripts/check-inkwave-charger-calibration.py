#!/usr/bin/env python3
"""Audit numeric calibration from an independently downloaded public model ZIP.

Usage: python scripts/check-inkwave-charger-calibration.py /path/to/342258.zip
Download: https://models.spriters-resource.com/nintendo_switch/splatoon3/asset/342258/
No model or texture is copied into the repository. This verifies extraction,
not Nintendo's runtime keep-charge frame binding or a console measurement.
"""
import hashlib
import json
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = {'c': 'http://www.collada.org/2005/11/COLLADASchema'}
FILES = {
    'Wmn_Charger_NormalT.dae': '7914851c0cd0c1cf30970774b22362ae7e01969ed084c95d94ad87605c951626',
    'Wmn_Charger_NormalT (Previous Ver.).dae': '9d1167de7d734f79cad6bd234eca937bc8b2f6404553d178b292517094730e3a',
}
measurements = []
with zipfile.ZipFile(sys.argv[1]) as archive:
    for name, digest in FILES.items():
        raw = archive.read('Splat Charger/' + name)
        assert hashlib.sha256(raw).hexdigest() == digest, 'Unknown model revision'
        root = ET.fromstring(raw)
        joint = root.find('.//c:visual_scene/c:node[@name="Root"]', NS)
        assert joint is not None and joint.attrib['type'] == 'JOINT'
        assert joint.find('c:translate', NS) is None
        assert joint.find('c:matrix', NS) is None
        assert joint.find('c:scale', NS) is None
        rotation = list(map(float, joint.find('c:rotate', NS).text.split()))
        assert rotation == [-1, 0, 0, -90], 'Exporter scene conversion changed'
        muzzle = joint.find('c:node[@name="Muzzle"]', NS)
        assert muzzle is not None and muzzle.attrib['type'] == 'JOINT'
        assert muzzle.find('c:matrix', NS) is None and muzzle.find('c:scale', NS) is None
        xyz = list(map(float, muzzle.find('c:translate', NS).text.split()))
        assert xyz == [0, .1781852, 1.717447], 'Joint-local anchor changed'
        measurements.append({'file': name, 'sha256': digest, 'rootLocalMuzzle': xyz})
scale = .686 / measurements[0]['rootLocalMuzzle'][2]
print(json.dumps({'modelMeasurements': measurements, 'targetMuzzle': [0, .058, .686],
    'scale': scale, 'storedTarget': [-.314 * scale, .058 + (.2105 - .1781852) * scale, 2.0176 * scale],
    'status': 'measured model retarget; Nintendo keep-frame binding unverified'}, indent=2))
