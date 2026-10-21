#!/usr/bin/env python3
"""Compare independently captured gameplay audio with original source clips.

A high correlation means a likely source sample, NOT a confirmed Nintendo SLINK
pitch envelope. Video may include BGM, other weapons, voice, reverb, and mixing.
Use only extracted measurements; don't redistribute third-party video/audio.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import wave
import csv
import math
from array import array

try:
    import numpy as np
except ImportError:
    np = None

RATE=8000

def filtered_pcm(path,max_seconds=45):
    cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','error',
         '-i',str(path),'-t',str(max_seconds),'-vn','-ac','1','-ar',str(RATE),
         '-af','highpass=f=450,lowpass=f=3400','-f','f32le','-']
    res=subprocess.run(cmd,capture_output=True,timeout=180,check=False)
    if res.returncode: raise RuntimeError(res.stderr.decode(errors='replace')[:600])
    if np is not None: return np.frombuffer(res.stdout,dtype='<f4')
    vals=array('f');vals.frombytes(res.stdout)
    if sys.byteorder!='little':vals.byteswap()
    return vals

def rms(x):
    if not len(x):return 0
    if np is not None:return float(np.sqrt(np.mean(x*x)))
    return math.sqrt(sum(float(v)**2 for v in x)/len(x))

def match(video,reference):
    if np is None:
        return {'status':'matching_unavailable_numpy_missing','candidates':[]}
    v=np.asarray(video,dtype=np.float64)
    v2=np.cumsum(np.r_[0,v*v])
    found=[]
    for rate in (.8,.9,1.0,1.1,1.2):
        q=np.asarray(reference,dtype=np.float64)
        n=max(20,int(round(len(q)/rate)))
        if n>=len(v):continue
        q=np.interp(np.arange(n)*rate,np.arange(len(q)),q)
        q-=q.mean()
        qnorm=float(np.linalg.norm(q))
        if qnorm<1e-8:continue
        nfft=1<<((len(v)+len(q)-2).bit_length())
        cross=np.fft.irfft(np.fft.rfft(v,n=nfft)*np.fft.rfft(q[::-1],n=nfft),n=nfft)
        cross=cross[len(q)-1:len(v)]
        local_norm=np.sqrt(np.maximum(v2[len(q):]-v2[:-len(q)],1e-12))*qnorm
        scores=cross/np.maximum(local_norm,1e-12)
        best=np.argsort(scores)[-15:][::-1]
        distinct=[]
        for pos in best:
            p=int(pos)
            if any(abs(p-prev)<.12*RATE for prev in distinct):continue
            distinct.append(p)
            found.append({'time_s':round(p/RATE,4),'pitch_rate_hypothesis':rate,
                          'correlation':round(float(scores[pos]),4)})
            if len(distinct)>=3:break
    found.sort(key=lambda a:a['correlation'],reverse=True)
    candidates=found[:5]
    score=candidates[0]['correlation'] if candidates else 0
    return {'status':'candidate_requires_listening' if score>=.55 else 'no_strong_direct_match',
            'candidates':candidates}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--video',required=True)
    p.add_argument('--source-url',default='unspecified')
    p.add_argument('--label',default='unnamed')
    p.add_argument('--reference',action='append',required=True)
    p.add_argument('--output-dir',required=True)
    p.add_argument('--max-seconds',type=float,default=45)
    a=p.parse_args()
    output=pathlib.Path(a.output_dir);output.mkdir(parents=True,exist_ok=True)
    video=filtered_pcm(a.video,a.max_seconds)
    if len(video)<RATE//4:raise RuntimeError('No usable decoded gameplay audio')
    report={'schema':1,'video_source_url':a.source_url,'video_label':a.label,
            'video_audio_verified_decoded':True,'duration_s':round(len(video)/RATE,3),
            'video_rms':round(rms(video),7),'references':[],
            'limits':'Short-source template detection in mixed gameplay is NOT retail event-graph recovery or accurate full charge pitch/volume curves. Music/reverb may obstruct any detection.'}
    frames=RATE//50
    with (output/'video_rms_20ms.csv').open('w',newline='') as f:
        w=csv.writer(f);w.writerow(['time_s','rms'])
        for k in range(0,len(video)-frames+1,frames):
            w.writerow([round(k/RATE,4),round(rms(video[k:k+frames]),7)])
    for path in a.reference:
        src=pathlib.Path(path)
        if not src.is_file():
            report['references'].append({'file':src.name,'error':'reference_missing'})
            continue
        data=src.read_bytes()
        sample=filtered_pcm(src,15)
        report['references'].append({'file':src.name,
            'sha256':hashlib.sha256(data).hexdigest(),
            'duration_s':round(len(sample)/RATE,4),
            'rms':round(rms(sample),7),**match(video,sample)})
    (output/'comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({'label':a.label,'video_duration_s':report['duration_s'],
        'matches':[{x['file']:x.get('status',x.get('error')),
                    'best':x.get('candidates',[None])[0] if x.get('candidates') else None}
                   for x in report['references']]},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
