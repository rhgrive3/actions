#!/bin/bash
# usage: wikiget.sh <url> <outfile>   (downloads one Inkipedia/wikimg image)
curl -sS -A "INKWAVE-ref/1.0" -o "$2" "$1" && file "$2"
