#!/usr/bin/env python3
"""Use Ubuntu's signed archive via HTTPS when the hosted Azure mirror stalls."""
from pathlib import Path
import sys
root = Path(sys.argv[1]) if len(sys.argv) == 2 else Path('/etc/apt')
if len(sys.argv) > 2:
    raise SystemExit('usage: prepare-inkwave-ci-apt.py [apt-root]')
files = [root / 'sources.list', root / 'apt-mirrors.txt', root / 'apt-mirrors-security.txt',
         *(root / 'sources.list.d').glob('*.list'), *(root / 'sources.list.d').glob('*.sources')]
for file in files:
    if not file.is_file():
        continue
    before = file.read_text()
    after = before.replace('http://azure.archive.ubuntu.com/ubuntu', 'https://archive.ubuntu.com/ubuntu').replace('https://azure.archive.ubuntu.com/ubuntu', 'https://archive.ubuntu.com/ubuntu')
    if after != before:
        file.write_text(after)
        print('Ubuntu archive transport updated:', file)
