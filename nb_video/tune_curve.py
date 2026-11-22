import sys
from sim import *
ORIG={26:96,28:84,30:72,32:64,34:55,36:42,38:32,40:25,42:21,44:18,46:13,48:10,50:8,51.5:4}
def run(schedule, seed=7, aN=9.59, aB=10.21, verbose=False):
    s=Sim([(ENTRY_N[0],ENTRY_N[1],aN),(ENTRY_B[0],ENTRY_B[1],aB)],schedule,seed=seed)
    out={}; balls={}
    while s.frame<NFRAMES:
        s.step()
        for t in ORIG:
            if s.frame==int(t*60): out[t]=100*s.bricks_left()/s.total_bricks; balls[t]=len(s.x)
    err=sum((out[t]-ORIG[t])**2 for t in ORIG)**0.5
    caught=[(round(f/60,2),k) for f,k in s.catch_frames]
    return err,out,balls,caught,s.pending
if __name__=='__main__':
    for seed in range(1,9):
        err,out,balls,caught,pend=run(SCHEDULE,seed)
        print(seed,'err %.1f'%err,' '.join('%d'%out[t] for t in ORIG),'| balls',' '.join(str(balls[t]) for t in ORIG),'| missed',len(SCHEDULE)-1-len(caught))
