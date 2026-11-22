import sys, numpy as np
from multiprocessing import Pool
from sim import *
def run(args):
    which,a=args
    st=[(ENTRY_N[0],ENTRY_N[1],a)] if which=='N' else [(ENTRY_B[0],ENTRY_B[1],a)]
    s=Sim(st,[]); s.pad_c=400.0
    exits=0; was_below=True
    while s.frame<1320:
        nb=len(s.broken_log); s.step()
        if len(s.x)==0: return (which,a,None,exits)
        below=s.y[0]>FIELD_BOTTOM
        if below and not was_below: exits+=1
        was_below=below
        if len(s.broken_log)>nb: return (which,a,s.frame/60,exits)
    return (which,a,None,exits)
if __name__=='__main__':
    jobs=[(w,round(sg*a,3)) for w in 'NB' for a in np.arange(5,20.001,0.01) for sg in (-1,1)]
    with Pool(4) as p:
        res=p.map(run,jobs,chunksize=8)
    for w in 'NB':
        hits=sorted([r for r in res if r[0]==w and r[2] is not None and 15<r[2]<18],key=lambda r:r[2])
        print(w,'candidates 15-18s:')
        for r in hits: print('   a=%7.2f t=%6.2f exits=%d'%(r[1],r[2],r[3]))
