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
# v28 selection: fresh attack on a strong sub level. E = 50 ms sub RMS (dB re max), 10 ms hop.
w=int(.05*SR); En=(len(b)-w)//hop
E=np.array([20*np.log10(np.sqrt((b[i*hop:i*hop+w]**2).mean())/np.abs(b).max()+1e-9) for i in range(En)])
sel=np.zeros(len(pk),bool); prev=None; info=[]
for k,p in enumerate(pk):
  if score[k] < .35: continue
  L=E[p:p+30].max()
  lo=max(0,p-40) if prev is None else max(prev+5,p-40)   # dip since the previous kept hit (max 400 ms back)
  dip=E[lo:p+3].min() if p+3>lo else L
  gap = 9 if prev is None else (p-prev)/fps
  ok = L>=-12 and gap>=.2 and (L-dip>=8 or (gap>=1.4 and L-dip>=5.5))
  if ok: t_on = p + int(np.argmax(E[p:p+30] >= L-6)); pk[k] = t_on   # time = when sub reaches within 6 dB of its peak
  info.append((p/fps,score[k],L,L-dip,gap,ok))
  if ok: sel[k]=True; prev=p
if '-g' in sys.argv:
  for t,sc,L,f,g,ok in info: print(f"  {t:7.2f}s score {sc:.2f} sub {L:6.1f}dB fresh {f:5.1f}dB gap {g:4.2f}s {'KEEP' if ok else '-'}")
s = np.clip((score[sel]-.35)/(1-.35)*.75+.25, 0, 1)
hits = [{'t': round((p - int(.04*fps)*0 )/fps, 3), 's': round(float(v),3)} for p, v in zip(pk[sel], s)]
json.dump({'duration': round(dur,3), 'hits': hits}, open(out,'w'))
print(f"candidates {len(pk)}  kept {len(hits)}  rate {len(hits)/dur*60:.0f}/min")
q = np.sort(score); print('score pct 50/70/80/90:', [round(float(np.percentile(score,x)),2) for x in (50,70,80,90)])
if '-v' in sys.argv:
  for p, sc in zip(pk, score): print(f"{p/fps:7.2f}s rise {flux[p]:5.1f}dB  peak {db[p:p+8].max():6.1f}dB  above-local {db[p:p+8].max()-loc[p]:5.1f}  score {sc:.2f} {'KEEP' if sc>=KEEP else ''}")
