import math
import statistics

T95={1:12.7062047364,2:4.3026527297,3:3.1824463053,4:2.7764451052,5:2.5705818356,
     6:2.4469118488,7:2.3646242510,8:2.3060041352,9:2.2621571629,10:2.2281388520,
     11:2.2009851601,12:2.1788128297,13:2.1603686565,14:2.1447866879,15:2.1314495456}

def quantile(values,q):
    xs=sorted(values);at=(len(xs)-1)*q;lo=math.floor(at);hi=math.ceil(at)
    return xs[lo]+(xs[hi]-xs[lo])*(at-lo)

def stats(values):
    xs=list(values)
    assert xs and all(math.isfinite(x) for x in xs)
    return dict(n=len(xs),mean=statistics.mean(xs),sd=statistics.stdev(xs) if len(xs)>1 else None,
                median=statistics.median(xs),min=min(xs),p05=quantile(xs,.05),p95=quantile(xs,.95),max=max(xs))

def ratio_stats(values):
    xs=list(values);s=stats(xs);assert all(x>0 for x in xs)
    logs=list(map(math.log,xs));lm=statistics.mean(logs)
    interval=None
    if len(xs)>1:
        margin=T95[len(xs)-1]*statistics.stdev(logs)/math.sqrt(len(xs))
        interval=[math.exp(lm-margin),math.exp(lm+margin)]
    s.update(geometricMean=math.exp(lm),changePercent=100*(math.exp(lm)-1),logRatioTInterval95=interval,
             changePercentInterval95=[100*(x-1) for x in interval] if interval else None)
    return s

def pct(value):return f'{value:+.2f}%'
def ci(s):
    x=s['changePercentInterval95']
    return f'{pct(x[0])} to {pct(x[1])}' if x else 'unavailable (one quartet)'

