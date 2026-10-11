import sys,json,urllib.request,urllib.parse,os
out=sys.argv[2]
for line in open(sys.argv[1]):
    wid,name=line.rstrip('\n').split('\t')
    for suf,tag in (('', '3d'),('_2D_Current','2d')):
        t='File:S3 Weapon Main '+name+suf+'.png'
        u='https://splatoonwiki.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size&format=json&titles='+urllib.parse.quote(t)
        d=json.load(urllib.request.urlopen(u))
        p=list(d['query']['pages'].values())[0]
        if 'imageinfo' not in p: print('MISSING',wid,t); continue
        ii=p['imageinfo'][0]
        fn=os.path.join(out,f'{wid}.{tag}.png')
        urllib.request.urlretrieve(ii['url'],fn)
        print(wid,tag,ii['width'],ii['height'])
