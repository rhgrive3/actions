#!/bin/bash
# usage: dlrot.sh names.tsv outdir  — downloads "S3 <Name> model rotating.mp4" when present
while IFS=$'\t' read -r wid name; do
  t=$(python3 -I -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "File:S3 $name model rotating.mp4")
  url=$(curl -sS -A "INKWAVE-ref/1.0" "https://splatoonwiki.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&titles=$t" | python3 -I -c "import sys,json;p=list(json.load(sys.stdin)['query']['pages'].values())[0];print(p['imageinfo'][0]['url'] if 'imageinfo' in p else '')")
  if [ -z "$url" ]; then echo "NOROT $wid"; continue; fi
  curl -sS -A "INKWAVE-ref/1.0" -o "$2/$wid.mp4" "$url" || echo "FAIL $wid"
done < "$1"
