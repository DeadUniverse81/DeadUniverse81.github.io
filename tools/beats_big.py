#!/usr/bin/env python3
"""BIG bass hits only: python3 tools/beats_big.py in.wav out.json [keep_thr=0.55]
Low-pass <=110 Hz, onset flux vs local average, min 400 ms gap (doubles merge), strength-weighted selection."""
import sys, json, subprocess, numpy as np
from scipy.signal import butter, sosfiltfilt, find_peaks
from scipy.ndimage import uniform_filter1d
src, out = sys.argv[1], sys.argv[2]; KEEP = float(sys.argv[3]) if len(sys.argv) > 3 else .55
SR = 11025
y = np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',src,'-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True,check=True).stdout, np.float32); dur = len(y)/SR
b = sosfiltfilt(butter(6,110,'lowpass',fs=SR,output='sos'), y)
hop = 110; fps = SR/hop; n = len(b)//hop
env = np.sqrt((b[:n*hop].reshape(n,hop)**2).mean(1)); env = uniform_filter1d(env, 3)
db = 20*np.log10(env/env.max()+1e-6)
loc = 20*np.log10(uniform_filter1d(env, int(4*fps))/env.max()+1e-6)   # local ~4 s average level
flux = np.maximum(0, db - np.roll(db, int(.04*fps)))                     # 40 ms rise in dB
pk, _ = find_peaks(flux, height=4, distance=int(.4*fps))
# strength: rise size + how far the peak level (next 80 ms) sits above local average + absolute loudness
pl = np.array([db[p:p+int(.08*fps)].max() for p in pk])
score = .45*np.clip(flux[pk]/12,0,1) + .35*np.clip((pl-loc[pk])/9,0,1) + .2*np.clip((pl+24)/24,0,1)
# cross-check: sub (<110 Hz) RMS right after the hit must be clearly high, and a real attack over the 300 ms before
def rms(a,b_): seg=b[max(0,a):max(a+1,b_)]; return 20*np.log10(np.sqrt((seg**2).mean())/np.abs(b).max()+1e-9)
L=np.array([rms(int(p*hop),int(p*hop+.1*SR)) for p in pk]); A=L-np.array([rms(int(p*hop-.3*SR),int(p*hop-.02*SR)) for p in pk])
gate=(L>=-14)&((A>=6)|((L>=-9)&(A>=2.5)))
if '-g' in sys.argv:
  for p,sc,l,aa in zip(pk,score,L,A):
    if sc>=KEEP: print(f"  {p/fps:7.2f}s subRMS {l:6.1f}dB attack {aa:5.1f}dB {'ok' if (l>=-14 and (aa>=6 or (l>=-9 and aa>=2.5))) else 'DROP'}")
sel = (score >= KEEP) & gate
print('dropped by sub cross-check:', [round(p/fps,2) for p in pk[(score>=KEEP)&~gate]])
s = np.clip((score[sel]-KEEP)/(1-KEEP)*.75+.25, 0, 1)
hits = [{'t': round((p - int(.04*fps)*0 )/fps, 3), 's': round(float(v),3)} for p, v in zip(pk[sel], s)]
json.dump({'duration': round(dur,3), 'hits': hits}, open(out,'w'))
print(f"candidates {len(pk)}  kept {len(hits)}  rate {len(hits)/dur*60:.0f}/min")
q = np.sort(score); print('score pct 50/70/80/90:', [round(float(np.percentile(score,x)),2) for x in (50,70,80,90)])
if '-v' in sys.argv:
  for p, sc in zip(pk, score): print(f"{p/fps:7.2f}s rise {flux[p]:5.1f}dB  peak {db[p:p+8].max():6.1f}dB  above-local {db[p:p+8].max()-loc[p]:5.1f}  score {sc:.2f} {'KEEP' if sc>=KEEP else ''}")
