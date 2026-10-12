# usage: python3 sheets.py <out dir>: turns the raw pictures of render.mjs into PNGs, sheets and close-ups
import sys, os
from PIL import Image
out=sys.argv[1]
names=['meadow','family','stage','portrait','street','idwal']
for f in os.listdir(out):
    if f.endswith('.rgb'):
        w,h=map(int,open(f'{out}/{f[:-4]}.size').read().split())
        Image.frombytes('RGB',(w,h),open(f'{out}/{f}','rb').read()).save(f'{out}/{f[:-4]}.png')
        os.remove(f'{out}/{f}'); os.remove(f'{out}/{f[:-4]}.size')
for s in (0,4):
    ims=[Image.open(f'{out}/{n}-s{s}.png') for n in names]
    H=760; ims=[i.resize((round(i.width*H/i.height),H), Image.LANCZOS) for i in ims]
    sheet=Image.new('RGB',(sum(i.width for i in ims)+10*len(ims),H),'white'); x=0
    for i in ims: sheet.paste(i,(x,0)); x+=i.width+10
    sheet.save(f'{out}/sheet-s{s}.png')
crops={'family':(0.35,0.2,0.85,0.75),'meadow':(0.3,0.1,0.7,0.6),'portrait':(0.2,0.15,0.8,0.6),'street':(0.1,0.3,0.7,0.8)}
for s in (0,4):
    ims=[]
    for n,(a,b,c,d) in crops.items():
        i=Image.open(f'{out}/{n}-s{s}.png'); ims.append(i.crop((int(a*i.width),int(b*i.height),int(c*i.width),int(d*i.height))).resize((700,700), Image.LANCZOS))
    sheet=Image.new('RGB',(710*len(ims),700),'white')
    for k,i in enumerate(ims): sheet.paste(i,(k*710,0))
    sheet.save(f'{out}/closeups-s{s}.png')
