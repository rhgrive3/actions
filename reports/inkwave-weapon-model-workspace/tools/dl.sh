#!/bin/bash
# usage: dl.sh names.tsv outdir
while IFS=$'\t' read -r wid name; do
  for pair in ":3d" "_2D_Current:2d"; do suf=${pair%%:*}; tag=${pair##*:}
    t=$(python3 -I -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "File:S3 Weapon Main $name$suf.png")
    url=$(curl -sS -A "INKWAVE-ref/1.0" "https://splatoonwiki.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&titles=$t" | python3 -I -c "import sys,json;p=list(json.load(sys.stdin)['query']['pages'].values())[0];print(p['imageinfo'][0]['url'] if 'imageinfo' in p else '')")
    if [ -z "$url" ]; then echo "MISSING $wid $tag"; continue; fi
    curl -sS -A "INKWAVE-ref/1.0" -o "$2/$wid.$tag.png" "$url" || echo "FAIL $wid $tag"
  done
done < "$1"
