#!/usr/bin/env python3
"""Install TWO SHA-pinned third-party combat confirmation sound references.
These are comparison candidates requested by the project owner. Do not label
them Nintendo-original nor replace game source clips without provenance.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

DEST = Path('inkwave-public/assets/audio/combat')
DEST.mkdir(parents=True, exist_ok=True)
REFERENCES = (
    ('direct-hit-upload.mp3',
     'https://us-tuna-sounds-files.voicemod.net/7b1057ff-4a65-4125-9c9e-dc09df1ca87c-1680531461173.mp3',
     '3001fbea582cc2c5b5b00f752d852eb36a637eaab185fd11b6107c3657a6e3d2',
     11136, 'https://tuna.voicemod.net/sound/7b1057ff-4a65-4125-9c9e-dc09df1ca87c'),
    ('charger-hit-upload.mp3',
     'https://us-tuna-sounds-files.voicemod.net/7efadaf2-a44f-4e3b-9588-653c21aa7440-1788640022745.mp3',
     'fd75c4c64a9153e4f3801299af9c1aae970c0c1818b5d4763a3a2b858e3b0487',
     17599, 'https://tuna.voicemod.net/sound/7efadaf2-a44f-4e3b-9588-653c21aa7440'),
)
manifest = []
for name, url, sha256, size, source in REFERENCES:
    target = DEST / name
    if target.is_file() and len(target.read_bytes()) == size and hashlib.sha256(target.read_bytes()).hexdigest() == sha256:
        payload = target.read_bytes()
    else:
        request = Request(url, headers={'User-Agent': 'Mozilla/5.0 INKWAVE-source-audit'})
        with urlopen(request, timeout=35) as response:
            payload = response.read(128 * 1024)
        assert len(payload) == size, f'{name}: incorrect size {len(payload)}'
        assert hashlib.sha256(payload).hexdigest() == sha256, f'{name}: SHA256 mismatch'
        assert payload[:3] == b'ID3' or payload[:1] == b'\xff', f'{name}: MP3 signature missing'
        target.write_bytes(payload)
    manifest.append({'file': name, 'path': str(target), 'bytes': size, 'sha256': sha256,
        'page': source, 'classification': 'third-party user-posted reference; game version and rights not verified'})
(DEST / 'PROVENANCE.json').write_text(json.dumps({'schema': 1, 'sources': manifest,
    'note': 'These reference recordings are NOT verified original game sound events.'},
    ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'installed': manifest}, ensure_ascii=False))
