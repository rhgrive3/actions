#!/bin/bash
# usage: wikifiles.sh "search words" [limit]  -> lists File: titles + URLs on Inkipedia (splatoonwiki.org)
q=$(python3 -I -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1")
curl -sS -A "INKWAVE-ref/1.0" "https://splatoonwiki.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=${2:-30}&gsrsearch=$q&prop=imageinfo&iiprop=url|size&format=json" \
 | python3 -I -c "import sys,json;d=json.load(sys.stdin);[print(p['title'],'|',p['imageinfo'][0]['width'],'x',p['imageinfo'][0]['height'],'|',p['imageinfo'][0]['url']) for p in d.get('query',{}).get('pages',{}).values() if 'imageinfo' in p]"
