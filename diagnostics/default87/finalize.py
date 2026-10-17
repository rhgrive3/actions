import sys,json,hashlib
from pathlib import Path
from provenance import fresh_pr
pending=json.load(open(sys.argv[1]));pr=fresh_pr(sys.argv[2],pending['ended']);out=Path(sys.argv[3]);assert not out.exists();out.write_text(json.dumps({'status':'passed','execution':pending,'postRunPR':pr},indent=2))
