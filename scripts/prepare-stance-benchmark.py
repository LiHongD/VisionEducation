"""Extract a frozen, auditable real-photo COCO17 benchmark. Development-time only.
Requires numpy, Pillow and onnxruntime; no Python dependency in the delivered app.
Run from repository root. PYTHONPATH may point at an existing local tool environment.
"""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps, ImageDraw
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'data/stance-benchmark/sources.json'
MODEL = ROOT / 'public/pose-lab-assets/yolo26n-pose.onnx'
REVIEW = ROOT / 'data/stance-benchmark/review'
THRESHOLD = 0.5
EDGES = [(5,6),(5,7),(7,9),(6,8),(8,10),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)]

def digest(data):
    return hashlib.sha256(data).hexdigest()

def extract(session, image):
    width,height=image.size
    scale=min(640/width,640/height)
    rw,rh=round(width*scale),round(height*scale)
    px,py=round((640-rw)/2-0.1),round((640-rh)/2-0.1)
    canvas=Image.new('RGB',(640,640),(114,114,114))
    canvas.paste(image.resize((rw,rh),Image.Resampling.BILINEAR),(px,py))
    tensor=np.ascontiguousarray(np.asarray(canvas,dtype=np.float32).transpose(2,0,1)[None]/255)
    rows=session.run(None,{session.get_inputs()[0].name:tensor})[0][0]
    if rows.shape!=(300,57):
        raise RuntimeError(f'Unexpected model output {rows.shape}')
    people=[r for r in rows if float(r[4])>=0.25 and round(float(r[5]))==0]
    people.sort(key=lambda r:float(r[4]),reverse=True)
    if not people:
        raise RuntimeError('No person detected; inspect original and record any exclusion explicitly')
    # All accepted originals contain one demonstration subject. Never choose by rule accuracy.
    row=people[0]
    points=row[6:].reshape(17,3).astype(float)
    points[:,0]=np.clip((points[:,0]-px)/scale,0,width-1)
    points[:,1]=np.clip((points[:,1]-py)/scale,0,height-1)
    return points.tolist(),float(row[4]),len(people)

def main():
    manifest=json.loads(MANIFEST.read_text(encoding='utf-8-sig'))
    REVIEW.mkdir(parents=True,exist_ok=True)
    session=ort.InferenceSession(str(MODEL),providers=['CPUExecutionProvider'])
    samples=[];sources={};thumbs=[];hashes=set()
    for item in manifest['samples']:
        if not item.get('manualVerified'):
            raise RuntimeError(f"Unreviewed label: {item['id']}")
        path=ROOT / item['localPath'];original=path.read_bytes();sha=digest(original)
        if sha!=item['sha256'] or sha in hashes:
            raise RuntimeError('Checksum mismatch or exact duplicate: '+item['id'])
        hashes.add(sha)
        rgba=ImageOps.exif_transpose(Image.open(path)).convert('RGBA')
        image=Image.new('RGBA',rgba.size,'white');image.alpha_composite(rgba);image=image.convert('RGB')
        points,score,people=extract(session,image)
        sourceid=item['sourceSite']+'-'+digest(item['pageUrl'].encode())[:8]
        sources[sourceid]={'id':sourceid,'title':item['sourceSite'],'pageUrl':item['pageUrl'],'license':item['license']}
        sample={'id':item['id'],'label':{'mabu':'horse','gongbu':'bow'}[item['label']],'sourceId':sourceid,'sourcePage':item['pageUrl'],
                'imageSha256':sha,'width':image.width,'height':image.height,'personConfidence':round(score,6),'detectedPeople':people,
                'keypoints':[[round(v,5) for v in p] for p in points],
                'lowConfidenceLowerBody':[i for i in [11,12,13,14,15,16] if points[i][2]<THRESHOLD]}
        samples.append(sample)
        overlay=image.copy();draw=ImageDraw.Draw(overlay);line=max(2,round(max(image.size)/250))
        for a,b in EDGES:
            draw.line([tuple(points[a][:2]),tuple(points[b][:2])],fill='#1e9979',width=line)
        for x,y,c in points:
            draw.ellipse((x-line*1.5,y-line*1.5,x+line*1.5,y+line*1.5),fill='#ffb833' if c>=THRESHOLD else '#f44336')
        overlay.save(REVIEW/(item['id']+'-overlay.jpg'),quality=90)
        overlay.thumbnail((310,245));tile=Image.new('RGB',(330,300),'white');tile.paste(overlay,((330-overlay.width)//2,34))
        label=f"{item['id']} | {sample['label']} | low={sample['lowConfidenceLowerBody']}"
        ImageDraw.Draw(tile).text((8,8),label,fill='black');thumbs.append(tile)
    assert all(sum(s['label']==c for s in samples)>=6 for c in ['horse','bow']), 'Need >=6 independent reviewed originals per class'
    payload={'schema':'stance-keypoints/v1','id':'stance-web-coco17-v1','preparedAt':'2026-11-01','keypointThreshold':THRESHOLD,
             'model':{'name':'YOLO26n-pose','sha256':digest(MODEL.read_bytes()),'input':[1,3,640,640],'detectorThreshold':0.25,'runtime':'onnxruntime '+ort.__version__,'resize':'EXIF orientation; alpha composite on white; letterbox bilinear RGB 114 pad, /255, NCHW','personSelection':'highest detection confidence; single demonstration subject reviewed'},
             'normalization':'x/max(width,height), y/max(width,height); isotropic, no per-axis stretching',
             'sources':list(sources.values()),'samples':samples}
    # Hash exact canonical payload before adding digest, to make frozen input reproducible.
    payload['digest']=digest(json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode())
    (ROOT/'lib/stance-benchmark.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    sheet=Image.new('RGB',(330*3,300*((len(thumbs)+2)//3)),'#e8ece5')
    for i,tile in enumerate(thumbs):sheet.paste(tile,((i%3)*330,(i//3)*300))
    sheet.save(REVIEW/'all-reviewed-overlays.jpg',quality=90)
    print(json.dumps({'samples':len(samples),'classes':{c:sum(s['label']==c for s in samples) for c in ['horse','bow']},'digest':payload['digest'],'lowConfidence':[{'id':s['id'],'points':s['lowConfidenceLowerBody']} for s in samples if s['lowConfidenceLowerBody']]},ensure_ascii=False))

if __name__=='__main__':
    main()
